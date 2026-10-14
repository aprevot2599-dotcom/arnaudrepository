// Local persistence. Everything stays in this browser's storage on this device; nothing is
// written to an external database. Conversations older than the retention window are
// purged on load, and the whole store can be exported or wiped from Settings.

import { emptyUsage } from "../core/advisor.js";

const KEY = "otter.v1";

export const DEFAULT_SETTINGS = {
  approvedServices: [],
  allowContactDetails: false,
  ferpaAttested: false,
  ferpaBasis: "",
  ferpaApprover: "",
  myNames: ["Arnaud", "Prevot", "aprevot"],
  briefingFormat: "Bottom line first, then reasoning, then a short action list.",
  retentionDays: 90,
  glasses: true,
  reduceMotion: false,
  theme: "system",
  disabledSkills: [],
  onboarded: false,
  voiceOn: true,
  voiceVolume: 0.2,
  voiceRate: 1,
  voiceName: "",
  speakMode: "summary",
  conversationMode: true,
  systemVolumeAtLaunch: true,
  launchVolume: 20,
  voiceOnboarded: false,
  askAboveTokens: 15000,
};

function blank() {
  return { version: 1, conversations: [], sources: {}, findings: [], proposals: [], audit: [], knowledge: [], projects: [], tasks: [], permissions: {}, settings: { ...DEFAULT_SETTINGS }, counters: { source: 0 }, usage: emptyUsage(), tokenLedger: {}, lastVerify: null };
}

export class Store {
  constructor(storage) {
    this.storage = storage;
    this.data = blank();
    this.available = true;
    this._t = null;
  }
  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...blank(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }, usage: { ...emptyUsage(), ...(parsed.usage || {}) } };
      }
    } catch {
      this.available = false;
    }
    this.purgeExpired();
    return this;
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 150);
  }
  flush() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
      this.available = true;
    } catch {
      this.available = false;
    }
  }
  purgeExpired(now = Date.now()) {
    const days = +this.data.settings.retentionDays || 0;
    if (!days) return 0;
    const cutoff = now - days * 86400000;
    const before = this.data.conversations.length;
    const keep = this.data.conversations.filter((c) => c.pinned || c.updatedAt >= cutoff);
    const dropped = this.data.conversations.filter((c) => !keep.includes(c));
    for (const c of dropped) for (const sid of c.sourceIds || []) delete this.data.sources[sid];
    this.data.conversations = keep;
    return before - keep.length;
  }
  wipe() {
    this.data = blank();
    try { this.storage?.removeItem(KEY); } catch {}
  }
  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }
}
