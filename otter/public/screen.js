// Screen snapshots for coaching. Chrome asks you to pick a screen, window or tab and shows its
// own "sharing" bar the whole time. O.T.T.E.R. takes a still picture every 15 seconds, keeps
// only the latest one in memory (never on disk), and sends one to Claude only when you ask a
// question while it's looking. Stopping, sleeping or shutting off ends the capture entirely.

export function fitSize(w, h, max = 1280) {
  if (!w || !h) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

// Average absolute difference of two equal-length grayscale thumbnails, 0 (same) to 1.
export function diffScore(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / (a.length * 255);
}

export class ScreenWatcher {
  constructor({ onState = () => {}, onSnapshot = () => {}, intervalMs = 15000, maxWidth = 1280, getWindow = () => window } = {}) {
    this.onState = onState;
    this.onSnapshot = onSnapshot;
    this.intervalMs = intervalMs;
    this.maxWidth = maxWidth;
    this.getWindow = getWindow;
    this.active = false;
    this.latest = null;
    this.thumb = null;
  }
  get supported() { return !!this.getWindow().navigator.mediaDevices?.getDisplayMedia; }
  async start() {
    if (this.active) return true;
    const w = this.getWindow();
    this.stream = await w.navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false, selfBrowserSurface: "exclude", surfaceSwitching: "include" });
    const track = this.stream.getVideoTracks()[0];
    track.addEventListener("ended", () => this.stop("Chrome's Stop sharing button"));
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.active = true;
    this.surface = track.getSettings?.().displaySurface || "screen";
    this.onState(true, this.surface);
    await this.capture();
    this.timer = setInterval(() => this.capture(), this.intervalMs);
    return true;
  }
  async capture() {
    if (!this.active || !this.video) return null;
    const v = this.video;
    if (!v.videoWidth) await new Promise((r) => setTimeout(r, 300));
    const { width, height } = fitSize(v.videoWidth, v.videoHeight, this.maxWidth);
    if (!width) return null;
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const g = c.getContext("2d");
    g.drawImage(v, 0, 0, width, height);
    const url = c.toDataURL("image/jpeg", 0.72);
    // Tiny grayscale thumbnail to tell whether the screen changed since the last picture.
    const t = document.createElement("canvas");
    t.width = 32; t.height = 18;
    const tg = t.getContext("2d");
    tg.drawImage(c, 0, 0, 32, 18);
    const px = tg.getImageData(0, 0, 32, 18).data;
    const gray = new Uint8Array(32 * 18);
    for (let i = 0; i < gray.length; i++) gray[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
    const changed = diffScore(this.thumb, gray);
    this.thumb = gray;
    this.latest = { url, data: url.split(",")[1], mediaType: "image/jpeg", width, height, at: Date.now(), changed };
    this.onSnapshot(this.latest);
    return this.latest;
  }
  stop(reason = "") {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    const was = this.active;
    this.stream = null; this.video = null; this.latest = null; this.thumb = null; this.active = false;
    if (was) this.onState(false, reason);
  }
}
