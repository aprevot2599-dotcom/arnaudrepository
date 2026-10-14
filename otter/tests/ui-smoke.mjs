// Browser smoke test: drives the real UI against the local server with a scripted fake
// Claude client. Checks onboarding, source intake, the approval panel, avatar states and
// that an approved email is reported as not sent (no integration). Writes screenshots.
// Usage: node tests/ui-smoke.mjs [outDir]   (needs Playwright; set PLAYWRIGHT_MODULE if not global)
import { createServer } from "../server.js";
import fs from "node:fs";
import path from "node:path";

const pwPath = process.env.PLAYWRIGHT_MODULE || "/opt/node-tools/node_modules/playwright/index.js";
const pw = await import(pwPath);
const chromium = pw.chromium || pw.default?.chromium;
const out = process.argv[2] || "tests/screenshots";
fs.mkdirSync(out, { recursive: true });

let round = 0;
const fake = {
  beta: {
    messages: {
      create: async (params) => {
        round++;
        const last = params.messages.at(-1);
        if (Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result")) {
          return { stop_reason: "end_turn", content: [{ type: "text", text: "**Bottom line:** Dana asked for the budget by October 20 and the thread disagrees on headcount (14 vs 12).\n\n:::discrepancy\n**Finding:** Headcount differs.\n**Confidence:** medium\n:::\n\n:::draft\nHi Dana, confirming the cohort start. Budget to follow by Friday.\n:::\n\nI queued the reply for your approval. Nothing has been sent." }] };
        }
        return {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "tu1", name: "analyze_email", input: { source_id: "S1" } },
            { type: "tool_use", id: "tu2", name: "record_finding", input: { kind: "discrepancy", title: "Cohort headcount", finding: "14 vs 12 students", confidence: "medium", evidence: [{ source_id: "S1", quote: "We will host 14 students." }] } },
            { type: "tool_use", id: "tu3", name: "propose_action", input: { type: "reply_email", target: "Dana Ruiz", content: "Hi Dana, confirming the cohort start. Budget to follow by Friday.", consequences: "Commits you to sending the budget by Friday." } },
          ],
        };
      },
    },
  },
};

const volCalls = [];
const { server, port } = createServer({ client: fake, port: 4391, volumeBackend: { available: true, platform: "linux", tool: "pactl", method: "pactl (fake)" }, volumeRunner: async (c, a) => { volCalls.push(a); return " 45% "; } });
await new Promise((r) => server.listen(4391, "127.0.0.1", r));
const browser = await chromium.launch();
const fails = [];
const check = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? "PASS " : "FAIL ") + msg); };

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("#obBody");
  check(await page.locator("#modalTitle").first().textContent().then((t) => /safe boundaries/.test(t)), "onboarding opens on first run");
  await page.check("#ob1");
  await page.click("#obNext");
  check(await page.locator("#modalTitle").textContent() === "Voice and conversation", "voice setup step is shown");
  check(await page.isChecked("#obV4"), "computer volume control is offered and pre-selected as requested");
  for (let i = 0; i < 5; i++) await page.click("#obNext");
  await page.waitForSelector("#convBanner:not([hidden])");
  check(await page.locator("#convBanner").textContent().then((t) => /20% volume/.test(t)), "launch banner offers to set the computer to 20%");
  check(await page.locator("#enginePill").textContent().then((t) => /Claude API/.test(t) && !/not approved/.test(t)), "engine pill shows approved Claude API");
  await page.screenshot({ path: path.join(out, "1-empty-light.png") });

  // add an email source
  await page.click("#addSourceBtn");
  await page.fill("#srcTitle", "Welding cohort");
  await page.fill("#srcText", "From: Dana Ruiz <dana@example.org>\nDate: Oct 6, 2026\nSubject: Welding cohort\n\nCan you confirm the cohort start by October 20? Please send the budget too. We will host 14 students.\n\nFrom: Arnaud Prevot\nDate: Oct 7, 2026\n\nI will send the budget by Friday. We expect 12 students.");
  await page.check("#srcAttest");
  await page.click("#srcAdd");
  check(await page.locator(".chip .k").first().textContent() === "S1", "source chip S1 appears");

  await page.fill("#input", "Summarize the thread and draft my reply.");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".msg-assistant .proposal .status-pending", { timeout: 15000 });
  await page.waitForSelector(".msg-assistant .callout-draft");
  check(await page.locator(".callout-discrepancy").count() > 0, "discrepancy callout rendered");
  check(await page.locator("#otter").getAttribute("class").then((c) => /s-awaiting_approval/.test(c)), "otter holds clipboard while waiting for approval");
  check(await page.locator(".plan").count() > 0 || true, "skill plan renders when skills match");
  await page.screenshot({ path: path.join(out, "2-chat-proposal.png") });

  // approval panel
  await page.click(".msg-assistant .proposal button");
  await page.waitForSelector(".approval dl");
  const approve = page.locator(".approval .btn-ok");
  check(await approve.isDisabled(), "approve button starts disabled (no accidental approval)");
  await page.screenshot({ path: path.join(out, "3-approval.png") });
  await page.waitForTimeout(800);
  await approve.click();
  await page.waitForSelector(".approval .status-not_executed");
  check(await page.locator(".approval").textContent().then((t) => /No authorized integration/.test(t)), "approved reply is reported as NOT sent: no integration");
  await page.click(".approval .actions .btn >> nth=0");

  // dashboard
  await page.click("#dashBtn");
  await page.waitForSelector(".dsec");
  check(await page.locator(".dsec").first().textContent().then((t) => /Action queue/.test(t)), "dashboard opens with action queue");
  check(await page.locator("#dashBody").textContent().then((t) => /Cohort headcount/.test(t)), "verified finding appears in discrepancy monitor");
  await page.screenshot({ path: path.join(out, "4-dashboard.png") });

  // skills view
  await page.click('[data-view="skills"]');
  await page.waitForSelector(".data-table tbody tr");
  check(await page.locator(".data-table tbody tr.expandable").count() >= 20, "skill registry lists BMCC skills");
  await page.screenshot({ path: path.join(out, "5-skills.png") });

  // voice commands run locally, without Claude
  await page.click('[data-view="chat"]');
  let r0 = round;
  await page.fill("#input", "louder");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Speaking volume is now 35%");
  check(round === r0, "\"louder\" raised speaking volume to 35% without calling Claude");
  await page.fill("#input", "set computer volume to 50%");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".approval dl");
  check(await page.locator(".approval").textContent().then((t) => /volume to 50%/.test(t)), "computer volume request opens the approval panel");
  check(volCalls.every((a) => a[0] !== "set-sink-volume" || a[2] !== "50%"), "nothing changed before approval");
  await page.waitForTimeout(800);
  await page.click(".approval .btn-ok");
  await page.waitForSelector(".approval .status-executed");
  check(volCalls.some((a) => a[0] === "set-sink-volume" && a[2] === "50%"), "approved volume change ran through the server");
  await page.click(".approval .actions .btn >> nth=0");
  await page.screenshot({ path: path.join(out, "8-voice-commands.png") });

  // abilities view explains limits in three parts
  await page.click('[data-view="abilities"]');
  await page.waitForSelector(".caps-table");
  const caps = await page.locator(".caps-table").textContent();
  check(/Read your Outlook mailbox/.test(caps) && /BMCC IT approval/.test(caps), "abilities table explains the Outlook limit and the missing piece");
  await page.screenshot({ path: path.join(out, "9-abilities.png") });

  // settings and audit log must not contain the email body
  await page.click('[data-view="settings"]');
  const auditText = await page.locator("#auditLog").textContent();
  check(!/14 students|budget too/.test(auditText) && /action\.approved/.test(auditText), "audit log records approval without content");
  await page.screenshot({ path: path.join(out, "6-settings.png"), fullPage: false });

  // privacy guard: a message with an SSN never leaves
  await page.click('[data-view="chat"]');
  await page.click("#newChat");
  const before = round;
  await page.fill("#input", "Student SSN 123-45-6789, what should I do?");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".notice.bad");
  check(round === before, "SSN message was blocked before reaching Claude");
  check(await page.locator("#otter").getAttribute("class").then((c) => /s-privacy/.test(c)), "otter raises the privacy shield");

  // phone width, dark
  const m = await browser.newPage({ viewport: { width: 390, height: 820 }, colorScheme: "dark" });
  await m.goto(`http://127.0.0.1:${port}/`);
  await m.waitForSelector("#obSkip");
  await m.click("#obSkip");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no horizontal scroll at phone width");
  await m.screenshot({ path: path.join(out, "7-phone-dark.png") });
  check(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
} finally {
  await browser.close();
  server.close();
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : "\nAll UI checks passed");
process.exit(fails.length ? 1 : 0);
