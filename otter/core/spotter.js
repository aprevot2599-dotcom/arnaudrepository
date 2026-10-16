// The spotter: O.T.T.E.R. as an advisor that notices what Dr. Prevot hasn't yet. It looks
// only at what he has already given it (pasted emails and documents, tasks, proposals) and
// runs locally for 0 tokens. It never reaches into BMCC systems and never acts; it points
// things out, with the evidence, and he decides.
import { analyzeEmail, findDiscrepancies, parseThread } from "./analysis.js";

const SPOT_STOP = new Set("the and for you your can could would will with that this from have has are was were what when where which who how does did about please just also into than then them they their there our out any all not but get got let may might should shall need make sure send sent".split(" "));
const spotKeywords = (t) => new Set((String(t).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((w) => !SPOT_STOP.has(w)));

const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "October 20", "Oct. 20, 2026", "10/20", "2026-10-20" -> Date (local), or null. Without a year,
// the next occurrence on or after the reference date's month is assumed.
export function parseLooseDate(s, ref = new Date()) {
  const t = String(s || "").trim().toLowerCase();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
  let month, day, year = null;
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/))) { month = MONTH_ABBR.indexOf(m[1]); day = +m[2]; year = m[3] ? +m[3] : null; }
  else if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) { month = +m[1] - 1; day = +m[2]; year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null; }
  else return null;
  if (month < 0 || month > 11 || !day || day > 31) return null;
  if (year == null) {
    year = ref.getFullYear();
    if (month < ref.getMonth() - 2) year++; // "January 10" said in October means next January
  }
  return new Date(year, month, day);
}

const dayMs = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function spot({ sources = [], tasks = [], proposals = [], me = [], now = new Date() } = {}) {
  const out = [];
  const today = startOfDay(now);
  const emails = sources.filter((s) => s.kind === "email");
  for (const s of emails) {
    const a = analyzeEmail(s.text, { me });
    for (const d of a.deadlines.filter((x) => x.basis === "explicit")) {
      const when = parseLooseDate(d.date, now);
      if (!when) continue;
      const days = Math.round((startOfDay(when) - today) / dayMs);
      if (days < 0 && days >= -14) out.push({ key: `late:${s.id}:${d.date}`, kind: "deadline", urgency: "high", title: `A deadline in "${s.title}" has passed (${d.date})`, detail: `${-days} day${days === -1 ? "" : "s"} ago. Check whether it was met.`, evidence: d.quote, sourceId: s.id });
      else if (days >= 0 && days <= 7) out.push({ key: `soon:${s.id}:${d.date}`, kind: "deadline", urgency: days <= 2 ? "high" : "medium", title: `Deadline ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}: ${d.date}`, detail: `From "${s.title}", ${d.from}.`, evidence: d.quote, sourceId: s.id });
    }
    // A question counts as answered only if a later message from you shares its key words;
    // replying to the thread about something else doesn't answer it.
    const msgs = parseThread(s.text);
    const isMe = (from) => me.some((n) => from.toLowerCase().includes(n.toLowerCase()));
    const unanswered = a.questions.filter((x) => {
      if (isMe(x.from)) return false;
      const kw = spotKeywords(x.quote);
      const later = msgs.slice(x.messageIndex + 1).filter((m) => isMe(m.from));
      return !later.some((m) => [...spotKeywords(m.body)].some((w) => kw.has(w)));
    });
    for (const q of unanswered)
      out.push({ key: `q:${s.id}:${q.quote.slice(0, 40)}`, kind: "unanswered", urgency: "medium", title: `${q.from.replace(/<.*>/, "").trim()} asked something that may still need your answer`, detail: `In "${s.title}".`, evidence: q.quote, sourceId: s.id });
    for (const c of a.othersCommitments)
      out.push({ key: `owed:${s.id}:${c.quote.slice(0, 40)}`, kind: "owed", urgency: "low", title: `${c.from.replace(/<.*>/, "").trim()} committed to something; worth tracking`, detail: `In "${s.title}".`, evidence: c.quote, sourceId: s.id });
    for (const c of a.myCommitments)
      out.push({ key: `mine:${s.id}:${c.quote.slice(0, 40)}`, kind: "mine", urgency: "medium", title: "You committed to something in this thread", detail: `In "${s.title}". Make sure it's on your list.`, evidence: c.quote, sourceId: s.id });
  }
  if (sources.length >= 1)
    for (const d of findDiscrepancies(sources))
      out.push({ key: `disc:${d.key}`, kind: "discrepancy", urgency: d.confidence === "high" ? "high" : "medium", title: "Numbers that don't agree", detail: d.finding, evidence: d.evidence[0]?.quote || "", sourceId: d.evidence[0]?.sourceId });
  for (const p of proposals.filter((x) => x.status === "pending" && now - x.createdAt > 2 * dayMs))
    out.push({ key: `stale:${p.id}`, kind: "waiting", urgency: "low", title: `"${p.label}" has waited ${Math.floor((now - p.createdAt) / dayMs)} days for your decision`, detail: `Target: ${p.target}.`, evidence: "" });
  for (const t of tasks.filter((x) => !x.done && now - x.createdAt > 7 * dayMs))
    out.push({ key: `task:${t.id}`, kind: "task", urgency: "low", title: `Open task for over a week: ${t.title}`, detail: "Do it, delegate it, or drop it.", evidence: "" });
  const rank = { high: 0, medium: 1, low: 2 };
  const seen = new Set();
  return out.filter((x) => (seen.has(x.key) ? false : seen.add(x.key))).sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}

export function spottedMarkdown(items, { max = 6 } = {}) {
  if (!items.length) return "Nothing new stands out in what you've given me. That covers deadlines, open questions, commitments and numbers in your attached emails and documents, plus your task list and waiting approvals.";
  const lines = items.slice(0, max).map((x) => `- **${x.title}** ${x.detail}${x.evidence ? `\n  _“${x.evidence.slice(0, 180)}”_` : ""}`);
  return `:::spotted\n${lines.join("\n")}${items.length > max ? `\n- …and ${items.length - max} more.` : ""}\n:::\nI only looked at what you've given me here (0 tokens). I haven't acted on any of it; it's your call.`;
}
