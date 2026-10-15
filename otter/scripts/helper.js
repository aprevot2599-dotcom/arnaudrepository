#!/usr/bin/env node
// O.T.T.E.R. helper launcher: starts the local server and opens O.T.T.E.R. in its own small
// Chrome (or Edge) window showing just the otter, with the microphone and sound allowed from
// the start. It uses a separate browser profile kept in data/local/chrome-profile, so the
// auto-allow settings apply only to O.T.T.E.R., never to your normal browsing.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +process.env.PORT || 4317;
const URL_ = `http://127.0.0.1:${PORT}/?mode=mini`;

export function browserCandidates(platform = process.platform, env = process.env) {
  if (platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")];
  if (platform === "win32") {
    const roots = [env["PROGRAMFILES"], env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return [...roots.map((r) => path.join(r, "Google", "Chrome", "Application", "chrome.exe")), ...roots.map((r) => path.join(r, "Microsoft", "Edge", "Application", "msedge.exe"))];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
}

export function helperArgs(url, profileDir) {
  return [
    `--app=${url}`,
    "--window-size=340,460",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Microphone and sound work from the first second: no permission prompt, no click needed
    // before speaking. Applies only inside this O.T.T.E.R. profile.
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const browser = process.env.OTTER_BROWSER || browserCandidates().find((p) => fs.existsSync(p));
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], { stdio: "inherit", env: process.env });
  const profile = path.join(ROOT, "data", "local", "chrome-profile");
  fs.mkdirSync(profile, { recursive: true });
  setTimeout(() => {
    if (!browser) {
      console.log(`Couldn't find Chrome or Edge. Open ${URL_} in Chrome yourself, or set OTTER_BROWSER to the browser's path.`);
      return;
    }
    const b = spawn(browser, helperArgs(URL_, profile), { stdio: "ignore", detached: true });
    b.unref();
    console.log(`O.T.T.E.R. helper window opened (${path.basename(browser)}). Close this terminal to stop O.T.T.E.R.`);
  }, 1200);
  const stop = () => { server.kill(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
