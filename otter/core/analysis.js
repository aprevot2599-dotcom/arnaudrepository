// Deterministic analysis that works with no AI connected: email-thread parsing, figure
// extraction, discrepancy candidates and evidence checking. Everything it reports points
// back to a verbatim line in a source the user supplied.

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const ABS_DATE = new RegExp(`\\b(?:(?:${MONTHS})\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2})\\b`, "i");
const REL_DATE = /\b(?:by|before|no later than|due|until)\s+(?:(?:this|next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|end of (?:day|week|month)|eod|eow|cob)\b|\b(?:asap|as soon as possible|next week|soon|this week|end of the month)\b/i;

export function normalizeSpace(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

export function splitSentences(text) {
  return normalizeSpace(text).split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter(Boolean);
}

// ---------- email ----------
export function parseThread(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const messages = [];
  let cur = null;
  const header = /^\s*(From|To|Cc|Date|Sent|Subject)\s*:\s*(.*)$/i;
  for (const line of lines) {
    const h = line.match(header);
    if (h && h[1].toLowerCase() === "from") {
      cur = { from: h[2].trim(), to: "", date: "", subject: "", body: [] };
      messages.push(cur);
      continue;
    }
    if (h && cur && cur.body.length === 0) {
      const k = h[1].toLowerCase() === "sent" ? "date" : h[1].toLowerCase();
      cur[k] = h[2].trim();
      continue;
    }
    if (/^\s*-{2,}\s*(?:original message|forwarded message)\s*-{2,}/i.test(line)) continue;
    if (!cur) {
      cur = { from: "(unknown sender)", to: "", date: "", subject: "", body: [] };
      messages.push(cur);
    }
    cur.body.push(line.replace(/^>\s?/, ""));
  }
  for (const m of messages) m.body = m.body.join("\n").trim();
  return messages.filter((m) => m.body || m.subject);
}

function isMe(sender, me) {
  if (!me?.length) return false;
  const s = sender.toLowerCase();
  return me.some((n) => n && s.includes(n.toLowerCase()));
}

export function analyzeEmail(text, { me = ["Arnaud", "Prevot"] } = {}) {
  const messages = parseThread(text);
  const out = { messages: messages.map(({ from, to, date, subject }) => ({ from, to, date, subject })), deadlines: [], actionItems: [], myCommitments: [], othersCommitments: [], questions: [], conflicts: [] };
  messages.forEach((m, i) => {
    const mine = isMe(m.from, me);
    for (const s of splitSentences(m.body)) {
      const abs = s.match(ABS_DATE);
      const rel = s.match(REL_DATE);
      if (abs && /\b(?:by|due|deadline|before|no later than|until|on)\b/i.test(s))
        out.deadlines.push({ quote: s, from: m.from, date: abs[0], basis: "explicit", messageIndex: i });
      else if (rel) out.deadlines.push({ quote: s, from: m.from, date: rel[0], basis: "inferred", note: "Relative wording; the actual date depends on when it was sent.", messageIndex: i });
      if (/\b(?:I will|I'll|I can|we will|we'll|I am going to|I'm going to)\b/i.test(s))
        (mine ? out.myCommitments : out.othersCommitments).push({ quote: s, from: m.from, messageIndex: i });
      if (/\b(?:please|can you|could you|would you|need you to|make sure|action required|let me know)\b/i.test(s) && !mine)
        out.actionItems.push({ quote: s, from: m.from, messageIndex: i });
      if (/\?\s*$/.test(s)) {
        const later = messages.slice(i + 1).some((n) => n.from !== m.from);
        out.questions.push({ quote: s, from: m.from, messageIndex: i, possiblyUnanswered: !later });
      }
    }
  });
  // Same kind of figure stated differently across messages in the thread
  out.conflicts = findDiscrepancies(messages.map((m, i) => ({ id: `msg${i + 1}`, title: `${m.from}${m.date ? " (" + m.date + ")" : ""}`, text: m.body })));
  return out;
}

// ---------- figures and discrepancies ----------
const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?\s?(?:k|K|million|M)?/g;
const COUNT = /\b(\d[\d,]*)\s+(students|participants|enrollees|enrollments|registrations|seats|hours|sessions|FTEs?|employees|staff|positions|trainees|completers|graduates)\b/gi;
const LABEL_STOP = new Set("the a an of for in on at to is was are were be will our their this that and or with by from about approximately around roughly".split(" "));

export function parseMoney(s) {
  let v = parseFloat(s.replace(/[$,\s]/g, ""));
  if (/k$/i.test(s.trim())) v *= 1000;
  if (/(?:million|M)$/.test(s.trim())) v *= 1e6;
  return v;
}

function labelBefore(line, index) {
  const before = line.slice(0, index).replace(/[:=\-–|]+\s*$/, "");
  const words = (before.toLowerCase().match(/[a-z][a-z&/-]*/g) || []).filter((w) => !LABEL_STOP.has(w));
  return words.slice(-3).join(" ");
}

export function extractFigures(doc) {
  const figs = [];
  const lines = String(doc.text).split(/\n/);
  lines.forEach((line, li) => {
    MONEY.lastIndex = 0;
    for (const m of line.matchAll(MONEY)) {
      const label = labelBefore(line, m.index);
      if (!label) continue;
      figs.push({ docId: doc.id, docTitle: doc.title, kind: "money", label, value: parseMoney(m[0]), raw: m[0].trim(), quote: line.trim(), line: li + 1, isTotal: /\btotal\b/i.test(line.slice(0, m.index)) });
    }
    COUNT.lastIndex = 0;
    for (const m of line.matchAll(COUNT)) {
      const unit = m[2].toLowerCase().replace(/s$/, "");
      const label = (labelBefore(line, m.index) + " " + unit).trim();
      figs.push({ docId: doc.id, docTitle: doc.title, kind: "count", label, unit, value: parseFloat(m[1].replace(/,/g, "")), raw: m[0], quote: line.trim(), line: li + 1 });
    }
  });
  return figs;
}

const keyOf = (f) => (f.kind === "count" ? "count:" + f.unit : f.kind + ":" + f.label.split(" ").slice(-2).join(" "));

// Returns candidates, never verdicts. Confidence reflects how sure we are that two lines
// describe the same thing, not that one of them is wrong.
export function findDiscrepancies(docs) {
  const figs = docs.flatMap(extractFigures);
  const byKey = new Map();
  for (const f of figs) {
    const k = keyOf(f);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(f);
  }
  const results = [];
  for (const [k, list] of byKey) {
    const docsInvolved = new Set(list.map((f) => f.docId));
    const values = new Set(list.map((f) => f.value));
    if (docsInvolved.size < 2 || values.size < 2) continue;
    const fullLabelMatch = new Set(list.map((f) => f.label)).size === 1;
    const sorted = [...list].sort((a, b) => a.value - b.value);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    results.push({
      type: "conflicting_figures",
      key: k,
      finding: `"${lo.label}" is stated as ${lo.raw} in ${lo.docTitle} and ${hi.raw} in ${hi.docTitle}.`,
      evidence: list.map((f) => ({ sourceId: f.docId, sourceTitle: f.docTitle, quote: f.quote })),
      confidence: fullLabelMatch ? "medium" : "low",
      difference: hi.value - lo.value,
      possibleExplanations: ["The documents are from different dates or drafts.", "They measure different things (budgeted vs actual, headcount vs FTE, gross vs net).", "One figure is a typo or was not updated."],
    });
  }
  // Internal totals: a "total" line that does not equal the itemized lines above it
  for (const d of docs) {
    const df = extractFigures(d).filter((f) => f.kind === "money");
    df.forEach((t, ti) => {
      if (!t.isTotal) return;
      const items = [];
      for (let j = ti - 1; j >= 0 && !df[j].isTotal; j--) items.unshift(df[j]);
      if (items.length < 2) return;
      const sum = items.reduce((s, f) => s + f.value, 0);
      if (Math.abs(sum - t.value) > 0.5)
        results.push({
          type: "total_mismatch",
          key: "total:" + d.id + ":" + t.line,
          finding: `In ${d.title}, the line items add up to $${sum.toLocaleString()} but the stated total is ${t.raw}.`,
          evidence: [...items, t].map((f) => ({ sourceId: d.id, sourceTitle: d.title, quote: f.quote })),
          confidence: "high",
          difference: t.value - sum,
          possibleExplanations: ["A line item is missing from the list.", "The total includes indirect costs or fees not itemized here.", "Arithmetic error."],
        });
    });
  }
  return results;
}

// Anti-fabrication: a quote counts as evidence only if it appears verbatim (ignoring
// whitespace and case) in a source the user actually supplied.
export function verifyEvidence(evidence, sources) {
  const index = new Map(sources.map((s) => [s.id, normalizeSpace(s.text).toLowerCase()]));
  const results = (evidence || []).map((e) => {
    const hay = index.get(e.sourceId ?? e.source_id);
    const quote = normalizeSpace(e.quote || "").toLowerCase();
    const ok = !!hay && quote.length >= 8 && hay.includes(quote);
    return { ...e, verified: ok, why: ok ? "" : !hay ? "unknown source" : quote.length < 8 ? "quote too short" : "quote not found in source" };
  });
  return { ok: results.length > 0 && results.every((r) => r.verified), results };
}

// ---------- knowledge search ----------
export function searchKnowledge(items, query, limit = 6) {
  const q = (query.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  if (!q.length) return [];
  return items
    .map((it) => {
      const hay = (it.title + " " + it.text + " " + (it.tags || []).join(" ")).toLowerCase();
      const score = q.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.it.updatedAt || 0) - (a.it.updatedAt || 0))
    .slice(0, limit)
    .map((x) => x.it);
}
