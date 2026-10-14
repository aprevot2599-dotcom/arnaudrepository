// Skill orchestration: turns a request into a plan of which discovered skills apply, in what
// order, and in what mode. Analysis-mode skills feed one integrated answer inside
// O.T.T.E.R.; hand-off skills become approval-gated briefs; blocked skills are reported
// with the reason. Nothing here can lift a restriction set in security.js.
import { skillStatus } from "./security.js";

// Intent rules: phrases in the request -> skills that serve it, and the role each plays.
export const INTENTS = [
  { id: "new_program", re: /\b(?:launch|start|create|add|offer)\b.*\b(?:program|certificate|training|course|pathway|apprenticeship)\b|\bshould (?:we|bmcc)\b/i, skills: [["deep-research", "labor-market and comparable-program research"], ["fte-report", "enrollment and FTE baseline"], ["master-i2pa-grant-writing", "grant funding options"], ["ce-wft-workshop-builder", "operational build-out and pricing"]], frame: "decision" },
  { id: "board_report", re: /\bboard (?:meeting )?report\b|center (?:updates|report)/i, skills: [["board-report", "board report in house format"]] },
  { id: "brand", re: /\bbrand\b|reputation|what (?:do )?people (?:say|think)|aaker/i, skills: [["brand-personality-analysis", "college-wide brand scan"]], county: true },
  { id: "workshop", re: /\bworkshop|course request|trainer|personal services contract|\bpsc\b|flyer/i, skills: [["ce-wft-workshop-builder", "workshop record and orchestration"], ["course-request-form-filler", "course request form"], ["psc-form-filler", "trainer contract"], ["ce-website-workshop-updater", "website listing"], ["ce-wft-workshop-guide", "process guidance"]] },
  { id: "fte", re: /\bfte\b|enrollment (?:numbers|totals)|zero-credit/i, skills: [["fte-report", "FTE totals from the Conclusive export"]] },
  { id: "grant", re: /\bgrant|i2pa|rped|funding opportunit|nofo\b/i, skills: [["master-i2pa-grant-writing", "grant development"], ["deep-research", "funding research"]] },
  { id: "policy", re: /\bpolic(?:y|ies)\b/i, skills: [["oi-policy-review", "Office of Instruction policy review"]] },
  { id: "oi_meeting", re: /office of instruction|\boi meeting|what have i been working on/i, skills: [["oi-meeting-report", "OI meeting notes"]] },
  { id: "cd_cod", re: /center director|\bcod\b|\bcd and cod\b/i, skills: [["cd-cod-meeting-memory", "CD and COD meeting agenda"]] },
  { id: "hiring", re: /candidate|applicant|hiring|screening matrix|hr matrix/i, skills: [["hr-matrix-filler", "candidate scoring"]] },
  { id: "ir", re: /institutional research|\bir (?:form|request|data)|data pull/i, skills: [["ir-request-form-filler", "IR data request"]] },
  { id: "triage", re: /on my plate|triage|chief of staff|what should i work on|sort this out/i, skills: [["chief-of-staff", "triage and routing"]] },
  { id: "research", re: /\bresearch|labor market|occupation|wage|employer demand|comparable|benchmark/i, skills: [["deep-research", "multi-source research"]] },
  { id: "start_day", re: /start my day|morning routine|open my tabs/i, skills: [["start", "start-of-day routine"]] },
  { id: "signature", re: /\bsign (?:this|the) pdf|e-?sign/i, skills: [["pdf-signer", "PDF signature"]] },
  { id: "parent_notice", re: /parent notification|failing students|synergy/i, skills: [["synergy-parent-notification", "parent notices (student records)"]] },
  { id: "email", re: /\bemail|inbox|thread|reply|outlook/i, skills: [], frame: "email" },
  { id: "discrepancy", re: /discrepanc|inconsisten|doesn'?t (?:add up|match)|conflict/i, skills: [], frame: "discrepancy" },
];

const COUNTIES = [
  [/baker/i, "brand-personality-skill-baker-county"],
  [/grant county|john day/i, "brand-personality-skill-grant-county"],
  [/hermiston|umatilla|west end|eohec/i, "brand-personality-skill-hermiston-west-umatilla"],
  [/morrow|boardman/i, "brand-personality-skill-morrow-county"],
  [/union county|la grande/i, "brand-personality-skill-union-county"],
];

function keywordMatches(request, skills, exclude) {
  const words = new Set((request.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter((w) => !["that", "this", "with", "from", "have", "what", "should", "would", "about", "please", "need", "want", "make", "help"].includes(w)));
  return skills
    .filter((s) => !exclude.has(s.name) && s.bmcc)
    .map((s) => {
      const hay = (s.name.replace(/-/g, " ") + " " + s.description).toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score++;
      return { s, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

export function planRequest(request, registry, { permissions, settings }) {
  const byName = new Map(registry.map((s) => [s.name, s]));
  const intents = INTENTS.filter((i) => i.re.test(request));
  const steps = [];
  const seen = new Set();
  const add = (name, role, why) => {
    if (seen.has(name)) return;
    const skill = byName.get(name);
    if (!skill) {
      steps.push({ name, role, why, mode: "missing", status: "missing", reason: "Not found among discovered skills." });
      seen.add(name);
      return;
    }
    const st = skillStatus(skill, { permissions, settings });
    const mode = st.runnable ? "analysis" : st.handoff ? "handoff" : "blocked";
    steps.push({ name, role, why, mode, status: st.status, reason: st.reason, missing: st.missing || [] });
    seen.add(name);
  };
  for (const intent of intents) {
    for (const [name, role] of intent.skills) {
      if (intent.county) {
        const c = COUNTIES.find(([re]) => re.test(request));
        if (c) { add(c[1], "county-scoped brand scan", intent.id); continue; }
      }
      add(name, role, intent.id);
    }
  }
  for (const { s } of keywordMatches(request, registry, seen)) add(s.name, "related by description", "keyword");
  const frames = [...new Set(intents.map((i) => i.frame).filter(Boolean))];
  return {
    request,
    intents: intents.map((i) => i.id),
    frames,
    steps,
    // Analysis skills can inform the answer together; hand-offs come after, one approval each.
    parallel: steps.filter((s) => s.mode === "analysis").map((s) => s.name),
    sequential: steps.filter((s) => s.mode === "handoff").map((s) => s.name),
    blocked: steps.filter((s) => s.mode === "blocked" || s.mode === "missing"),
  };
}

export function planSummary(plan) {
  if (!plan.steps.length) return "No discovered skill matches this request; O.T.T.E.R. answers directly.";
  return plan.steps.map((s) => `- ${s.name} (${s.role}): ${s.mode}${s.mode === "analysis" ? "" : " - " + s.reason}`).join("\n");
}

// The text a hand-off proposal carries. The user approves it, then pastes it into the Claude
// surface that can run the skill (Claude in Chrome, Cowork, Claude Code).
export function handoffBrief(skillName, request, notes = "") {
  return [
    `Use the ${skillName} skill.`,
    `Request from Dr. Prevot: ${request}`,
    notes ? `Context prepared by O.T.T.E.R.: ${notes}` : "",
    "Stop before any Submit, Send, Publish or Next button and wait for Dr. Prevot to press it.",
  ].filter(Boolean).join("\n\n");
}
