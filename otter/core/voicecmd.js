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
  return null;
}
