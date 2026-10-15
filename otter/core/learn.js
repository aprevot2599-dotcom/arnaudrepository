// Learning: what O.T.T.E.R. knows about Dr. Prevot and how it picks up more. It starts from
// the setup brief, notices stable preferences and facts in what he says ("I prefer…", "from
// now on…", "remember that…", corrections), and asks before keeping any of them. Nothing
// sensitive is ever proposed for memory, and everything learned can be seen and forgotten.
import { scanSensitive } from "./privacy.js";

// Facts from the original O.T.T.E.R. brief, written by Dr. Prevot. Provenance is kept so
// they can be corrected or expired like anything else.
export const PROFILE_SEED = [
  ["Role", "Executive Director of Community Education and Workforce Training at Blue Mountain Community College (BMCC), Oregon. Oversees CE workshops and noncredit programs, Workforce Training, BMCC centers, campuses and coordinators, supervision, partnerships and economic development, program pricing and budgets, grants, employer engagement, enrollment growth."],
  ["BMCC strategic priorities", "Students First; Grow Enrollment; Community Engagement; Vibrant Workplace Culture; Fiscal Sustainability."],
  ["Management philosophy", "Practical experimentation, measurable outcomes, entrepreneurship, accountability, efficiency, decisions grounded in reliable data."],
  ["How to talk to me", "Bottom line first (never write the word BLUF), then reasoning. Concise, direct, analytical. No flattery, no filler, no em dashes. Push back on weak assumptions and explain tradeoffs. Ask before using any connector."],
  ["Hard rules", "Nothing is sent, submitted, posted, changed or deleted without my explicit approval. Signed-in does not mean authorized. FERPA and BMCC policy come first. Never invent evidence."],
  ["Service area", "Rural northeastern Oregon. Centers and partners mentioned in my skills include Boardman (Morrow County), Hermiston and the West End of Umatilla County, Milton-Freewater, Baker County, and Contracted Out of District agreements with Grant and Union counties."],
  ["Recurring work", "Monthly board report, Office of Instruction meeting notes, CD and COD coordinator meeting, FTE reports from Conclusive Systems, workshop setup (course request, trainer contract, website), IR data requests, policy reviews, the I2PA pre-apprenticeship grant, brand perception scans."],
];

export function seedProfile(knowledge, now = Date.now()) {
  if (knowledge.some((k) => k.tags?.includes("profile"))) return 0;
  let n = 0;
  for (const [title, text] of PROFILE_SEED) {
    knowledge.push({ id: "kb_profile_" + n, title, text, tags: ["profile"], provenance: "Your O.T.T.E.R. setup brief", createdAt: now, updatedAt: now, expiresAt: null });
    n++;
  }
  return n;
}

const PATTERNS = [
  /\b(?:I|we) (?:really )?(?:prefer|like|want|need|hate|dislike|don't like|do not like|can't stand)\b[^.?!]*/i,
  /\b(?:from now on|going forward|in the future|next time|always|never)\b[^.?!]*/i,
  /\bremember (?:that )?[^.?!]+/i,
  /\bcall me [^.?!]+/i,
  /\bmy (?:boss|supervisor|assistant|director|dean|president|vp|vice president|counterpart|team|budget cycle|fiscal year|board meeting)\b[^.?!]*\b(?:is|are|meets?|starts?|ends?)\b[^.?!]*/i,
  /\b(?:no|actually),? (?:I meant|I mean|it's|it is)\b[^.?!]*/i,
];

// Returns up to two short candidate facts worth asking about, or none.
export function extractLearnables(text, knowledge = []) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length < 12 || t.length > 1200) return [];
  const out = [];
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    let fact = m[0].trim().replace(/^(?:remember (?:that )?)/i, "");
    if (fact.length < 10 || fact.length > 220) continue;
    if (scanSensitive(fact).length) continue; // never offer to remember identifiers or contact details
    if (/\b(student|grade|gpa|ssn|salary of|disciplin|medical|diagnos)/i.test(fact)) continue;
    const norm = fact.toLowerCase();
    if (knowledge.some((k) => k.text.toLowerCase().includes(norm))) continue;
    if (!out.some((o) => o.toLowerCase() === norm)) out.push(fact.charAt(0).toUpperCase() + fact.slice(1));
    if (out.length >= 2) break;
  }
  return out;
}

// Profile and learned facts always travel with the request (they are short), so Claude can
// use what it knows instead of asking.
export function profileText(knowledge, maxChars = 2200) {
  const items = knowledge.filter((k) => k.tags?.includes("profile") || k.tags?.includes("learned"));
  let out = "";
  for (const k of items) {
    const line = `- ${k.title}: ${k.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trim();
}
