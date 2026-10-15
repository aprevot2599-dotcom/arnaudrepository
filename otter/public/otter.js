// The O.T.T.E.R. avatar: one inline SVG river otter whose expression and props are switched
// by CSS classes. State comes only from real application events (see app.js setActivity).

const SVG = `
<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <g class="water-g"><path class="water" d="M4 104 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0"/><path class="water" d="M14 112 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0"/></g>

  <g class="prop p-board"><rect class="paper" x="4" y="54" width="32" height="24" rx="2"/><rect class="accent" x="9" y="68" width="4" height="6"/><rect class="accent" x="16" y="63" width="4" height="11"/><rect class="warm" x="23" y="59" width="4" height="15"/><path class="pline" d="M12 78 L8 92 M28 78 L32 92" style="opacity:1"/></g>
  <g class="prop p-map"><rect class="paper" x="6" y="70" width="30" height="22" rx="2"/><path class="pline" d="M10 86 q6 -10 12 -4 t10 -8" stroke-dasharray="2 2" style="opacity:1"/><path class="badf" d="M31 72 l2.2 3.5 h-4.4z"/></g>
  <g class="prop p-stack"><rect class="paper" x="14" y="98" width="26" height="6" rx="1"/><rect class="paper" x="16" y="91" width="24" height="6" rx="1" transform="rotate(-3 28 94)"/><rect class="paper" x="13" y="84" width="25" height="6" rx="1" transform="rotate(4 25 87)"/><rect class="paper" x="17" y="77" width="23" height="6" rx="1" transform="rotate(-6 28 80)"/></g>
  <g class="prop p-two-papers"><rect class="paper" x="4" y="60" width="20" height="26" rx="2"/><path class="pline" d="M8 67 h12 M8 72 h12 M8 77 h8"/><rect class="paper" x="96" y="60" width="20" height="26" rx="2"/><path class="pline" d="M100 67 h12 M100 72 h12 M100 77 h8"/><text x="14" y="58" font-size="9" font-weight="700" class="warnf" text-anchor="middle">A</text><text x="106" y="58" font-size="9" font-weight="700" class="warnf" text-anchor="middle">B</text></g>
  <g class="prop p-gate"><path class="ink-line" stroke-width="2" d="M6 60 v52 M14 60 v52 M22 60 v52 M30 60 v52 M3 66 h30 M3 104 h30"/><rect class="warm" x="12" y="78" width="12" height="10" rx="2"/><path class="ink-line" stroke-width="2" d="M14.5 78 v-3 a3.5 3.5 0 0 1 7 0 v3"/></g>

  <g class="body-g">
    <path class="fur tail" d="M78 98 C92 104 104 100 110 88 C106 92 98 96 86 92 Z"/>
    <ellipse class="fur" cx="60" cy="86" rx="25" ry="26"/>
    <ellipse class="belly" cx="60" cy="92" rx="15" ry="18"/>
    <ellipse class="fur-dark" cx="47" cy="110" rx="7" ry="3.5"/>
    <ellipse class="fur-dark" cx="73" cy="110" rx="7" ry="3.5"/>
    <g class="head-g">
      <circle class="fur ear" cx="41" cy="31" r="5.5"/><circle class="fur ear" cx="79" cy="31" r="5.5"/>
      <circle class="fur-dark" cx="41" cy="31" r="2.6"/><circle class="fur-dark" cx="79" cy="31" r="2.6"/>
      <ellipse class="fur" cx="60" cy="48" rx="23" ry="21"/>
      <ellipse class="belly" cx="60" cy="57" rx="13" ry="9.5"/>
      <g class="eyes">
        <circle class="ink" cx="50.5" cy="45" r="3.8"/><circle class="ink" cx="69.5" cy="45" r="3.8"/>
        <g class="pupils"><circle cx="51.8" cy="43.6" r="1.3" fill="#fff"/><circle cx="70.8" cy="43.6" r="1.3" fill="#fff"/></g>
      </g>
      <path class="ink-line brow brow-l" stroke-width="1.6" d="M45.5 38.5 Q50 36.5 54.5 38"/>
      <path class="ink-line brow brow-r" stroke-width="1.6" d="M65.5 38 Q70 36.5 74.5 38.5"/>
      <g class="glasses"><circle class="glass" cx="50.5" cy="45" r="6"/><circle class="glass" cx="69.5" cy="45" r="6"/><path class="ink-line" stroke-width="1.2" d="M56.5 45 h7"/></g>
      <ellipse class="ink" cx="60" cy="52.5" rx="4.2" ry="3"/>
      <path class="ink-line mouth-flat" stroke-width="1.4" d="M55.5 59.5 Q60 61.5 64.5 59.5"/>
      <path class="ink-line mouth-smile" stroke-width="1.6" d="M53.5 58 Q60 66 66.5 58"/>
      <path class="whisker" d="M48 55 L35 52 M48 58 L35 59 M72 55 L85 52 M72 58 L85 59"/>
    </g>
    <g class="paws"><ellipse class="fur-dark paw-l" cx="49" cy="76" rx="5.5" ry="4"/><ellipse class="fur-dark paw-r" cx="71" cy="76" rx="5.5" ry="4"/></g>
  </g>

  <g class="prop p-float-docs"><rect class="paper" x="48" y="10" width="14" height="18" rx="1.5" transform="rotate(-10 55 19)"/><rect class="paper" x="60" y="12" width="14" height="18" rx="1.5" transform="rotate(8 67 21)"/></g>
  <g class="prop p-magnifier"><circle cx="94" cy="66" r="9" style="fill:var(--river)" opacity=".18"/><circle class="glass" cx="94" cy="66" r="9" stroke-width="2.4"/><path class="ink-line" stroke-width="3.5" d="M88 73 L80 81"/></g>
  <g class="prop p-envelopes"><g class="env1"><rect class="paper" x="78" y="80" width="24" height="15" rx="1.5"/><path class="pline" style="opacity:1" d="M78 80 l12 8 l12 -8"/></g><g class="env2"><rect class="paper" x="86" y="64" width="22" height="14" rx="1.5"/><path class="pline" style="opacity:1" d="M86 64 l11 7.5 l11 -7.5"/></g></g>
  <g class="prop p-calculator"><rect class="fur-dark" x="84" y="70" width="20" height="26" rx="3"/><rect class="accent" x="87" y="73" width="14" height="6" rx="1"/><g style="fill:var(--prop-paper)"><rect x="87" y="82" width="3.5" height="3" /><rect x="92.3" y="82" width="3.5" height="3"/><rect x="97.6" y="82" width="3.5" height="3"/><rect x="87" y="88" width="3.5" height="3"/><rect x="92.3" y="88" width="3.5" height="3"/><rect x="97.6" y="88" width="3.5" height="3"/></g><text class="num accent" x="88" y="64" font-size="8" font-weight="700">7</text><text class="num warm" x="96" y="60" font-size="8" font-weight="700">%</text><text class="num accent" x="104" y="66" font-size="8" font-weight="700">$</text></g>
  <g class="prop p-puzzle"><path class="piece accent" d="M84 78 h8 a3 3 0 1 1 5 0 h5 v8 a3 3 0 1 0 0 5 v5 h-18z"/><path class="piece warm" d="M100 64 h10 v12 h-4 a3 3 0 1 0 -5 0 h-1z"/></g>
  <g class="prop p-coffee"><path class="ink-line steam" stroke-width="1.2" d="M90 66 q-2 -4 0 -7 M95 66 q-2 -4 0 -7"/><rect class="warm" x="85" y="70" width="15" height="15" rx="2.5"/><path class="ink-line" stroke-width="2" d="M100 73 q5 0 5 4 t-5 4"/></g>
  <g class="prop p-sheet"><rect class="paper" x="80" y="66" width="30" height="24" rx="1.5"/><path class="pline" d="M80 72 h30 M80 78 h30 M80 84 h30 M90 66 v24 M100 66 v24"/><rect class="warnf" x="100.5" y="78.5" width="9" height="5" opacity=".7"/></g>
  <g class="prop p-bulb"><circle class="warnf" cx="94" cy="20" r="7"/><rect class="fur-dark" x="91" y="26" width="6" height="4" rx="1"/><path class="ink-line" stroke-width="1.3" d="M94 8 v-4 M84 12 l-3 -3 M104 12 l3 -3 M82 21 h-4 M106 21 h4"/></g>
  <g class="prop p-laptop"><rect class="fur-dark" x="40" y="66" width="40" height="22" rx="2"/><rect class="accent" x="43" y="69" width="34" height="16" rx="1" opacity=".85"/><rect class="ink" x="34" y="88" width="52" height="4" rx="2"/></g>
  <g class="prop p-clipboard"><rect class="warm" x="82" y="64" width="22" height="30" rx="2.5"/><rect class="paper" x="85" y="69" width="16" height="22" rx="1"/><rect class="fur-dark" x="88" y="61" width="10" height="5" rx="1.5"/><path class="pline" style="opacity:.8" d="M88 75 h10 M88 80 h10 M88 85 h7"/></g>
  <g class="prop p-shield"><path class="accent" d="M94 58 l12 4 v9 c0 8 -6 13 -12 15 c-6 -2 -12 -7 -12 -15 v-9z"/><path style="stroke:var(--surface)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M88.5 72 l4 4 l7 -8"/></g>
  <g class="prop p-thumb"><ellipse class="fur-dark" cx="94" cy="74" rx="7" ry="6"/><rect class="fur-dark" x="91" y="60" width="5" height="12" rx="2.5"/><path class="okf" d="M104 58 l1.4 3 l3 1.4 l-3 1.4 l-1.4 3 l-1.4 -3 l-3 -1.4 l3 -1.4z"/></g>
  <g class="prop p-question"><text x="90" y="30" font-size="22" font-weight="700" class="warnf">?</text></g>
</svg>`;

export const STATES = {
  idle: "Ready when you are.",
  listening: "I'm listening…",
  speaking: "Talking…",
  thinking: "Thinking it through…",
  researching: "Digging into sources…",
  reading_email: "Reading your email…",
  analyzing: "Checking the numbers…",
  discrepancy: "Found something that doesn't match",
  conflict: "Weighing conflicting evidence",
  opportunity: "Spotted an opportunity",
  drafting: "Writing a draft…",
  awaiting_approval: "Your turn: tap to review.",
  privacy: "Privacy guard stopped this",
  locked: "Locked door: needs authorization",
  done: "Done!",
  error: "Hmm, that didn't work.",
};

// Activities shown while thinking. Discrepancy Alert and Permission Patrol are not in the
// random pool: they appear only when a real discrepancy or lock exists.
export const THINKING_ACTIVITIES = ["floating", "inbox", "calculator", "map", "papers", "puzzle", "coffee", "briefing"];

export function mountOtter(el) {
  el.innerHTML = SVG;
  let state = "idle";
  return {
    get state() { return state; },
    set(next, { activity } = {}) {
      state = STATES[next] ? next : "idle";
      const keep = [...el.classList].filter((c) => !c.startsWith("s-") && !c.startsWith("act-"));
      el.className = keep.join(" ");
      el.classList.add("s-" + state);
      if (state === "thinking") el.classList.add("act-" + (activity || THINKING_ACTIVITIES[Math.floor(Math.random() * THINKING_ACTIVITIES.length)]));
      el.setAttribute("aria-label", "O.T.T.E.R.: " + STATES[state]);
      return STATES[state];
    },
    glasses(on) { el.classList.toggle("glasses-on", !!on); },
  };
}
