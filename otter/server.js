#!/usr/bin/env node
// O.T.T.E.R. local server. Serves the app on 127.0.0.1 only and relays model calls to the
// Claude API with a key that never reaches the browser. It re-checks outbound content for
// secrets and SSNs, requires a per-launch token on every API call, and rejects requests
// from other origins, so a web page open in the same browser cannot drive it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { scanSensitive } from "./core/privacy.js";
import { discover, parseFrontmatter } from "./scripts/discover-skills.js";
import { detectBackend, getVolume, setVolume, defaultRunner } from "./lib/sysvolume.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.OTTER_MODEL || "claude-opus-5-5";
const EFFORT = process.env.OTTER_EFFORT || "medium";
const USE_FALLBACKS = process.env.OTTER_FALLBACKS !== "off";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const STATIC = { "/": "public/index.html", "/data/skills.json": "data/skills.json" };

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? TYPES[".json"] : headers["content-type"] || "text/plain",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

async function readJson(req, limit = 4 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createServer({ client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null, port = 4317, token = crypto.randomBytes(24).toString("hex"), volumeBackend = detectBackend(), volumeRunner = defaultRunner } = {}) {
  let skills = null;
  const skillIndex = () => (skills ||= discover());
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        const origin = req.headers.origin;
        if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: "Cross-origin request refused.", code: "forbidden" });
        if (req.headers["x-otter-token"] !== token) return send(res, 401, { error: "Missing or wrong session token. Reload the page.", code: "bad_token" });

        if (url.pathname === "/api/capabilities")
          return send(res, 200, {
            engine: "server",
            model: MODEL,
            apiKey: !!client,
            webSearch: !!client,
            chromeBridge: false,
            chromeReason: "No supported interface exists for a local web app to drive the Claude in Chrome extension. Use paste or file upload, or hand off to Claude in Chrome.",
            skillsOnDisk: skillIndex().length,
            systemVolume: { available: volumeBackend.available, platform: volumeBackend.platform, method: volumeBackend.method || "", reason: volumeBackend.reason || "", fix: volumeBackend.fix || "" },
          });

        // Computer volume. The browser calls this only after you approve a proposal in the
        // approval panel; the token and origin checks above keep other pages out.
        if (url.pathname === "/api/system/volume") {
          try {
            if (req.method === "GET") return send(res, 200, { level: await getVolume(volumeBackend, volumeRunner) });
            if (req.method === "POST") {
              const { level } = await readJson(req, 1024);
              const set = await setVolume(volumeBackend, level, volumeRunner);
              console.log(`Computer volume set to ${set}% (approved in O.T.T.E.R.)`);
              return send(res, 200, { level: set });
            }
          } catch (e) {
            return send(res, e.status || 502, { error: e.status ? e.message : "The volume command failed on this computer: " + (e.stderr || e.message || "").toString().slice(0, 200), code: "volume_failed" });
          }
        }

        if (url.pathname === "/api/skills") return send(res, 200, { skills: skillIndex().map(({ path: p, ...s }) => s) });

        const m = url.pathname.match(/^\/api\/skills\/([a-z0-9-]+)\/instructions$/);
        if (m) {
          const s = skillIndex().find((x) => x.name === m[1]);
          if (!s) return send(res, 404, { error: "No such skill." });
          const { body } = parseFrontmatter(fs.readFileSync(path.join(s.path, "SKILL.md"), "utf8"));
          return send(res, 200, { name: s.name, instructions: body });
        }

        if (url.pathname === "/api/messages" && req.method === "POST") {
          if (!client) return send(res, 503, { error: "No ANTHROPIC_API_KEY is set for the local server. Set it and restart, or use the claude.ai version.", code: "no_key" });
          const body = await readJson(req);
          // Defense in depth: the browser already applied the privacy policy. The server
          // refuses secrets, SSNs and card numbers no matter what the browser sent.
          const outbound = JSON.stringify([body.system, body.messages]);
          const hard = scanSensitive(outbound).filter((f) => f.severity === "block");
          if (hard.length) return send(res, 422, { error: `Blocked by the server privacy guard: ${[...new Set(hard.map((f) => f.label))].join(", ")}.`, code: "privacy_block" });
          const tools = Array.isArray(body.tools) ? body.tools.slice(0, 20) : [];
          if (body.webSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 6 });
          const params = {
            model: MODEL,
            max_tokens: 16000,
            thinking: { type: "adaptive" },
            output_config: { effort: EFFORT },
            system: String(body.system || ""),
            messages: body.messages,
            tools,
          };
          if (USE_FALLBACKS) Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
          try {
            const msg = await client.beta.messages.create(params);
            return send(res, 200, { content: msg.content, stop_reason: msg.stop_reason, model: msg.model, usage: msg.usage });
          } catch (e) {
            if (e instanceof Anthropic.AuthenticationError) return send(res, 401, { error: "The Claude API rejected the API key.", code: "auth" });
            if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: "Rate limited by the Claude API. Try again in a minute.", code: "rate_limited" });
            if (e instanceof Anthropic.BadRequestError) return send(res, 400, { error: "The Claude API refused the request: " + e.message, code: "bad_request" });
            if (e instanceof Anthropic.APIError) return send(res, 502, { error: "Claude API error: " + e.message, code: "upstream_error" });
            throw e;
          }
        }
        return send(res, 404, { error: "Unknown endpoint." });
      }

      // Static files: an explicit allowlist of directories, no traversal
      let rel = STATIC[url.pathname];
      if (!rel && /^\/(public|core)\/[\w.-]+\.(js|css|svg)$/.test(url.pathname)) rel = url.pathname.slice(1);
      if (!rel) return send(res, 404, "Not found");
      let data = fs.readFileSync(path.join(ROOT, rel));
      if (rel.endsWith("index.html"))
        data = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' +
          data.toString("utf8").replace('<meta name="otter-token" content="">', `<meta name="otter-token" content="${token}">`) + "</body></html>";
      return send(res, 200, data, {
        "content-type": TYPES[path.extname(rel)] || "application/octet-stream",
        ...(rel.endsWith(".html") ? { "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" } : {}),
      });
    } catch (e) {
      send(res, e.status || 500, { error: e.status ? e.message : "Internal error. Details are in the terminal.", code: "server_error" });
      if (!e.status) console.error(e);
    }
  });
  return { server, token, port };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // The registry is generated from this machine's SKILL.md files and never committed.
  const reg = path.join(ROOT, "data", "skills.json");
  if (!fs.existsSync(reg)) {
    const found = discover();
    fs.mkdirSync(path.dirname(reg), { recursive: true });
    fs.writeFileSync(reg, JSON.stringify({ generatedAt: new Date().toISOString(), skills: found.map(({ path: p, ...s }) => s) }, null, 2));
    console.log(`Discovered ${found.length} skills on this computer.`);
  }
  const port = +process.env.PORT || 4317;
  const { server } = createServer({ port });
  server.listen(port, "127.0.0.1", () => {
    console.log(`O.T.T.E.R. is running at http://127.0.0.1:${port}`);
    console.log(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? `Claude API: connected (${MODEL}, effort ${EFFORT})` : "Claude API: no ANTHROPIC_API_KEY set. The app runs with built-in analyzers only.");
  });
}
