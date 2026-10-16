// Browser test of the closed, no-install file (dist/otter-web.html) opened from disk, the way
// it will be used. Claude is simulated by intercepting api.anthropic.com; screen sharing is
// simulated with a drawn canvas. Checks: start card, closed mode, only api.anthropic.com is
// reachable, screen snapshot sent only with a question, circles on the snapshot, checklists,
// verifiable log, and the shut-off switch.
// Usage: node scripts/build-artifact.js && node tests/web-smoke.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pw = await import(process.env.PLAYWRIGHT_MODULE || "/opt/node-tools/node_modules/playwright/index.js");
const chromium = pw.chromium || pw.default?.chromium;
const out = process.argv[2] || path.join(ROOT, "tests", "screenshots");
fs.mkdirSync(out, { recursive: true });
const file = "file://" + path.join(ROOT, "dist", "otter-web.html");

const fails = [];
const check = (c, m) => { if (!c) fails.push(m); console.log((c ? "PASS " : "FAIL ") + m); };
const browser = await chromium.launch();
const calls = [];
try {
  // 1) The floating window: Start opens Chrome's always-on-top window with the otter in it.
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(file);
    await p.waitForSelector("#startCard");
    const pipPromise = ctx.waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await p.click(".start-go");
    const pip = await pipPromise;
    if (pip) {
      await pip.waitForSelector("#otter", { timeout: 5000 }).catch(() => {});
      check(await pip.locator("#otter svg").count() === 1 && await pip.locator("body.mini").count() === 1, "Start opens the floating always-on-top window with just the otter in it");
      check(await p.locator("#floatNote").count() === 1, "the original tab says O.T.T.E.R. is floating, with a way to bring it back");
      await pip.screenshot({ path: path.join(out, "w0-floating.png") });
      await pip.click("#miniOff");
      await p.waitForSelector("#offScreen", { timeout: 5000 }).catch(() => {});
      check(pip.isClosed() || (await p.locator("#offScreen").count()) === 1, "the power button closes the floating window and shows Otter is off");
    } else check(false, "Start opens the floating window (this browser build didn't open one)");
    await ctx.close();
  }

  // 2) Everything else, with the floating window turned off so the test can reach the page.
  const page = await browser.newPage({ viewport: { width: 420, height: 640 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Content Security Policy|example\.com|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    delete window.documentPictureInPicture;
    // A fake shared screen: a canvas with a "Save" button drawn top right.
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
      const g = c.getContext("2d");
      const draw = () => { g.fillStyle = "#fff"; g.fillRect(0, 0, 1280, 720); g.fillStyle = "#217346"; g.fillRect(1000, 120, 160, 50); g.fillStyle = "#fff"; g.font = "28px sans-serif"; g.fillText("Save", 1045, 155); };
      draw(); setInterval(draw, 200);
      return c.captureStream(5);
    };
  });
  await page.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    calls.push({ headers: req.headers(), body });
    const last = body.messages.at(-1);
    const isToolResult = Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result");
    const usage = { input_tokens: 4200, output_tokens: 300 };
    const json = isToolResult
      ? { stop_reason: "end_turn", usage, content: [{ type: "text", text: ":::understood\nYou can't find where to save the flow.\n:::\n\nIt's the **Save** button, top right; I circled it.\n\n- [ ] Click Save (top right)\n- [ ] Click Test, then Manually\n\n:::better\nYou can make this experience better if you keep the flow designer full screen while I look.\n:::" }] }
      : { stop_reason: "tool_use", usage, content: [{ type: "tool_use", id: "t1", name: "point_at", input: { x: 0.84, y: 0.2, label: "Save button" } }] };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(json) });
  });

  await page.goto(file);
  await page.waitForSelector("#startCard");
  check(true, "opens with a start card (one click starts it)");
  check(!(await page.isChecked("#startHey")), "\"Hey Otter\" listening is off until you choose it (closed mode)");
  await page.fill("#startKey", "sk-ant-test-key");
  await page.screenshot({ path: path.join(out, "w1-start.png") });
  await page.click(".start-go");
  await page.waitForSelector("#startCard", { state: "detached" });
  check(await page.locator("body.mini").count() === 1, "starts as just the otter");
  check(await page.locator("#enginePill").textContent().then((t) => /direct/.test(t)), "connected straight to the Claude API, no server");

  const blocked = await page.evaluate(() => fetch("https://example.com/").then(() => "reached", () => "blocked"));
  check(blocked === "blocked", "the browser itself blocks any address except api.anthropic.com (Content Security Policy)");

  // ask without looking: no picture goes out
  await page.click("#miniChat");
  await page.fill("#input", "Hey, what is a good name for a reminder flow?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".msg-assistant").length >= 2, null, { timeout: 15000 });
  check(calls.length > 0 && !JSON.stringify(calls[0].body).includes('"type":"image"'), "no screen picture is sent when O.T.T.E.R. isn't looking");
  check(calls[0].headers["anthropic-dangerous-direct-browser-access"] === "true" && calls[0].headers["x-api-key"] === "sk-ant-test-key", "request goes straight to Anthropic with your key");

  // look, then ask where something is
  await page.click("#miniLook");
  await page.waitForFunction(() => document.getElementById("miniLook").classList.contains("on"));
  check(true, "eye button starts looking (after Chrome's own screen picker)");
  const before = calls.length;
  await page.fill("#input", "where is the save button?");
  await page.keyboard.press("Enter");
  await page.waitForSelector("figure.snap svg circle", { state: "attached", timeout: 15000 });
  check(JSON.stringify(calls[before].body).includes('"type":"image"'), "asking while looking sends one snapshot with the question");
  check(await page.locator(".snap-labels").last().textContent().then((t) => /Save button/.test(t)), "the answer circles the spot on the snapshot and labels it");
  const boxes = page.locator(".msg-assistant:has(figure.snap) li.task input");
  check(await boxes.count() === 2, "steps arrive as a clickable checklist");
  await page.screenshot({ path: path.join(out, "w2-pointing.png") });
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.waitForFunction(() => !document.body.classList.contains("mini-chat"), null, { timeout: 6000 });
  check(true, "ticking every step shrinks the helper back to the otter");

  // the verifiable log
  await page.click("#miniMax");
  await page.click("#openSide"); await page.click('[data-view="abilities"]');
  await page.click("#lgVerify");
  await page.waitForSelector("#lgResult .notice");
  check(await page.locator("#lgResult").textContent().then((t) => /Verified/.test(t)), "the log verifies in the app");
  const exported = await page.evaluate(() => JSON.parse(localStorage.getItem("otter.v1")).ledger);
  const types = exported.map((e) => e.type);
  check(["session.start", "screen.on", "screen.snapshot", "screen.sent", "network.out", "claude.answer"].every((t) => types.includes(t)), "the log records start, looking, snapshots, what was sent and each answer");
  check(!JSON.stringify(exported).includes("sk-ant-test-key") && !JSON.stringify(exported).includes("save button"), "the log holds no key and no content");
  const logFile = path.join(out, "ledger.json");
  fs.writeFileSync(logFile, JSON.stringify({ entries: exported }));
  let cli = "";
  try { cli = execFileSync(process.execPath, [path.join(ROOT, "scripts", "verify-log.mjs"), logFile]).toString(); } catch (e) { cli = String(e.stdout); }
  check(/VERIFIED/.test(cli) && /api\.anthropic\.com \(all allowed\)/.test(cli), "the separate log checker verifies it and finds only api.anthropic.com");
  const tampered = exported.map((e, i) => (i === 3 ? { ...e, detail: { ...e.detail, bytes: 1 } } : e));
  fs.writeFileSync(logFile, JSON.stringify({ entries: tampered }));
  try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "verify-log.mjs"), logFile]); cli = "passed"; } catch (e) { cli = String(e.stdout); }
  check(/BROKEN/.test(cli), "an edited log is caught");

  // shut off
  await page.click('[data-view="chat"]').catch(() => {});
  await page.click("#minBtn");
  await page.click("#miniOff");
  await page.waitForSelector("#offScreen");
  check(!(await page.evaluate(() => document.getElementById("miniLook").classList.contains("on"))), "shut off stops looking at the screen");
  await page.waitForTimeout(600); // the log is saved a moment after each entry
  const offTypes = await page.evaluate(() => JSON.parse(localStorage.getItem("otter.v1")).ledger.map((e) => e.type));
  check(offTypes.includes("session.off") && offTypes.includes("screen.off"), "shut off is recorded in the log");
  await page.screenshot({ path: path.join(out, "w3-off.png") });
  check(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : "\nAll web checks passed");
process.exit(fails.length ? 1 : 0);
