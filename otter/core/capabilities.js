// O.T.T.E.R.'s knowledge of its own limits. Every entry answers three questions in plain
// words: why it can't, what piece is missing, and what that piece would let it do. The
// statuses are computed from the live environment, so the answer changes as pieces arrive.

export const STATUS_TEXT = { ready: "Ready", partial: "Partly ready", needs_you: "Needs your OK", missing: "Missing a piece", blocked: "Blocked" };

export function assessCapabilities(env = {}) {
  const sp = env.speech || {};
  const vol = env.systemVolume || {};
  const server = env.engineKind === "server" || !!env.serverRunning;
  const list = [];
  const add = (e) => list.push(e);

  add(env.engineKind === "offline"
    ? { id: "chat", name: "Answer with Claude", status: "missing", why: "No Claude connection is active, so only the built-in email and discrepancy checkers run.", missing: "Open the claude.ai link while signed in, or start the local server with an API key.", unlocks: "give full answers, drafts, recommendations and skill plans." }
    : env.serviceApproved
      ? { id: "chat", name: "Answer with Claude", status: "ready", can: env.engineKind === "server" ? "Claude API through the local server." : "Your claude.ai account." }
      : { id: "chat", name: "Answer with Claude", status: "needs_you", why: "You haven't confirmed that BMCC permits sending work content to this Claude service.", missing: "Your confirmation in Settings > Engine.", unlocks: "answer with Claude." });

  add(env.engineKind !== "server"
    ? { id: "web_research", name: "Research the web with citations", status: "missing", why: "In the claude.ai version, Claude gets no web access, and I won't invent sources.", missing: "The local server on your computer with an Anthropic API key.", unlocks: "search government, institutional and research sources and cite them with links and dates." }
    : env.webResearch
      ? { id: "web_research", name: "Research the web with citations", status: "ready", can: "Claude's web search tool, citations shown under each answer." }
      : { id: "web_research", name: "Research the web with citations", status: "needs_you", why: "Web research is switched off.", missing: "Your permission in Settings > Permissions > Public web research.", unlocks: "research labor markets, grants, comparable programs and policy, with citations." });

  add({ id: "voice_volume", name: "Change my speaking volume", status: sp.synthesis ? "ready" : "missing", can: "Say or type \"louder\", \"quieter\" or \"volume to 40%\".", why: sp.synthesis ? "" : "This browser has no speech output.", missing: sp.synthesis ? "" : "A browser with speech synthesis (Edge, Chrome, Safari).", unlocks: "speak my answers." });

  if (!sp.synthesis) add({ id: "speak", name: "Speak with a human-like male voice", status: "missing", why: "This browser has no speech output.", missing: "Edge, Chrome or Safari.", unlocks: "speak my answers." });
  else if (sp.maleVoice && (sp.maleVoiceLocal || sp.cloudVoicesAllowed))
    add({ id: "speak", name: "Speak with a human-like male voice", status: sp.maleVoiceNatural ? "ready" : "partial", can: `Speaking as "${sp.maleVoice}".`, why: sp.maleVoiceNatural ? "" : "The best male voice on this device is an older, more robotic one.", missing: sp.maleVoiceNatural ? "" : "A natural male voice. Mac: System Settings > Accessibility > Spoken Content > System Voice > Manage Voices, download Evan or Nathan (Enhanced). Windows: open O.T.T.E.R. in Microsoft Edge, which has natural voices such as Andrew and Guy.", unlocks: "sound like a person rather than a screen reader." });
  else if (sp.cloudMaleVoice && !sp.cloudVoicesAllowed)
    add({ id: "speak", name: "Speak with a human-like male voice", status: "needs_you", why: `The most natural male voice here ("${sp.cloudMaleVoice}") is an online voice: the text I speak is sent to ${sp.cloudVendor || "the browser maker"} to be turned into audio. That is an outside service, so it needs your OK.`, missing: "Your permission in Settings > Voice > Allow online voices, if BMCC policy allows it.", unlocks: "use the most human-sounding male voice this browser offers." });
  else add({ id: "speak", name: "Speak with a human-like male voice", status: "missing", why: "No male voice is installed in this browser.", missing: "Mac: download Evan or Nathan (Enhanced) in Spoken Content settings. Windows: use Microsoft Edge. Chromebook or Chrome: the \"Google UK English Male\" voice (online).", unlocks: "answer out loud in a male voice." });

  if (env.engineKind !== "server" && !env.serverRunning)
    add({ id: "listen", name: "Hear you (hands-free conversation)", status: "blocked", why: "Pages on claude.ai are not allowed to use the microphone.", missing: "The local server version, opened in Chrome, Edge or Safari on your computer. Meanwhile, use your keyboard's dictation (Windows+H, or Fn twice on a Mac) in the message box.", unlocks: "hold a hands-free conversation: you talk, pause, I answer out loud and listen again." });
  else if (!sp.recognition)
    add({ id: "listen", name: "Hear you (hands-free conversation)", status: "missing", why: "This browser has no speech recognition (Firefox doesn't).", missing: "Chrome, Edge or Safari.", unlocks: "hold a hands-free conversation." });
  else if (!sp.recognitionAllowed)
    add({ id: "listen", name: "Hear you (hands-free conversation)", status: "needs_you", why: sp.onDevice ? "Listening is off." : "Browser speech recognition sends your audio to the browser maker (Google for Chrome, Microsoft for Edge, Apple for Safari) to be transcribed. That is an outside service, so it needs your OK.", missing: "Your permission in Settings > Voice > Allow listening.", unlocks: "hold a hands-free conversation." });
  else add({ id: "listen", name: "Hear you (hands-free conversation)", status: "ready", can: sp.onDevice ? "Listening, transcribed on this device." : "Listening through the browser's speech service." });

  if (!server)
    add({ id: "system_volume", name: "Control your computer's volume", status: "blocked", why: "Browsers do not let any web page change the computer's volume. That protection applies to claude.ai pages too.", missing: "The local server running on your computer (npm start), which can use your operating system's volume command.", unlocks: "set the computer to 20% at launch and raise or lower it when you ask, each change approved by you." });
  else if (!vol.available)
    add({ id: "system_volume", name: "Control your computer's volume", status: "missing", why: vol.reason || "The local server could not find a volume control tool on this computer.", missing: vol.fix || "macOS: built in. Windows: PowerShell (built in). Linux: install pulseaudio-utils (pactl) or alsa-utils (amixer).", unlocks: "change the computer's volume when you approve it." });
  else if (!env.systemVolumePermitted)
    add({ id: "system_volume", name: "Control your computer's volume", status: "needs_you", why: "Changing a system setting needs your permission.", missing: "Settings > Permissions > This computer's volume: read and write.", unlocks: "change the computer's volume, one approved change at a time." });
  else add({ id: "system_volume", name: "Control your computer's volume", status: "ready", can: `Through ${vol.method || "the operating system"}. Each change still asks for your approval.` });

  add(env.floatSupported
    ? { id: "float", name: "Float on top of other windows", status: "ready", can: "Chrome's always-on-top mini window." }
    : { id: "float", name: "Float on top of other windows", status: env.engineKind === "artifact" ? "blocked" : "missing", why: env.engineKind === "artifact" ? "Pages inside claude.ai can't open Chrome's always-on-top window." : "This browser doesn't support always-on-top windows for web pages.", missing: "The O.T.T.E.R. helper (npm run helper) in Google Chrome 116 or newer, or Microsoft Edge.", unlocks: "stay on top of your other windows as a small otter you can talk to." });
  add({ id: "outlook_read", name: "Read your Outlook mailbox", status: "blocked", why: "BMCC does not allow Claude's Microsoft 365 connector, and I will not work around that through your browser session.", missing: "BMCC IT approval of a Microsoft 365 connector or a Microsoft Graph app registration with read-only mail scope.", unlocks: "triage your inbox daily and track commitments and deadlines without copy and paste." });
  add({ id: "send_email", name: "Send, reply or forward email", status: "blocked", why: "No authorized email integration exists, so an approved draft comes back to you to send.", missing: "The same BMCC-approved Microsoft 365 connection, with send permission.", unlocks: "send exactly what you approve, one approval per message." });
  add({ id: "calendar", name: "Check or schedule meetings", status: "missing", why: "O.T.T.E.R. has no calendar connection. BMCC meetings live in Outlook, which is blocked; a Google Calendar connector exists on your claude.ai account but isn't wired in.", missing: "For BMCC: an approved Outlook calendar connection. For personal: wiring the Google Calendar connector into O.T.T.E.R. with read-only permission.", unlocks: "find meeting times, prepare meeting briefs and propose invitations for your approval." });
  add({ id: "chrome_bridge", name: "Fill forms and websites through Claude in Chrome", status: "missing", why: "There is no supported way for a web app to control the Claude in Chrome extension.", missing: "Running these skills in Claude in Chrome or Cowork directly. O.T.T.E.R. writes the brief for you to paste.", unlocks: "complete course requests, PSCs, IR requests and website updates end to end, still stopping before Submit." });
  add({ id: "skill_scripts", name: "Produce Word, Excel, PowerPoint or PDF files with your skills", status: "missing", why: "Those skills run scripts that execute inside Claude Code, Cowork or claude.ai, not inside a web page.", missing: "Running the skill in Cowork or Claude Code. O.T.T.E.R. prepares the inputs.", unlocks: "hand you board reports, OI notes and FTE reports as finished files." });
  add({ id: "memory_sync", name: "Remember across your devices", status: "partial", can: "Remembers on this browser and device.", why: "History is kept local on purpose, so BMCC content never goes to an outside database.", missing: "A BMCC-approved storage location (for example a BMCC SharePoint site approved for this use).", unlocks: "keep the same history on your laptop and phone." });
  add(env.ferpaAttested
    ? { id: "student_records", name: "Work with student education records", status: "partial", can: "Allowed under the basis you recorded, with redaction of IDs.", why: "Detection is pattern-based and is not a FERPA certification.", missing: "Review by BMCC's FERPA officer.", unlocks: "tell you the use has been reviewed, not just attested." }
    : { id: "student_records", name: "Work with student education records", status: "blocked", why: "FERPA processing is off, so anything that looks like a student record is stopped before it leaves this device.", missing: "A lawful basis and a named BMCC approver recorded in Settings > Privacy.", unlocks: "analyze material that includes student-level detail." });
  add({ id: "learning", name: "Learn from experience", status: "partial", can: "Counts what you ask for and where I get stuck, on this device, and suggests connectors and skills from that.", why: "I don't retrain myself, and I don't read your past conversations to learn. I count request types and missing pieces.", missing: "Nothing required. Approving \"save to knowledge base\" proposals gives me facts to reuse.", unlocks: "bring the right facts into answers without you repeating them." });
  return list;
}

const MATCHERS = [
  ["send_email", /\b(send|reply|forward|email (it|this|them)|shoot (an|a) (email|note))\b/i],
  ["outlook_read", /\b(inbox|outlook|my (e-?mail|mail)|check (my )?e-?mail|unread)\b/i],
  ["calendar", /\b(calendar|schedule (a|the)? ?meeting|availability|book (a|the) (time|meeting)|invite)\b/i],
  ["system_volume", /\b(computer|system|laptop|pc|mac) (volume|sound)|(volume|sound) (of|on) (the|my) (computer|laptop|pc|mac)\b/i],
  ["listen", /\b(hear me|listen|microphone|mic\b|talk to you|voice conversation|hands-?free)\b/i],
  ["float", /\b(float|on top|always on top|pop ?out|picture in picture)\b/i],
  ["speak", /\b(male voice|your voice|sound (more )?(human|natural)|speak|talk (back|to me|out loud))\b/i],
  ["web_research", /\b(search the web|google|look (it )?up online|internet|web research|latest (news|data))\b/i],
  ["chrome_bridge", /\b(chrome|fill (out |in )?(the )?form|submit (the )?form|update the website|jotform|course request form)\b/i],
  ["skill_scripts", /\b(docx|word (doc|document|file)|excel|xlsx|powerpoint|pptx|pdf file|make (me )?a file)\b/i],
  ["student_records", /\b(student (records?|grades?|ids?)|transcripts?|banner|synergy|gpa|failing students)\b/i],
  ["memory_sync", /\b(other (device|computer)|my phone|sync|across devices)\b/i],
];

export function matchCapabilities(text, list) {
  const ids = MATCHERS.filter(([, re]) => re.test(text || "")).map(([id]) => id);
  return list.filter((c) => ids.includes(c.id));
}

// The three-part explanation, as a callout the interface labels.
export function explain(c) {
  if (c.status === "ready") return `:::finding\n**${c.name}: ready.** ${c.can || ""}\n:::`;
  return [
    ":::limitation",
    `**${c.name}** (${STATUS_TEXT[c.status].toLowerCase()})`,
    "",
    c.can ? `- **What I can do now:** ${c.can}` : null,
    `- **Why I can't:** ${c.why}`,
    `- **The missing piece:** ${c.missing}`,
    `- **With that piece, I could:** ${c.unlocks}`,
    ":::",
  ].filter((l) => l !== null).join("\n");
}

// Compact form for the system prompt.
export function capabilitySummary(list) {
  return list.map((c) => `- ${c.id} [${c.status}] ${c.name}${c.status === "ready" ? "" : `. Why not: ${c.why} Missing: ${c.missing} With it: ${c.unlocks}`}`).join("\n");
}
