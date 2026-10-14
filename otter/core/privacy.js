// Privacy guard: detects protected data, redacts it, and decides whether text may leave the
// device for a given AI service. Detection is pattern based, so it is a safeguard, not a
// compliance certification; anything it flags must be cleared by a person.

const LUHN = (digits) => {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};

// severity: block = never leaves the device; ferpa = education-record indicator;
// high = identifying; medium = contact details.
export const DETECTORS = [
  { category: "credential", severity: "block", label: "Password or secret", re: /\b(?:password|passcode|passwd|pwd|api[_ -]?key|secret|token)\s*[:=]\s*\S{4,}/gi },
  { category: "credential", severity: "block", label: "API key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { category: "ssn", severity: "block", label: "Social Security number", re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
  { category: "card", severity: "block", label: "Payment card number", re: /\b(?:\d[ -]?){13,19}\b/g, check: (m) => LUHN(m.replace(/\D/g, "")) && m.replace(/\D/g, "").length >= 13 },
  { category: "student_id", severity: "ferpa", label: "Student ID number", re: /\b(?:student\s*(?:id|#|no\.?|number)|SID|BMCC\s*ID)\s*[:#]?\s*[A-Z]?\d{5,10}\b/gi },
  { category: "dob", severity: "high", label: "Date of birth", re: /\b(?:DOB|date of birth|birth\s*date)\s*[:\-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi },
  { category: "education_record", severity: "ferpa", label: "Education-record detail (grades, transcript, aid, disability, discipline)", re: /\b(?:GPA|transcripts?|final grades?|failing (?:grade|students?|the class)|grade of [A-DF][+-]?|academic (?:probation|suspension)|financial aid (?:award|status)|FAFSA|disability (?:services|accommodation)|IEP|504 plan|disciplinary (?:record|action)|enrollment status of)\b/gi },
  { category: "email", severity: "medium", label: "Email address", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { category: "phone", severity: "medium", label: "Phone number", re: /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g },
];

export function scanSensitive(text = "") {
  const findings = [];
  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    for (const m of String(text).matchAll(d.re)) {
      if (d.check && !d.check(m[0])) continue;
      findings.push({ category: d.category, severity: d.severity, label: d.label, index: m.index, length: m[0].length, preview: mask(m[0]) });
    }
  }
  // Overlapping matches: keep the most severe
  const rank = { block: 4, ferpa: 3, high: 2, medium: 1 };
  findings.sort((a, b) => a.index - b.index || rank[b.severity] - rank[a.severity]);
  const out = [];
  for (const f of findings) {
    const prev = out[out.length - 1];
    if (prev && f.index < prev.index + prev.length) continue;
    out.push(f);
  }
  return out;
}

function mask(s) {
  if (s.length <= 4) return "****";
  return s.slice(0, 2) + "*".repeat(Math.min(8, s.length - 4)) + s.slice(-2);
}

export function redact(text = "", findings = scanSensitive(text), { categories = null } = {}) {
  let out = "";
  let pos = 0;
  for (const f of findings) {
    if (categories && !categories.includes(f.category)) continue;
    // education_record flags context words, not identifiers; leave the words in place
    if (f.category === "education_record") continue;
    out += text.slice(pos, f.index) + `[REDACTED ${f.category.toUpperCase()}]`;
    pos = f.index + f.length;
  }
  return out + text.slice(pos);
}

export const redactForLog = (s) => redact(String(s));

// settings: {approvedServices: [...], ferpaAttested: bool, allowContactDetails: bool}
export function evaluateOutbound(text, service, settings = {}) {
  const approved = (settings.approvedServices || []).includes(service);
  const findings = scanSensitive(text);
  const counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  if (!approved)
    return { decision: "block", reason: `The AI service "${service}" has not been approved for BMCC work content. Approve it in Settings > Privacy after confirming BMCC permits it.`, findings };
  if (counts.block)
    return { decision: "block", reason: "Contains a password, SSN, payment card or secret. These never leave this device. Remove them and try again.", findings };
  if (counts.ferpa && !settings.ferpaAttested)
    return { decision: "block", reason: "Looks like it contains student education-record information. FERPA processing is off. Remove it, or record the lawful basis and institutional approval in Settings > Privacy first.", findings };
  if (counts.high || (counts.medium && !settings.allowContactDetails))
    return { decision: "redact", reason: "Identifying details were found and will be replaced with placeholders before sending.", findings, text: redact(text, findings) };
  return { decision: "allow", findings, text };
}

// ---------- untrusted content ----------
const INJECTION_PATTERNS = [
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|rules)/i,
  /disregard (?:your|the) (?:instructions|rules|system prompt)/i,
  /you are now|new instructions?:|system prompt/i,
  /(?:forward|send|email|transfer|wire) (?:this|all|the)? ?(?:emails?|messages?|files?|data|funds|money|credentials?) to/i,
  /approve (?:this|the) (?:action|request) (?:automatically|without)/i,
  /do not (?:tell|inform|notify) (?:the )?user/i,
  /(?:click|press) (?:the )?(?:submit|send|publish|approve)/i,
];

export function detectInjection(text = "") {
  return INJECTION_PATTERNS.filter((re) => re.test(text)).map((re) => re.source);
}

// Wraps external content so the model sees it as quoted data. Closing tags inside the
// content are neutralized so the content cannot end the wrapper early.
export function wrapUntrusted(source) {
  const safe = String(source.text || "").replace(/<\/?\s*untrusted_content/gi, "&lt;untrusted_content");
  return `<untrusted_content id="${source.id}" kind="${source.kind}" title="${String(source.title || "").replace(/"/g, "'")}">\n${safe}\n</untrusted_content>`;
}
