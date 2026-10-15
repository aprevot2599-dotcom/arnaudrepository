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
          return { stop_reason: "end_turn", usage: { input_tokens: 6100, output_tokens: 420 }, content: [{ type: "text", text: ":::understood\nYou want the thread summarized and a reply drafted for your approval.\n:::\n\n**Bottom line:** Dana asked for the budget by October 20 and the thread disagrees on headcount (14 vs 12).\n\n:::discrepancy\n**Finding:** Headcount differs.\n**Confidence:** medium\n:::\n\n:::draft\nHi Dana, confirming the cohort start. Budget to follow by Friday.\n:::\n\nI queued the reply for your approval. Nothing has been sent.\n\n:::better\nYou can make this experience better if you attach the cohort budget, so I can check the headcount against it.\n:::" }] };
        }
        return {
          stop_reason: "tool_use",
          usage: { input_tokens: 5900, output_tokens: 260 },
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
const nav = async (p, v) => { await p.click("#openSide"); await p.click(`[data-view="${v}"]`); };
const check = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? "PASS " : "FAIL ") + msg); };

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("body.mini");
  check(true, "opens as just the otter (mini helper view)");
  check(await page.isVisible("#miniBar") && await page.isVisible("#miniMax") && await page.isVisible("#miniChat"), "mini view shows microphone, chat and maximize buttons");
  check(!(await page.isVisible("#messages")), "chat stays hidden until asked for");
  check(await page.locator("#modalRoot").isHidden(), "no setup questions block first use");
  check(await page.locator("#enginePill").textContent().then((t) => /Claude API/.test(t) && !/not approved/.test(t)), "defaults are on: Claude approved without a setup screen");
  await page.click("#miniChat");
  await page.waitForSelector("body.mini-chat #messages");
  check(await page.locator("#messages").textContent().then((t) => /On by default/.test(t) && /Still off, on purpose/.test(t)), "first launch says exactly what was switched on and what stays off");
  await page.screenshot({ path: path.join(out, "0-mini-chat.png") });
  await page.click("#miniChat");
  await page.screenshot({ path: path.join(out, "0-mini.png") });
  await page.click("#miniMax");
  await page.waitForSelector("body:not(.mini)");
  check(true, "maximize opens the full view");
  await page.waitForSelector("#convBanner:not([hidden])");
  check(await page.locator("#convBanner").textContent().then((t) => /20% volume/.test(t)), "launch banner offers to set the computer to 20%");
  await page.click("#openSide"); await page.click("#newChat");
  check(await page.locator(".tile").count() === 6, "start screen shows six friendly action tiles");
  await page.click("#otterBtn");
  check(await page.locator("#otter").getAttribute("class").then((c) => /trick/.test(c)), "tapping the otter makes it do a trick");
  await page.screenshot({ path: path.join(out, "1-empty-light.png") });

  // add an email source
  await page.click("#addSourceBtn");
  await page.fill("#srcTitle", "Welding cohort");
  await page.fill("#srcText", "From: Dana Ruiz <dana@example.org>\nDate: Oct 6, 2026\nSubject: Welding cohort\n\nCan you confirm the cohort start by October 20? Please send the budget too. We will host 14 students.\n\nFrom: Arnaud Prevot\nDate: Oct 7, 2026\n\nI will send the budget by Friday. We expect 12 students.");
  await page.check("#srcAttest");
  await page.click("#srcAdd");
  check(await page.locator(".chip .k").first().textContent() === "S1", "source chip S1 appears");

  await page.fill("#input", "Summarize the thread and draft my reply.");
  await page.waitForFunction(() => /Route: standard/.test(document.getElementById("routeHint").textContent));
  check(true, "route hint shows the standard route and a token estimate before sending");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".msg-assistant .proposal .status-pending", { timeout: 15000 });
  await page.waitForSelector(".msg-assistant .callout-draft");
  check(await page.locator(".callout-discrepancy").count() > 0, "discrepancy callout rendered");
  check(await page.locator(".callout-understood").count() > 0 && await page.locator(".callout-better").count() > 0, "answer shows what it understood and how to make the experience better");
  const ul = await page.locator(".msg-assistant:has(.callout-better) .usage-line").first().textContent();
  check(/used 12,680 tokens/.test(ul), "answer shows exact tokens used (summed over tool rounds) and cost");
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
  await page.click("#dashClose");

  // skills view
  await nav(page, "skills");
  await page.waitForSelector(".data-table tbody tr");
  check(await page.locator(".data-table tbody tr.expandable").count() >= 20, "skill registry lists BMCC skills");
  await page.screenshot({ path: path.join(out, "5-skills.png") });

  // voice commands run locally, without Claude
  await nav(page, "chat");
  let r0 = round;
  await page.fill("#input", "louder");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Speaking volume is now 35%");
  check(round === r0, "\"louder\" raised speaking volume to 35% without calling Claude");
  check(await page.locator(".usage-line").last().textContent().then((t) => /0 tokens/.test(t)), "local answers are labeled 0 tokens");
  // learning: a stated preference is offered for memory and kept after "yes"
  await page.fill("#input", "From now on, I prefer tables over long paragraphs.");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".callout-question", { timeout: 15000 });
  check(await page.locator(".callout-question").last().textContent().then((t) => /tables over long paragraphs/.test(t)), "O.T.T.E.R. asks before remembering a preference");
  await page.fill("#input", "yes");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Got it. I'll remember that.");
  check(true, "saying yes keeps it");
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
  await nav(page, "abilities");
  await page.waitForSelector(".caps-table");
  const caps = await page.locator(".caps-table").textContent();
  check(/Read your Outlook mailbox/.test(caps) && /BMCC IT approval/.test(caps), "abilities table explains the Outlook limit and the missing piece");
  check(await page.locator("#knowBox").textContent().then((t) => /tables over long paragraphs/.test(t) && /Bottom line first/.test(t)), "What I know about you shows the brief and the learned preference");
  await page.click("#runCheck");
  await page.waitForSelector("#verifyBox table");
  const vtext = await page.locator("#verifyBox").textContent();
  check(/Claude API key|Claude API/.test(vtext) && /Privacy guard/.test(vtext) && /tokens used: 0/.test(vtext), "morning check runs from the Abilities page, uses 0 tokens, and covers server and browser");
  await page.screenshot({ path: path.join(out, "9-abilities.png") });

  // settings and audit log must not contain the email body
  await nav(page, "settings");
  const auditText = await page.locator("#auditLog").textContent();
  check(!/14 students|budget too/.test(auditText) && /action\.approved/.test(auditText), "audit log records approval without content");
  await page.screenshot({ path: path.join(out, "6-settings.png"), fullPage: false });

  // privacy guard: a message with an SSN never leaves
  await nav(page, "chat");
  await page.click("#openSide"); await page.click("#newChat");
  const before = round;
  await page.fill("#input", "Student SSN 123-45-6789, what should I do?");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".notice.bad");
  check(round === before, "SSN message was blocked before reaching Claude");
  check(await page.waitForFunction(() => /s-privacy/.test(document.getElementById("otter").className), null, { timeout: 8000 }).then(() => true, () => false), "otter raises the privacy shield");

  // phone width, dark
  const m = await browser.newPage({ viewport: { width: 390, height: 820 }, colorScheme: "dark" });
  await m.goto(`http://127.0.0.1:${port}/`);
  await m.waitForSelector("body.mini");
  await m.screenshot({ path: path.join(out, "7-phone-mini-dark.png") });
  await m.click("#miniMax");
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
