// Computer volume control for the local server. Uses each operating system's own tool with
// fixed arguments (no shell), and only an integer 0-100 ever reaches the command line.
// macOS and Linux were written against documented commands; Windows uses the Core Audio
// COM interface through PowerShell. Only the Linux path has been run in the build
// environment (against a fake runner); test on your machine before relying on it.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function defaultRunner(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(String(stdout))));
  });
}

function onPath(bin) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  return dirs.some((d) => { try { return fs.statSync(path.join(d, bin)).isFile(); } catch { return false; } });
}

const WIN_TYPE = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class OtterAudio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null; Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null; var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv)); return epv;
  }
  public static float Get() { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(v, Guid.Empty)); }
}
'@`;

export function detectBackend(platform = process.platform, has = onPath) {
  if (platform === "darwin") return { available: true, platform, method: "macOS osascript" };
  if (platform === "win32") return { available: true, platform, method: "Windows Core Audio (PowerShell)" };
  if (platform === "linux") {
    if (has("pactl")) return { available: true, platform, method: "PulseAudio/PipeWire pactl", tool: "pactl" };
    if (has("amixer")) return { available: true, platform, method: "ALSA amixer", tool: "amixer" };
    return { available: false, platform, reason: "No volume tool found on this Linux computer.", fix: "Install pulseaudio-utils (pactl) or alsa-utils (amixer), then restart O.T.T.E.R." };
  }
  return { available: false, platform, reason: `Volume control isn't implemented for ${platform}.`, fix: "Use macOS, Windows or Linux." };
}

export function validLevel(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw Object.assign(new Error("Volume must be a whole number from 0 to 100."), { status: 400 });
  return n;
}

export async function getVolume(backend, run = defaultRunner) {
  if (!backend.available) throw Object.assign(new Error(backend.reason), { status: 501 });
  if (backend.platform === "darwin") return parseInt(await run("osascript", ["-e", "output volume of (get volume settings)"]), 10);
  if (backend.platform === "win32") return Math.round(parseFloat(await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_TYPE + "\n[OtterAudio]::Get()"])) * 100);
  if (backend.tool === "pactl") return parseInt((await run("pactl", ["get-sink-volume", "@DEFAULT_SINK@"])).match(/(\d+)%/)?.[1] ?? "NaN", 10);
  return parseInt((await run("amixer", ["sget", "Master"])).match(/\[(\d+)%\]/)?.[1] ?? "NaN", 10);
}

export async function setVolume(backend, level, run = defaultRunner) {
  const n = validLevel(level);
  if (!backend.available) throw Object.assign(new Error(backend.reason), { status: 501 });
  if (backend.platform === "darwin") await run("osascript", ["-e", `set volume output volume ${n}`]);
  else if (backend.platform === "win32") await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_TYPE + `\n[OtterAudio]::Set(${(n / 100).toFixed(2)})`]);
  else if (backend.tool === "pactl") await run("pactl", ["set-sink-volume", "@DEFAULT_SINK@", `${n}%`]);
  else await run("amixer", ["sset", "Master", `${n}%`]);
  return n;
}
