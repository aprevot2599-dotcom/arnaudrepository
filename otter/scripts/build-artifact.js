#!/usr/bin/env node
// Bundles the app into one self-contained HTML file for publishing as a private claude.ai
// artifact. Modules are concatenated in dependency order with import/export syntax removed,
// the stylesheet and skill registry are inlined, and the result is syntax-checked.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["core/security.js", "core/privacy.js", "core/analysis.js", "core/orchestrator.js", "core/capabilities.js", "core/advisor.js", "core/voicecmd.js", "core/m365guides.js", "core/router.js", "core/verify.js", "core/learn.js", "core/ledger.js", "core/spotter.js", "core/agent.js", "public/markdown.js", "public/otter.js", "public/voice.js", "public/screen.js", "public/store.js", "public/app.js"];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let js = "";
for (const m of MODULES) {
  const src = read(m)
    .replace(/^import [\s\S]*? from "[^"]+";\n/gm, "")
    .replace(/^export (?=(?:async )?function |const |class |let )/gm, "");
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Unbundled import/export left in ${m}`);
  js += `\n// ---- ${m} ----\n${src}`;
}
js = js.replace(/<\/script/gi, "<\\/script");

const registry = JSON.parse(read("data/skills.json"));
const css = read("public/styles.css");
let html = read("public/index.html")
  .replace('<link rel="stylesheet" href="/public/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/public/app.js"></script>', () => `<script>globalThis.OTTER_SKILLS = ${JSON.stringify({ generatedAt: registry.generatedAt, skills: registry.skills }).replace(/</g, "\\u003c")};</script>\n<script type="module">${js}\n</script>`);

const out = path.join(ROOT, "dist", "otter.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

// Closed, no-install version: one file you open in Chrome. No web fonts, no outside scripts,
// and a Content Security Policy that lets the page talk to api.anthropic.com and nothing else.
// Pass --no-skills to leave your skill list out (for publishing the file anywhere public).
const withSkills = !process.argv.includes("--no-skills");
const regScript = `globalThis.OTTER_SKILLS = ${JSON.stringify({ generatedAt: registry.generatedAt, skills: withSkills ? registry.skills : [] }).replace(/</g, "\\u003c")};`;
const appScript = js + "\n";
const hash = (t) => "'sha256-" + crypto.createHash("sha256").update(t, "utf8").digest("base64") + "'";
const csp = ["default-src 'none'", `script-src ${hash(regScript)} ${hash(appScript)}`, "style-src 'unsafe-inline'", "img-src data: blob:", "media-src blob:", "connect-src https://api.anthropic.com", "font-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join("; ");
const body = read("public/index.html")
  .replace(/<link rel="preconnect"[^>]*>\n/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n/, "")
  .replace('<link rel="stylesheet" href="/public/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/public/app.js"></script>', () => `<script>${regScript}</script>\n<script type="module">${appScript}</script>`);
const web = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>\n${body}\n</body></html>\n`;
if (/fonts\.googleapis|https?:\/\/(?!api\.anthropic\.com)[a-z0-9.-]+\/[^"\s]*\.(js|css)/i.test(web.replace(/<script type="module">[\s\S]*<\/script>/, ""))) throw new Error("otter-web.html would load something from outside");
const webOut = path.join(ROOT, "dist", withSkills ? "otter-web.html" : "otter-web-public.html");
fs.writeFileSync(webOut, web);

// Syntax check of the bundled script (duplicate top-level names fail here)
const tmp = path.join(ROOT, "dist", ".bundle-check.mjs");
fs.writeFileSync(tmp, js);
try { execFileSync(process.execPath, ["--check", tmp]); } finally { fs.unlinkSync(tmp); }
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB) and ${path.relative(process.cwd(), webOut)} (${(web.length / 1024).toFixed(0)} KB, closed CSP, ${withSkills ? registry.skills.length : 0} skills)`);
