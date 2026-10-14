#!/usr/bin/env node
// Skill discovery: inventories SKILL.md files that are actually present on disk and writes
// data/skills.json. Only metadata and a short summary are stored, never the full skill body,
// so the registry can ship inside the browser app without carrying form URLs or other
// operational detail. Full instructions stay on disk and are read locally by server.js.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "data", "skills.json");

export function skillRoots() {
  const roots = [];
  if (process.env.OTTER_SKILLS_DIR) roots.push(...process.env.OTTER_SKILLS_DIR.split(path.delimiter));
  const home = os.homedir();
  const base = path.join(home, ".claude", "skills");
  if (fs.existsSync(base)) {
    roots.push(base);
    const synced = path.join(base, "synced");
    if (fs.existsSync(synced)) for (const d of fs.readdirSync(synced)) if (!d.startsWith(".") && fs.statSync(path.join(synced, d)).isDirectory()) roots.push(path.join(synced, d));
  }
  const pluginBase = path.join(home, ".claude", "plugins", "synced");
  if (fs.existsSync(pluginBase)) {
    for (const p of fs.readdirSync(pluginBase)) {
      const pd = path.join(pluginBase, p);
      if (!fs.statSync(pd).isDirectory()) continue;
      for (const plugin of fs.readdirSync(pd)) {
        const sd = path.join(pd, plugin, "skills");
        if (fs.existsSync(sd)) roots.push(sd);
      }
    }
  }
  // Project-level skills in this repository
  const repoSkills = path.join(here, "..", "..", ".claude", "skills");
  if (fs.existsSync(repoSkills)) roots.push(repoSkills);
  return [...new Set(roots)];
}

export function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[kv[1]] = v.replace(/\\"/g, '"');
  }
  return { meta, body: m[2] };
}

// Systems a skill touches, inferred from what its own instructions say. Each maps to a
// permission in core/security.js, so a skill cannot run until that system is authorized.
const SYSTEM_PATTERNS = [
  ["chrome", /claude in chrome|mcp__claude-in-chrome|chrome extension/i],
  ["builtin_browser", /built-in browser|Claude_Browser/i],
  ["desktop", /computer use|mcp__computer-use/i],
  ["outlook", /\boutlook\b|microsoft 365|\bm365\b/i],
  ["sharepoint", /sharepoint/i],
  ["teams", /\bteams\b/i],
  ["banner", /\bbanner\b/i],
  ["synergy", /\bsynergy\b/i],
  ["paycom", /paycom/i],
  ["intacct", /intacct/i],
  ["jotform", /jotform/i],
  ["google_forms", /google (course request )?form|docs\.google\.com\/forms/i],
  ["ms_forms", /microsoft form/i],
  ["google_drive", /google drive|google docs|google sheets|google slides/i],
  ["gmail", /\bgmail\b/i],
  ["calendar", /google calendar/i],
  ["canva", /\bcanva\b/i],
  ["website_cms", /elementor|wordpress|bluecc\.edu/i],
  ["claude_memory", /claude memory|\/memories|memory tool|saves? (?:results )?to memory/i],
  ["web_research", /web search|live public sources|search the web|fresh search|websearch/i],
];

const SENSITIVITY_PATTERNS = [
  ["ferpa_student_records", /failing students|student records|\bgrades?\b.*\bstudents?\b|\bFERPA\b|synergy/i],
  ["personnel_confidential", /candidate|applicant|hiring committee|\bcv\b|resume/i],
  ["financial", /budget|intacct|compensation|\$\d|fee/i],
  ["credentials_signin", /sign-?in|log ?in|password/i],
];

const CAPABILITY_VERBS = [
  ["generate documents", /\.docx|word document|report/i],
  ["fill forms (stops before submit)", /form/i],
  ["research public sources", /research|search|sources/i],
  ["analyze data files", /csv|xlsx|spreadsheet|fte/i],
  ["draft communications", /email|agenda|post|flyer/i],
  ["score or evaluate", /score|matrix|rubric|scorecard/i],
  ["manage memory", /memory/i],
  ["route and orchestrate other skills", /child skill|orchestrat|routes?/i],
  ["grant development", /grant/i],
  ["policy review", /policy/i],
];

function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.max(1, sa.size + sb.size - inter);
}
const STOP = new Set("the a an and or of to for in on with by from is are be use this that it its as at when whenever any even if skill not named user ask asks".split(" "));
function tokens(s) {
  return (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((t) => !STOP.has(t));
}

export function summarize(body) {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#") && !p.startsWith("```") && !p.startsWith("|"));
  const first = paras[0] || "";
  // Addresses and URLs stay in the SKILL.md on disk; the shipped registry does not carry them.
  return first.replace(/\s+/g, " ").replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]").replace(/https?:\/\/\S+/g, "[link]").slice(0, 420);
}

export function analyzeSkill(dir, src) {
  const { meta, body } = parseFrontmatter(src);
  const name = meta.name || path.basename(dir);
  const description = (meta.description || "").replace(/\s+/g, " ").replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]").trim();
  const text = description + "\n" + body;
  const systems = SYSTEM_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
  const sensitivity = SENSITIVITY_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
  const capabilities = CAPABILITY_VERBS.filter(([, re]) => re.test(description)).map(([k]) => k);
  const bmcc = /\bBMCC\b|Blue Mountain|Arnaud|Prevot|Community Education|Workforce Training/i.test(text);
  const stopsBeforeSubmit = /never (?:click|press)|stop(?:s|ping)? before|never submit|without clicking/i.test(text);
  const needsBrowser = systems.some((s) => ["chrome", "builtin_browser", "desktop"].includes(s));
  return {
    name,
    description,
    summary: summarize(body),
    path: dir,
    bmcc,
    systems,
    sensitivity,
    capabilities,
    stopsBeforeSubmit,
    needsBrowser,
    hasScripts: fs.existsSync(path.join(dir, "scripts")),
    hasReferences: fs.existsSync(path.join(dir, "references")),
    bytes: Buffer.byteLength(src),
  };
}

export function discover(roots = skillRoots()) {
  const found = new Map();
  for (const root of roots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    for (const d of fs.readdirSync(root)) {
      const dir = path.join(root, d);
      const file = path.join(dir, "SKILL.md");
      if (!fs.existsSync(file)) continue;
      const s = analyzeSkill(dir, fs.readFileSync(file, "utf8"));
      if (!found.has(s.name)) found.set(s.name, s);
    }
  }
  const skills = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Overlap: same family prefix, or similar descriptions
  for (const s of skills) {
    const tk = tokens(s.description);
    s.overlap = skills
      .filter((o) => o !== s)
      .filter((o) => {
        const fam = (x) => x.name.split("-").slice(0, 2).join("-");
        return fam(o) === fam(s) || jaccard(tk, tokens(o.description)) > 0.22;
      })
      .map((o) => o.name);
  }
  return skills;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const roots = skillRoots();
  const skills = discover(roots);
  // Paths are machine-specific; keep only a relative hint in the shipped registry.
  const shipped = skills.map(({ path: p, ...rest }) => ({ ...rest, location: p.replace(os.homedir(), "~") }));
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), roots: roots.map((r) => r.replace(os.homedir(), "~")), skills: shipped }, null, 2));
  console.log(`Discovered ${skills.length} skills from ${roots.length} locations -> ${path.relative(process.cwd(), OUT)}`);
  for (const s of skills) console.log(`  ${s.bmcc ? "BMCC" : "    "}  ${s.name.padEnd(48)} systems=[${s.systems.join(",")}] sensitivity=[${s.sensitivity.join(",")}]`);
}
