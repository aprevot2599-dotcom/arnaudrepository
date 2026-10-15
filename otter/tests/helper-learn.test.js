// Helper window, wake word and learning tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseWake } from "../core/voicecmd.js";
import { seedProfile, extractLearnables, profileText, PROFILE_SEED } from "../core/learn.js";
import { helperArgs, browserCandidates } from "../scripts/helper.js";
import { assessCapabilities, matchCapabilities } from "../core/capabilities.js";
import { buildSystemPrompt } from "../core/agent.js";
import { PermissionRegistry } from "../core/security.js";

test("wake word: only speech addressed to Otter is acted on", () => {
  assert.deepEqual(parseWake("Otter, what's on my plate?"), { addressed: true, text: "what's on my plate?" });
  assert.deepEqual(parseWake("hey otter louder"), { addressed: true, text: "louder" });
  assert.equal(parseWake("other, check the budget").addressed, true, "common mishearing accepted");
  assert.equal(parseWake("the budget meeting moved to Thursday").addressed, false, "side conversation ignored");
  assert.equal(parseWake("the budget meeting moved", { followUp: true }).addressed, true, "a reply right after Otter spoke counts");
  assert.deepEqual(parseWake("Otter"), { addressed: true, text: "" });
});

test("helper voice commands: window, chat, float, yes/no, profile", () => {
  assert.deepEqual(parseCommand("maximize"), { kind: "ui", ui: "maximize" });
  assert.deepEqual(parseCommand("just the otter"), { kind: "ui", ui: "minimize" });
  assert.deepEqual(parseCommand("show me the chat"), { kind: "ui", ui: "chat" });
  assert.deepEqual(parseCommand("stay on top"), { kind: "ui", ui: "float" });
  assert.deepEqual(parseCommand("yes please"), { kind: "confirm", yes: true });
  assert.deepEqual(parseCommand("no thanks"), { kind: "confirm", yes: false });
  assert.equal(parseCommand("what do you know about me?").kind, "profile");
  assert.equal(parseCommand("Should we maximize enrollment in Boardman?"), null);
});

test("learning starts from the brief and only offers safe, new facts", () => {
  const kb = [];
  assert.equal(seedProfile(kb), PROFILE_SEED.length);
  assert.equal(seedProfile(kb), 0, "seeded once");
  assert.ok(kb.every((k) => k.tags.includes("profile") && k.provenance));
  const facts = extractLearnables("From now on, send me the board report draft by the 10th. I prefer tables over long paragraphs.", kb);
  assert.deepEqual(facts, ["I prefer tables over long paragraphs", "From now on, send me the board report draft by the 10th"]);
  assert.deepEqual(extractLearnables("Remember that Jane's number is 541-555-0134.", kb), [], "contact details are never offered");
  assert.deepEqual(extractLearnables("I prefer that failing students get a call first.", kb), [], "student matters are never offered");
  assert.deepEqual(extractLearnables("What's the fee for the welding workshop?", kb), []);
  kb.push({ title: "x", text: "I prefer tables over long paragraphs", tags: ["learned"] });
  assert.deepEqual(extractLearnables("I prefer tables over long paragraphs.", kb), [], "already known");
  const p = profileText(kb);
  assert.match(p, /Bottom line first/);
  assert.match(p, /tables over long paragraphs/);
});

test("what O.T.T.E.R. knows travels with every question", () => {
  const prompt = buildSystemPrompt({ settings: {}, plan: { steps: [] }, sources: [], knowledgeHits: [], mode: "server", permissions: new PermissionRegistry(), today: "2026-10-15", profile: "- Role: Executive Director" });
  assert.match(prompt, /What you already know about Dr\. Prevot/);
  assert.match(prompt, /Role: Executive Director/);
  assert.match(prompt, /ask at most one pertinent question/);
});

test("helper launcher opens a small app window with microphone and sound allowed, in its own profile", () => {
  const args = helperArgs("http://127.0.0.1:4317/?mode=mini", "/tmp/otter-profile");
  assert.ok(args.includes("--app=http://127.0.0.1:4317/?mode=mini"));
  assert.ok(args.includes("--use-fake-ui-for-media-stream"));
  assert.ok(args.includes("--autoplay-policy=no-user-gesture-required"));
  assert.ok(args.includes("--user-data-dir=/tmp/otter-profile"), "auto-allow is confined to O.T.T.E.R.'s own profile");
  assert.ok(browserCandidates("win32", { PROGRAMFILES: "C:\\Program Files" }).some((p) => /chrome\.exe$/.test(p)));
  assert.ok(browserCandidates("darwin").some((p) => /Google Chrome$/.test(p)));
});

test("floating is explained honestly where it can't work", () => {
  const art = assessCapabilities({ engineKind: "artifact" }).find((c) => c.id === "float");
  assert.equal(art.status, "blocked");
  assert.match(art.missing, /npm run helper/);
  assert.equal(assessCapabilities({ engineKind: "server", floatSupported: true }).find((c) => c.id === "float").status, "ready");
  assert.ok(matchCapabilities("can you stay on top of my other windows?", assessCapabilities({ engineKind: "artifact" })).some((c) => c.id === "float"));
});
