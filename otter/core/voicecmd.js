// Local commands that never go to Claude: speaking volume, computer volume, voice and
// listening controls. Parsed before a message is sent so "louder" costs no usage.

const NUM = /(\d{1,3})\s*(?:%|percent)?/;

export function parseCommand(text) {
  const t = String(text || "").toLowerCase().trim().replace(/[.!?]+$/, "");
  if (!t || t.length > 80) return null;
  const system = /\b(computer|system|laptop|pc|mac|machine|windows|speaker)s?\b/.test(t);
  const target = system ? "system" : "voice";
  let m;
  if ((m = t.match(/\b(?:set|put|change|make|turn)?\s*(?:the |my )?(?:computer |system |laptop |pc |mac |machine )?(?:volume|sound)\s*(?:level\s*)?(?:to|at)\s+/)) && NUM.test(t.slice(m.index + m[0].length))) {
    const level = Math.max(0, Math.min(100, parseInt(t.slice(m.index + m[0].length).match(NUM)[1], 10)));
    return { kind: "volume_set", target, level };
  }
  if (/^(?:please )?(?:louder|volume up|speak up|turn (?:it |the volume |that )?up|raise (?:the |your )?(?:volume|voice)|(?:a bit |a little )?louder please)\b/.test(t) || /\b(?:turn up|raise) (?:the )?(?:computer |system )?volume\b/.test(t))
    return { kind: "volume_step", target, step: +15 };
  if (/^(?:please )?(?:quieter|softer|volume down|turn (?:it |the volume |that )?down|lower (?:the |your )?(?:volume|voice))\b/.test(t) || /\b(?:turn down|lower) (?:the )?(?:computer |system )?volume\b/.test(t))
    return { kind: "volume_step", target, step: -15 };
  if (/^(?:mute|be quiet|stop talking|silence|hush)(?: please)?$/.test(t)) return { kind: "mute" };
  if (/^(?:unmute|start talking|talk to me|speak again|voice on)(?: please)?$/.test(t)) return { kind: "unmute" };
  if (/^(?:stop listening|pause listening|stop the conversation|end conversation|conversation off)(?: please)?$/.test(t)) return { kind: "listen_off" };
  if (/^(?:start listening|conversation on|let'?s talk|start (?:a )?conversation)(?: please)?$/.test(t)) return { kind: "listen_on" };
  if (/^(?:what(?:'s| is) (?:the |my )?volume|current volume|volume\??)$/.test(t)) return { kind: "volume_query", target };
  if (/^(?:maximi[sz]e|full screen|open (?:the )?(?:full|big) (?:view|window|screen)|go big|expand)(?: (?:it|the window|please))*$/.test(t)) return { kind: "ui", ui: "maximize" };
  if (/^(?:minimi[sz]e|shrink|go small|mini(?: mode)?|just the otter|get out of the way)(?: (?:it|the window|please))*$/.test(t)) return { kind: "ui", ui: "minimize" };
  if (/^(?:(?:show|open)(?: me)? (?:the )?chat|let me type|type (?:it|instead))(?: please)?$/.test(t)) return { kind: "ui", ui: "chat" };
  if (/^(?:hide|close) (?:the )?chat(?: please)?$/.test(t)) return { kind: "ui", ui: "hide_chat" };
  if (/^(?:float|stay on top|pop out|float (?:on top|the window)|keep (?:it|yourself) on top)(?: please)?$/.test(t)) return { kind: "ui", ui: "float" };
  if (/^(?:what do you know about me|what have you learned(?: about me)?|what do you remember(?: about me)?)\??$/.test(t)) return { kind: "profile" };
  if (/^(?:yes|yeah|yep|sure|ok(?:ay)?|please do|remember (?:it|that)|keep it|go ahead)(?: please)?$/.test(t)) return { kind: "confirm", yes: true };
  if (/^(?:no|nope|don't|do not|forget it|skip(?: it)?|never mind|nevermind)(?: thanks)?$/.test(t)) return { kind: "confirm", yes: false };
  return null;
}

// Wake word: in helper mode O.T.T.E.R. acts only on speech addressed to it ("Otter, ...") or
// said within the follow-up window after it spoke. Speech recognizers often hear "otter" as
// "other", "odder" or "auto", so those are accepted at the start of an utterance.
const WAKE = /^\s*(?:hey |hi |ok |okay )?(?:otter|odder|other|auto|outer|ottar)\b[,.!?:;\s]*/i;
export function parseWake(text, { followUp = false } = {}) {
  const t = String(text || "").trim();
  const m = t.match(WAKE);
  if (m) return { addressed: true, text: t.slice(m[0].length).trim() };
  return { addressed: !!followUp, text: t };
}
