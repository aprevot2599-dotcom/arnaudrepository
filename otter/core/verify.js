// Morning verification: shared scheduling logic, browser-side checks, and the report shape.
// Every check returns {id, name, status: pass|warn|fail, detail, fix}. Verification uses no
// Claude tokens unless the optional live check is switched on, and the report says so.
import { assessCapabilities, STATUS_TEXT } from "./capabilities.js";
import { scanSensitive, evaluateOutbound } from "./privacy.js";

export const VERIFY_HOUR = 5;

// Next 5:00 a.m. local time strictly after `now`.
export function nextRunAt(now = new Date(), hour = VERIFY_HOUR) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// The most recent 5:00 a.m. at or before `now`.
export function lastScheduledAt(now = new Date(), hour = VERIFY_HOUR) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

// True when no verification has run since the last 5 a.m. (computer asleep, server off).
export function needsCatchUp(lastRanAt, now = new Date(), hour = VERIFY_HOUR) {
  return !lastRanAt || new Date(lastRanAt) < lastScheduledAt(now, hour);
}

const check = (id, name, status, detail, fix = "") => ({ id, name, status, detail, fix });

// Checks that need no server: they run in any browser, including claude.ai.
export function browserChecks(env) {
  const out = [];
  out.push(env.engineKind === "offline"
    ? check("engine", "Claude connection", "fail", "No Claude connection: only built-in analyzers run.", "Open the claude.ai link signed in, or start the local server with ANTHROPIC_API_KEY set.")
    : env.serviceApproved ? check("engine", "Claude connection", "pass", `Connected (${env.engineLabel}).`)
      : check("engine", "Claude connection", "warn", "Connected but not approved for BMCC content, so nothing is sent.", "Settings > Engine: confirm BMCC permits it."));
  out.push(env.storage ? check("storage", "Local storage", "pass", "History and settings are saving on this device.") : check("storage", "Local storage", "fail", "This browser is blocking storage, so nothing is saved between visits.", "Leave private browsing, or allow site data for this page."));
  const sp = env.speech || {};
  if (!sp.synthesis) out.push(check("voice", "Voice", "warn", "This browser can't speak.", "Use Edge, Chrome or Safari."));
  else if (!sp.maleVoice) out.push(check("voice", "Voice", "warn", sp.cloudMaleVoice ? `Only an online male voice is available ("${sp.cloudMaleVoice}") and online voices are off.` : "No male voice is installed.", sp.cloudMaleVoice ? "Settings > Voice > Allow online voices, if BMCC policy allows." : "Mac: download Evan or Nathan (Enhanced). Windows: use Edge."));
  else out.push(check("voice", "Voice", sp.maleVoiceNatural ? "pass" : "warn", `Speaking as "${sp.maleVoice}"${sp.maleVoiceNatural ? "" : ", which sounds synthetic"}.`, sp.maleVoiceNatural ? "" : "Allow online voices, or install a natural voice."));
  if (env.serverRunning) out.push(sp.recognition ? (sp.recognitionAllowed ? check("listen", "Listening", "pass", "Conversation mode can hear you.") : check("listen", "Listening", "warn", "Listening is not allowed yet.", "Settings > Voice > Allow listening.")) : check("listen", "Listening", "warn", "This browser has no speech recognition.", "Use Chrome, Edge or Safari."));
  const stale = (env.pending || []).filter((p) => env.now - p.createdAt > 3 * 86400000);
  out.push(stale.length ? check("approvals", "Approval queue", "warn", `${stale.length} proposal${stale.length === 1 ? " has" : "s have"} waited more than 3 days.`, "Open Tasks and approve or cancel them; stale drafts tend to go out of date.") : check("approvals", "Approval queue", "pass", `${(env.pending || []).length} waiting, none stale.`));
  const expired = (env.knowledge || []).filter((k) => k.expiresAt && k.expiresAt < env.now);
  if (expired.length) out.push(check("knowledge", "Knowledge base", "warn", `${expired.length} stored fact${expired.length === 1 ? " has" : "s have"} expired.`, "Settings > Knowledge base: update or delete them."));
  // The privacy guard is checked against known samples every morning.
  const ok = evaluateOutbound("SSN 123-45-6789", "x", { approvedServices: ["x"] }).decision === "block" && scanSensitive("jane@bluecc.edu").length === 1 && evaluateOutbound("Student ID 7012345 GPA 1.9", "x", { approvedServices: ["x"] }).decision === "block";
  out.push(ok ? check("privacy", "Privacy guard", "pass", "Blocks SSNs and student records, detects contact details.") : check("privacy", "Privacy guard", "fail", "The privacy guard failed its self-test. Sending is unsafe.", "Stop using Claude features and report this; run npm test on the local server."));
  if (env.serverRunning && env.serverReport) {
    const age = env.now - new Date(env.serverReport.ranAt).getTime();
    out.push(age < 26 * 3600000 ? check("server_verify", "Server self-test", "pass", `Last ran ${new Date(env.serverReport.ranAt).toLocaleString()}.`) : check("server_verify", "Server self-test", "warn", "The server's morning test hasn't run in over a day.", "Leave the local server running overnight, or schedule npm run verify (see README)."));
  }
  return out;
}

// Merges browser and server checks with today's limits into one report.
export function buildReport({ trigger, env, serverReport = null, now = Date.now() }) {
  const checks = [...browserChecks({ ...env, now, serverReport }), ...(serverReport?.checks || [])];
  const caps = assessCapabilities(env);
  const limits = caps.filter((c) => c.status !== "ready").map((c) => ({ id: c.id, name: c.name, status: STATUS_TEXT[c.status], why: c.why, missing: c.missing, unlocks: c.unlocks }));
  const issues = checks.filter((c) => c.status !== "pass").sort((a, b) => (a.status === "fail" ? -1 : 1) - (b.status === "fail" ? -1 : 1));
  return {
    ranAt: new Date(now).toISOString(),
    trigger,
    checks,
    issues,
    limits,
    tokensUsed: serverReport?.tokensUsed || 0,
    summary: `${checks.filter((c) => c.status === "pass").length} passed, ${issues.filter((c) => c.status === "warn").length} warnings, ${issues.filter((c) => c.status === "fail").length} failures. ${limits.length} limits today.`,
  };
}

export function reportMarkdown(r, { maxLimits = 4 } = {}) {
  const top = r.issues.slice(0, 4);
  const lines = [
    ":::finding",
    `**Morning check** (${new Date(r.ranAt).toLocaleString()}, ${r.trigger}): ${r.summary} Used ${r.tokensUsed} Claude tokens.`,
    ":::",
  ];
  if (top.length) {
    lines.push("", "**Issues and fixes**");
    for (const c of top) lines.push(`- **${c.name}** (${c.status}): ${c.detail}${c.fix ? ` Fix: ${c.fix}` : ""}`);
  } else lines.push("", "No issues found.");
  if (r.limits.length) {
    lines.push("", "**Limits today, given your current setup**");
    for (const l of r.limits.slice(0, maxLimits)) lines.push(`- **${l.name}** (${l.status.toLowerCase()}): ${l.why} Missing piece: ${l.missing}`);
    if (r.limits.length > maxLimits) lines.push(`- …and ${r.limits.length - maxLimits} more on the Abilities page.`);
  }
  return lines.join("\n");
}
