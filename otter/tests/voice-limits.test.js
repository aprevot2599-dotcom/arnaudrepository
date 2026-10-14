// Voice, volume, self-knowledge and recommendation tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../core/voicecmd.js";
import { assessCapabilities, matchCapabilities, explain } from "../core/capabilities.js";
import { emptyUsage, recordTurn, recommend, dueRecommendation, markShown } from "../core/advisor.js";
import { ApprovalGate, PermissionRegistry, AuditLog } from "../core/security.js";
import { detectBackend, setVolume, getVolume, validLevel } from "../lib/sysvolume.js";
import { pickMaleVoice, speakable } from "../public/voice.js";
import { createServer } from "../server.js";

test("volume and voice commands are parsed locally", () => {
  assert.deepEqual(parseCommand("louder"), { kind: "volume_step", target: "voice", step: 15 });
  assert.deepEqual(parseCommand("Quieter please"), { kind: "volume_step", target: "voice", step: -15 });
  assert.deepEqual(parseCommand("set the volume to 35%"), { kind: "volume_set", target: "voice", level: 35 });
  assert.deepEqual(parseCommand("Set computer volume to 50 percent"), { kind: "volume_set", target: "system", level: 50 });
  assert.deepEqual(parseCommand("turn up the computer volume"), { kind: "volume_step", target: "system", step: 15 });
  assert.equal(parseCommand("stop listening").kind, "listen_off");
  assert.equal(parseCommand("mute").kind, "mute");
  assert.equal(parseCommand("volume to 400").level, 100);
  // ordinary questions are not commands
  assert.equal(parseCommand("What volume of students enrolled in welding last fall compared with 2024?"), null);
  assert.equal(parseCommand("Should we raise the fee for the CDL course?"), null);
});

test("O.T.T.E.R. knows it cannot control volume or listen from claude.ai, and says why", () => {
  const caps = assessCapabilities({ engineKind: "artifact", serviceApproved: true, speech: { synthesis: true, recognition: true } });
  const vol = caps.find((c) => c.id === "system_volume");
  assert.equal(vol.status, "blocked");
  const text = explain(vol);
  assert.match(text, /Why I can't/);
  assert.match(text, /The missing piece/);
  assert.match(text, /With that piece, I could/);
  assert.equal(caps.find((c) => c.id === "listen").status, "blocked");
  assert.equal(caps.find((c) => c.id === "web_research").status, "missing");
  assert.equal(caps.find((c) => c.id === "outlook_read").status, "blocked");
  for (const c of caps) if (c.status !== "ready") assert.ok(c.why && c.missing && c.unlocks, `${c.id} needs all three parts`);
});

test("capability status follows the environment", () => {
  const base = { engineKind: "server", serviceApproved: true, speech: { synthesis: true, recognition: true }, systemVolume: { available: true, method: "macOS osascript" } };
  assert.equal(assessCapabilities(base).find((c) => c.id === "system_volume").status, "needs_you");
  assert.equal(assessCapabilities({ ...base, systemVolumePermitted: true }).find((c) => c.id === "system_volume").status, "ready");
  assert.equal(assessCapabilities({ ...base, systemVolume: { available: false, reason: "No tool" } }).find((c) => c.id === "system_volume").status, "missing");
  assert.equal(assessCapabilities(base).find((c) => c.id === "listen").status, "needs_you");
  assert.equal(assessCapabilities({ ...base, speech: { synthesis: true, recognition: true, recognitionAllowed: true } }).find((c) => c.id === "listen").status, "ready");
  const cloudOnly = assessCapabilities({ ...base, speech: { synthesis: true, cloudMaleVoice: "Microsoft Andrew Online (Natural)", cloudVendor: "Microsoft" } }).find((c) => c.id === "speak");
  assert.equal(cloudOnly.status, "needs_you");
  assert.match(cloudOnly.why, /Microsoft/);
  const ids = (t) => matchCapabilities(t, assessCapabilities(base)).map((c) => c.id);
  assert.ok(ids("send this reply to Dana").includes("send_email"));
  assert.ok(ids("check my calendar for Thursday").includes("calendar"));
  assert.ok(ids("turn the computer volume up").includes("system_volume"));
});

test("recommendations come from usage evidence, respect dismissals, and pace themselves", () => {
  const u = emptyUsage();
  assert.equal(recommend(u, { engineKind: "server" }).length, 0, "nothing invented with no usage");
  for (let i = 0; i < 3; i++) recordTurn(u, { plan: { intents: ["email"], steps: [] }, proposals: [{ type: "reply_email", status: "not_executed" }], noSkillTopic: "email" });
  recordTurn(u, { plan: { intents: ["workshop"], steps: [{ name: "psc-form-filler", mode: "handoff" }, { name: "course-request-form-filler", mode: "handoff" }, { name: "ce-website-workshop-updater", mode: "handoff" }] } });
  const recs = recommend(u, { engineKind: "server", skillCount: 38 });
  const ids = recs.map((r) => r.id);
  assert.ok(ids.includes("connector-m365"));
  assert.ok(ids.includes("surface-cowork"));
  assert.ok(ids.includes("skill-email"));
  assert.equal(recs[0].priority, "high");
  for (const r of recs) assert.ok(r.evidence && r.why && r.missing && r.unlocks);
  const due = dueRecommendation(u, recs, 1000);
  assert.ok(due);
  markShown(u, due, 1000);
  const next = recs.find((r) => !u.shown[r.id]);
  assert.equal(dueRecommendation(u, recs.filter((r) => r.priority !== "high"), 2000), null, "non-urgent ones wait three days");
  assert.ok(next);
  u.dismissed.push("connector-m365");
  assert.ok(!recommend(u, { engineKind: "server" }).some((r) => r.id === "connector-m365"));
  // research without web access recommends the local server
  const u2 = emptyUsage();
  recordTurn(u2, { plan: { intents: ["research", "new_program"], steps: [] } });
  assert.ok(recommend(u2, { engineKind: "artifact" }).some((r) => r.id === "setup-local-server"));
});

test("computer volume changes need permission and a specific approval", async () => {
  const audit = new AuditLog();
  const permissions = new PermissionRegistry({}, { audit });
  const set = [];
  const gate = new ApprovalGate({ permissions, audit, executors: { set_system_volume: async (run) => { set.push(+run.content.match(/(\d+)%/)[1]); return { ok: true }; } } });
  const p = await gate.propose({ type: "set_system_volume", target: "This computer", content: "Set this computer's volume to 20%", origin: "launch" });
  await assert.rejects(gate.execute(p.id), (e) => e.code === "not_approved");
  gate.approve(p.id, { confirmDigest: p.digest });
  assert.equal((await gate.execute(p.id)).status, "not_executed", "no permission, no change");
  permissions.grant("system_volume", "write", { purpose: "test" });
  const q = await gate.propose({ type: "set_system_volume", target: "This computer", content: "Set this computer's volume to 20%" });
  gate.approve(q.id, { confirmDigest: q.digest });
  await assert.rejects(gate.execute(q.id, { type: "set_system_volume", target: "This computer", content: "Set this computer's volume to 100%" }), (e) => e.code === "payload_changed");
  const r = await gate.propose({ type: "set_system_volume", target: "This computer", content: "Set this computer's volume to 20%" });
  gate.approve(r.id, { confirmDigest: r.digest });
  assert.equal((await gate.execute(r.id)).status, "executed");
  assert.deepEqual(set, [20]);
});

test("volume commands use fixed arguments and reject anything but 0-100", async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, ...args]); return "Volume: front-left: 13107 /  20% / -41.94 dB\n"; };
  for (const bad of ["20; rm -rf /", 101, -1, 2.5, "abc"]) assert.throws(() => validLevel(bad));
  const linux = detectBackend("linux", (b) => b === "pactl");
  await setVolume(linux, 20, run);
  assert.deepEqual(calls.at(-1), ["pactl", "set-sink-volume", "@DEFAULT_SINK@", "20%"]);
  assert.equal(await getVolume(linux, run), 20);
  await setVolume(detectBackend("darwin"), 35, run);
  assert.deepEqual(calls.at(-1), ["osascript", "-e", "set volume output volume 35"]);
  await setVolume(detectBackend("win32"), 20, run);
  assert.equal(calls.at(-1)[0], "powershell");
  assert.match(calls.at(-1).at(-1), /\[OtterAudio\]::Set\(0\.20\)/);
  const none = detectBackend("linux", () => false);
  assert.equal(none.available, false);
  assert.match(none.fix, /pactl|amixer/);
  await assert.rejects(setVolume(none, 20, run));
});

test("the server volume endpoint needs the token and validates input", async () => {
  const calls = [];
  const { server, token } = createServer({ client: null, port: 0, volumeBackend: { available: true, platform: "linux", tool: "pactl", method: "pactl" }, volumeRunner: async (c, a) => { calls.push(a); return " 20% "; } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/system/volume", { method: "POST", body: JSON.stringify({ level: 20 }) })).status, 401);
    const h = { "content-type": "application/json", "x-otter-token": token };
    assert.equal((await fetch(base + "/api/system/volume", { method: "POST", headers: h, body: JSON.stringify({ level: "20; reboot" }) })).status, 400);
    const ok = await fetch(base + "/api/system/volume", { method: "POST", headers: h, body: JSON.stringify({ level: 20 }) });
    assert.equal((await ok.json()).level, 20);
    assert.deepEqual(calls.at(-1), ["set-sink-volume", "@DEFAULT_SINK@", "20%"]);
    const cap = await (await fetch(base + "/api/capabilities", { headers: h })).json();
    assert.equal(cap.systemVolume.available, true);
  } finally { server.close(); }
});

test("voice picker prefers natural male voices and keeps text local unless allowed", () => {
  const voices = [
    { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
    { name: "Microsoft Andrew Online (Natural) - English (United States)", lang: "en-US", localService: false },
    { name: "Microsoft David - English (United States)", lang: "en-US", localService: true },
    { name: "Zarvox", lang: "en-US", localService: true },
    { name: "Thomas", lang: "fr-FR", localService: true },
  ];
  const local = pickMaleVoice(voices, { allowCloud: false });
  assert.equal(local.voice.name, "Microsoft David - English (United States)");
  assert.equal(local.natural, false);
  assert.match(local.bestCloud.name, /Andrew/);
  const cloud = pickMaleVoice(voices, { allowCloud: true });
  assert.match(cloud.voice.name, /Andrew/);
  assert.equal(cloud.natural, true);
  assert.equal(pickMaleVoice([voices[0], voices[3]], { allowCloud: true }).voice, null, "never falls back to a female or novelty voice");
});

test("spoken text drops markup and stays short", () => {
  const parts = speakable("**Bottom line:** O.T.T.E.R. recommends waiting. See https://bls.gov for data.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n:::limitation\n- **Why I can't:** blocked.\n:::\nOne. Two. Three. Four.");
  const text = parts.join(" ");
  assert.ok(!/[*|#]|https?:/.test(text));
  assert.match(text, /^Bottom line: Otter recommends waiting/);
  assert.match(text, /The rest is on screen\.$/);
});
