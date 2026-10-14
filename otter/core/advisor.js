// "Grow O.T.T.E.R.": learns from usage counts (never message content) and recommends new
// connectors, skills and setup changes. Every recommendation cites the evidence that
// triggered it and uses the same why / missing piece / unlocks shape as capabilities.js.

export function emptyUsage() {
  return { turns: 0, intents: {}, skillModes: {}, notExecuted: {}, proposed: {}, sourceKinds: {}, capabilityAsks: {}, noSkillTopics: {}, voiceCommands: 0, lastShownAt: 0, shown: {}, dismissed: [] };
}

const inc = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n; };

// Called after each turn with the plan and what happened. Stores counts only.
export function recordTurn(usage, { plan, proposals = [], sourceKinds = [], capabilityIds = [], noSkillTopic = null }) {
  usage.turns++;
  for (const i of plan?.intents || []) inc(usage.intents, i);
  for (const s of plan?.steps || []) { usage.skillModes[s.name] ||= {}; inc(usage.skillModes[s.name], s.mode); }
  for (const p of proposals) { inc(usage.proposed, p.type); if (p.status === "not_executed") inc(usage.notExecuted, p.type); }
  for (const k of sourceKinds) inc(usage.sourceKinds, k);
  for (const c of capabilityIds) inc(usage.capabilityAsks, c);
  if (noSkillTopic) inc(usage.noSkillTopics, noSkillTopic);
  return usage;
}

export function recordExecution(usage, p) {
  if (p.status === "not_executed") inc(usage.notExecuted, p.type);
}

const sumOf = (obj, keys) => keys.reduce((a, k) => a + (obj[k] || 0), 0);
const handoffCount = (u) => Object.values(u.skillModes).reduce((a, m) => a + (m.handoff || 0), 0);

// env: {engineKind, connectorsOnAccount: [...], webResearch, voice: {...}, systemVolume: {...}}
export function recommend(usage, env = {}) {
  const u = usage;
  const recs = [];
  const add = (r) => { if (!u.dismissed.includes(r.id)) recs.push(r); };
  const emailUnsent = sumOf(u.notExecuted, ["send_email", "reply_email", "forward_email"]);
  const emailWork = (u.intents.email || 0) + (u.sourceKinds.email || 0);
  const calAsks = (u.capabilityAsks.calendar || 0) + sumOf(u.proposed, ["schedule_meeting", "send_invitation"]);
  const ho = handoffCount(u);

  if (emailUnsent >= 2 || emailWork >= 5)
    add({ id: "connector-m365", kind: "connector", priority: emailUnsent >= 3 ? "high" : "medium", title: "Microsoft 365 mail connection, approved by BMCC IT",
      evidence: `${emailUnsent} approved email${emailUnsent === 1 ? "" : "s"} I couldn't send, and ${emailWork} email-related request${emailWork === 1 ? "" : "s"}.`,
      why: "Every email still goes through copy and paste because BMCC blocks the connector.", missing: "A BMCC IT decision: either enable Claude's Microsoft 365 connector or approve a Graph app registration with read and send scopes.", unlocks: "read threads directly and send what you approve, one approval per message.", effort: "A request to BMCC IT; no work on your side after approval." });

  if (calAsks >= 2)
    add({ id: "connector-calendar", kind: "connector", priority: "medium", title: (env.connectorsOnAccount || []).includes("Google Calendar") ? "Wire your Google Calendar connector into O.T.T.E.R. (read-only)" : "A calendar connection",
      evidence: `${calAsks} scheduling request${calAsks === 1 ? "" : "s"} I couldn't act on.`,
      why: "I can't see availability or prepare invitations.", missing: (env.connectorsOnAccount || []).includes("Google Calendar") ? "The Google Calendar connector is already on your claude.ai account; O.T.T.E.R. needs a build step to use it, plus your read-only permission. For BMCC meetings, Outlook calendar access through BMCC IT." : "A calendar connector and your permission.", unlocks: "find times, write meeting briefs, and propose invitations for approval.", effort: "One build change for Google; a BMCC IT request for Outlook." });

  if (ho >= 3)
    add({ id: "surface-cowork", kind: "setup", priority: "high", title: "Run your form-filling skills from Cowork or Claude in Chrome",
      evidence: `${ho} times a request needed a skill that only runs in Chrome or the desktop app.`,
      why: "O.T.T.E.R. can only write hand-off briefs for those skills.", missing: "Opening Cowork (Claude desktop app) or Claude in Chrome with the brief O.T.T.E.R. prepares. A future version could live inside Cowork itself.", unlocks: "finish course requests, PSCs, IR forms and website updates end to end, stopping before Submit.", effort: "Your habit change, or a later build of O.T.T.E.R. as a Cowork plugin." });

  if (env.engineKind !== "server" && ((u.intents.research || 0) + (u.intents.new_program || 0) + (u.intents.grant || 0) >= 2 || (u.capabilityAsks.web_research || 0) >= 1))
    add({ id: "setup-local-server", kind: "setup", priority: "high", title: "Run the local server with an API key",
      evidence: `${(u.intents.research || 0) + (u.intents.new_program || 0) + (u.intents.grant || 0)} research, program or grant requests answered without web access.`,
      why: "The claude.ai version cannot search the web, hear you, or change your computer's volume.", missing: "Node.js on your computer, an Anthropic API key, and `npm start` in the otter folder.", unlocks: "research with citations, hold hands-free conversations, and control the computer's volume with your approval.", effort: "About 15 minutes once; API usage is billed to the key." });

  if (env.engineKind === "server" && !env.webResearch && (u.intents.research || 0) + (u.intents.new_program || 0) + (u.intents.grant || 0) >= 1)
    add({ id: "perm-web", kind: "setting", priority: "medium", title: "Turn on web research", evidence: "You asked research questions while it was off.", why: "Answers rely on what you paste.", missing: "Settings > Permissions > Public web research.", unlocks: "cite current labor-market, grant and policy sources.", effort: "One switch." });

  for (const [topic, n] of Object.entries(u.noSkillTopics))
    if (n >= 3)
      add({ id: "skill-" + topic, kind: "skill", priority: "medium", title: `A new Claude skill for "${topic.replace(/_/g, " ")}"`,
        evidence: `${n} requests on this topic matched none of your ${env.skillCount || ""} skills.`,
        why: "Each time, the work starts from scratch with no house format or checklist.", missing: "A SKILL.md capturing your format, sources and rules. Your skill-creator skill can draft it from two or three good examples.", unlocks: "produce the same deliverable the same way every time, and plan it alongside your other skills.", effort: "One session with skill-creator." });

  if ((u.intents.fte || 0) >= 2 && !(u.sourceKinds.document > 0))
    add({ id: "fte-routine", kind: "skill", priority: "low", title: "Attach the Conclusive FTE export when you ask about FTE", evidence: `${u.intents.fte} FTE questions without a data file.`, why: "No connector exists for Conclusive Systems, so I only see FTE numbers you paste or upload.", missing: "The CSV export added as a source (paste it), or the fte-report skill run in Cowork.", unlocks: "compute zero-credit and CE/WFT FTE totals and check them against other documents.", effort: "Paste the CSV." });

  if (u.turns >= 8 && (env.knowledgeCount || 0) === 0)
    add({ id: "knowledge-seed", kind: "setting", priority: "low", title: "Let O.T.T.E.R. keep a few standing facts", evidence: `${u.turns} conversations and an empty knowledge base.`, why: "You repeat context that could be remembered.", missing: "Ask me to \"save that to the knowledge base\" and approve the proposal.", unlocks: "bring current facts (budgets, contacts by role, standing decisions) into answers automatically.", effort: "One approval per fact." });

  const v = env.voice || {};
  if (v.synthesis && !v.maleVoiceNatural)
    add({ id: "voice-natural", kind: "setup", priority: "medium", title: "Install or allow a natural male voice", evidence: v.maleVoice ? `Currently speaking as "${v.maleVoice}".` : "No male voice is available.", why: "The voice sounds synthetic.", missing: v.cloudMaleVoice && !v.cloudVoicesAllowed ? `Allow online voices in Settings > Voice to use "${v.cloudMaleVoice}" (text is sent to ${v.cloudVendor || "the browser maker"}).` : "Mac: download Evan or Nathan (Enhanced) under Spoken Content. Windows: use Microsoft Edge.", unlocks: "talk in a voice that sounds like a person.", effort: "A few minutes." });
  if (v.premiumWanted)
    add({ id: "voice-premium", kind: "connector", priority: "low", title: "A premium neural voice service", evidence: "You asked for a more human voice than the browser offers.", why: "Browser voices are the ceiling without an outside text-to-speech service.", missing: "An account and API key with a text-to-speech provider, BMCC approval to send response text to it, and a build step.", unlocks: "speak with studio-quality voices.", effort: "A vendor decision plus one build change." });

  const rank = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

// Periodic nudge: at most one per 3 days, or immediately for a new high-priority item.
export function dueRecommendation(usage, recs, now = Date.now()) {
  const fresh = recs.filter((r) => !usage.shown[r.id]);
  if (!fresh.length) return null;
  const top = fresh[0];
  if (top.priority === "high" || now - (usage.lastShownAt || 0) > 3 * 86400000) return top;
  return null;
}

export function markShown(usage, rec, now = Date.now()) {
  usage.shown[rec.id] = now;
  usage.lastShownAt = now;
}

export function recommendationMarkdown(r) {
  return [
    ":::suggestion",
    `**${r.title}** (${r.kind}, ${r.priority} priority)`,
    "",
    `- **What I noticed:** ${r.evidence}`,
    `- **Why it matters:** ${r.why}`,
    `- **The missing piece:** ${r.missing}`,
    `- **With that piece, I could:** ${r.unlocks}`,
    `- **Effort:** ${r.effort}`,
    ":::",
  ].join("\n");
}
