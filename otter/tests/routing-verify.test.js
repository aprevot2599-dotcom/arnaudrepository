// Cost-aware routing and morning verification tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chooseRoute, costUsd, describeEstimate, estimateTokens } from "../core/router.js";
import { assessCapabilities } from "../core/capabilities.js";
import { nextRunAt, needsCatchUp, buildReport, reportMarkdown, browserChecks } from "../core/verify.js";
import { serverChecks, scheduleDaily, saveReport, loadReport } from "../lib/verify-server.js";
import { buildSystemPrompt, runTurn } from "../core/agent.js";
import { PermissionRegistry, ApprovalGate } from "../core/security.js";
import { createServer } from "../server.js";

const caps = assessCapabilities({ engineKind: "server", serviceApproved: true, speech: {} });
const base = { engineKind: "server", capabilities: caps, model: "claude-opus-5-5" };

test("cheapest route first: local, quick, standard, deep", () => {
  assert.equal(chooseRoute("louder", base).tier, "local");
  assert.equal(chooseRoute("thanks", base).tier, "local");
  assert.equal(chooseRoute("Can you read my Outlook inbox?", base).tier, "local", "a limit question is answered from the status list");
  assert.equal(chooseRoute("morning check", base).tier, "local");
  assert.equal(chooseRoute("What's a reasonable fee for a 6-hour Excel workshop?", base).tier, "quick");
  const src = [{ id: "S1", text: "From: Dana\n\nPlease send the budget by October 20. ".repeat(40) }];
  assert.equal(chooseRoute("Summarize the attached thread", { ...base, sources: src, plan: { frames: ["email"], intents: ["email"], steps: [] } }).tier, "standard");
  const decision = chooseRoute("Should BMCC launch a welding certificate in Boardman?", { ...base, plan: { frames: ["decision"], intents: ["new_program"], steps: [] }, webAllowed: true });
  assert.equal(decision.tier, "standard", "a decision starts on standard, not deep");
  assert.equal(decision.upgrade.tier, "deep", "and offers the deeper route");
  assert.ok(decision.upgrade.estimate.total > decision.estimate.total);
  assert.equal(chooseRoute("Do a deep research on Oregon CDL demand", { ...base, webAllowed: true }).tier, "deep");
  assert.equal(chooseRoute("anything", { ...base, engineKind: "offline" }).tier, "local");
});

test("estimates grow with sources and tool rounds, and say what they are", () => {
  const q = chooseRoute("Short question?", base);
  const withSources = chooseRoute("Check the attached budget", { ...base, sources: [{ id: "S1", text: "x".repeat(40000) }], plan: { frames: ["discrepancy"], intents: ["discrepancy"], steps: [] } });
  assert.ok(withSources.estimate.input > q.estimate.input + 10000 * 2, "a 10k-token source is resent each round");
  assert.equal(withSources.estimate.rounds, 2);
  assert.equal(estimateTokens("abcd".repeat(100)), 100);
  assert.ok(q.estimate.costUsd > 0 && q.estimate.costUsd < 0.2);
  assert.equal(costUsd("claude-opus-5-5", 1e6, 0), 4);
  assert.match(describeEstimate(q, "server"), /tokens .*\$/);
  assert.match(describeEstimate({ ...q, estimate: { ...q.estimate, costUsd: null } }, "artifact"), /claude\.ai plan usage/);
  // quick route keeps sources out unless the request refers to them
  const quickWithSource = chooseRoute("What's the weather like for the fair?", { ...base, sources: [{ id: "S1", text: "x".repeat(4000) }] });
  assert.equal(quickWithSource.include.sources, false);
  assert.equal(quickWithSource.upgrade.tier, "standard");
});

test("the route trims what is sent and sets effort; usage is summed exactly", async () => {
  const permissions = new PermissionRegistry();
  permissions.grant("anthropic_api", "read", { purpose: "t" });
  const gate = new ApprovalGate({ permissions });
  let seen;
  const transport = { kind: "server", service: "anthropic_api", run: async (a) => { seen = a; return { text: "ok", usage: { input_tokens: 4100, output_tokens: 300, rounds: 1 } }; } };
  const ctx = { gate, permissions, registry: [], settings: { approvedServices: ["anthropic_api"] }, knowledge: [], rawSources: [{ id: "S1", kind: "doc", title: "big", text: "secret-ish budget ".repeat(500) }], addFinding: () => ({}), capabilities: caps };
  const route = chooseRoute("Quick question about fees?", { ...base, sources: ctx.rawSources });
  const res = await runTurn({ transport, ctx, userText: "Quick question about fees?", history: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "turn " + i })), route });
  assert.equal(route.tier, "quick");
  assert.ok(!seen.system.includes("secret-ish budget"), "quick route leaves the unreferenced source out");
  assert.equal(seen.turns.length, 5, "4 history turns plus the question");
  assert.deepEqual(seen.tools.map((t) => t.name).sort(), ["check_capability", "propose_action", "search_knowledge"]);
  assert.equal(seen.route.effort, "low");
  assert.equal(res.usage.input_tokens, 4100);
});

test("every answer is told to show its interpretation, ask when unclear, and suggest an improvement", () => {
  const p = buildSystemPrompt({ settings: {}, plan: { steps: [] }, sources: [], knowledgeHits: [], mode: "server", permissions: new PermissionRegistry(), today: "2026-10-14", route: { tier: "quick", label: "Quick", include: {}, estimate: { total: 4000 } } });
  assert.match(p, /:::understood/);
  assert.match(p, /clarification questions/);
  assert.match(p, /You can make this experience better if you/);
  assert.match(p, /quick route/);
  assert.match(p, /dictation artifacts/);
});

test("morning check runs at 5 a.m. and catches up when missed", () => {
  const at = nextRunAt(new Date(2026, 9, 14, 3, 0));
  assert.equal(at.getHours(), 5);
  assert.equal(at.getDate(), 14);
  assert.equal(nextRunAt(new Date(2026, 9, 14, 6, 0)).getDate(), 15);
  assert.equal(needsCatchUp(null), true);
  assert.equal(needsCatchUp(new Date(2026, 9, 14, 5, 1), new Date(2026, 9, 14, 9, 0)), false);
  assert.equal(needsCatchUp(new Date(2026, 9, 13, 22, 0), new Date(2026, 9, 14, 9, 0)), true);
  assert.equal(needsCatchUp(new Date(2026, 9, 13, 22, 0), new Date(2026, 9, 14, 4, 0)), false, "before 5 a.m. yesterday's run still counts");
  // scheduler: catch-up on start, then arms the next 5 a.m.
  const runs = [], timers = [];
  scheduleDaily((t) => runs.push(t), { now: () => new Date(2026, 9, 14, 9, 0), setTimer: (fn, ms) => timers.push(ms), last: null, log: () => {} });
  assert.deepEqual(runs, ["catch-up"]);
});

test("server checks find real problems and say how to fix them, using no tokens", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otter-verify-"));
  const okClient = { models: { retrieve: async () => ({ id: "claude-opus-5-5" }) }, messages: { create: async () => { throw new Error("should not be called"); } } };
  const r = await serverChecks({ root, client: okClient, model: "claude-opus-5-5", volumeBackend: { available: false, reason: "No tool", fix: "Install pactl" }, discoverFn: () => [{ name: "board-report", path: "/x" }], testsFn: async () => ({ pass: 16, fail: 0 }) });
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by.api.status, "pass");
  assert.equal(by.failsafe.status, "pass");
  assert.equal(by.volume.status, "warn");
  assert.equal(by.volume.fix, "Install pactl");
  assert.equal(r.tokensUsed, 0);
  const bad = await serverChecks({ root, client: { models: { retrieve: async () => { throw Object.assign(new Error("401 invalid x-api-key"), { status: 401 }); } } }, model: "m", volumeBackend: { available: false }, discoverFn: () => [], testsFn: async () => ({ pass: 15, fail: 1 }) });
  const b = Object.fromEntries(bad.checks.map((c) => [c.id, c]));
  assert.equal(b.api.status, "fail");
  assert.match(b.api.fix, /new key/);
  assert.equal(b.failsafe.status, "fail");
  assert.match(b.failsafe.fix, /Do not approve/);
  assert.equal(b.skills.status, "warn", "board-report disappeared since the last run");
  const none = await serverChecks({ root, client: null, model: "m", volumeBackend: { available: false }, discoverFn: () => [{ name: "board-report", path: "/x" }], testsFn: async () => ({ pass: 16, fail: 0 }) });
  assert.equal(none.checks.find((c) => c.id === "api_key").status, "fail");
  saveReport(root, { ...r, trigger: "test" });
  assert.equal(loadReport(root).trigger, "test");
});

test("the morning report lists issues with fixes and today's limits", () => {
  const env = { engineKind: "artifact", serviceApproved: false, engineLabel: "Claude via claude.ai", storage: true, speech: { synthesis: true }, pending: [{ createdAt: 0 }], knowledge: [], serverRunning: false };
  const rep = buildReport({ trigger: "first open after 5 a.m.", env, now: 10 * 86400000 });
  assert.ok(rep.issues.some((i) => i.id === "engine" && i.fix));
  assert.ok(rep.issues.some((i) => i.id === "approvals"));
  assert.ok(rep.checks.some((c) => c.id === "privacy" && c.status === "pass"), "privacy guard self-test runs every morning");
  assert.ok(rep.limits.some((l) => l.id === "system_volume"));
  const md = reportMarkdown(rep);
  assert.match(md, /Issues and fixes/);
  assert.match(md, /Limits today/);
  assert.match(md, /Used 0 Claude tokens/);
  assert.ok(browserChecks({ ...env, now: Date.now() }).every((c) => ["pass", "warn", "fail"].includes(c.status)));
});

test("verification endpoints need the token", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otter-verify-"));
  const { server, token } = createServer({ client: null, port: 0, root, volumeBackend: { available: false }, checksOptions: { discoverFn: () => [], testsFn: async () => ({ pass: 16, fail: 0 }) } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/verify/run", { method: "POST" })).status, 401);
    const r = await (await fetch(base + "/api/verify/run", { method: "POST", headers: { "x-otter-token": token } })).json();
    assert.equal(r.report.trigger, "manual");
    assert.equal(r.report.tokensUsed, 0);
    const l = await (await fetch(base + "/api/verify/latest", { headers: { "x-otter-token": token } })).json();
    assert.equal(l.report.ranAt, r.report.ranAt);
  } finally { server.close(); }
});
