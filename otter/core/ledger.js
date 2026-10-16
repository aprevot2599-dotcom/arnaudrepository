// Verifiable activity ledger. Every session event and every byte that leaves the device is
// recorded as a hash-chained entry: each entry's hash covers its content and the previous
// entry's hash, so editing, deleting or reordering any entry breaks the chain from that point.
// Entries describe what happened (when, where to, how many bytes and tokens, a fingerprint of
// the payload) and never the content itself. scripts/verify-log.mjs checks an exported ledger
// independently of the app.
import { canonical, sha256 } from "./security.js";

export const GENESIS = "0".repeat(64);
// The only place O.T.T.E.R. may send anything in closed mode.
export const ALLOWED_HOSTS = ["api.anthropic.com"];

export async function entryHash(e) {
  const { hash, ...body } = e;
  return sha256(canonical(body));
}

export class Ledger {
  constructor(entries = [], { now = () => Date.now(), limit = 5000, onChange = () => {} } = {}) {
    this.entries = entries;
    this.now = now;
    this.limit = limit;
    this.onChange = onChange;
    this.queue = Promise.resolve();
  }
  get head() {
    return this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS;
  }
  // Appends are serialized so the chain order matches the call order.
  append(type, detail = {}) {
    this.queue = this.queue.then(async () => {
      const safe = {};
      for (const [k, v] of Object.entries(detail)) if (!["content", "text", "body", "image", "payload"].includes(k)) safe[k] = v;
      const prev = this.entries[this.entries.length - 1];
      const e = { seq: prev ? prev.seq + 1 : 1, ts: new Date(this.now()).toISOString(), type, detail: safe, prev: prev ? prev.hash : GENESIS };
      e.hash = await entryHash(e);
      this.entries.push(e);
      if (this.entries.length > this.limit) this._compact();
      this.onChange(e);
      return e;
    });
    return this.queue;
  }
  // Oldest entries are replaced by one checkpoint that carries the dropped range's last hash,
  // so the remaining chain still verifies from the checkpoint.
  _compact() {
    const drop = this.entries.length - Math.floor(this.limit * 0.8);
    const dropped = this.entries.splice(0, drop);
    const last = dropped[dropped.length - 1];
    this.entries.unshift({ seq: last.seq, ts: last.ts, type: "checkpoint", detail: { droppedFrom: dropped[0].seq, droppedTo: last.seq }, prev: "checkpoint", hash: last.hash });
  }
  export() {
    return JSON.stringify({ format: "otter-ledger-1", exportedAt: new Date(this.now()).toISOString(), head: this.head, entries: this.entries }, null, 2);
  }
}

// Returns {ok, count, brokenAt, reason}. Works on an exported ledger with no app code.
export async function verifyChain(entries) {
  let prevHash = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === "checkpoint" && i === 0) { prevHash = e.hash; continue; }
    const expectedPrev = i === 0 ? GENESIS : prevHash;
    if (e.prev !== expectedPrev) return { ok: false, count: entries.length, brokenAt: e.seq, reason: "link to the previous entry doesn't match (an entry was removed, inserted or reordered)" };
    if ((await entryHash(e)) !== e.hash) return { ok: false, count: entries.length, brokenAt: e.seq, reason: "entry content doesn't match its fingerprint (it was edited)" };
    if (i > 0 && entries[i - 1].type !== "checkpoint" && e.seq !== entries[i - 1].seq + 1) return { ok: false, count: entries.length, brokenAt: e.seq, reason: "sequence numbers skip" };
    prevHash = e.hash;
  }
  return { ok: true, count: entries.length, brokenAt: null, reason: "" };
}

// Every outbound request goes through here: it refuses any host that isn't allowed and
// records what left, how big it was, and a fingerprint of it.
export function makeClosedFetch(ledger, { allowed = ALLOWED_HOSTS, baseFetch = (...a) => fetch(...a), selfOrigin = null } = {}) {
  return async function closedFetch(url, init = {}, purpose = "") {
    const u = new URL(url, selfOrigin || "http://localhost");
    const local = selfOrigin && u.origin === selfOrigin;
    if (!local && !allowed.includes(u.hostname)) {
      await ledger.append("network.blocked", { host: u.hostname, purpose });
      throw Object.assign(new Error(`Blocked: O.T.T.E.R. only talks to ${allowed.join(", ")}. Nothing was sent to ${u.hostname}.`), { code: "blocked_host" });
    }
    const body = typeof init.body === "string" ? init.body : "";
    const images = (body.match(/"type":"image"/g) || []).length;
    const sent = await ledger.append(local ? "network.local" : "network.out", { host: u.hostname, path: u.pathname, purpose, bytes: body.length, images, fingerprint: body ? (await sha256(body)).slice(0, 16) : "" });
    const res = await baseFetch(url, init);
    return Object.assign(res, { ledgerSeq: sent.seq });
  };
}
