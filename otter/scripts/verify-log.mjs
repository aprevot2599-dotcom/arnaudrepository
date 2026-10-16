#!/usr/bin/env node
// Checks an exported O.T.T.E.R. log on its own, without the app: every entry's fingerprint
// must match its content and link to the entry before it. Also lists every outside address
// the log says was contacted.  Usage: node scripts/verify-log.mjs otter-ledger.json
import fs from "node:fs";
import { verifyChain, ALLOWED_HOSTS } from "../core/ledger.js";

const file = process.argv[2];
if (!file) { console.error("Usage: node scripts/verify-log.mjs <exported-log.json>"); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const entries = data.entries || data;
const r = await verifyChain(entries);
const hosts = [...new Set(entries.filter((e) => e.type === "network.out").map((e) => e.detail.host))];
const blocked = entries.filter((e) => e.type === "network.blocked").length;
const exceptions = entries.filter((e) => e.type === "closed_mode.off").map((e) => `#${e.seq} ${e.ts}: ${e.detail.exception}`);
console.log(r.ok ? `VERIFIED: ${r.count} entries, chain intact.` : `BROKEN at entry #${r.brokenAt}: ${r.reason}.`);
console.log(`Outside addresses contacted: ${hosts.length ? hosts.join(", ") : "none"}${hosts.every((h) => ALLOWED_HOSTS.includes(h)) ? " (all allowed)" : "  <-- NOT ALLOWED"}`);
console.log(`Blocked attempts: ${blocked}`);
console.log(`Closed-mode exceptions turned on: ${exceptions.length ? "\n  " + exceptions.join("\n  ") : "none"}`);
process.exit(r.ok && hosts.every((h) => ALLOWED_HOSTS.includes(h)) ? 0 : 1);
