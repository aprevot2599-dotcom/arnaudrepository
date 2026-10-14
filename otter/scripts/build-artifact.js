#!/usr/bin/env node
// Bundles the app into one self-contained HTML file for publishing as a private claude.ai
// artifact. Modules are concatenated in dependency order with import/export syntax removed,
// the stylesheet and skill registry are inlined, and the result is syntax-checked.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["core/security.js", "core/privacy.js", "core/analysis.js", "core/orchestrator.js", "core/capabilities.js", "core/advisor.js", "core/voicecmd.js", "core/agent.js", "public/markdown.js", "public/otter.js", "public/voice.js", "public/store.js", "public/app.js"];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let js = "";
for (const m of MODULES) {
  const src = read(m)
    .replace(/^import [\s\S]*? from "[^"]+";\n/gm, "")
    .replace(/^export (?=(?:async )?function |const |class |let )/gm, "");
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`Unbundled import/export left in ${m}`);
  js += `\n// ---- ${m} ----\n${src}`;
}
js = js.replace(/<\/script/gi, "<\\/script");

const registry = JSON.parse(read("data/skills.json"));
const css = read("public/styles.css");
let html = read("public/index.html")
  .replace('<link rel="stylesheet" href="/public/styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="/public/app.js"></script>', () => `<script>globalThis.OTTER_SKILLS = ${JSON.stringify({ generatedAt: registry.generatedAt, skills: registry.skills }).replace(/</g, "\\u003c")};</script>\n<script type="module">${js}\n</script>`);

const out = path.join(ROOT, "dist", "otter.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

// Syntax check of the bundled script (duplicate top-level names fail here)
const tmp = path.join(ROOT, "dist", ".bundle-check.mjs");
fs.writeFileSync(tmp, js);
try { execFileSync(process.execPath, ["--check", tmp]); } finally { fs.unlinkSync(tmp); }
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB, ${registry.skills.length} skills inlined)`);
