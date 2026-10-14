// Server-side morning checks: API key and reachability, skill inventory, the fail-safe test
// suite, volume control and disk. All free (no Claude tokens) except the optional live check.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { discover } from "../scripts/discover-skills.js";
import { getVolume } from "./sysvolume.js";
import { nextRunAt, needsCatchUp } from "../core/verify.js";

const check = (id, name, status, detail, fix = "") => ({ id, name, status, detail, fix });

function runTests(root) {
  return new Promise((resolve) => {
    execFile(process.execPath, ["--test", path.join(root, "tests", "failsafe.test.js")], { cwd: root, timeout: 60000 }, (err, stdout) => {
      const pass = +(String(stdout).match(/# pass (\d+)/)?.[1] || 0);
      const fail = +(String(stdout).match(/# fail (\d+)/)?.[1] || (err ? 1 : 0));
      resolve({ pass, fail });
    });
  });
}

export async function serverChecks({ root, client, model, volumeBackend, volumeRunner, live = false, discoverFn = discover, testsFn = runTests }) {
  const checks = [];
  let tokensUsed = 0;
  if (!client) checks.push(check("api_key", "Claude API key", "fail", "No ANTHROPIC_API_KEY is set for the local server.", "Set ANTHROPIC_API_KEY in the terminal (or your startup script) and restart npm start."));
  else {
    try {
      // Looking up the model costs no tokens and proves the key and network work.
      await client.models.retrieve(model);
      checks.push(check("api", "Claude API", "pass", `Reachable; ${model} is available to your key.`));
    } catch (e) {
      const auth = /401|auth|invalid x-api-key/i.test(String(e?.status || "") + e?.message);
      checks.push(check("api", "Claude API", "fail", auth ? "The API key was rejected." : `The API could not be reached: ${String(e?.message || e).slice(0, 120)}`, auth ? "Create a new key at console.anthropic.com and update ANTHROPIC_API_KEY." : "Check the internet connection or a firewall/proxy; try again later."));
    }
    if (live) {
      try {
        const r = await client.messages.create({ model, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with the single word OK." }] });
        tokensUsed = (r.usage?.input_tokens || 0) + (r.usage?.output_tokens || 0);
        checks.push(check("api_live", "Claude live answer", "pass", `Answered (${tokensUsed} tokens).`));
      } catch (e) {
        checks.push(check("api_live", "Claude live answer", "fail", `A tiny test message failed: ${String(e?.message || e).slice(0, 120)}`, "If the API check passed, this is likely a usage limit or model access issue on your account."));
      }
    }
  }
  // Skills: compare the disk with yesterday's registry.
  try {
    const regPath = path.join(root, "data", "skills.json");
    const prev = fs.existsSync(regPath) ? JSON.parse(fs.readFileSync(regPath, "utf8")).skills.map((s) => s.name) : [];
    const now = discoverFn();
    const names = now.map((s) => s.name);
    const added = names.filter((n) => !prev.includes(n));
    const removed = prev.filter((n) => !names.includes(n));
    if (added.length || removed.length) {
      fs.mkdirSync(path.dirname(regPath), { recursive: true });
      fs.writeFileSync(regPath, JSON.stringify({ generatedAt: new Date().toISOString(), skills: now.map(({ path: p, ...s }) => s) }, null, 2));
    }
    checks.push(check("skills", "Skill inventory", now.length ? (removed.length ? "warn" : "pass") : "warn",
      `${now.length} skills on disk.${added.length ? ` New: ${added.join(", ")}.` : ""}${removed.length ? ` Gone: ${removed.join(", ")}.` : ""}`,
      !now.length ? "Skills sync to ~/.claude/skills when Claude Code runs; open Claude Code once, or set OTTER_SKILLS_DIR." : removed.length ? "If a removal was unintended, re-enable the skill in claude.ai settings." : ""));
  } catch (e) {
    checks.push(check("skills", "Skill inventory", "fail", "Skill discovery failed: " + e.message, "Check that ~/.claude/skills is readable."));
  }
  const t = await testsFn(root);
  checks.push(t.fail ? check("failsafe", "Approval and privacy fail-safes", "fail", `${t.fail} fail-safe test${t.fail === 1 ? "" : "s"} failed.`, "Do not approve external actions until fixed. Run npm test and report the output.") : check("failsafe", "Approval and privacy fail-safes", "pass", `${t.pass} fail-safe tests passed.`));
  if (!volumeBackend?.available) checks.push(check("volume", "Computer volume control", "warn", volumeBackend?.reason || "Unavailable.", volumeBackend?.fix || ""));
  else {
    try {
      const v = await getVolume(volumeBackend, volumeRunner);
      checks.push(Number.isFinite(v) ? check("volume", "Computer volume control", "pass", `Reads the current volume (${v}%) via ${volumeBackend.method}.`) : check("volume", "Computer volume control", "warn", "The volume tool ran but its output wasn't understood.", "Tell O.T.T.E.R.'s maintainer which operating system and audio setup this is."));
    } catch (e) {
      checks.push(check("volume", "Computer volume control", "fail", `The volume command failed: ${String(e.stderr || e.message).slice(0, 120)}`, process.platform === "win32" ? "PowerShell may be restricted by BMCC policy; ask IT, or skip volume control." : "Check that the audio service is running."));
    }
  }
  try {
    const dir = path.join(root, "data", "local");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".write-test"), "ok");
    fs.unlinkSync(path.join(dir, ".write-test"));
    checks.push(check("disk", "Report storage", "pass", "Can save reports."));
  } catch (e) {
    checks.push(check("disk", "Report storage", "fail", "Can't write to data/local: " + e.message, "Free disk space or fix folder permissions."));
  }
  return { ranAt: new Date().toISOString(), checks, tokensUsed };
}

export function saveReport(root, report) {
  const dir = path.join(root, "data", "local", "verification");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, report.ranAt.slice(0, 10) + ".json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(report, null, 2));
  // Keep 30 days of reports
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(dir, f));
}

export function loadReport(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "data", "local", "verification", "latest.json"), "utf8")); } catch { return null; }
}

// Runs at 5 a.m. local time while the server is up, and catches up on start if it missed one.
export function scheduleDaily(run, { now = () => new Date(), setTimer = setTimeout, last = null, log = console.log } = {}) {
  let timer;
  const arm = () => {
    const at = nextRunAt(now());
    timer = setTimer(async () => { await run("scheduled"); arm(); }, at - now());
    log(`Next morning check: ${at.toLocaleString()}`);
  };
  if (needsCatchUp(last, now())) Promise.resolve(run("catch-up")).finally(arm);
  else arm();
  return () => clearTimeout(timer);
}
