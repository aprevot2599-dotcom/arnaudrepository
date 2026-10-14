// Cost-aware routing. Every request takes the cheapest route that can do the job:
//   local    - answered by O.T.T.E.R. itself, 0 tokens
//   quick    - short context, low effort, few tools
//   standard - sources, skills and tools
//   deep     - high effort, web research, more tool rounds
// A request that would merit "deep" runs as "standard" first unless the user asked for depth,
// and the answer offers the deeper route with its estimate. Estimates are rough (about 4
// characters per token, +/-25%) and say so; the local server reports exact usage afterwards.
import { parseCommand } from "./voicecmd.js";
import { matchCapabilities } from "./capabilities.js";

export const PRICES = { // USD per million tokens, from Anthropic's published table (cached 2026-10-06)
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

export const TIERS = {
  local: { label: "Local (no Claude)", effort: null, modelTier: null, rounds: 0, outMax: 0, historyTurns: 0, knowledge: 0 },
  quick: { label: "Quick", effort: "low", modelTier: "quick", rounds: 1, outTypical: 500, outMax: 2500, historyTurns: 4, knowledge: 2, tools: ["check_capability", "propose_action", "search_knowledge"] },
  standard: { label: "Standard", effort: "medium", modelTier: "default", rounds: 2, outTypical: 1800, outMax: 8000, historyTurns: 12, knowledge: 5, tools: null },
  deep: { label: "Deep", effort: "high", modelTier: "complex", rounds: 4, outTypical: 4500, outMax: 20000, historyTurns: 16, knowledge: 5, tools: null, web: true },
};

// Fixed overhead measured from the real system prompt and tool list (rounded up).
export const OVERHEAD = { system: 2900, toolsAll: 1400, toolsQuick: 800 }; // measured 2026-10-14: prompt ~2.7k, tools ~1.0k / 0.46k, plus API tool preamble

export const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

const DEEP_ASK = /\b(deep(er)?|thorough(ly)?|in[- ]depth|comprehensive|full (analysis|report|research)|research (this|it|the)|dig into|go deeper|everything you can find)\b/i;
const SOURCE_REF = /\b(S\d+|attached|this (email|thread|document|doc|budget|file)|the (email|thread|document|budget|attachment)s?|above)\b/i;
const SMALL_TALK = /^(hi|hello|hey|thanks|thank you|ok(ay)?|great|good (morning|afternoon)|got it|cool)[.!]*$/i;
const ABILITY_Q = /\b(can|could|are) you\b|\bable to\b|\bwhy can'?t you\b|\bwhat can'?t you\b/i;

export function costUsd(model, input, output) {
  const p = PRICES[model];
  if (!p) return null;
  return (input * p.in + output * p.out) / 1e6;
}

// ctx: {plan, sources: [{id,text}], history: [{content}], engineKind, webAllowed, capabilities, forceTier, model, quickModel}
export function chooseRoute(text, ctx = {}) {
  const reasons = [];
  const t = String(text || "").trim();
  if (parseCommand(t)) return finish("local", ["A voice or volume command O.T.T.E.R. handles itself."], ctx, t);
  if (SMALL_TALK.test(t)) return finish("local", ["Small talk; no need to spend tokens."], ctx, t);
  if (/^(run (the )?(morning|daily) check|verify yourself|self[- ]check|morning check)\b/i.test(t)) return finish("local", ["Runs the built-in verification, which uses no tokens."], ctx, t);
  const capHits = matchCapabilities(t, ctx.capabilities || []);
  if (capHits.length && ABILITY_Q.test(t) && t.length < 160 && capHits.every((c) => c.status !== "ready"))
    return finish("local", ["A question about something O.T.T.E.R. can't do yet; it explains that from its own status list."], ctx, t);
  if (ctx.engineKind === "offline") return finish("local", ["No Claude connection; built-in analyzers only."], ctx, t);

  let tier = "quick";
  const frames = ctx.plan?.frames || [];
  const intents = ctx.plan?.intents || [];
  const analysisSkills = (ctx.plan?.steps || []).filter((s) => s.mode === "analysis").length;
  const refersToSources = (ctx.sources || []).length > 0 && (SOURCE_REF.test(t) || frames.includes("email") || frames.includes("discrepancy"));
  if (refersToSources) { tier = "standard"; reasons.push("Uses the attached sources."); }
  if (frames.includes("decision") || intents.includes("new_program")) { tier = "standard"; reasons.push("A decision needs the full recommendation frame."); }
  if (analysisSkills) { tier = "standard"; reasons.push(`${analysisSkills} of your skills inform this.`); }
  if (t.length > 600) { tier = "standard"; reasons.push("Long request."); }
  const wantsDepth = DEEP_ASK.test(t);
  const meritsDeep = wantsDepth || intents.includes("research") || intents.includes("grant") || frames.includes("decision");
  if (wantsDepth) { tier = "deep"; reasons.push("You asked for depth."); }
  if (ctx.forceTier) { tier = ctx.forceTier; reasons.splice(0, reasons.length, `You chose the ${tier} route.`); }
  if (tier === "quick") reasons.push("Short question with no sources: cheapest route.");
  const route = finish(tier, reasons, ctx, t, refersToSources || tier !== "quick");
  // Lowest first: offer the next route up instead of spending on it unasked.
  if (tier !== "deep" && meritsDeep && !ctx.forceTier) route.upgrade = { tier: "deep", why: ctx.engineKind === "server" && ctx.webAllowed ? "High effort with web research and citations." : "High effort and more tool rounds.", estimate: finish("deep", [], ctx, t, true).estimate };
  else if (tier === "quick" && ((ctx.sources || []).length || (ctx.plan?.steps || []).length)) route.upgrade = { tier: "standard", why: "Include your attached sources and skills.", estimate: finish("standard", [], ctx, t, true).estimate };
  return route;
}

function finish(tier, reasons, ctx, text, includeSources = false) {
  const T = TIERS[tier];
  if (tier === "local") return { tier, label: T.label, reasons, include: {}, estimate: { input: 0, output: 0, total: 0, perRound: 0, rounds: 0, costUsd: 0, exact: true } };
  const history = (ctx.history || []).slice(-T.historyTurns);
  const sources = includeSources ? ctx.sources || [] : [];
  const perRound = OVERHEAD.system + (T.tools ? OVERHEAD.toolsQuick : OVERHEAD.toolsAll) + estimateTokens(text) + history.reduce((a, h) => a + estimateTokens(h.content), 0) + sources.reduce((a, s) => a + estimateTokens(s.text), 0) + T.knowledge * 120;
  // Each tool round resends the whole conversation, so input grows with rounds.
  const input = Math.round(perRound * T.rounds + (T.rounds - 1) * 600);
  const output = T.outTypical;
  const model = tier === "quick" && ctx.quickModel ? ctx.quickModel : ctx.model || "claude-opus-5-5";
  return {
    tier, label: T.label, reasons, model,
    effort: T.effort, modelTier: T.modelTier,
    include: { sources: includeSources, historyTurns: T.historyTurns, knowledge: T.knowledge, tools: T.tools, web: !!T.web && !!ctx.webAllowed },
    estimate: { input, output, outputMax: T.outMax, total: input + output, perRound, rounds: T.rounds, costUsd: ctx.engineKind === "server" ? costUsd(model, input, output) : null, exact: false },
  };
}

export function fmtTokens(n) {
  if (n == null) return "?";
  if (n < 1000) return String(n);
  return (n / 1000).toFixed(n < 10000 ? 1 : 0) + "k";
}

export function describeEstimate(route, engineKind) {
  if (route.tier === "local") return "0 tokens (answered locally)";
  const e = route.estimate;
  const money = e.costUsd != null ? `, about $${e.costUsd < 0.01 ? e.costUsd.toFixed(3) : e.costUsd.toFixed(2)}` : "";
  const where = engineKind === "artifact" ? " of your claude.ai plan usage" : "";
  return `about ${fmtTokens(e.total)} tokens${where} (${fmtTokens(e.input)} in, ~${fmtTokens(e.output)} out, up to ${fmtTokens(e.outputMax)} with thinking${money})`;
}
