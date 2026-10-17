/* Piper: a full-body animated character. Builds an SVG rig, then drives it every frame:
   moods set her face and pick a body action; idle time adds walking, looking around and play. */
(function () {
  const SKIN = "#B97A57", SKIN_D = "#9A5F40", HAIR = "#2B1810", MOUTH = "#7A2430", TONGUE = "#E9707A";
  const SHIRT = "#2BA3A0", STRIPE = "#FFF4DF", DENIM = "#3E6DB5", DENIM_D = "#2F5899", LEGS = "#6B4C9A", SHOE = "#E04B3C";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- Markup ---------- */
  const puff = (cx, cy, r) => {
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; s += `<circle cx="${(cx + Math.cos(a) * r * .82).toFixed(1)}" cy="${(cy + Math.sin(a) * r * .82).toFixed(1)}" r="${(r * .42).toFixed(1)}"/>`; }
    return s;
  };
  const eye = (id, x) => `
    <g id="eye${id}" transform="translate(${x},-42)">
      <clipPath id="clip${id}"><ellipse rx="7.5" ry="9"/></clipPath>
      <g id="eyeOpen${id}">
        <ellipse rx="7.5" ry="9" fill="#fff"/>
        <g id="iris${id}"><circle r="5.2" fill="#6B4226"/><circle r="2.5" fill="#160C06"/><circle cx="1.7" cy="-1.9" r="1.5" fill="#fff"/></g>
        <rect id="lid${id}" clip-path="url(#clip${id})" x="-9" y="-10" width="18" height="0" fill="${SKIN}"/>
        <path d="M${id === "L" ? "-7,-4 l-3,-2.5" : "7,-4 l3,-2.5"}" stroke="${HAIR}" stroke-width="1.6" stroke-linecap="round"/>
      </g>
      <path id="eyeArc${id}" d="M-7,2 Q0,-7 7,2" stroke="${HAIR}" stroke-width="2.6" fill="none" stroke-linecap="round" display="none"/>
    </g>`;
  const headMarkup = () => `
    <g fill="${HAIR}">${puff(-31, -76, 14)}${puff(31, -76, 14)}</g>
    <ellipse cx="-23" cy="-66" rx="5" ry="3" fill="#F2766B" transform="rotate(-35 -23 -66)"/>
    <ellipse cx="23" cy="-66" rx="5" ry="3" fill="#F2766B" transform="rotate(35 23 -66)"/>
    <g transform="rotate(28 36 -84)"><rect x="33" y="-104" width="5" height="24" rx="1" fill="#FFD34E"/><rect x="33" y="-106" width="5" height="4" rx="1" fill="#F49AC2"/><path d="M33,-80 h5 l-2.5,5z" fill="#E8C9A0"/></g>
    <ellipse cx="0" cy="-44" rx="38" ry="38" fill="${HAIR}"/>
    <circle cx="-35" cy="-27" r="8" fill="${HAIR}"/><circle cx="35" cy="-27" r="8" fill="${HAIR}"/>
    <ellipse cx="-33" cy="-38" rx="5" ry="7" fill="${SKIN_D}"/><ellipse cx="33" cy="-38" rx="5" ry="7" fill="${SKIN_D}"/>
    <path d="M-33,-31 l1.6,3.2 3.5,.5 -2.5,2.5 .6,3.5 -3.2,-1.7 -3.2,1.7 .6,-3.5 -2.5,-2.5 3.5,-.5z" fill="#F5C35A"/>
    <path d="M33,-31 l1.6,3.2 3.5,.5 -2.5,2.5 .6,3.5 -3.2,-1.7 -3.2,1.7 .6,-3.5 -2.5,-2.5 3.5,-.5z" fill="#F5C35A"/>
    <ellipse cx="0" cy="-40" rx="33" ry="35" fill="${SKIN}"/>
    <path d="M-34,-44 C-36,-80 36,-80 34,-44 C26,-60 12,-64 0,-62 C-12,-64 -26,-60 -34,-44 Z" fill="${HAIR}"/>
    <g fill="${HAIR}"><circle cx="-23" cy="-61" r="5"/><circle cx="-13" cy="-65" r="5.5"/><circle cx="-2" cy="-66" r="5.5"/><circle cx="9" cy="-66" r="5.5"/><circle cx="20" cy="-62" r="5"/></g>
    <ellipse id="blushL" cx="-20" cy="-27" rx="6.5" ry="3.8" fill="#F2768B" opacity=".35"/>
    <ellipse id="blushR" cx="20" cy="-27" rx="6.5" ry="3.8" fill="#F2768B" opacity=".35"/>
    <g fill="${SKIN_D}" opacity=".7"><circle cx="-24" cy="-33" r=".9"/><circle cx="-19" cy="-34" r=".9"/><circle cx="-21.5" cy="-30.5" r=".9"/><circle cx="24" cy="-33" r=".9"/><circle cx="19" cy="-34" r=".9"/><circle cx="21.5" cy="-30.5" r=".9"/></g>
    ${eye("L", -12)}${eye("R", 12)}
    <path id="browL" d="M-6,0 Q0,-3.6 6,0" stroke="${HAIR}" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(-12,-56)"/>
    <path id="browR" d="M-6,0 Q0,-3.6 6,0" stroke="${HAIR}" stroke-width="3" fill="none" stroke-linecap="round" transform="translate(12,-56)"/>
    <path d="M-1.8,-32 Q0,-29.3 1.8,-32" stroke="${SKIN_D}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <g id="mouth" transform="translate(0,-21)"></g>
    <g id="talkMouth" transform="translate(0,-21)" display="none"><ellipse id="talkE" rx="5.5" ry="3" fill="${MOUTH}"/><ellipse id="talkT" cy="2" rx="3.4" ry="1.3" fill="${TONGUE}"/></g>
    <path id="sweat" d="M31,-64 q-4.5,7.5 0,9.5 q4.5,-2 0,-9.5z" fill="#8FD3F4" stroke="#5BB4DE" stroke-width=".8" display="none"/>`;
  const MOUTHS = {
    smile: `<path d="M-9,-1 Q0,8 9,-1" stroke="${MOUTH}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`,
    grin: `<path d="M-10,-2 Q0,12 10,-2 Q0,2 -10,-2Z" fill="${MOUTH}"/><path d="M-8,-1 Q0,2.5 8,-1 L7.5,1.5 Q0,4.5 -7.5,1.5Z" fill="#fff"/>`,
    laugh: `<path d="M-11,-3 Q0,16 11,-3 Q0,0 -11,-3Z" fill="${MOUTH}"/><path d="M-9,-2 Q0,1.5 9,-2 L8.5,.5 Q0,3.5 -8.5,.5Z" fill="#fff"/><ellipse cy="7" rx="5" ry="2.6" fill="${TONGUE}"/>`,
    soft: `<path d="M-6,1 Q0,4.5 6,1" stroke="${MOUTH}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    o: `<ellipse cy="1" rx="4.2" ry="5.2" fill="${MOUTH}"/>`,
    smallo: `<ellipse cy="1" rx="2.6" ry="3" fill="${MOUTH}"/>`,
    flat: `<path d="M-6,1 Q1,-1 7,2" stroke="${MOUTH}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    tongue: `<path d="M-9,-1 Q0,8 9,-1" stroke="${MOUTH}" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M-1,3 q3,7.5 6.5,0z" fill="${TONGUE}" stroke="${MOUTH}" stroke-width="1.2"/>`,
    oops: `<path d="M-9,-1 Q0,6 9,-1 Q0,1 -9,-1Z" fill="${MOUTH}"/><path d="M-7.5,-.6 Q0,1.6 7.5,-.6 L7,1 Q0,3 -7,1Z" fill="#fff"/>`,
    yawn: `<ellipse cy="1" rx="4" ry="6.2" fill="${MOUTH}"/>`,
  };
  const arm = (id) => `
    <g id="arm${id}"><rect x="-5" y="-2" width="10" height="24" rx="5" fill="${SHIRT}"/><path d="M-5,7 h10 M-5,15 h10" stroke="${STRIPE}" stroke-width="2.4"/>
      <g id="fore${id}"><rect x="-4" y="0" width="8" height="20" rx="4" fill="${SKIN}"/><rect x="-5" y="-1" width="10" height="4" rx="2" fill="${STRIPE}"/>
        <g id="hand${id}" transform="translate(0,22)"><circle r="5.8" fill="${SKIN}"/><ellipse id="thumb${id}" cx="${id === "L" ? 4 : -4}" cy="-5" rx="2" ry="4" fill="${SKIN}" stroke="${SKIN_D}" stroke-width=".6" display="none"/></g>
      </g>
    </g>`;
  const leg = (id) => `
    <g id="leg${id}"><rect x="-5" y="0" width="10" height="31" rx="5" fill="${LEGS}"/>
      <g id="shin${id}" transform="translate(0,30)"><rect x="-4.5" y="0" width="9" height="27" rx="4.5" fill="${LEGS}"/>
        <path d="${id === "L" ? "M5,25 h-12 q-6,0 -6,5 v2 h18z" : "M-5,25 h12 q6,0 6,5 v2 h-18z"}" fill="${SHOE}"/><path d="M${id === "L" ? "-13" : "-5"},30 h18 v2 h-18z" fill="#fff"/></g>
    </g>`;
  const bodyMarkup = () => `
    <g id="pp" style="cursor:pointer">
      <ellipse id="shadow" cx="0" cy="1" rx="30" ry="5" fill="#000" opacity=".12"/>
      <g id="ppBody">
        <rect x="-40" y="-215" width="80" height="215" fill="transparent"/>
        <g id="legLw" transform="translate(-10,-62)">${leg("L")}</g>
        <g id="legRw" transform="translate(10,-62)">${leg("R")}</g>
        <g id="torso" transform="translate(0,-62)">
          <clipPath id="torsoClip"><rect x="-19" y="-58" width="38" height="34" rx="10"/></clipPath>
          <rect x="-19" y="-58" width="38" height="34" rx="10" fill="${SHIRT}"/>
          <g clip-path="url(#torsoClip)" stroke="${STRIPE}" stroke-width="2.6"><path d="M-20,-50 h40 M-20,-42 h40 M-20,-34 h40"/></g>
          <path d="M-26,3 L26,3 L18,-34 L-18,-34 Z" fill="${DENIM}"/>
          <path d="M-26,3 L26,3" stroke="${DENIM_D}" stroke-width="2"/>
          <rect x="-13" y="-50" width="26" height="18" rx="3" fill="${DENIM}"/>
          <path d="M-12,-49 L-16,-58 M12,-49 L16,-58" stroke="${DENIM}" stroke-width="4" stroke-linecap="round"/>
          <circle cx="-10" cy="-47" r="1.6" fill="#FFD34E"/><circle cx="10" cy="-47" r="1.6" fill="#FFD34E"/>
          <rect x="-6.5" y="-45" width="13" height="11" rx="2" fill="#FFD34E"/>
          <text x="0" y="-36.5" font-family="Georgia,serif" font-size="10" font-weight="bold" fill="${DENIM_D}" text-anchor="middle">π</text>
          <rect x="-5.5" y="-66" width="11" height="10" fill="${SKIN_D}"/>
          <g id="armLw" transform="translate(-19,-52)">${arm("L")}</g>
          <g id="head" transform="translate(0,-60)">${headMarkup()}</g>
          <g id="armRw" transform="translate(19,-52)">${arm("R")}</g>
        </g>
      </g>
    </g>`;

  /* Static portrait for chat bubbles and the phone page */
  const portrait = `<svg xmlns="${NS}" viewBox="-50 -112 100 100"><circle cx="0" cy="-62" r="50" fill="#DCEFF8"/><g transform="translate(0,-8)"><rect x="-26" y="-14" width="52" height="30" rx="14" fill="${SHIRT}"/><rect x="-5.5" y="-22" width="11" height="12" fill="${SKIN_D}"/>${headMarkup().replace('<g id="mouth" transform="translate(0,-21)"></g>', `<g transform="translate(0,-21)">${MOUTHS.grin}</g>`)}</g></svg>`;
  window.AVATAR = "data:image/svg+xml," + encodeURIComponent(portrait);

  /* ---------- Faces ---------- */
  const FACES = {
    calm:      { mouth: "smile", eyes: "open", lid: .1, blush: .35 },
    hello:     { mouth: "grin", eyes: "open", lid: 0, bdy: -2, blush: .45 },
    happy:     { mouth: "grin", eyes: "open", lid: .25, bdy: -2, blush: .5 },
    celebrate: { mouth: "laugh", eyes: "arc", bdy: -4, blush: .7 },
    proud:     { mouth: "smile", eyes: "open", lid: .4, bdy: -1, bdyR: -4, brR: -8, blush: .5 },
    thinking:  { mouth: "flat", eyes: "open", lid: .15, look: [-2.6, -3], bdyR: -4, brR: -6 },
    idea:      { mouth: "smallo", eyes: "open", wide: 1.12, bdy: -5, blush: .4 },
    empathy:   { mouth: "soft", eyes: "open", lid: .3, bdy: -1, brL: -14, brR: 14, blush: .45 },
    encourage: { mouth: "grin", eyes: "open", lid: .15, bdy: -1, brL: 6, brR: -6, blush: .45 },
    curious:   { mouth: "smallo", eyes: "open", look: [2.2, 0], bdyL: -5, brL: -6, blush: .35 },
    surprised: { mouth: "o", eyes: "open", wide: 1.18, bdy: -7, blush: .4 },
    listening: { mouth: "smile", eyes: "open", lid: .1, bdy: -1.5, blush: .35 },
    silly:     { mouth: "tongue", eyes: "winkL", bdy: -3, blush: .6 },
    oops:      { mouth: "oops", eyes: "open", lid: .1, bdy: -2, brL: -10, brR: 10, sweat: true, blush: .45 },
    sleepy:    { mouth: "yawn", eyes: "open", lid: .65, bdy: 1 },
  };
  const LINES = {
    calm: "Piper is here with you", hello: "Piper says hi!", happy: "Piper is happy", celebrate: "Piper is cheering for you!",
    proud: "Piper is proud of you", thinking: "Piper is thinking...", idea: "Piper has an idea!", empathy: "Piper understands",
    encourage: "Piper believes in you", curious: "Piper is curious", surprised: "Ooh, something new!", listening: "Piper is listening",
    silly: "Piper is being silly", oops: "Oops! Piper made a mistake", sleepy: "Piper is stretching",
  };
  window.MOOD_LINES = LINES;
  window.MOODS = new Set(Object.keys(LINES));
  const MOOD_ACTION = {
    calm: "idle", hello: "wave", happy: "bounce", celebrate: "party", proud: "hips", thinking: "think", idea: "idea",
    empathy: "heart", encourage: "thumbs", curious: "curious", surprised: "surprised", listening: "listen",
    silly: "wiggle", oops: "shrug", sleepy: "stretch",
  };

  /* ---------- Stage ---------- */
  const stage = document.getElementById("stage");
  if (!stage) return;
  const GROUND = 226;
  stage.innerHTML = `
    <rect class="st-wall" x="-2000" y="0" width="5000" height="${GROUND}"/>
    <rect class="st-floor" x="-2000" y="${GROUND}" width="5000" height="40"/>
    <path class="st-line" d="M-2000,${GROUND} H3000"/>
    <g id="board" transform="translate(18,26)">
      <rect width="176" height="104" rx="6" class="st-frame"/><rect x="7" y="7" width="162" height="90" rx="3" class="st-board"/>
      <text x="20" y="38" class="st-chalk">½ + ¼ = ¾</text>
      <text x="20" y="70" class="st-chalk small">π ≈ 3.14</text>
      <path d="M128,74 l18,-30 l18,30 z" class="st-doodle"/><path d="M132,30 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0" class="st-doodle"/>
      <rect x="120" y="94" width="20" height="5" rx="2" fill="#F4F1E6"/>
    </g>
    <g id="plant"><rect x="-14" y="${GROUND - 26}" width="28" height="26" rx="4" fill="#E07B4F"/><g fill="#4FA76B"><ellipse cx="-8" cy="${GROUND - 38}" rx="7" ry="14" transform="rotate(-25 -8 ${GROUND - 38})"/><ellipse cx="8" cy="${GROUND - 40}" rx="7" ry="15" transform="rotate(25 8 ${GROUND - 40})"/><ellipse cx="0" cy="${GROUND - 46}" rx="6" ry="16"/></g></g>
    ${bodyMarkup()}
    <g id="fx"></g>`;
  window.svgEl = stage;
  stage.dataset.mood = "calm";
  const $s = (id) => document.getElementById(id);
  const E = {};
  ["pp", "ppBody", "shadow", "legLw", "legRw", "shinL", "shinR", "torso", "armLw", "armRw", "foreL", "foreR", "thumbL", "thumbR", "head",
   "eyeL", "eyeR", "eyeOpenL", "eyeOpenR", "eyeArcL", "eyeArcR", "irisL", "irisR", "lidL", "lidR", "browL", "browR", "blushL", "blushR",
   "mouth", "talkMouth", "talkE", "talkT", "sweat", "fx", "plant", "board"].forEach(id => E[id] = $s(id));

  let vbW = 640;
  function fit() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    vbW = Math.max(300, 240 * r.width / r.height);
    stage.setAttribute("viewBox", `0 0 ${vbW.toFixed(1)} 240`);
    E.plant.setAttribute("transform", `translate(${(vbW - 34).toFixed(1)},0)`);
    E.board.style.display = vbW < 430 ? "none" : "";
    S.x = Math.min(Math.max(S.x, 60), vbW - 60); S.tx = Math.min(Math.max(S.tx, 60), vbW - 60);
  }

  /* ---------- State ---------- */
  const S = { x: 400, tx: 400, dir: 1, action: "wave", actStart: 0, face: "hello", talking: false, mouthOpen: 0, flapTarget: 0, nextFlap: 0,
    blinkUntil: 0, nextBlink: 2, lastBusy: 0, nextIdle: 6, lastUpset: -999, lastWin: -999, look: [0, 0], pointer: null };
  const P = {}; // current smoothed pose
  const KEYS = ["bob", "hop", "squash", "spin", "lean", "head", "aLs", "aLe", "aRs", "aRe", "lLh", "lLk", "lRh", "lRk",
    "lidL", "lidR", "wide", "bdyL", "bdyR", "brL", "brR", "lookX", "lookY", "blush"];
  KEYS.forEach(k => P[k] = (k === "squash" || k === "spin" || k === "wide") ? 1 : 0);
  let curMouth = "", curEyes = "", curThumbs = false;

  const now = () => performance.now() / 1000;
  function act(name) { S.action = name; S.actStart = now(); }
  window.piperAct = act;

  /* ---------- Actions: each returns target limb angles for elapsed time a and clock t ---------- */
  const rm = reduceMotion;
  const osc = (t, f) => rm ? 0 : Math.sin(t * f);
  const ACTIONS = {
    idle: { dur: 0, f: () => {} },
    wave: { dur: 2.6, f: (p, a, t) => { p.aRs = -140 + osc(t, 11) * 14; p.aRe = -25 + osc(t, 11) * 18; p.head = 6; } },
    bounce: { dur: 1.6, f: (p, a, t) => { p.bob = -Math.abs(osc(t, 7)) * 6; p.aLs = 25; p.aRs = -25; p.aLe = -20; p.aRe = 20; } },
    party: { dur: 3.4, f: (p, a, t) => {
      if (S.party === "dance") return ACTIONS.dance.f(p, a, t);
      if (S.party === "spin" && a < .9 && !rm) { p.spin = Math.cos(a / .9 * Math.PI * 2); p.aLs = 80; p.aRs = -80; return; }
      const ph = rm ? .5 : (a % .72) / .72, air = rm ? 0 : Math.sin(ph * Math.PI);
      p.hop = -air * 34; p.squash = 1 - (ph < .12 || ph > .9 ? .1 : 0);
      p.lLk = 35 * air; p.lRk = -35 * air; p.lLh = -10 * air; p.lRh = 10 * air;
      p.aLs = 160; p.aLe = 10; p.aRs = -160; p.aRe = -10;
    } },
    dance: { dur: 3.2, f: (p, a, t) => {
      const s = osc(t, 7), c = osc(t + .8, 7);
      p.bob = -Math.abs(s) * 6; p.lean = s * 7; p.head = c * 8;
      p.aLs = 125 + s * 30; p.aLe = -70; p.aRs = -125 + c * 30; p.aRe = 70;
      p.lLh = Math.max(0, s) * -16; p.lLk = Math.max(0, s) * 26; p.lRh = Math.max(0, -s) * 16; p.lRk = Math.max(0, -s) * -26;
    } },
    hips: { dur: 3, f: (p) => { p.aLs = 35; p.aLe = -61; p.aRs = -35; p.aRe = 61; p.lean = -2; p.head = -5; } },
    think: { dur: 999, f: (p, a, t) => { p.aRs = 67; p.aRe = 135; p.aLs = 10; p.aLe = -60; p.head = 8; p.lRk = -Math.max(0, osc(t, 6)) * 20; } },
    idea: { dur: 2.2, f: (p) => { p.aRs = -168; p.aRe = 4; p.head = -4; p.bob = -3; } },
    heart: { dur: 4, f: (p, a, t) => { p.aLs = 8; p.aLe = -137; p.aRs = -8; p.aRe = 137; p.head = -10; p.lean = 4 + osc(t, 1.5) * 3; } },
    thumbs: { dur: 2.6, f: (p, a, t) => { p.aRs = -25; p.aRe = -110 + Math.max(0, osc(t, 6)) * -10; p.head = osc(t, 5) * 6; p.thumbs = true; } },
    curious: { dur: 3, f: (p) => { p.lean = 8; p.head = 14; p.aLs = 35; p.aLe = -61; p.aRs = -10; p.aRe = 20; } },
    surprised: { dur: 1.6, f: (p, a) => { const k = Math.max(0, 1 - a * 2); p.hop = -k * 14; p.aLs = 70; p.aLe = 40; p.aRs = -70; p.aRe = -40; p.lean = -6; } },
    listen: { dur: 999, f: (p, a, t) => { p.aRs = -150; p.aRe = -40; p.head = 10 + osc(t, 2) * 3; p.lean = 3; } },
    wiggle: { dur: 2.6, f: (p, a, t) => { const s = osc(t, 9); p.lean = s * 10; p.head = -s * 8; p.aLs = 60 + s * 40; p.aLe = -40; p.aRs = -60 + s * 40; p.aRe = 40; p.bob = -Math.abs(s) * 3; } },
    shrug: { dur: 2.4, f: (p, a, t) => { p.aLs = 45; p.aLe = 60; p.aRs = -45; p.aRe = -60; p.head = 9; p.bob = -Math.max(0, osc(t, 5)) * 2; } },
    stretch: { dur: 3.2, f: (p, a) => { const k = Math.min(1, a / 1.2) * (a < 2.4 ? 1 : Math.max(0, 1 - (a - 2.4) / .8)); p.aLs = 165 * k; p.aRs = -165 * k; p.aLe = 10; p.aRe = -10; p.bob = -3 * k; p.squash = 1 + .03 * k; } },
    walk: { dur: 999, f: (p, a, t) => { const s = osc(t, 9); p.lLh = s * 16; p.lRh = -s * 16; p.lLk = Math.max(0, -s) * 18; p.lRk = Math.max(0, s) * -18; p.aLs = -s * 18; p.aRs = -s * 18; p.bob = -Math.abs(s) * 2.5; p.lean = 3 * S.dir; } },
  };

  /* ---------- Effects ---------- */
  const parts = [];
  const COLORS = ["#F2B33D", "#E04B3C", "#2BA3A0", "#3E6DB5", "#F49AC2", "#6FD39A"];
  function headPos() { return [S.x + P.head * .6 * S.dir, GROUND + P.bob + P.hop - 170 * P.squash]; }
  function spawn(kind, n) {
    if (rm) return;
    const [hx, hy] = headPos();
    for (let i = 0; i < n; i++) {
      let el;
      if (kind === "confetti") { el = document.createElementNS(NS, "rect"); el.setAttribute("width", 5); el.setAttribute("height", 8); el.setAttribute("fill", COLORS[i % COLORS.length]); }
      else if (kind === "bulb") { el = document.createElementNS(NS, "g"); el.innerHTML = `<circle r="11" fill="#FFE27A" stroke="#F2B33D" stroke-width="2"/><rect x="-5" y="9" width="10" height="7" rx="2" fill="#B9C4CF"/><path d="M-4,1 l3,-4 2,4 3,-4" stroke="#F2B33D" stroke-width="1.6" fill="none"/><g stroke="#F2B33D" stroke-width="2" stroke-linecap="round"><path d="M0,-17 v-6 M14,-11 l4,-4 M-14,-11 l-4,-4 M17,2 h6 M-17,2 h-6"/></g>`; }
      else { el = document.createElementNS(NS, "text"); el.setAttribute("font-family", "Fredoka, system-ui, sans-serif"); el.setAttribute("font-weight", "700"); el.setAttribute("text-anchor", "middle");
        const g = { heart: ["♥", "#E5566B", 22], note: [i % 2 ? "♫" : "♪", "#3E6DB5", 22], q: ["?", "#3E6DB5", 26], bang: ["!", "#E04B3C", 28], zzz: ["z", "#7D8FA6", 18], spark: ["✦", "#F2B33D", 18] }[kind];
        el.textContent = g[0]; el.setAttribute("fill", g[1]); el.setAttribute("font-size", g[2]); }
      E.fx.append(el);
      const spread = kind === "confetti" ? 1 : .35;
      parts.push({ el, kind, x: hx + (Math.random() - .5) * 40 * spread + (kind === "bulb" ? 0 : (kind === "q" || kind === "bang" ? 34 : 0)),
        y: hy - (kind === "bulb" ? 58 : 30) - Math.random() * 10,
        vx: kind === "confetti" ? (Math.random() - .5) * 220 : (Math.random() - .5) * 30,
        vy: kind === "confetti" ? -160 - Math.random() * 120 : (kind === "bulb" ? 0 : -30 - Math.random() * 20),
        rot: Math.random() * 360, vr: (Math.random() - .5) * 600, life: 0, max: kind === "confetti" ? 2.2 : kind === "bulb" ? 1.8 : 2, delay: kind === "zzz" || kind === "note" ? i * .45 : 0 });
    }
  }
  window.piperFx = spawn;
  function stepFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      if (q.delay > 0) { q.delay -= dt; q.el.setAttribute("opacity", 0); continue; }
      q.life += dt;
      if (q.kind === "confetti") { q.vy += 420 * dt; q.vx *= .99; q.rot += q.vr * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const k = q.life / q.max, op = k < .15 ? k / .15 : Math.max(0, 1 - (k - .6) / .4);
      const sc = q.kind === "bulb" ? Math.min(1, q.life * 5) : 1;
      q.el.setAttribute("transform", `translate(${q.x.toFixed(1)},${q.y.toFixed(1)}) rotate(${q.kind === "confetti" ? q.rot.toFixed(0) : 0}) scale(${sc.toFixed(2)})`);
      q.el.setAttribute("opacity", op.toFixed(2));
      if (q.life >= q.max || q.y > 260) { q.el.remove(); parts.splice(i, 1); }
    }
  }
  const MOOD_FX = { celebrate: ["confetti", 26], proud: ["spark", 3], idea: ["bulb", 1], empathy: ["heart", 3], curious: ["q", 1],
    surprised: ["bang", 1], silly: ["note", 3], sleepy: ["zzz", 3], encourage: ["spark", 2], hello: ["spark", 2] };

  /* ---------- Public: moods and talking ---------- */
  let moodToken = 0;
  window.setMood = function (m, revertAfter) {
    if (!LINES[m]) m = "calm";
    const tok = ++moodToken, t = now();
    stage.dataset.mood = m; S.face = m;
    const line = document.getElementById("moodLine"); if (line) line.textContent = LINES[m];
    if (m === "celebrate") { S.party = ["jump", "dance", "spin"][Math.floor(Math.random() * 3)]; S.lastWin = t; }
    if (m === "empathy" || m === "oops") S.lastUpset = t;
    act(MOOD_ACTION[m] || "idle");
    if (m === "empathy") S.tx = Math.min(Math.max(vbW * .5, 60), vbW - 60);
    const fx = MOOD_FX[m]; if (fx) spawn(fx[0], fx[1]);
    S.nextIdle = t + 8 + Math.random() * 6;
    if (revertAfter) setTimeout(() => { if (tok === moodToken) window.setMood("calm"); }, revertAfter);
  };
  window.setTalking = function (on) { S.talking = !!on; if (!on) S.mouthOpen = 0; };

  /* ---------- Idle life ---------- */
  function idleBehavior(t) {
    if (rm || S.talking || S.action !== "idle" || S.face === "thinking" || S.face === "listening") return;
    if (t < S.nextIdle) return;
    S.nextIdle = t + 7 + Math.random() * 8;
    const gentle = t - S.lastUpset < 40, partyOk = t - S.lastWin < 120;
    const r = Math.random();
    if (r < .5) { S.tx = 70 + Math.random() * (vbW - 140); }
    else if (r < .65) { S.lookAround = t; }
    else if (r < .75 && !gentle) { act("wave"); }
    else if (r < .85 && !gentle && partyOk) { act("dance"); spawn("note", 3); }
    else if (r < .92 && !gentle) { act("wiggle"); }
    else if (t - S.lastBusy > 90) { window.setMood("sleepy", 3200); }
  }

  /* ---------- Frame loop ---------- */
  let last = now();
  function frame() {
    const t = now(), dt = Math.min(.05, t - last); last = t;
    const p = { bob: Math.sin(t * 2.1) * (rm ? 0 : 1), hop: 0, squash: 1, spin: 1, lean: osc(t, .8) * 1.5, head: osc(t, .9) * 3,
      aLs: 6 + osc(t, 1.3) * 3, aLe: -8, aRs: -6 - osc(t, 1.2) * 3, aRe: 8, lLh: 0, lLk: 0, lRh: 0, lRk: 0, thumbs: false };
    // Walking toward a target spot
    const dist = S.tx - S.x, walking = !rm && Math.abs(dist) > 3 && S.action !== "party" && S.action !== "surprised";
    if (walking) { S.dir = dist > 0 ? 1 : -1; S.x += Math.sign(dist) * Math.min(Math.abs(dist), 70 * dt); }
    let a = t - S.actStart, A = ACTIONS[S.action] || ACTIONS.idle;
    if (A.dur && a > A.dur) { act("idle"); A = ACTIONS.idle; a = 0; }
    if (walking && (S.action === "idle" || S.action === "heart")) ACTIONS.walk.f(p, a, t); else A.f(p, a, t);
    if (S.talking && (S.action === "idle" || S.action === "listen")) { p.aRs += -16 + osc(t, 2.3) * 12; p.aRe += -22 + osc(t, 3.1) * 16; p.aLs += 8 + osc(t, 1.9) * 7; p.head += osc(t, 2.7) * 3; }
    // Face
    const F = FACES[S.face] || FACES.calm;
    let lookX = F.look ? F.look[0] : 0, lookY = F.look ? F.look[1] : 0;
    if (!F.look && S.lookAround && t - S.lookAround < 2.4) { const k = t - S.lookAround; lookX = k < 1.1 ? -2.6 : 2.6; lookY = -.5; }
    else if (!F.look && S.pointer && t - S.pointer.t < 4) {
      const r = stage.getBoundingClientRect(), [hx, hy] = headPos();
      const px = (S.pointer.x - r.left) / r.width * vbW, py = (S.pointer.y - r.top) / r.height * 240;
      lookX = Math.max(-2.6, Math.min(2.6, (px - hx) / 60)) * S.dir; lookY = Math.max(-2.2, Math.min(2.6, (py - hy + 40) / 60));
    }
    if (t > S.nextBlink && !rm) { S.blinkUntil = t + .13; S.nextBlink = t + 2.2 + Math.random() * 3.8; }
    const blink = t < S.blinkUntil ? 1 : 0;
    const tgt = Object.assign(p, {
      lidL: Math.max(F.lid || 0, blink), lidR: Math.max(F.lid || 0, blink), wide: F.wide || 1,
      bdyL: (F.bdy || 0) + (F.bdyL || 0), bdyR: (F.bdy || 0) + (F.bdyR || 0), brL: F.brL || 0, brR: F.brR || 0, lookX, lookY, blush: F.blush || .3 });
    // Smooth toward targets
    const kLimb = 1 - Math.exp(-dt * 16), kFace = 1 - Math.exp(-dt * 12);
    KEYS.forEach(k => {
      const fast = k === "lidL" || k === "lidR" || k === "hop" || k === "spin";
      P[k] += (tgt[k] - P[k]) * (fast ? 1 : (k.startsWith("a") || k.startsWith("l") && k.length === 3 ? kLimb : kFace));
    });
    // Talking mouth flaps
    if (S.talking && !rm) { if (t > S.nextFlap) { S.flapTarget = Math.random() < .2 ? .1 : .35 + Math.random() * .65; S.nextFlap = t + .08 + Math.random() * .07; } }
    else S.flapTarget = 0;
    S.mouthOpen += (S.flapTarget - S.mouthOpen) * Math.min(1, dt * 22);
    render(F, tgt.thumbs);
    stepFx(dt);
    idleBehavior(t);
    requestAnimationFrame(frame);
  }
  const f1 = (n) => n.toFixed(1);
  function render(F, thumbs) {
    E.pp.setAttribute("transform", `translate(${f1(S.x)},${f1(GROUND + P.bob + P.hop)}) scale(${(S.dir * P.spin).toFixed(3)},${P.squash.toFixed(3)})`);
    E.shadow.setAttribute("transform", `translate(0,${f1(-P.bob - P.hop)}) scale(${(1 + P.hop / 80).toFixed(2)},1)`);
    E.legLw.setAttribute("transform", `translate(-10,-62) rotate(${f1(P.lLh)})`); E.shinL.setAttribute("transform", `translate(0,30) rotate(${f1(P.lLk)})`);
    E.legRw.setAttribute("transform", `translate(10,-62) rotate(${f1(P.lRh)})`); E.shinR.setAttribute("transform", `translate(0,30) rotate(${f1(P.lRk)})`);
    E.torso.setAttribute("transform", `translate(0,-62) rotate(${f1(P.lean)})`);
    E.armLw.setAttribute("transform", `translate(-19,-52) rotate(${f1(P.aLs)})`); E.foreL.setAttribute("transform", `translate(0,22) rotate(${f1(P.aLe)})`);
    E.armRw.setAttribute("transform", `translate(19,-52) rotate(${f1(P.aRs)})`); E.foreR.setAttribute("transform", `translate(0,22) rotate(${f1(P.aRe)})`);
    E.head.setAttribute("transform", `translate(0,-60) rotate(${f1(P.head)})`);
    E.eyeL.setAttribute("transform", `translate(-12,-42) scale(${P.wide.toFixed(3)})`); E.eyeR.setAttribute("transform", `translate(12,-42) scale(${P.wide.toFixed(3)})`);
    E.irisL.setAttribute("transform", `translate(${f1(P.lookX)},${f1(P.lookY)})`); E.irisR.setAttribute("transform", `translate(${f1(P.lookX)},${f1(P.lookY)})`);
    E.lidL.setAttribute("height", f1(19 * Math.min(1, P.lidL))); E.lidR.setAttribute("height", f1(19 * Math.min(1, P.lidR)));
    E.browL.setAttribute("transform", `translate(-12,${f1(-56 + P.bdyL)}) rotate(${f1(P.brL)})`); E.browR.setAttribute("transform", `translate(12,${f1(-56 + P.bdyR)}) rotate(${f1(P.brR)})`);
    E.blushL.setAttribute("opacity", P.blush.toFixed(2)); E.blushR.setAttribute("opacity", P.blush.toFixed(2));
    const eyes = F.eyes || "open";
    if (eyes !== curEyes) {
      curEyes = eyes;
      E.eyeOpenL.setAttribute("display", eyes === "arc" || eyes === "winkL" ? "none" : "inline"); E.eyeArcL.setAttribute("display", eyes === "arc" || eyes === "winkL" ? "inline" : "none");
      E.eyeOpenR.setAttribute("display", eyes === "arc" ? "none" : "inline"); E.eyeArcR.setAttribute("display", eyes === "arc" ? "inline" : "none");
    }
    const talk = S.mouthOpen > .08;
    if (F.mouth !== curMouth) { curMouth = F.mouth; E.mouth.innerHTML = MOUTHS[F.mouth] || MOUTHS.smile; }
    E.mouth.setAttribute("display", talk ? "none" : "inline"); E.talkMouth.setAttribute("display", talk ? "inline" : "none");
    if (talk) { E.talkE.setAttribute("ry", f1(1.4 + S.mouthOpen * 5.6)); E.talkE.setAttribute("rx", f1(4.8 + S.mouthOpen * 1.6)); E.talkT.setAttribute("cy", f1(.8 + S.mouthOpen * 3)); }
    E.sweat.setAttribute("display", F.sweat ? "inline" : "none");
    if (thumbs !== curThumbs) { curThumbs = thumbs; E.thumbR.setAttribute("display", thumbs ? "inline" : "none"); }
  }

  /* ---------- Interaction ---------- */
  document.addEventListener("pointermove", (e) => { S.pointer = { x: e.clientX, y: e.clientY, t: now() }; }, { passive: true });
  const tickle = () => {
    if (typeof window.piperIsBusy === "function" && window.piperIsBusy()) { const l = document.getElementById("moodLine"); if (l) l.textContent = "One sec, I'm thinking!"; return; }
    const pick = ["silly", "celebrate", "hello", "surprised"][Math.floor(Math.random() * 4)];
    window.setMood(pick, 3000);
    const l = document.getElementById("moodLine"); if (l) l.textContent = ["Hehe, that tickles!", "Wheee!", "Hi again!", "Oh! You found me!"][["silly", "celebrate", "hello", "surprised"].indexOf(pick)];
    if (window.sfx) window.sfx("pop");
  };
  E.pp.addEventListener("click", tickle);
  stage.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tickle(); } });
  window.piperBusy = (b) => { if (b) S.lastBusy = now(); };

  fit();
  S.x = S.tx = Math.min(vbW * .62, vbW - 80);
  window.addEventListener("resize", fit);
  try { new ResizeObserver(fit).observe(stage); } catch (e) {}
  act("wave"); S.face = "hello";
  requestAnimationFrame(frame);
})();
