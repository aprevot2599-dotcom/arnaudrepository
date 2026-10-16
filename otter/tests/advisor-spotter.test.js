// Advisor-not-actor, spotter and screen-hold tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spot, spottedMarkdown, parseLooseDate } from "../core/spotter.js";
import { assertAdvisorOnly, ACTION_TYPES, SYSTEMS, ACTOR_KINDS } from "../core/security.js";
import { assessCapabilities, matchCapabilities } from "../core/capabilities.js";
import { buildSystemPrompt } from "../core/agent.js";
import { PermissionRegistry } from "../core/security.js";
import { parseCommand } from "../core/voicecmd.js";
import { guideMarkdown, GUIDES } from "../core/m365guides.js";

test("O.T.T.E.R. is an advisor: nothing can execute against BMCC systems, cloud accounts or the browser", () => {
  const appExecutors = { save_knowledge: 1, create_task: 1, set_system_volume: 1 }; // the app's complete list
  assert.equal(assertAdvisorOnly(appExecutors), true);
  for (const t of ["send_email", "reply_email", "submit_form", "edit_document", "post_content", "modify_record", "skill_handoff"])
    assert.throws(() => assertAdvisorOnly({ ...appExecutors, [t]: 1 }), (e) => e.code === "not_advisor", t);
  const acting = Object.entries(ACTION_TYPES).filter(([, a]) => ACTOR_KINDS.includes(SYSTEMS[a.system]?.kind)).map(([k]) => k);
  assert.ok(acting.length >= 15, "every BMCC-facing action type exists only as a proposal");
  const p = buildSystemPrompt({ settings: {}, plan: { steps: [] }, sources: [], knowledgeHits: [], mode: "direct", permissions: new PermissionRegistry(), today: "2026-10-17" });
  assert.match(p, /an advisor, not an actor/);
  assert.match(p, /never act on BMCC systems/);
  assert.match(p, /:::spotted/);
});

test("dates in emails are read the way people write them", () => {
  const ref = new Date(2026, 9, 17);
  assert.equal(parseLooseDate("October 20", ref).getDate(), 20);
  assert.equal(parseLooseDate("Oct. 20, 2026", ref).getMonth(), 9);
  assert.equal(parseLooseDate("10/20", ref).getFullYear(), 2026);
  assert.equal(parseLooseDate("January 10", ref).getFullYear(), 2027, "January said in October means next year");
  assert.equal(parseLooseDate("2026-11-03", ref).getMonth(), 10);
  assert.equal(parseLooseDate("next week", ref), null);
});

test("the spotter flags what you may have missed, from what you've given it, for 0 tokens", () => {
  const now = new Date(2026, 9, 17, 9);
  const email = { id: "S1", kind: "email", title: "Welding cohort", text: "From: Dana Ruiz <dana@example.org>\nDate: Oct 15, 2026\n\nCan you confirm the cohort start by October 18? Please send the budget too. We will host 14 students. Will the lab be ready?\n\nFrom: Arnaud Prevot\nDate: Oct 16, 2026\n\nI will send the budget by Friday. We expect 12 students." };
  const budget = { id: "S2", kind: "document", title: "Budget", text: "Instructor: $9,000\nSupplies: $3,000\nTotal: $13,000" };
  const items = spot({ sources: [email, budget], tasks: [{ id: "t1", title: "Call WorkSource", done: false, createdAt: now - 9 * 86400000 }], proposals: [{ id: "a1", status: "pending", label: "Reply to email", target: "Dana", createdAt: now - 3 * 86400000 }], me: ["Arnaud"], now });
  const kinds = items.map((i) => i.kind);
  assert.ok(items.some((i) => i.kind === "deadline" && /tomorrow/.test(i.title)), "deadline tomorrow");
  assert.ok(kinds.includes("unanswered"), "a question from Dana that nobody answered");
  assert.ok(kinds.includes("mine"), "your own commitment");
  assert.ok(kinds.includes("discrepancy"), "14 vs 12 students, and a total that doesn't add up");
  assert.ok(kinds.includes("waiting") && kinds.includes("task"));
  assert.equal(items[0].urgency, "high", "most urgent first");
  assert.ok(items.every((i) => i.key), "every item has a key so it's only flagged once");
  const md = spottedMarkdown(items);
  assert.match(md, /:::spotted/);
  assert.match(md, /0 tokens/);
  assert.match(md, /haven't acted on any of it/);
  assert.match(spottedMarkdown([]), /Nothing new stands out/);
  assert.equal(parseCommand("what did you spot?").kind, "spotted");
  assert.equal(parseCommand("anything I missed?").kind, "spotted");
});

test("screen coaching is on hold until BMCC approves, and says so", () => {
  const caps = assessCapabilities({ engineKind: "direct", topLevel: true });
  const screen = caps.find((c) => c.id === "screen");
  assert.equal(screen.status, "blocked");
  assert.match(screen.why, /until BMCC gives full permission/);
  assert.match(screen.missing, /Release the hold/);
  assert.equal(assessCapabilities({ engineKind: "direct", topLevel: true, screenHold: false }).find((c) => c.id === "screen").status, "ready");
  assert.ok(matchCapabilities("can you look at my screen?", caps).some((c) => c.id === "screen"));
  assert.match(guideMarkdown(GUIDES[0]), /on hold until BMCC approves/);
  assert.match(guideMarkdown(GUIDES[0], { screen: true }), /tap the eye button/);
});

test("asking to open with Chrome gets the startup steps for 0 tokens, not the form-filling answer", async () => {
  const { chooseRoute } = await import("../core/router.js");
  const caps = assessCapabilities({ engineKind: "direct" });
  for (const q of ["can you make otter open when I open Chrome", "can you start up with chrome?", "could you auto-start?"]) {
    assert.deepEqual(matchCapabilities(q, caps).map((c) => c.id), ["autostart"], q);
    assert.equal(chooseRoute(q, { engineKind: "direct", capabilities: caps }).tier, "local", q);
  }
  const a = caps.find((c) => c.id === "autostart");
  assert.match(a.missing, /On startup/);
  assert.match(a.why, /one click/);
  assert.equal(assessCapabilities({ engineKind: "artifact" }).find((c) => c.id === "autostart").status, "blocked");
  assert.deepEqual(matchCapabilities("fill the course request form in chrome", caps).map((c) => c.id), ["chrome_bridge"]);
});
