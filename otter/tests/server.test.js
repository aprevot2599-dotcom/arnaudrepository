// Local server boundary tests, run against a fake Claude client so no API key is needed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

let srv, base, token, calls = [];
const fake = { beta: { messages: { create: async (params) => { calls.push(params); return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", model: params.model, usage: {} }; } } } };

before(async () => {
  const s = createServer({ client: fake, port: 0, token: "t".repeat(48) });
  srv = s.server;
  token = s.token;
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

const post = (body, headers = {}) => fetch(base + "/api/messages", { method: "POST", headers: { "content-type": "application/json", "x-otter-token": token, ...headers }, body: JSON.stringify(body) });

test("API calls need the per-launch token", async () => {
  assert.equal((await fetch(base + "/api/capabilities")).status, 401);
  assert.equal((await post({ messages: [] }, { "x-otter-token": "wrong" })).status, 401);
  const ok = await fetch(base + "/api/capabilities", { headers: { "x-otter-token": token } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).chromeBridge, false);
});

test("requests from other web pages are refused", async () => {
  assert.equal((await post({ messages: [] }, { origin: "https://evil.example" })).status, 403);
});

test("the server privacy guard blocks secrets even if the browser sent them", async () => {
  const before = calls.length;
  const r = await post({ system: "", messages: [{ role: "user", content: "my SSN is 123-45-6789" }], tools: [] });
  assert.equal(r.status, 422);
  assert.equal(calls.length, before);
});

test("relays a clean request and adds web search only when asked", async () => {
  let r = await post({ system: "s", messages: [{ role: "user", content: "hello" }], tools: [{ name: "propose_action", description: "d", input_schema: { type: "object" } }] });
  assert.equal(r.status, 200);
  assert.equal(calls.at(-1).tools.some((t) => t.type?.startsWith("web_search")), false);
  r = await post({ system: "s", messages: [{ role: "user", content: "hello" }], tools: [], webSearch: true });
  assert.ok(calls.at(-1).tools.some((t) => t.type === "web_search_20260209"));
  assert.equal(calls.at(-1).model, "claude-opus-5-5");
});

test("static files are allowlisted and the token is injected only into the page", async () => {
  assert.equal((await fetch(base + "/../server.js")).status, 404);
  assert.equal((await fetch(base + "/public/../server.js")).status, 404);
  assert.equal((await fetch(base + "/data/local/x.json")).status, 404);
  const page = await (await fetch(base + "/")).text();
  assert.match(page, /^<!doctype html>/);
  assert.ok(page.includes(token));
});
