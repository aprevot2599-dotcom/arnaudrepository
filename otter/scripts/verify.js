#!/usr/bin/env node
// Runs the morning check once from the command line, for an operating-system scheduler to
// call at 5 a.m. when the O.T.T.E.R. server isn't left running. Uses no Claude tokens unless
// OTTER_VERIFY_LIVE=1. The report is saved to data/local/verification/ for the app to show.
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { serverChecks, saveReport } from "../lib/verify-server.js";
import { detectBackend } from "../lib/sysvolume.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
const report = { ...(await serverChecks({ root, client, model: process.env.OTTER_MODEL || "claude-opus-5-5", volumeBackend: detectBackend(), live: process.env.OTTER_VERIFY_LIVE === "1" })), trigger: "os-scheduler" };
saveReport(root, report);
for (const c of report.checks) console.log(`${c.status.toUpperCase().padEnd(4)} ${c.name}: ${c.detail}${c.fix ? `  Fix: ${c.fix}` : ""}`);
console.log(`Claude tokens used: ${report.tokensUsed}`);
process.exit(report.checks.some((c) => c.status === "fail") ? 1 : 0);
