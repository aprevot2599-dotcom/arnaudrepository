// Voice: speaks answers with the most natural male voice the browser offers and listens
// through the browser's speech recognition. Both are browser features, so what is possible
// depends on the browser and on where the page runs; voiceEnv() reports it honestly.

const MALE = /\b(andrew|guy|christopher|eric|brian|davis|roger|steffan|tony|jason|ryan|thomas|william|liam|connor|evan|nathan|aaron|alex|daniel|tom|reed|oliver|arthur|david|mark|james|george|rishi|lee|male|matthew|justin|joey|stephen|gregory|kevin)\b/i;
const FEMALE = /\b(aria|jenny|michelle|emma|ava|samantha|zira|susan|hazel|libby|sonia|natasha|karen|moira|tessa|fiona|victoria|allison|serena|female|catherine|nancy|joanna|salli|kimberly|ivy|kendra|ana|jane|nicky|zoe|siri)\b/i;
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|rocko|grandpa|junior|ralph|fred|eddy|sandy|shelley|flo)\b/i;
const NATURAL = /natural|neural|enhanced|premium/i;

export function vendorOf(v) {
  if (/microsoft/i.test(v.name)) return "Microsoft";
  if (/google/i.test(v.name)) return "Google";
  return "the browser maker";
}

export function scoreVoice(v) {
  if (!/^en/i.test(v.lang) || NOVELTY.test(v.name) || FEMALE.test(v.name) || !MALE.test(v.name)) return -1;
  let s = 10;
  if (NATURAL.test(v.name)) s += 20;
  if (/^en[-_]US/i.test(v.lang)) s += 3;
  if (/david|alex/i.test(v.name)) s -= 2; // older voices
  return s;
}

// allowCloud=false keeps answer text on this device: only localService voices qualify.
export function pickMaleVoice(voices, { allowCloud = false, preferred = "" } = {}) {
  const ranked = voices.map((v) => ({ v, s: scoreVoice(v) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  const local = ranked.filter((x) => x.v.localService);
  const cloud = ranked.filter((x) => !x.v.localService);
  const pool = allowCloud ? ranked : local;
  const pref = preferred && pool.find((x) => x.v.name === preferred);
  const best = pref || pool[0];
  return {
    voice: best?.v || null,
    natural: !!best && NATURAL.test(best.v.name),
    local: !!best?.v.localService,
    bestCloud: cloud[0]?.v || null,
    bestCloudNatural: !!cloud[0] && NATURAL.test(cloud[0].v.name),
    candidates: pool.map((x) => x.v),
  };
}

// Turns Markdown into something worth hearing: no symbols, tables, code or URLs.
export function speakable(md, mode = "summary") {
  let t = String(md || "")
    .replace(/O\.T\.T\.E\.R\.?/g, "Otter")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^:::\s*(\w+)\s*$/gm, (_, k) => ({ draft: "Draft.", limitation: "", suggestion: "Suggestion.", discrepancy: "Discrepancy.", recommendation: "Recommendation." }[k.toLowerCase()] ?? ""))
    .replace(/^:::\s*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\[REDACTED (\w+)\]/g, "a redacted $1")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = t.match(/[^.!?]+[.!?]+["')]?|[^.!?]+$/g) || [];
  if (mode === "full") return sentences.map((s) => s.trim()).filter(Boolean);
  const out = [];
  let len = 0;
  for (const s of sentences) {
    if (out.length >= 3 || len + s.length > 480) break;
    out.push(s.trim());
    len += s.length;
  }
  if (out.length < sentences.length) out.push("The rest is on screen.");
  return out.filter(Boolean);
}

export class Speaker {
  constructor({ getSettings, onStart, onEnd }) {
    this.synth = globalThis.speechSynthesis || null;
    this.getSettings = getSettings;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.voices = [];
    this.speaking = false;
    this._keepAlive = null;
    if (this.synth) {
      const load = () => (this.voices = this.synth.getVoices());
      load();
      this.synth.addEventListener?.("voiceschanged", load);
    }
  }
  get supported() { return !!this.synth; }
  choice() {
    const s = this.getSettings();
    return pickMaleVoice(this.voices, { allowCloud: s.allowCloudVoices, preferred: s.voiceName });
  }
  stop() {
    if (!this.synth) return;
    this.synth.cancel();
    clearInterval(this._keepAlive);
    if (this.speaking) { this.speaking = false; this.onEnd?.(true); }
  }
  // Speaks sentence by sentence with a short breath between, which sounds more natural and
  // avoids Chrome cutting off long utterances.
  speak(markdown, { mode } = {}) {
    if (!this.synth) return Promise.resolve(false);
    const s = this.getSettings();
    const { voice } = this.choice();
    const parts = speakable(markdown, mode || s.speakMode);
    if (!parts.length || s.voiceVolume <= 0) return Promise.resolve(false);
    this.synth.cancel();
    this.speaking = true;
    this.onStart?.();
    clearInterval(this._keepAlive);
    this._keepAlive = setInterval(() => { if (this.synth.speaking && !this.synth.paused) { this.synth.pause(); this.synth.resume(); } }, 10000);
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (!this.speaking) return resolve(false);
        if (i >= parts.length) { this.speaking = false; clearInterval(this._keepAlive); this.onEnd?.(false); return resolve(true); }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-US";
        u.volume = Math.max(0, Math.min(1, s.voiceVolume));
        u.rate = s.voiceRate || 1;
        u.pitch = 0.95;
        u.onend = () => setTimeout(next, 140);
        u.onerror = () => { this.speaking = false; clearInterval(this._keepAlive); this.onEnd?.(true); resolve(false); };
        this.synth.speak(u);
      };
      next();
    });
  }
}

export class Listener {
  constructor({ onFinal, onInterim, onState, onError, silenceMs = 1600 }) {
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    this.SR = SR;
    this.onFinal = onFinal;
    this.onInterim = onInterim;
    this.onState = onState;
    this.onError = onError;
    this.silenceMs = silenceMs;
    this.active = false;
    this.onDevice = false;
    this.noSpeech = 0;
  }
  get supported() { return !!this.SR; }
  // Chrome has an experimental on-device check (SpeechRecognition.available), but calling it
  // crashed the page in testing, so O.T.T.E.R. never calls it and assumes audio is sent to
  // the browser maker's speech service. That keeps the privacy notice on the cautious side.
  async checkOnDevice() {
    this.onDevice = false;
    return false;
  }
  start() {
    if (!this.SR || this.active) return false;
    const rec = new this.SR();
    this.rec = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    let timer = null;
    const finish = () => { clearTimeout(timer); try { rec.stop(); } catch {} };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      this.noSpeech = 0;
      this.onInterim?.((finalText + interim).trim());
      clearTimeout(timer);
      timer = setTimeout(finish, this.silenceMs);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") this.noSpeech++;
      if (e.error !== "no-speech" && e.error !== "aborted") this.onError?.(e.error);
    };
    rec.onend = () => {
      clearTimeout(timer);
      this.active = false;
      this.onState?.(false);
      const text = finalText.trim();
      if (text) this.onFinal?.(text);
      else if (this.noSpeech >= 2) this.onError?.("idle");
      else this.onError?.("silence");
    };
    try {
      rec.start();
      this.active = true;
      this.onState?.(true);
      return true;
    } catch (e) {
      this.onError?.(e.message || "start-failed");
      return false;
    }
  }
  stop() {
    if (this.rec && this.active) { try { this.rec.abort(); } catch {} }
    this.active = false;
  }
}
