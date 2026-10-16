// O.T.T.E.R. application shell: wires the security core, the conversation engine, local
// storage and the interface together. The approval panel in this file is the only place
// that calls gate.approve() and gate.execute(), and only from a click.
import { mountOtter, STATES } from "./otter.js";
import { renderMarkdown, esc } from "./markdown.js";
import { Store } from "./store.js";
import { PermissionRegistry, ApprovalGate, AuditLog, SYSTEMS, ACTION_TYPES, describeProposalStatus, skillStatus, newId } from "../core/security.js";
import { scanSensitive, redact, redactForLog, detectInjection } from "../core/privacy.js";
import { runTurn, artifactTransport, serverTransport, offlineTransport, offlineAnswer, directTransport } from "../core/agent.js";
import { Ledger, verifyChain, makeClosedFetch, ALLOWED_HOSTS } from "../core/ledger.js";
import { findGuide, guideMarkdown } from "../core/m365guides.js";
import { ScreenWatcher } from "./screen.js";
import { assessCapabilities, matchCapabilities, explain, STATUS_TEXT } from "../core/capabilities.js";
import { recordTurn, recordExecution, recommend, dueRecommendation, markShown, recommendationMarkdown } from "../core/advisor.js";
import { parseCommand, parseWake } from "../core/voicecmd.js";
import { seedProfile, extractLearnables } from "../core/learn.js";
import { chooseRoute, describeEstimate, fmtTokens, costUsd, TIERS } from "../core/router.js";
import { buildReport, reportMarkdown, needsCatchUp } from "../core/verify.js";
import { planRequest } from "../core/orchestrator.js";
import { Speaker, Listener, vendorOf } from "./voice.js";

// DOC is the document the interface lives in: the page, or the floating window when popped out.
let DOC = document;
const $ = (id) => DOC.getElementById(id);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// ---------- state ----------
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const store = new Store(storage).load();
const D = store.data;
const audit = new AuditLog(D.audit, { redact: redactForLog });
D.audit = audit.entries;
audit.listeners.add(() => store.save());
const permissions = new PermissionRegistry(D.permissions, { audit });
// Verifiable ledger: hash-chained record of every session event and everything sent out.
const ledger = new Ledger(D.ledger || (D.ledger = []), { onChange: () => store.save() });
audit.listeners.add((e) => { if (/^(action|permission|privacy|source|skill|knowledge)\./.test(e.event)) ledger.append("audit." + e.event, { id: e.id || "", type: e.type || "", system: e.system || "", status: e.status || "" }); });
const closedFetch = makeClosedFetch(ledger, { selfOrigin: location.origin.startsWith("http") ? location.origin : null });
// The API key lives in its own browser-storage slot: never in exports, never in the ledger.
const KEY_SLOT = "otter.apikey";
const readKey = () => { try { return localStorage.getItem(KEY_SLOT) || ""; } catch { return ""; } };
const writeKey = (k) => { try { k ? localStorage.setItem(KEY_SLOT, k) : localStorage.removeItem(KEY_SLOT); } catch {} };
const savePerms = () => { D.permissions = permissions.toJSON(); store.save(); };

const executors = {
  save_knowledge: async (run, p) => {
    D.knowledge.push({ id: newId("kb"), title: run.target, text: run.content, tags: p.origin === "learning" ? ["learned"] : [], provenance: p.origin === "learning" ? `You said it, and said yes to remembering it (${new Date().toLocaleDateString()})` : `Approved from "${convById(p.conversationId)?.title || "a conversation"}"`, createdAt: Date.now(), updatedAt: Date.now(), expiresAt: null });
    store.save();
    return { ok: true, message: "Saved to the O.T.T.E.R. knowledge base on this device." };
  },
  create_task: async (run) => {
    D.tasks.push({ id: newId("task"), title: run.target, detail: run.content, done: false, createdAt: Date.now() });
    store.save();
    return { ok: true, message: "Added to your task list." };
  },
};
let lastSystemVolume = null;
executors.set_system_volume = async (run) => {
  const level = parseInt((run.content.match(/(\d{1,3})%/) || [])[1], 10);
  if (!engine.token) return { ok: false, message: "Not run: computer volume can only be changed through the local server on your computer." };
  const r = await fetch("/api/system/volume", { method: "POST", headers: { "content-type": "application/json", "x-otter-token": engine.token }, body: JSON.stringify({ level }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, message: j.error || "The volume change failed." };
  lastSystemVolume = j.level;
  renderVoicePop();
  // A later volume change makes the launch prompt moot; cancelling it can never cause an action.
  setTimeout(() => {
    for (const q of gate.list()) if (q.type === "set_system_volume" && q.origin === "launch" && q.status === "pending") gate.reject(q.id, { reason: "superseded by a later volume change" });
    launchChecks({ volume: false });
  }, 0);
  return { ok: true, message: `Computer volume set to ${j.level}%.` };
};
const gate = new ApprovalGate({ permissions, audit, executors, proposals: D.proposals });
gate.listeners.add(() => { D.proposals = gate.list(); store.save(); renderCounts(); renderDashboard(); refreshProposalCards(); if (currentView === "tasks") renderTasks(); });

let registry = [];
let engine = { kind: "offline", transport: offlineTransport, label: "Connecting…", detail: "" };
let current = null;
let busy = null; // AbortController while a turn runs
let currentView = "chat";
const otter = mountOtter($("otter"));

// ---------- helpers ----------
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch {
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C or Cmd+C to copy."); }
    else toast("Copy is blocked here. Select the text and copy it yourself.");
  }
}
const convById = (id) => D.conversations.find((c) => c.id === id);
const service = () => engine.transport.service;

function openModal(node, { onClose } = {}) {
  const root = $("modalRoot"), m = $("modal");
  m.replaceChildren(node);
  root.hidden = false;
  const doc = DOC;
  const close = () => { root.hidden = true; m.replaceChildren(); doc.removeEventListener("keydown", esc_); onClose?.(); };
  const esc_ = (e) => { if (e.key === "Escape") close(); };
  doc.addEventListener("keydown", esc_);
  root.querySelector(".modal-scrim").onclick = close;
  (m.querySelector("[data-autofocus]") || m.querySelector("input,textarea,select,button"))?.focus();
  return close;
}
function confirmBox(title, body, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    const n = h(`<div><h2 id="modalTitle">${esc(title)}</h2><p>${esc(body)}</p><div class="actions"><button type="button" class="btn" data-no data-autofocus>Keep it</button><button type="button" class="btn ${danger ? "btn-bad" : "btn-primary"}" data-yes>${esc(okLabel)}</button></div></div>`);
    let done = false;
    const close = openModal(n, { onClose: () => !done && resolve(false) });
    n.querySelector("[data-no]").onclick = () => { done = true; close(); resolve(false); };
    n.querySelector("[data-yes]").onclick = () => { done = true; close(); resolve(true); };
  });
}
function promptBox(title, label, value = "") {
  return new Promise((resolve) => {
    const n = h(`<form><h2 id="modalTitle">${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input id="promptVal" type="text" value="${esc(value)}" data-autofocus></label><div class="actions"><button type="button" class="btn" data-no>Cancel</button><button class="btn btn-primary">Save</button></div></form>`);
    let done = false;
    const close = openModal(n, { onClose: () => !done && resolve(null) });
    n.querySelector("[data-no]").onclick = () => { done = true; close(); resolve(null); };
    n.onsubmit = (e) => { e.preventDefault(); done = true; const v = n.querySelector("#promptVal").value.trim(); close(); resolve(v); };
  });
}

// ---------- avatar & activity ----------
const GENERIC_LINES = ["Checking the evidence…", "Sorting through the details…", "Looking for the missing piece…", "Following the paper trail…", "Reviewing the executive implications…", "No guessing. Checking.", "This may require a bigger calculator."];
const TOOL_LINES = {
  search_knowledge: "Checking the knowledge base…",
  analyze_email: "Reading the thread you attached…",
  find_discrepancies: "These numbers deserve another look.",
  get_skill: "Consulting your skill registry…",
  record_finding: "Writing it down, with the evidence…",
  propose_action: "Preparing something for your approval…",
  web_search: "Searching public sources…",
};
let lineTimer = null, idleTimer = null;
function setActivity(state, tool) {
  clearTimeout(idleTimer);
  const caption = otter.set(state);
  $("otterCaption").textContent = caption;
  if (busy) {
    $("thinkingText").textContent = TOOL_LINES[tool] || $("thinkingText").textContent;
    clearInterval(lineTimer);
    lineTimer = setInterval(() => { $("thinkingText").textContent = GENERIC_LINES[Math.floor(Math.random() * GENERIC_LINES.length)]; }, 4200);
  }
  if (state === "done") idleTimer = setTimeout(() => setActivity("idle"), 2800);
}

// ---------- engine ----------
async function detectEngine() {
  const token = document.querySelector('meta[name="otter-token"]')?.content;
  if (token) {
    try {
      const r = await fetch("/api/capabilities", { headers: { "x-otter-token": token } });
      if (r.ok) {
        const cap = await r.json();
        if (cap.apiKey) return { kind: "server", transport: serverTransport({ token }), label: `Claude API · ${cap.model}`, detail: "Local server on this computer with your API key. Web research available when you allow it.", cap, token };
        return { kind: "offline", transport: offlineTransport, label: "Built-in analyzers only", detail: "The local server is running without an ANTHROPIC_API_KEY. Set one and restart to enable Claude.", cap, token };
      }
    } catch {}
  }
  if (window.claude?.use) {
    const sample = await window.claude.use("sample").catch(() => null);
    if (sample) return { kind: "artifact", transport: artifactTransport(sample), label: "Claude via claude.ai", detail: "Uses your claude.ai account inside this private artifact. No web access in this mode." };
  }
  if (window.top === window) {
    const apiKey = readKey();
    if (apiKey) return { kind: "direct", transport: directTransport({ apiKey, closedFetch }), label: "Claude API · direct", detail: "This page talks only to api.anthropic.com with your key, stored in this browser. Nothing is installed.", cap: { model: "claude-opus-5-5" } };
    return { kind: "offline", needsKey: true, transport: offlineTransport, label: "Add your API key", detail: "Paste an Anthropic API key in Settings to connect Claude. Built-in guides and checkers work without it." };
  }
  return { kind: "offline", transport: offlineTransport, label: "Built-in analyzers only", detail: "No Claude connection found. Open the claude.ai link or run the local server with an API key." };
}

function serviceApproved() {
  const s = service();
  return !s || (D.settings.approvedServices.includes(s) && permissions.check(s, "read"));
}
function approveService() {
  const s = service();
  if (!s) return;
  if (!D.settings.approvedServices.includes(s)) D.settings.approvedServices.push(s);
  permissions.grant(s, "read", { purpose: "Non-protected BMCC work content, confirmed by Dr. Prevot" });
  savePerms();
  renderEngine();
}
function revokeService(s) {
  D.settings.approvedServices = D.settings.approvedServices.filter((x) => x !== s);
  permissions.revoke(s);
  savePerms();
  renderEngine();
}

function renderEngine() {
  const pill = $("enginePill");
  pill.textContent = engine.label + (engine.kind !== "offline" && !serviceApproved() ? " · not approved yet" : "");
  pill.classList.toggle("off", engine.kind === "offline" || !serviceApproved());
  pill.title = engine.detail;
  const pp = $("privacyPill");
  pp.hidden = false;
  pp.textContent = (closedMode() ? "Closed · " : "Closed except speech · ") + (store.available ? "stored on this device only" : "storage unavailable: nothing is saved");
}

// ---------- conversations ----------
function newConversation() {
  current = { id: newId("c"), title: "O.T.T.E.R.", createdAt: Date.now(), updatedAt: Date.now(), messages: [], sourceIds: [], pinned: false, projectId: null };
  renderConversation();
  renderHistory();
  showView("chat");
  $("input").focus();
}
function ensureSaved() {
  if (!D.conversations.includes(current)) D.conversations.unshift(current);
}
function autoTitle(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= 56) return t;
  const cut = t.slice(0, 56);
  return cut.slice(0, cut.lastIndexOf(" ") > 30 ? cut.lastIndexOf(" ") : 56) + "…";
}
function openConversation(id) {
  const c = convById(id);
  if (!c) return;
  current = c;
  renderConversation();
  renderHistory();
  showView("chat");
  closeSideOnNarrow();
}

// ---------- history (incremental rendering for long lists) ----------
const PAGE = 80;
let historyLimit = PAGE;
function historyItems() {
  const q = $("searchChats").value.trim().toLowerCase();
  let list = D.conversations;
  if (q) list = list.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => (m.content || "").toLowerCase().includes(q)));
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}
function dateGroup(ts) {
  const d = new Date(ts), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff < 1) return "Today";
  if (diff < 2) return "Yesterday";
  if (diff < 7) return "Previous 7 days";
  if (diff < 30) return "Previous 30 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function renderHistory() {
  const el = $("history");
  const items = historyItems();
  const pinned = items.filter((c) => c.pinned);
  const rest = items.filter((c) => !c.pinned).slice(0, historyLimit);
  const byProject = $("groupBy").value === "project";
  const frag = document.createDocumentFragment();
  const item = (c) => {
    const b = h(`<button class="hist-item${current && c.id === current.id ? " active" : ""}" role="listitem" title="${esc(c.title)}">${c.pinned ? '<span class="pin" aria-label="Pinned">&#9733;</span>' : ""}<span class="t">${esc(c.title)}</span></button>`);
    b.onclick = () => openConversation(c.id);
    return b;
  };
  if (pinned.length) { frag.append(h(`<div class="hist-group">Pinned</div>`)); pinned.forEach((c) => frag.append(item(c))); }
  let last = null;
  for (const c of rest) {
    const g = byProject ? (D.projects.find((p) => p.id === c.projectId)?.name || "No project") : dateGroup(c.updatedAt);
    if (g !== last) { frag.append(h(`<div class="hist-group">${esc(g)}</div>`)); last = g; }
    frag.append(item(c));
  }
  if (!items.length) frag.append(h(`<div class="dempty" style="padding:8px">${$("searchChats").value ? "No chats match." : "Conversations you start appear here."}</div>`));
  const more = items.filter((c) => !c.pinned).length > historyLimit;
  if (more) {
    const s = h(`<div class="hist-more"></div>`);
    frag.append(s);
    new IntersectionObserver((entries, obs) => { if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); historyLimit += PAGE; renderHistory(); } }, { root: el }).observe(s);
  }
  el.replaceChildren(frag);
}

// ---------- messages ----------
function renderConversation() {
  $("convTitle").textContent = current.title;
  $("stage").classList.toggle("compact", current.messages.length > 0);
  const box = $("messages");
  box.replaceChildren();
  if (!current.messages.length) box.append(emptyState());
  for (const m of current.messages) box.append(messageNode(m));
  renderSourceTray();
  box.scrollTop = current.messages.length ? box.scrollHeight : 0;
}

function emptyState() {
  const tiles = [
    { cls: "t-talk", title: "Just talk", sub: "Tell me what's on your mind", act: () => startConversation() },
    { cls: "t-plate", title: "What's on my plate?", sub: "I'll sort it by what matters", act: () => send("Here's what's on my plate. Help me sort it by what matters most and tell me what to drop. I'll list it next.") },
    { cls: "t-email", title: "Make sense of an email", sub: "Paste a thread, I'll find deadlines and asks", act: () => openSourceModal({ kind: "email" }) },
    { cls: "t-numbers", title: "Check some numbers", sub: "Budgets, enrollments, totals that don't add up", act: () => openSourceModal({ kind: "document" }) },
    { cls: "t-decide", title: "Help me decide", sub: "Options, costs, risks, a clear recommendation", act: () => { $("input").value = "Help me decide: "; autosize(); $("input").focus(); } },
    { cls: "t-can", title: "What can you do?", sub: "And what you can't, and why", act: () => showView("abilities") },
  ];
  const used = D.usage.tiles || {};
  tiles.sort((a, b) => (used[b.cls] || 0) - (used[a.cls] || 0));
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const n = h(`<div class="empty-chat"><h2>${hello}, Arnaud.</h2><p class="lead">What should we tackle?</p><div class="tile-grid"></div></div>`);
  const g = n.querySelector(".tile-grid");
  for (const t of tiles) {
    const b = h(`<button type="button" class="tile ${t.cls}"><b>${esc(t.title)}</b><span>${esc(t.sub)}</span></button>`);
    b.onclick = () => { (D.usage.tiles ||= {})[t.cls] = ((D.usage.tiles || {})[t.cls] || 0) + 1; store.save(); t.act(); };
    g.append(b);
  }
  return n;
}

function planNode(plan, skillsUsed = []) {
  if (!plan?.steps?.length) return null;
  const counts = plan.steps.reduce((a, s) => ((a[s.mode] = (a[s.mode] || 0) + 1), a), {});
  const sum = Object.entries(counts).map(([k, v]) => `${v} ${k === "analysis" ? "in-app" : k}`).join(", ");
  const n = h(`<details class="plan"><summary>Skill plan: ${plan.steps.length} skill${plan.steps.length > 1 ? "s" : ""} (${esc(sum)})${skillsUsed.length ? " · consulted: " + esc(skillsUsed.join(", ")) : ""}</summary><ul></ul></details>`);
  for (const s of plan.steps) n.querySelector("ul").append(h(`<li><span class="mode mode-${s.mode}">${s.mode === "analysis" ? "in-app" : s.mode}</span> <span class="skill-name">${esc(s.name)}</span>: ${esc(s.role)}${s.mode !== "analysis" ? ` <span class="hint">${esc(s.reason)}</span>` : ""}</li>`));
  return n;
}

function proposalCard(id) {
  const p = gate.get(id);
  if (!p) return h(`<div class="proposal"><span class="hint">Proposal no longer stored.</span></div>`);
  const st = describeProposalStatus(p);
  const n = h(`<div class="proposal" data-proposal="${p.id}"><div class="p-head"><span class="p-title">${esc(p.label)}</span><span class="status status-${p.status}">${esc(st.label)}</span></div><div class="p-target">Target: ${esc(p.target)}</div><div><button type="button" class="btn">${p.status === "pending" ? "Review and decide" : "View details"}</button></div></div>`);
  n.querySelector("button").onclick = () => openApproval(p.id);
  return n;
}
function refreshProposalCards() {
  DOC.querySelectorAll("[data-proposal]").forEach((el) => el.replaceWith(proposalCard(el.dataset.proposal)));
}

function messageNode(m) {
  const isUser = m.role === "user";
  const n = h(`<article class="msg msg-${m.role}" data-msg="${m.id}"><div class="msg-meta"><span class="who">${isUser ? "You" : "O.T.T.E.R."}</span><span>${fmtTime(m.ts)}</span></div></article>`);

  if (m.notice) n.append(h(`<div class="notice ${m.notice.kind || ""}">${esc(m.notice.text)}</div>`));
  const bubble = h(`<div class="bubble"></div>`);
  if (isUser) bubble.textContent = m.content;
  else bubble.innerHTML = renderMarkdown(m.content || "");
  if (m.content || isUser) n.append(bubble);
  if (!isUser) wireChecklist(bubble, m);
  if (m.snapshotId || m.pointers?.length) n.append(snapshotNode(m));
  if (!isUser && (m.content || "").length > 2600) {
    bubble.classList.add("collapsed");
  }
  for (const id of m.proposalIds || []) n.append(proposalCard(id));
  if (m.citations?.length) {
    const c = h(`<div class="cites"><b>Sources</b><ol></ol></div>`);
    for (const s of m.citations) c.querySelector("ol").append(h(`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>${s.pageAge ? ` <span class="hint">(${esc(s.pageAge)})</span>` : ' <span class="hint">(date not given)</span>'}</li>`));
    n.append(c);
  }
  if (!isUser && (m.route || m.local)) {
    const foot = h(`<details class="msg-foot"><summary></summary></details>`);
    foot.querySelector("summary").append(usageLine(m));
    const p = planNode(m.plan, m.skillsUsed);
    if (p) { p.open = true; foot.append(p); } else foot.append(h(`<div class="hint">No skills were needed for this one.</div>`));
    n.append(foot);
  }
  if (!isUser && m.content) {
    const tools = h(`<div class="msg-tools"><button type="button" data-copy>Copy</button>${m.route?.upgrade && m.question ? `<button type="button" data-deeper>Go deeper: ${esc(TIERS[m.route.upgrade.tier].label.toLowerCase())} route, about ${fmtTokens(m.route.upgrade.estimate.total)} tokens</button>` : ""}${bubble.classList.contains("collapsed") ? '<button type="button" data-expand>Show all</button>' : ""}</div>`);
    tools.querySelector("[data-copy]").onclick = () => copyText(m.content, bubble);
    const deeper = tools.querySelector("[data-deeper]");
    if (deeper) deeper.onclick = () => send(m.question, { forceTier: m.route.upgrade.tier });
    const ex = tools.querySelector("[data-expand]");
    if (ex) ex.onclick = () => { const c = bubble.classList.toggle("collapsed"); ex.textContent = c ? "Show all" : "Collapse"; };
    n.append(tools);
  }
  return n;
}

// ---------- sources ----------
function renderSourceTray() {
  const tray = $("sourceTray");
  tray.replaceChildren();
  for (const id of current.sourceIds) {
    const s = D.sources[id];
    if (!s) continue;
    const c = h(`<span class="chip" title="${esc(s.kind)} added ${fmtDate(s.addedAt)}"><span class="k">${esc(s.id)}</span><span class="t">${esc(s.title)}</span><button type="button" aria-label="Remove ${esc(s.title)}">&times;</button></span>`);
    c.querySelector("button").onclick = () => { current.sourceIds = current.sourceIds.filter((x) => x !== id); delete D.sources[id]; store.save(); renderSourceTray(); };
    tray.append(c);
  }
}

function openSourceModal(prefill = {}) {
  const n = h(`<form class="approval">
    <h2 id="modalTitle">Add an authorized source</h2>
    <p class="hint">Paste or upload an email thread or document you are allowed to analyze. O.T.T.E.R. does not read your mailbox or any system directly; it only sees what you add here. Content stays on this device until you send a message, and the privacy guard checks it first.</p>
    <div class="grid-2">
      <label class="field"><span>Type</span><select id="srcKind"><option value="email">Email thread</option><option value="document">Document or spreadsheet text</option><option value="web">Web page text</option><option value="notes">Notes</option></select></label>
      <label class="field"><span>Title</span><input id="srcTitle" type="text" placeholder="e.g. Welding cohort budget thread"></label>
    </div>
    <label class="field"><span>Content</span><textarea id="srcText" placeholder="Paste here, including From:, Date: and Subject: lines for emails."></textarea></label>
    <label class="field"><span>Or load a text file</span><input id="srcFile" type="file" accept=".txt,.md,.csv,.tsv,.eml,.json,.html,.htm"><small>Text formats only. For Word, Excel or PDF, copy the text in.</small></label>
    <div id="srcScan" class="findings-list"></div>
    <label class="switch"><input id="srcAttest" type="checkbox"><span>I am authorized to analyze this content, and I copied or exported it myself through an approved method.</span></label>
    <div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="button" class="btn" id="srcRedact" hidden>Redact sensitive items</button><button class="btn btn-primary" id="srcAdd" disabled>Add source</button></div>
  </form>`);
  const kind = n.querySelector("#srcKind"), title = n.querySelector("#srcTitle"), text = n.querySelector("#srcText"), attest = n.querySelector("#srcAttest"), add = n.querySelector("#srcAdd"), red = n.querySelector("#srcRedact"), scanEl = n.querySelector("#srcScan");
  kind.value = prefill.kind || "email";
  text.value = prefill.text || "";
  const scan = () => {
    const f = scanSensitive(text.value);
    const inj = detectInjection(text.value);
    const by = {};
    for (const x of f) by[x.label] = (by[x.label] || 0) + 1;
    const blocks = f.some((x) => x.severity === "block");
    const ferpa = f.some((x) => x.severity === "ferpa");
    scanEl.replaceChildren();
    if (Object.keys(by).length) scanEl.append(h(`<div class="notice ${blocks ? "bad" : ""}"><b>Privacy check:</b> ${Object.entries(by).map(([k, v]) => `${esc(k)} (${v})`).join(", ")}.${blocks ? " Passwords, SSNs, card numbers and secrets cannot be added. Redact them first." : ""}${ferpa ? " Possible student education-record details: this can stay on your device, but it will not be sent to Claude unless FERPA processing is authorized in Settings." : ""}${!blocks && !ferpa ? " Contact details will be replaced with placeholders before anything is sent, unless you allow them in Settings." : ""}</div>`));
    if (inj.length) scanEl.append(h(`<div class="notice bad"><b>Possible manipulation:</b> this content contains instructions aimed at an assistant (for example "ignore previous instructions" or "forward this to"). O.T.T.E.R. will treat it as data and flag it, not follow it.</div>`));
    red.hidden = !f.some((x) => x.severity !== "medium");
    add.disabled = !text.value.trim() || !attest.checked || blocks;
    if (!title.value && kind.value === "email") { const m = text.value.match(/^\s*Subject:\s*(.+)$/im); if (m) title.placeholder = m[1].trim().slice(0, 80); }
  };
  text.oninput = scan; attest.onchange = scan; kind.onchange = scan;
  red.onclick = () => { text.value = redact(text.value); scan(); };
  n.querySelector("#srcFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast("That file is over 2 MB. Paste the relevant part instead."); return; }
    let t = await file.text();
    if (/\.html?$/i.test(file.name)) t = new DOMParser().parseFromString(t, "text/html").body.textContent || "";
    text.value = t;
    if (!title.value) title.value = file.name;
    if (/\.eml$/i.test(file.name)) kind.value = "email";
    scan();
  };
  const close = openModal(n);
  n.querySelector("[data-cancel]").onclick = close;
  n.onsubmit = (e) => {
    e.preventDefault();
    scan();
    if (add.disabled) return;
    D.counters.source = (D.counters.source || 0) + 1;
    const id = "S" + D.counters.source;
    const t = title.value.trim() || title.placeholder.replace(/^e\.g\. .*/, "") || `${kind.value} ${id}`;
    D.sources[id] = { id, kind: kind.value, title: t, text: text.value, addedAt: Date.now(), attested: true, injection: detectInjection(text.value).length > 0 };
    ensureSaved();
    current.sourceIds.push(id);
    current.updatedAt = Date.now();
    audit.record("source.added", { id, kind: kind.value });
    store.save();
    close();
    renderSourceTray();
    renderHistory();
    if (!current.messages.length) renderConversation();
    toast(`Added ${id}. Ask about it in your message.`);
  };
  scan();
}

// ---------- sending ----------
function autosize() {
  const el = $("input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
  if (!el.value) $("routeHint").textContent = "";
}

async function send(text, { forceTier = null, confirmed = false } = {}) {
  text = text.trim();
  if (!text || busy) return;
  speaker.stop();
  const cmd = parseCommand(text);
  if (cmd) { $("input").value = ""; autosize(); return handleCommand(cmd, text); }
  // While O.T.T.E.R. is looking, a question takes a fresh snapshot along (and only then).
  let turnSnapshot = null;
  if (watcher.active && engine.kind !== "offline" && engine.kind !== "artifact") turnSnapshot = await watcher.capture();
  const route = routeFor(text, forceTier, turnSnapshot ? 1 : 0);
  if (route.tier === "local") { $("input").value = ""; autosize(); const r = answerLocally(text, route); offerLearning(text); return r; }
  if (!confirmed && D.settings.askAboveTokens && route.estimate.total > D.settings.askAboveTokens) return preflight(text, route);
  if (engine.kind !== "offline" && !serviceApproved()) { askServiceApproval(() => send(text)); return; }
  ensureSaved();
  if (!current.messages.length) current.title = autoTitle(text);
  const userMsg = { id: newId("m"), role: "user", content: text, ts: Date.now() };
  current.messages.push(userMsg);
  current.updatedAt = Date.now();
  $("input").value = "";
  autosize();
  if (current.messages.length === 1) $("messages").replaceChildren();
  $("stage").classList.add("compact");
  $("messages").append(messageNode(userMsg));
  $("convTitle").textContent = current.title;
  renderHistory();

  const reply = { id: newId("m"), role: "assistant", content: "", ts: Date.now(), proposalIds: [] };
  const live = h(`<article class="msg msg-assistant"><div class="msg-meta"><span class="who">O.T.T.E.R.</span><span>${fmtTime(reply.ts)}</span></div><div class="bubble"></div></article>`);
  $("messages").append(live);
  const scroll = () => { const b = $("messages"); if (b.scrollHeight - b.scrollTop - b.clientHeight < 160) b.scrollTop = b.scrollHeight; };
  scroll();

  busy = new AbortController();
  $("thinkingLine").hidden = false;
  $("sendBtn").disabled = true;
  $("thinkingText").textContent = GENERIC_LINES[0];
  setActivity("thinking");

  let foundDiscrepancy = false, foundOpportunity = false;
  const usedSkills = new Set();
  const ctx = {
    gate, permissions, registry, settings: D.settings, knowledge: D.knowledge, projects: D.projects,
    rawSources: current.sourceIds.map((id) => D.sources[id]).filter(Boolean),
    capabilities: assessCapabilities(capEnv()),
    snapshot: turnSnapshot,
    addPointer: (pt) => { (reply.pointers ||= []).push(pt); },
    onImageSent: (snap) => { reply.snapshotId = keepSnapshot(snap); ledger.append("screen.sent", { width: snap.width, height: snap.height, to: "api.anthropic.com" }); },
    usedSkills,
    addFinding: (f) => {
      const saved = { ...f, id: newId("f"), createdAt: Date.now(), conversationId: current.id, evidence: f.evidence.map((e) => ({ ...e, sourceTitle: e.sourceId ? D.sources[e.sourceId]?.title || e.sourceId : e.title })) };
      D.findings.unshift(saved);
      if (["discrepancy", "conflicting_evidence"].includes(f.kind)) foundDiscrepancy = true;
      if (f.kind === "opportunity") foundOpportunity = true;
      store.save();
      renderDashboard();
      return saved;
    },
    onActivity: (state, tool) => setActivity(state, tool),
    onProposal: (p) => { p.conversationId = current.id; reply.proposalIds.push(p.id); live.append(proposalCard(p.id)); scroll(); },
    getSkillInstructions: engine.kind === "server" ? async (name) => {
      const r = await fetch(`/api/skills/${encodeURIComponent(name)}/instructions`, { headers: { "x-otter-token": engine.token } });
      return r.ok ? (await r.json()).instructions : null;
    } : null,
  };
  const history = current.messages.slice(0, -1).filter((m) => m.content && !m.local && (m.role === "user" || m.role === "assistant")).slice(-16).map((m) => ({ role: m.role, content: m.content }));
  const bubble = live.querySelector(".bubble");
  let final = "done";
  try {
    reply.question = text;
    reply.route = { tier: route.tier, label: route.label, estimate: route.estimate, upgrade: route.upgrade || null, model: route.model };
    const res = await runTurn({ transport: engine.transport, ctx, userText: text, history, route, signal: busy.signal, onText: (t) => { bubble.innerHTML = renderMarkdown(t); scroll(); } });
    reply.usage = res.usage || null;
    reply.plan = res.plan;
    reply.skillsUsed = [...usedSkills];
    if (res.blocked) {
      reply.notice = { kind: "bad", text: "Privacy guard: " + res.privacy.reason + " Nothing was sent." };
      final = "privacy";
    } else {
      reply.content = res.text || "";
      reply.citations = res.citations || [];
      if (res.privacy?.redacted) reply.notice = { kind: "info", text: "Identifying details were replaced with placeholders before this was sent." };
      if (res.truncated) reply.content += "\n\n_The answer was cut short. Ask for the rest._";
      if (reply.proposalIds.some((id) => gate.get(id)?.status === "pending")) final = "awaiting_approval";
      else if (foundDiscrepancy) final = "discrepancy";
      else if (foundOpportunity) final = "opportunity";
    }
  } catch (e) {
    const code = e.code || "";
    if (code === "cancelled" || e.name === "AbortError") { reply.content = (e.text || bubble.textContent || "").trim(); reply.notice = { kind: "info", text: "Stopped. Nothing else ran." }; final = "idle"; }
    else if (code === "not_authorized") { reply.notice = { kind: "bad", text: "Locked door. I'll wait for authorization. " + e.message }; final = "locked"; }
    else if (code === "not_granted" || code === "sampling_disabled") { reply.notice = { kind: "bad", text: "Claude access was declined for this page, so I can't answer with Claude. Reload and choose Allow, or keep using the built-in analyzers." }; final = "locked"; engine = { kind: "offline", transport: offlineTransport, label: "Built-in analyzers only", detail: "Claude access was declined." }; renderEngine(); }
    else if (code === "rate_limited") { reply.notice = { kind: "bad", text: "Claude usage limit or rate limit reached. Try again in a little while; nothing was retried automatically." }; final = "error"; }
    else { if (e.usage) reply.usage = e.usage; reply.content = (e.text || "").trim(); reply.notice = { kind: "bad", text: "That didn't work: " + (e.message || "unknown error") + (e.text ? " The partial answer is kept above." : "") }; final = "error"; }
  } finally {
    busy = null;
    clearInterval(lineTimer);
    $("thinkingLine").hidden = true;
    $("sendBtn").disabled = false;
  }
  current.messages.push(reply);
  current.updatedAt = Date.now();
  if (reply.route && !reply.notice?.text?.startsWith("Privacy guard")) logTokens(reply);
  ledger.append("claude.answer", { route: reply.route?.tier || "", tokensIn: reply.usage?.input_tokens ?? null, tokensOut: reply.usage?.output_tokens ?? null, estimated: !reply.usage?.rounds, snapshot: !!reply.snapshotId });
  noteActivity();
  if (viewMode === "mini" && (reply.content || reply.notice)) expandHelper();
  store.save();
  live.replaceWith(messageNode(reply));
  scroll();
  setActivity(final);
  renderDashboard();
  recordTurn(D.usage, {
    plan: reply.plan,
    proposals: reply.proposalIds.map((id) => gate.get(id)).filter(Boolean),
    sourceKinds: ctx.rawSources.map((s) => s.kind),
    capabilityIds: matchCapabilities(text, ctx.capabilities).map((c) => c.id),
    noSkillTopic: reply.plan && !reply.plan.steps.length ? reply.plan.intents[0] || null : null,
  });
  store.save();
  const spoken = reply.content || reply.notice?.text || "";
  const speaking = D.settings.voiceOn && spoken ? speaker.speak(spoken) : (afterSpeaking(), Promise.resolve());
  offerLearning(text, speaking);
  maybeSuggest();
}

function askServiceApproval(then) {
  const label = SYSTEMS[service()]?.label || service();
  const n = h(`<div><h2 id="modalTitle">Approve the AI service first</h2>
    <p>O.T.T.E.R. will send your messages and the sources attached to this conversation to <b>${esc(label)}</b>. Before that happens, confirm that BMCC permits using it for <b>non-protected</b> work content.</p>
    <p class="hint">The privacy guard still blocks passwords, SSNs and card numbers, blocks student education-record details unless FERPA processing is authorized, and replaces contact details with placeholders. You can revoke this any time in Settings.</p>
    <div class="actions"><button type="button" class="btn" data-no data-autofocus>Not now</button><button type="button" class="btn btn-primary" data-yes>BMCC permits it: approve</button></div></div>`);
  const close = openModal(n);
  n.querySelector("[data-no]").onclick = () => { close(); setActivity("locked"); toast("Locked door. I'll wait for authorization."); };
  n.querySelector("[data-yes]").onclick = () => { approveService(); close(); then?.(); };
}

// ---------- approval panel ----------
function openApproval(id) {
  const p = gate.get(id);
  if (!p) return;
  const st = describeProposalStatus(p);
  const sys = SYSTEMS[p.system]?.label || p.system;
  const shownDigest = p.digest;
  const n = h(`<div class="approval">
    <h2 id="modalTitle">${p.status === "pending" ? "Approval needed" : "Proposed action"}</h2>
    <span class="status status-${p.status}" style="justify-self:start">${esc(st.label)}</span>
    ${p.untrustedContext ? `<div class="notice">This was proposed while analyzing outside content (emails, documents or web pages). Outside content can try to trick assistants. Check the target and content carefully.</div>` : ""}
    <dl>
      <dt>Action</dt><dd>${esc(p.label)} <span class="hint">via ${esc(sys)}${p.external ? ", leaves O.T.T.E.R." : ", local to O.T.T.E.R."}</span></dd>
      <dt>Target</dt><dd>${esc(p.target)}</dd>
      <dt>Content</dt><dd><div class="content-box">${esc(p.content)}</div></dd>
      <dt>Consequences</dt><dd>${esc(p.consequences)}</dd>
      <dt>Approval</dt><dd>${p.status === "pending" ? "Explicit authorization from you, for this exact action and content only." : p.approval ? `Approved ${fmtDate(p.approval.at)} ${fmtTime(p.approval.at)}` : "Not approved"}<div class="digest">Fingerprint ${esc(shownDigest.slice(0, 16))}</div></dd>
      ${p.result ? `<dt>Result</dt><dd>${esc(p.result.message || (p.result.ok ? "Done." : ""))}</dd>` : ""}
    </dl>
    <div class="actions"></div>
  </div>`);
  const actions = n.querySelector(".actions");
  const close = openModal(n);
  const btn = (label, cls, fn) => { const b = h(`<button type="button" class="btn ${cls}">${label}</button>`); b.onclick = fn; actions.append(b); return b; };
  btn("Close", "", close).setAttribute("data-autofocus", "");
  btn("Copy content", "btn-ghost", () => copyText(p.content, n.querySelector(".content-box")));
  if (p.status === "pending") {
    btn("Cancel action", "btn-bad", () => { gate.reject(p.id, { reason: "user cancelled" }); close(); toast("Cancelled. Nothing ran."); setActivity("idle"); });
    btn("Revise", "", () => { close(); openRevise(p.id); });
    const ok = btn("Approve", "btn-ok", async () => {
      ok.disabled = true;
      try {
        gate.approve(p.id, { confirmDigest: shownDigest });
        const done = await gate.execute(p.id);
        recordExecution(D.usage, done);
        close();
        openApproval(p.id);
        if (done.status === "executed") { setActivity("done"); toast("That one's wrapped up. The paperwork survived."); }
        else { setActivity(done.result?.code === "not_authorized" ? "locked" : "idle"); }
      } catch (e) {
        toast(e.message, 5000);
        close();
      }
    });
    // A short pause stops a stray Enter or double click from approving
    ok.disabled = true;
    setTimeout(() => (ok.disabled = false), 700);
    setActivity("awaiting_approval");
  }
}

function openRevise(id) {
  const p = gate.get(id);
  const n = h(`<form class="approval"><h2 id="modalTitle">Revise: ${esc(p.label)}</h2>
    <p class="hint">Saving creates a new proposal. It still needs your approval; the old one can no longer run.</p>
    <label class="field"><span>Target</span><input id="rvTarget" type="text" value="${esc(p.target)}"></label>
    <label class="field"><span>Content</span><textarea id="rvContent">${esc(p.content)}</textarea></label>
    <label class="field"><span>Consequences</span><input id="rvCons" type="text" value="${esc(p.consequences)}"></label>
    <div class="actions"><button type="button" class="btn" data-cancel>Back</button><button class="btn btn-primary">Save revision</button></div></form>`);
  const close = openModal(n);
  n.querySelector("[data-cancel]").onclick = () => { close(); openApproval(id); };
  n.onsubmit = async (e) => {
    e.preventDefault();
    const next = await gate.revise(id, { target: n.querySelector("#rvTarget").value, content: n.querySelector("#rvContent").value, consequences: n.querySelector("#rvCons").value });
    next.conversationId = p.conversationId;
    const conv = convById(p.conversationId);
    const msg = conv?.messages.find((m) => (m.proposalIds || []).includes(id));
    if (msg) msg.proposalIds.push(next.id);
    store.save();
    close();
    if (current && conv === current) renderConversation();
    openApproval(next.id);
  };
}

// ---------- views ----------
function showView(v) {
  currentView = v;
  DOC.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === "view-" + v));
  DOC.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  if (v === "skills") renderSkills();
  if (v === "projects") renderProjects();
  if (v === "tasks") renderTasks();
  if (v === "research") renderResearch();
  if (v === "settings") renderSettings();
  if (v === "abilities") renderAbilities();
  if (v !== "chat") $("convTitle").textContent = { skills: "Skill Registry", projects: "Projects", tasks: "Tasks and approvals", research: "Research", settings: "Settings", abilities: "Abilities and growth" }[v];
  else if (current) $("convTitle").textContent = current.title;
  closeSideOnNarrow();
}

// Skill Registry
const skillFilter = { q: "", bmcc: true, status: "all" };
function renderSkills() {
  const el = $("view-skills");
  const rows = registry.map((s) => ({ s, st: skillStatus(s, { permissions, settings: D.settings }) }));
  const counts = rows.reduce((a, r) => ((a[r.st.status] = (a[r.st.status] || 0) + 1), a), {});
  const page = h(`<div class="page">
    <div><h2>Skill Registry</h2><p class="lead">${registry.length} Claude skills discovered on disk${D.skillsGeneratedAt ? "" : ""}. Dependencies and sensitivity are inferred from each SKILL.md and decide what O.T.T.E.R. may do with a skill. In-app skills inform answers here; hand-off skills run in Claude in Chrome or the desktop app after you approve a brief; restricted skills stay off until you authorize their data.</p></div>
    <div class="toolbar"><input type="search" id="skillQ" placeholder="Search skills" value="${esc(skillFilter.q)}"><div class="chipset" id="skillChips"></div></div>
    <div class="table-wrap"><table class="data-table skills-table"><thead><tr><th>Skill</th><th>Purpose</th><th class="hide-narrow">Capabilities</th><th class="hide-narrow">Dependencies</th><th class="hide-narrow">Permissions</th><th>Status</th><th class="hide-narrow">Overlap</th></tr></thead><tbody></tbody></table></div>
  </div>`);
  const chips = page.querySelector("#skillChips");
  const chip = (label, pressed, fn) => { const b = h(`<button type="button" class="fchip" aria-pressed="${pressed}">${label}</button>`); b.onclick = fn; chips.append(b); };
  chip("BMCC only", skillFilter.bmcc, () => { skillFilter.bmcc = !skillFilter.bmcc; renderSkills(); });
  for (const s of ["all", "available", "handoff", "unavailable", "restricted", "disabled"]) chip(`${s === "all" ? "All" : s} ${s === "all" ? registry.length : counts[s] || 0}`, skillFilter.status === s, () => { skillFilter.status = s; renderSkills(); });
  const tb = page.querySelector("tbody");
  const q = skillFilter.q.toLowerCase();
  for (const { s, st } of rows) {
    if (skillFilter.bmcc && !s.bmcc) continue;
    if (skillFilter.status !== "all" && st.status !== skillFilter.status) continue;
    if (q && !(s.name + " " + s.description).toLowerCase().includes(q)) continue;
    const perms = (s.systems || []).map((x) => `<span class="tag">${esc(SYSTEMS[x]?.label?.split(" (")[0] || x)}: ${permissions.scope(x)}</span>`).join("") || '<span class="hint">none</span>';
    const tr = h(`<tr class="expandable"><td><div class="skill-name">${esc(s.name)}</div>${s.bmcc ? '<span class="tag">BMCC</span>' : ""}</td><td>${esc(s.description.slice(0, 180))}${s.description.length > 180 ? "…" : ""}</td><td class="hide-narrow">${(s.capabilities || []).map((c) => `<span class="tag">${esc(c)}</span>`).join("") || '<span class="hint">see purpose</span>'}</td><td class="hide-narrow">${(s.systems || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("") || '<span class="hint">none detected</span>'}${(s.sensitivity || []).map((x) => `<span class="tag sens">${esc(x.replace(/_/g, " "))}</span>`).join("")}</td><td class="hide-narrow">${perms}</td><td><span class="st st-${st.status}">${st.status}</span></td><td class="hide-narrow">${(s.overlap || []).slice(0, 4).map((o) => `<span class="tag">${esc(o)}</span>`).join("")}</td></tr>`);
    const detail = h(`<tr hidden><td colspan="7"><div class="card"><div><b>Summary.</b> ${esc(s.summary || s.description)}</div><div><b>Status.</b> ${esc(st.reason)}</div><div class="hint">Location: ${esc(s.location || "")} · ${s.stopsBeforeSubmit ? "Instructions say it stops before submit buttons." : "No stop-before-submit rule detected."}</div><label class="switch"><input type="checkbox" ${D.settings.disabledSkills.includes(s.name) ? "checked" : ""}><span>Disable this skill in O.T.T.E.R.</span></label></div></td></tr>`);
    detail.querySelector("input").onchange = (e) => {
      D.settings.disabledSkills = e.target.checked ? [...new Set([...D.settings.disabledSkills, s.name])] : D.settings.disabledSkills.filter((x) => x !== s.name);
      audit.record(e.target.checked ? "skill.disabled" : "skill.enabled", { skill: s.name });
      store.save();
      renderSkills();
      renderDashboard();
    };
    tr.onclick = () => (detail.hidden = !detail.hidden);
    tb.append(tr, detail);
  }
  if (!tb.children.length) tb.append(h(`<tr><td colspan="7" class="hint">No skills match.</td></tr>`));
  el.replaceChildren(page);
  const qi = page.querySelector("#skillQ");
  qi.oninput = () => { skillFilter.q = qi.value; const pos = qi.selectionStart; renderSkills(); const n = $("skillQ"); n.focus(); n.setSelectionRange(pos, pos); };
}

// Projects
function renderProjects() {
  const el = $("view-projects");
  const page = h(`<div class="page"><div><h2>Projects</h2><p class="lead">Your active initiatives. O.T.T.E.R. includes them as context in every answer and groups conversations under them. Only what you enter here is used.</p></div>
    <form class="card" id="projForm"><div class="grid-2"><label class="field"><span>Project name</span><input id="pName" type="text" required placeholder="e.g. Boardman CDL cohort"></label><label class="field"><span>Priority</span><select id="pPri"><option>high</option><option selected>normal</option><option>low</option></select></label></div><label class="field"><span>Notes, milestones, open questions</span><textarea id="pNotes" rows="2"></textarea></label><div class="actions"><button class="btn btn-primary">Add project</button></div></form>
    <div id="projList" class="grid-2"></div></div>`);
  page.querySelector("#projForm").onsubmit = (e) => {
    e.preventDefault();
    D.projects.push({ id: newId("p"), name: page.querySelector("#pName").value.trim(), priority: page.querySelector("#pPri").value, status: "active", notes: page.querySelector("#pNotes").value.trim(), createdAt: Date.now() });
    store.save(); renderProjects(); renderDashboard();
  };
  const list = page.querySelector("#projList");
  for (const p of D.projects) {
    const convs = D.conversations.filter((c) => c.projectId === p.id).length;
    const c = h(`<div class="card"><div class="row" style="display:flex;gap:8px;align-items:center"><h3 style="flex:1;margin:0">${esc(p.name)}</h3><span class="tag">${convs} chat${convs === 1 ? "" : "s"}</span></div>
      <div class="grid-2" style="gap:8px"><label class="field"><span>Priority</span><select data-k="priority"><option ${p.priority === "high" ? "selected" : ""}>high</option><option ${p.priority === "normal" ? "selected" : ""}>normal</option><option ${p.priority === "low" ? "selected" : ""}>low</option></select></label><label class="field"><span>Status</span><select data-k="status">${["active", "on hold", "at risk", "complete"].map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
      <label class="field"><span>Notes</span><textarea data-k="notes" rows="3">${esc(p.notes || "")}</textarea></label>
      <div><button type="button" class="link-btn danger">Delete project</button></div></div>`);
    c.querySelectorAll("[data-k]").forEach((inp) => (inp.onchange = () => { p[inp.dataset.k] = inp.value; store.save(); renderDashboard(); }));
    c.querySelector(".danger").onclick = async () => { if (await confirmBox("Delete project?", `"${p.name}" will be removed. Its conversations stay, without a project.`, "Delete", true)) { D.projects = D.projects.filter((x) => x !== p); D.conversations.forEach((cv) => cv.projectId === p.id && (cv.projectId = null)); store.save(); renderProjects(); renderDashboard(); } };
    list.append(c);
  }
  if (!D.projects.length) list.append(h(`<p class="hint">No projects yet. Add your current priorities so recommendations account for them.</p>`));
  el.replaceChildren(page);
}

// Tasks and approvals
function renderTasks() {
  const el = $("view-tasks");
  const all = gate.list().sort((a, b) => b.createdAt - a.createdAt);
  const pending = all.filter((p) => p.status === "pending");
  const page = h(`<div class="page"><div><h2>Tasks and approvals</h2><p class="lead">Everything O.T.T.E.R. proposed and what you decided. Only actions you approve run, and only through an integration you have authorized. Most external ones have none yet, so approval gives you the final text to use yourself.</p></div>
    <div class="card"><h3>Waiting for your approval (${pending.length})</h3><div id="pend" class="findings-list"></div></div>
    <div class="card"><h3>Task list</h3><form id="taskForm" class="toolbar"><input id="taskTitle" class="inline-input" style="flex:1" placeholder="Add a task" required><button class="btn">Add</button></form><div id="taskList" class="findings-list"></div></div>
    <div class="card"><h3>Approval history</h3><div id="histList" class="findings-list"></div></div></div>`);
  const pend = page.querySelector("#pend");
  pending.forEach((p) => pend.append(proposalCard(p.id)));
  if (!pending.length) pend.append(h(`<p class="dempty">Nothing is waiting on you.</p>`));
  page.querySelector("#taskForm").onsubmit = (e) => { e.preventDefault(); D.tasks.push({ id: newId("task"), title: page.querySelector("#taskTitle").value.trim(), detail: "", done: false, createdAt: Date.now() }); store.save(); renderTasks(); renderDashboard(); };
  const tl = page.querySelector("#taskList");
  for (const t of D.tasks) {
    const r = h(`<label class="switch"><input type="checkbox" ${t.done ? "checked" : ""}><span>${t.done ? `<s>${esc(t.title)}</s>` : esc(t.title)}${t.detail ? ` <span class="hint">${esc(t.detail.slice(0, 160))}</span>` : ""}</span></label>`);
    r.querySelector("input").onchange = (e) => { t.done = e.target.checked; store.save(); renderTasks(); renderDashboard(); };
    tl.append(r);
  }
  if (!D.tasks.length) tl.append(h(`<p class="dempty">No tasks. Approved "add task" proposals land here too.</p>`));
  const hl = page.querySelector("#histList");
  all.filter((p) => p.status !== "pending").slice(0, 60).forEach((p) => hl.append(proposalCard(p.id)));
  if (!hl.children.length) hl.append(h(`<p class="dempty">No decisions yet.</p>`));
  el.replaceChildren(page);
}

// Research
function renderResearch() {
  const el = $("view-research");
  const research = D.findings.filter((f) => f.kind === "research" || f.kind === "opportunity");
  const cites = [];
  for (const c of D.conversations) for (const m of c.messages) for (const s of m.citations || []) cites.push({ ...s, conv: c, ts: m.ts });
  const page = h(`<div class="page"><div><h2>Research</h2><p class="lead">Source-backed research findings and every web source Claude cited, with the conversation it came from. ${engine.kind === "server" ? (permissions.check("web_research", "read") ? "Web research is on." : "Web research is available but off; allow it in Settings > Permissions.") : "Web research needs the local server with an API key; the claude.ai version has no web access and will not invent sources."}</p></div>
    <div class="card"><h3>Findings</h3><div id="rf" class="findings-list"></div></div><div class="card"><h3>Cited sources</h3><div id="rc" class="findings-list"></div></div></div>`);
  const rf = page.querySelector("#rf");
  research.forEach((f) => rf.append(findingNode(f)));
  if (!research.length) rf.append(h(`<p class="dempty">No research findings recorded yet. Nothing is shown until there is a verifiable source.</p>`));
  const rc = page.querySelector("#rc");
  cites.sort((a, b) => b.ts - a.ts).slice(0, 200).forEach((s) => { const n = h(`<div class="ditem"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a><span class="hint">${s.pageAge ? esc(s.pageAge) + " · " : ""}cited ${fmtDate(s.ts)} in <button type="button" class="link-btn">${esc(s.conv.title)}</button></span></div>`); n.querySelector("button").onclick = () => openConversation(s.conv.id); rc.append(n); });
  if (!cites.length) rc.append(h(`<p class="dempty">No web sources cited yet.</p>`));
  el.replaceChildren(page);
}

// Settings
function renderSettings() {
  const el = $("view-settings");
  const S = D.settings;
  const svc = service();
  const page = h(`<div class="page">
    <div><h2>Settings</h2><p class="lead">Permissions are off until you turn them on. Everything here is stored on this device.</p></div>
    <div class="grid-2">
      <div class="card"><h3>Engine</h3><div><b>${esc(engine.label)}</b></div><p class="hint" style="margin:0">${esc(engine.detail)}</p>
        ${svc ? `<label class="switch"><input id="svcOk" type="checkbox" ${serviceApproved() ? "checked" : ""}><span>BMCC permits sending non-protected work content to ${esc(SYSTEMS[svc].label)}.</span></label>` : ""}
        <p class="hint" style="margin:0">Outlook and Claude in Chrome: no supported bridge exists from this app, so neither is connected. Add emails with <b>+ Add source</b> (paste or file). Skills that need Chrome are handed off with an approved brief.</p>
        ${window.top === window && !engine.token ? `<label class="field"><span>Anthropic API key</span><input id="sKey" type="password" placeholder="${readKey() ? "saved (hidden)" : "sk-ant-..."}" autocomplete="off"><small>Kept only in this browser, never exported or logged. Sent only to api.anthropic.com.</small></label><div class="toolbar"><button type="button" class="btn" id="sKeySave">Save key</button><button type="button" class="btn btn-bad" id="sKeyForget">Forget key</button></div>` : ""}
        <label class="switch"><input id="sClosed" type="checkbox" ${closedMode() ? "checked" : ""}><span>Closed mode: talk only to api.anthropic.com. Turning this off allows “Hey Otter” listening (Chrome sends audio to Google) and online voices.</span></label>
        <label class="field"><span>Fall asleep (stop looking at the screen) after</span><select id="sAwake">${[5, 10, 20, 30].map((v) => `<option value="${v}" ${(+S.awakeMinutes || 10) === v ? "selected" : ""}>${v} quiet minutes</option>`).join("")}</select></label>
        <button type="button" class="btn" id="rerunOnboard">Run setup questions again</button></div>
      <div class="card"><h3>Privacy</h3>
        <label class="switch"><input id="allowContact" type="checkbox" ${S.allowContactDetails ? "checked" : ""}><span>Allow work email addresses and phone numbers to be sent (otherwise replaced with placeholders).</span></label>
        <label class="switch"><input id="ferpaOn" type="checkbox" ${S.ferpaAttested ? "checked" : ""}><span>Authorize processing of student education-record information.</span></label>
        <div id="ferpaFields" ${S.ferpaAttested ? "" : "hidden"} class="grid-2" style="gap:8px"><label class="field"><span>Lawful basis (FERPA exception)</span><input id="ferpaBasis" type="text" value="${esc(S.ferpaBasis)}" placeholder="e.g. school official, legitimate educational interest"></label><label class="field"><span>Approved by (BMCC office or person)</span><input id="ferpaApprover" type="text" value="${esc(S.ferpaApprover)}"></label></div>
        <p class="hint" style="margin:0">O.T.T.E.R. is not certified FERPA-compliant. Turning this on records your attestation; it does not establish compliance. Leave it off unless BMCC has approved this use in writing.</p></div>
    </div>
    <div class="card"><h3>Voice and conversation</h3>
      <div class="grid-2" style="gap:10px">
        <label class="switch"><input id="sVoiceOn" type="checkbox" ${S.voiceOn ? "checked" : ""}><span>Speak answers</span></label>
        <label class="field"><span>Speaking volume <b class="mono" id="sVolVal">${Math.round(S.voiceVolume * 100)}%</b></span><input id="sVol" type="range" min="0" max="100" step="5" value="${Math.round(S.voiceVolume * 100)}"></label>
        <label class="field"><span>Voice</span><select id="sVoice"></select></label>
        <label class="field"><span>How much to read aloud</span><select id="sSpeakMode"><option value="summary">Bottom line and first points</option><option value="full">Everything</option></select></label>
        <label class="field"><span>Speed</span><select id="sRate">${[[0.9, "Slower"], [1, "Normal"], [1.1, "Faster"]].map(([v, l]) => `<option value="${v}" ${+S.voiceRate === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="switch"><input id="sCloud" type="checkbox" ${permissions.check("cloud_voice", "read") ? "checked" : ""}><span>Allow online voices (most natural; spoken text goes to Microsoft or Google)</span></label>
        <label class="switch"><input id="sConv" type="checkbox" ${S.conversationMode ? "checked" : ""}><span>Conversation mode: listen after speaking</span></label>
        <label class="switch"><input id="sAuto" type="checkbox" ${S.autoListen ? "checked" : ""}><span>Always listen while O.T.T.E.R. is open</span></label>
        <label class="switch"><input id="sWake" type="checkbox" ${S.wakeWord ? "checked" : ""}><span>Only act when I say "Otter" first (saves tokens, ignores side conversations)</span></label>
        <label class="switch"><input id="sListen" type="checkbox" ${permissions.check("browser_speech", "read") ? "checked" : ""}><span>Allow listening (audio may go to ${esc(recognitionVendor())} for transcription)</span></label>
        <label class="switch"><input id="sSysVol" type="checkbox" ${permissions.check("system_volume", "write") ? "checked" : ""}><span>Allow changing this computer's volume (each change approved)</span></label>
        <label class="field"><span>Computer volume at launch</span><select id="sLaunch"><option value="off" ${!S.systemVolumeAtLaunch ? "selected" : ""}>Don't ask</option>${[10, 20, 30, 40, 50].map((v) => `<option value="${v}" ${S.systemVolumeAtLaunch && +S.launchVolume === v ? "selected" : ""}>Ask to set ${v}%</option>`).join("")}</select></label>
      </div></div>
    <div class="card"><h3>Permissions</h3><p class="hint" style="margin:0">Each system is separate: Outlook access says nothing about SharePoint or Banner, and read never implies write. A signed-in browser does not count. Protected systems need a stated purpose. Note that no integration for these systems exists yet, so a grant today only lets plans and approvals reference them.</p><div id="permList"></div></div>
    <div class="grid-2">
      <div class="card"><h3>Personal</h3>
        <label class="field"><span>Names and addresses that mean "me" in email threads</span><input id="myNames" type="text" value="${esc(S.myNames.join(", "))}"></label>
        <label class="field"><span>Briefing format</span><input id="briefing" type="text" value="${esc(S.briefingFormat)}"></label>
        <label class="field"><span>Layout</span><select id="layoutSel"><option value="simple">Simple (otter front and center)</option><option value="full">Full (sidebar, dashboard, details)</option></select></label>
        <label class="field"><span>Theme</span><select id="themeSel"><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label class="switch"><input id="glasses" type="checkbox" ${S.glasses ? "checked" : ""}><span>Reading glasses on the otter</span></label>
        <label class="switch"><input id="motion" type="checkbox" ${S.reduceMotion ? "checked" : ""}><span>Reduce motion</span></label></div>
      <div class="card"><h3>Data</h3>
        <label class="field"><span>Ask me before sending a request larger than</span><select id="askAbove">${[[5000, "5k tokens"], [15000, "15k tokens"], [30000, "30k tokens"], [60000, "60k tokens"], [0, "Never ask"]].map(([v, l]) => `<option value="${v}" ${+S.askAboveTokens === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field"><span>Delete unpinned conversations after</span><select id="retention">${[[30, "30 days"], [90, "90 days"], [180, "180 days"], [365, "1 year"], [0, "Never"]].map(([v, l]) => `<option value="${v}" ${+S.retentionDays === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <p class="hint" style="margin:0">${D.conversations.length} conversations, ${Object.keys(D.sources).length} sources, ${D.knowledge.length} knowledge entries, ${D.findings.length} findings on this device.</p>
        <div class="toolbar"><button type="button" class="btn" id="exportAll">Copy full export (JSON)</button><button type="button" class="btn btn-bad" id="wipeAll">Delete all O.T.T.E.R. data</button></div>
        <h3 style="margin-top:6px">Knowledge base</h3><div id="kbList" class="findings-list"></div></div>
    </div>
    <div class="card"><h3>Capability report</h3><div id="capReport"></div></div>
    <div class="card"><h3>Audit log</h3><p class="hint" style="margin:0">What was proposed, approved, run, blocked or changed. Content is never logged; actions are identified by fingerprint.</p><div class="audit" id="auditLog"></div></div>
  </div>`);
  const $$ = (s) => page.querySelector(s);
  if (svc) $$("#svcOk").onchange = (e) => (e.target.checked ? approveService() : revokeService(svc));
  $$("#rerunOnboard").onclick = () => runOnboarding();
  $$("#sClosed").onchange = (e) => { setClosedMode(e.target.checked, "turned off in Settings"); renderSettings(); };
  $$("#sAwake").onchange = (e) => { S.awakeMinutes = +e.target.value; store.save(); };
  if (page.querySelector("#sKeySave")) {
    $$("#sKeySave").onclick = async () => { const k = $$("#sKey").value.trim(); if (!k) return; writeKey(k); engine = await detectEngine(); approveService(); ledger.append("engine.connected", { engine: engine.kind, host: "api.anthropic.com" }); renderEngine(); renderSettings(); toast("Key saved in this browser."); };
    $$("#sKeyForget").onclick = async () => { writeKey(""); engine = await detectEngine(); ledger.append("engine.disconnected", {}); renderEngine(); renderSettings(); toast("Key removed from this browser."); };
  }
  $$("#allowContact").onchange = (e) => { S.allowContactDetails = e.target.checked; audit.record("privacy.contact_details", { allowed: S.allowContactDetails }); store.save(); };
  $$("#ferpaOn").onchange = (e) => { $$("#ferpaFields").hidden = !e.target.checked; if (!e.target.checked) { S.ferpaAttested = false; audit.record("privacy.ferpa", { attested: false }); store.save(); } else toast("Fill in the basis and approver to turn this on."); };
  const ferpaSave = () => { const b = $$("#ferpaBasis").value.trim(), a = $$("#ferpaApprover").value.trim(); S.ferpaBasis = b; S.ferpaApprover = a; S.ferpaAttested = !!(b && a && $$("#ferpaOn").checked); audit.record("privacy.ferpa", { attested: S.ferpaAttested }); store.save(); };
  $$("#ferpaBasis").onchange = ferpaSave; $$("#ferpaApprover").onchange = ferpaSave;
  const pl = $$("#permList");
  for (const [key, sys] of Object.entries(SYSTEMS)) {
    if (["anthropic_api", "claude_ai", "local_knowledge", "cloud_voice", "browser_speech", "system_volume"].includes(key)) continue;
    const g = permissions.grants[key];
    const row = h(`<div class="perm-row"><div><b>${esc(sys.label)}</b> ${sys.protected ? '<span class="lock">protected</span>' : ""}${g.purpose ? `<div class="hint">Purpose: ${esc(g.purpose)}</div>` : ""}</div><select aria-label="Access for ${esc(sys.label)}"><option value="none">No access</option><option value="read">Read</option><option value="write">Read and write</option></select><input class="purpose inline-input" type="text" placeholder="Purpose and scope (required to grant)" hidden></div>`);
    const sel = row.querySelector("select"), pur = row.querySelector(".purpose");
    sel.value = g.scope;
    sel.onchange = () => {
      if (sel.value === "none") { permissions.revoke(key); savePerms(); renderSettings(); return; }
      if (sys.protected) { pur.hidden = false; pur.focus(); return; }
      permissions.grant(key, sel.value, { purpose: "Enabled in Settings" }); savePerms(); renderSettings();
    };
    pur.onchange = () => {
      try { permissions.grant(key, sel.value, { purpose: pur.value }); savePerms(); renderSettings(); } catch (e) { toast(e.message, 4000); }
    };
    pl.append(row);
  }
  const vs = $$("#sVoice");
  const choice = speaker.supported ? speaker.choice() : { candidates: [] };
  vs.innerHTML = `<option value="">Best available${choice.voice ? ` (${esc(choice.voice.name)})` : ""}</option>` + choice.candidates.map((v) => `<option value="${esc(v.name)}" ${S.voiceName === v.name ? "selected" : ""}>${esc(v.name)}${v.localService ? "" : " (online)"}</option>`).join("");
  vs.onchange = () => { S.voiceName = vs.value; store.save(); speaker.speak("This is the voice you picked.", { mode: "full" }); };
  $$("#sSpeakMode").value = S.speakMode;
  $$("#sSpeakMode").onchange = (e) => { S.speakMode = e.target.value; store.save(); };
  $$("#sRate").onchange = (e) => { S.voiceRate = +e.target.value; store.save(); };
  $$("#sVoiceOn").onchange = (e) => { S.voiceOn = e.target.checked; store.save(); renderVoicePop(); };
  $$("#sVol").oninput = (e) => { S.voiceVolume = +e.target.value / 100; $$("#sVolVal").textContent = e.target.value + "%"; store.save(); renderVoicePop(); };
  const permToggle = (sel, sys, scope, purpose) => ($$(sel).onchange = (e) => { e.target.checked ? permissions.grant(sys, scope, { purpose }) : permissions.revoke(sys); savePerms(); renderSettings(); renderVoicePop(); });
  permToggle("#sCloud", "cloud_voice", "read", "Natural voice, enabled in Settings");
  permToggle("#sListen", "browser_speech", "read", "Conversation mode, enabled in Settings");
  permToggle("#sSysVol", "system_volume", "write", "Volume changes, each approved");
  $$("#sAuto").onchange = (e) => { S.autoListen = e.target.checked; store.save(); };
  $$("#sWake").onchange = (e) => { S.wakeWord = e.target.checked; store.save(); };
  $$("#sConv").onchange = (e) => { S.conversationMode = e.target.checked; if (!e.target.checked) stopConversation(); store.save(); };
  $$("#sLaunch").onchange = (e) => { S.systemVolumeAtLaunch = e.target.value !== "off"; if (S.systemVolumeAtLaunch) S.launchVolume = +e.target.value; store.save(); };
  $$("#myNames").onchange = (e) => { S.myNames = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); store.save(); };
  $$("#briefing").onchange = (e) => { S.briefingFormat = e.target.value; store.save(); };
  $$("#layoutSel").value = S.layout === "full" ? "full" : "simple";
  $$("#layoutSel").onchange = (e) => { S.layout = e.target.value; applyPrefs(); store.save(); };
  $$("#themeSel").value = S.theme;
  $$("#themeSel").onchange = (e) => { S.theme = e.target.value; applyPrefs(); store.save(); };
  $$("#glasses").onchange = (e) => { S.glasses = e.target.checked; applyPrefs(); store.save(); };
  $$("#motion").onchange = (e) => { S.reduceMotion = e.target.checked; applyPrefs(); store.save(); };
  $$("#askAbove").onchange = (e) => { S.askAboveTokens = +e.target.value; store.save(); };
  $$("#retention").onchange = (e) => { S.retentionDays = +e.target.value; const n = store.purgeExpired(); store.save(); renderHistory(); toast(n ? `Removed ${n} old conversation(s).` : "Retention updated."); };
  $$("#exportAll").onclick = () => copyText(store.exportJSON());
  $$("#wipeAll").onclick = async () => { if (await confirmBox("Delete everything?", "All conversations, sources, findings, knowledge, approvals, permissions, settings, the log and the API key on this device will be erased. This cannot be undone.", "Delete all", true)) { store.wipe(); writeKey(""); location.reload(); } };
  const kb = $$("#kbList");
  for (const k of D.knowledge) {
    const n = h(`<div class="ditem"><div class="row"><b>${esc(k.title)}</b><button type="button" class="link-btn danger" style="margin-left:auto">Delete</button></div><span>${esc(k.text.slice(0, 220))}</span><span class="hint">${esc(k.provenance || "")} · ${fmtDate(k.createdAt)}</span></div>`);
    n.querySelector("button").onclick = () => { D.knowledge = D.knowledge.filter((x) => x !== k); audit.record("knowledge.deleted", { id: k.id }); store.save(); renderSettings(); };
    kb.append(n);
  }
  if (!D.knowledge.length) kb.append(h(`<p class="dempty">Empty. Facts are saved only when you approve a "save to knowledge base" proposal.</p>`));
  $$("#capReport").innerHTML = capabilityReport();
  $$("#auditLog").innerHTML = audit.entries.slice(-150).reverse().map((e) => `<div>${new Date(e.ts).toLocaleString()} · ${esc(e.event)} ${esc(Object.entries(e).filter(([k]) => !["ts", "event"].includes(k)).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" "))}</div>`).join("") || '<div class="hint">No events yet.</div>';
  el.replaceChildren(page);
}

function capabilityReport() {
  const cls = { ready: "st-available", partial: "st-unavailable", needs_you: "st-unavailable", missing: "st-restricted", blocked: "st-restricted" };
  const caps = assessCapabilities(capEnv());
  return `<div class="table-wrap"><table class="data-table caps-table"><thead><tr><th>Capability</th><th>Status</th><th>Why I can't</th><th>The missing piece</th><th>With that piece, I could</th></tr></thead><tbody>${caps.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.can ? `<div class="hint">${esc(c.can)}</div>` : ""}</td><td><span class="st ${cls[c.status]}">${esc(STATUS_TEXT[c.status])}</span></td><td>${esc(c.why || "")}</td><td>${esc(c.missing || "")}</td><td>${esc(c.unlocks || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------- dashboard ----------
function findingNode(f) {
  const n = h(`<div class="ditem"><div class="row"><b>${esc(f.title)}</b><span class="conf conf-${f.confidence}">${f.confidence}</span>${f.deadline ? `<span class="tag">${esc(f.deadline)} (${esc(f.deadlineBasis || "?")})</span>` : ""}</div><span>${esc(f.finding)}</span>${(f.evidence || []).slice(0, 3).map((e) => `<span class="hint">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.sourceTitle || e.url)}</a>` : esc(e.sourceTitle || e.sourceId)}: <q>${esc((e.quote || "").slice(0, 200))}</q></span>`).join("")}${f.impact ? `<span><b>Impact:</b> ${esc(f.impact)}</span>` : ""}${f.recommendation ? `<span><b>Recommendation:</b> ${esc(f.recommendation)}</span>` : ""}${f.nextStep ? `<span><b>Next step:</b> ${esc(f.nextStep)}</span>` : ""}<div class="row"><button type="button" class="link-btn" data-open>Open conversation</button><button type="button" class="link-btn" data-dismiss style="color:var(--muted)">Dismiss</button></div></div>`);
  n.querySelector("[data-open]").onclick = () => openConversation(f.conversationId);
  n.querySelector("[data-dismiss]").onclick = () => { D.findings = D.findings.filter((x) => x !== f); store.save(); renderDashboard(); if (currentView === "research") renderResearch(); };
  return n;
}

function renderDashboard() {
  if ($("dashboard").hidden) return;
  const body = $("dashBody");
  const sec = (title, count, nodes, emptyText, open = true) => {
    const d = h(`<details class="dsec" ${open ? "open" : ""}><summary>${esc(title)}${count === null ? "" : `<span class="count ${count ? "warn" : ""}">${count}</span>`}</summary><div class="dlist"></div></details>`);
    const l = d.querySelector(".dlist");
    if (nodes.length) nodes.forEach((x) => l.append(x)); else l.append(h(`<p class="dempty">${esc(emptyText)}</p>`));
    return d;
  };
  const pending = gate.list().filter((p) => p.status === "pending");
  const disc = D.findings.filter((f) => ["discrepancy", "conflicting_evidence"].includes(f.kind));
  const emailF = D.findings.filter((f) => ["action_item", "commitment", "decision"].includes(f.kind) || f.deadline);
  const research = D.findings.filter((f) => ["research", "opportunity", "risk"].includes(f.kind));
  const prio = [...D.projects.filter((p) => p.priority === "high" && p.status !== "complete").map((p) => h(`<div class="ditem"><b>${esc(p.name)}</b><span class="hint">${esc(p.status)} · high priority</span></div>`)), ...D.tasks.filter((t) => !t.done).slice(0, 6).map((t) => h(`<div class="ditem"><span>&#9744; ${esc(t.title)}</span></div>`))];
  const skillRows = registry.filter((s) => s.bmcc).map((s) => skillStatus(s, { permissions, settings: D.settings }).status);
  const sc = skillRows.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
  const colors = { available: "var(--ok)", handoff: "var(--river)", unavailable: "var(--warn)", restricted: "var(--bad)", disabled: "var(--muted)" };
  const meter = h(`<div class="ditem"><div class="meter">${Object.entries(sc).map(([k, v]) => `<i style="width:${(v / skillRows.length) * 100}%;background:${colors[k]}" title="${k}: ${v}"></i>`).join("")}</div><div class="row">${Object.entries(sc).map(([k, v]) => `<span class="st st-${k}">${k} ${v}</span>`).join("")}</div><button type="button" class="link-btn" style="justify-self:start">Open Skill Registry</button></div>`);
  meter.querySelector("button").onclick = () => showView("skills");
  const granted = Object.entries(SYSTEMS).filter(([k]) => permissions.scope(k) !== "none" && k !== "local_knowledge").map(([k, v]) => h(`<div class="ditem"><span>${esc(v.label)}: <b>${permissions.scope(k)}</b></span></div>`));
  const recent = audit.entries.filter((e) => /^action\.(approved|rejected|result|blocked)/.test(e.event)).slice(-5).reverse().map((e) => h(`<div class="ditem"><span class="hint">${fmtDate(e.ts)} ${fmtTime(e.ts)} · ${esc(e.event.replace("action.", ""))} ${esc(e.type || "")} ${e.status ? "(" + esc(e.status) + ")" : ""}</span></div>`));
  const security = [...(granted.length ? granted : [h(`<p class="dempty">No systems authorized beyond the local knowledge base.</p>`)]), ...recent];
  body.replaceChildren(
    sec("Action queue", pending.length, pending.map((p) => proposalCard(p.id)), "Nothing awaiting your approval."),
    sec("Priorities", prio.length, prio, "Add high-priority projects or tasks to see them here."),
    sec("Discrepancy monitor", disc.length, disc.slice(0, 8).map(findingNode), "No evidence-backed discrepancies recorded."),
    sec("Email intelligence", emailF.length, emailF.slice(0, 8).map(findingNode), "No findings from authorized email yet. Add a thread with + Add source."),
    sec("Research", research.length, research.slice(0, 6).map(findingNode), "No source-backed research findings yet.", false),
    sec("Projects", D.projects.length, D.projects.map((p) => h(`<div class="ditem"><div class="row"><b>${esc(p.name)}</b><span class="tag">${esc(p.status)}</span><span class="tag">${esc(p.priority)}</span></div>${p.notes ? `<span class="hint">${esc(p.notes.slice(0, 140))}</span>` : ""}</div>`)), "No projects entered.", false),
    sec("Claude usage", null, [(() => { const d = tokenTotals(1), w = tokenTotals(7), mo = tokenTotals(30); const n = h(`<div class="ditem"><div class="row"><b>Today</b> ${fmtTokens(d.tokens)} tokens in ${d.turns} answer${d.turns === 1 ? "" : "s"}${d.cost ? ` · $${d.cost.toFixed(2)}` : ""}</div><span class="hint">7 days: ${fmtTokens(w.tokens)} · 30 days: ${fmtTokens(mo.tokens)}${mo.cost ? ` · $${mo.cost.toFixed(2)}` : ""}${mo.estimated ? ` · ${fmtTokens(mo.estimated)} of that estimated` : ""}. Ask-before limit: ${fmtTokens(D.settings.askAboveTokens)}.</span></div>`); return n; })()], "", true),
    sec("Morning check", D.lastVerify ? D.lastVerify.issues.length : null, D.lastVerify ? [h(`<div class="ditem"><span>${esc(D.lastVerify.summary)}</span>${D.lastVerify.issues.slice(0, 2).map((c) => `<span class="hint"><b>${esc(c.name)}:</b> ${esc(c.detail)}</span>`).join("")}<span class="hint">${esc(new Date(D.lastVerify.ranAt).toLocaleString())}</span></div>`)] : [], "Not run yet.", false),
    sec("Grow O.T.T.E.R.", recommend(D.usage, advisorEnv()).length, recommend(D.usage, advisorEnv()).slice(0, 3).map((r) => { const n = h(`<div class="ditem"><b>${esc(r.title)}</b><span class="hint">${esc(r.evidence)}</span><button type="button" class="link-btn" style="justify-self:start">Details</button></div>`); n.querySelector("button").onclick = () => showView("abilities"); return n; }), "No suggestions yet. They come from where I get stuck.", false),
    sec("Skill status", null, [meter], "", false),
    sec("Security", null, security, "", false),
  );
}

function renderCounts() {
  const pend = gate.list().filter((p) => p.status === "pending");
  const n = pend.length;
  const ny = $("needsYou");
  ny.hidden = !n;
  ny.textContent = n === 1 ? "1 thing needs your OK" : `${n} things need your OK`;
  ny.onclick = () => openApproval(pend[0].id);
  const q = $("queueCount");
  q.hidden = !n;
  q.textContent = n;
  $("skillCount").textContent = registry.length || "";
}

// ---------- onboarding ----------
function otterMini() {
  return $("otter").querySelector("svg")?.outerHTML.replace(/class="(prop [^"]*)"/g, 'class="$1" style="display:none"') || "";
}
function runOnboarding({ only = null, onDone = null } = {}) {
  const S = D.settings;
  const svc = service();
  const voiceStep = () => {
    const c = speaker.supported ? speaker.choice() : {};
    const listenCap = capability("listen");
    const volCap = capability("system_volume");
    const canAskListen = !!engine.token && listener.supported;
    return `<h2 id="modalTitle">Voice and conversation</h2>
      <p>I speak with the most natural male voice this browser offers, at <b>20%</b> speaking volume. Say or type "louder", "quieter" or "volume to 40%" any time.</p>
      <label class="switch"><input id="obV1" type="checkbox" ${S.voiceOn ? "checked" : ""}><span>Speak my answers${c.voice ? ` (voice: ${esc(c.voice.name)})` : ""}</span></label>
      ${c.bestCloud ? `<label class="switch"><input id="obV2" type="checkbox" ${permissions.check("cloud_voice", "read") || !S.voiceOnboarded ? "checked" : ""}><span>Use the most natural online voice, "${esc(c.bestCloud.name)}". The text I speak is sent to ${esc(vendorOf(c.bestCloud))} to be voiced.</span></label>` : ""}
      ${canAskListen ? `<label class="switch"><input id="obV3" type="checkbox" ${S.conversationMode && (permissions.check("browser_speech", "read") || !S.voiceOnboarded) ? "checked" : ""}><span>Conversation mode: listen after I speak. ${listener.onDevice ? "This browser can transcribe on this device." : `Your audio goes to ${esc(recognitionVendor())} to be transcribed.`}</span></label>` : `<p class="hint"><b>Listening:</b> ${esc(listenCap.why)} ${esc(listenCap.missing)}</p>`}
      ${engine.token && engine.cap?.systemVolume?.available ? `<label class="switch"><input id="obV4" type="checkbox" ${permissions.check("system_volume", "write") || !S.voiceOnboarded ? "checked" : ""}><span>Let O.T.T.E.R. change this computer's volume, starting at ${S.launchVolume}% when it opens. Every change still asks for your approval.</span></label>` : `<p class="hint"><b>Computer volume:</b> ${esc(volCap.why)} ${esc(volCap.missing)}</p>`}`;
  };
  const steps = [
    () => `<div class="ob-hero"><div class="ob-otter" aria-hidden="true">${otterMini()}</div><h2 id="modalTitle">Hi, I'm Otter.</h2><p>I help with email, numbers, decisions and your BMCC skills. I never send or change anything until you say OK.</p></div>${svc ? `<label class="switch big"><input id="ob1" type="checkbox" ${serviceApproved() || !S.onboarded ? "checked" : ""}><span>BMCC allows me to use ${esc(SYSTEMS[svc].label)} for everyday, non-student work.</span></label>` : `<p class="hint">I'm not connected to Claude yet, so only my built-in tools will work. You can still look around.</p>`}${engine.kind === "server" ? `<label class="switch"><input id="obWeb" type="checkbox" ${permissions.check("web_research", "read") ? "checked" : ""}><span>Let me search the web when you ask for deeper research.</span></label>` : ""}`,
    voiceStep,
    () => `<h2 id="modalTitle">What are you working on?</h2><label class="field"><span>A few projects, one per line. Put a * in front of the urgent ones. (Optional.)</span><textarea id="ob3" rows="4" placeholder="*I2PA pre-apprenticeship grant&#10;Fall workshop lineup&#10;Union County COD renewal"></textarea></label><p class="hint">That's it. Briefing style, history and privacy settings have sensible defaults; change them any time under Menu > Settings.</p>`,
  ];
  if (only === "voice") steps.splice(0, steps.length, voiceStep);
  let i = 0;
  const n = h(`<div><div class="step-dots" aria-hidden="true">${steps.map(() => "<i></i>").join("")}</div><div id="obBody"></div><div class="actions"><button type="button" class="btn btn-ghost" id="obSkip">Skip for now</button><button type="button" class="btn" id="obBack">Back</button><button type="button" class="btn btn-primary" id="obNext" data-autofocus>Next</button></div></div>`);
  const close = openModal(n, { onClose: () => { S.onboarded = true; S.voiceOnboarded = true; store.save(); renderVoicePop(); onDone?.(); } });
  const collect = () => {
    const q = (s) => n.querySelector(s);
    if (q("#ob1")) q("#ob1").checked ? approveService() : svc && serviceApproved() && revokeService(svc);
    if (q("#ob2")) S.myNames = q("#ob2").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (q("#obWeb")) { if (q("#obWeb").checked) permissions.grant("web_research", "read", { purpose: "Public research" }); else permissions.revoke("web_research"); savePerms(); }
    if (q("#ob3") && q("#ob3").value.trim()) {
      for (const line of q("#ob3").value.split("\n").map((l) => l.trim()).filter(Boolean)) D.projects.push({ id: newId("p"), name: line.replace(/^\*\s*/, ""), priority: line.startsWith("*") ? "high" : "normal", status: "active", notes: "", createdAt: Date.now() });
      q("#ob3").value = "";
    }
    const r = n.querySelector('input[name="ob4"]:checked'); if (r) S.briefingFormat = r.value;
    if (q("#obV1")) { S.voiceOn = q("#obV1").checked; S.voiceOnboarded = true; }
    if (q("#obV2")) { q("#obV2").checked ? permissions.grant("cloud_voice", "read", { purpose: "Natural male voice, approved in setup" }) : permissions.revoke("cloud_voice"); }
    if (q("#obV3")) { S.conversationMode = q("#obV3").checked; q("#obV3").checked ? permissions.grant("browser_speech", "read", { purpose: "Conversation mode, approved in setup" }) : permissions.revoke("browser_speech"); }
    if (q("#obV4")) { S.systemVolumeAtLaunch = q("#obV4").checked; q("#obV4").checked ? permissions.grant("system_volume", "write", { purpose: "Volume changes, each approved" }) : permissions.revoke("system_volume"); }
    savePerms();
    if (q("#ob5")) { S.retentionDays = +q("#ob5").value; }
    store.save();
  };
  const show = () => {
    n.querySelector("#obBody").innerHTML = steps[i]();
    n.querySelectorAll(".step-dots i").forEach((d, j) => d.classList.toggle("on", j <= i));
    n.querySelector("#obBack").hidden = i === 0;
    n.querySelector("#obNext").textContent = i === steps.length - 1 ? "Let's go" : "Next";
  };
  n.querySelector("#obNext").onclick = () => { collect(); if (i < steps.length - 1) { i++; show(); } else { close(); renderDashboard(); toast("Setup saved. Change anything later in Settings."); } };
  n.querySelector("#obBack").onclick = () => { collect(); i = Math.max(0, i - 1); show(); };
  n.querySelector("#obSkip").onclick = close;
  show();
}

// ---------- routing and token accounting ----------
function routeFor(text, forceTier = null, images = 0) {
  const sources = current ? current.sourceIds.map((id) => D.sources[id]).filter(Boolean) : [];
  const plan = planRequest(text, registry, { permissions, settings: D.settings });
  const history = current ? current.messages.filter((m) => m.content && !m.local).map((m) => ({ content: m.content })) : [];
  return chooseRoute(text, {
    plan, sources, history, forceTier, images,
    engineKind: engine.kind,
    webAllowed: permissions.check("web_research", "read"),
    capabilities: assessCapabilities(capEnv()),
    model: engine.cap?.model, quickModel: engine.cap?.quickModel !== engine.cap?.model ? engine.cap?.quickModel : null,
  });
}

function usageLine(m) {
  if (m.local) return h(`<div class="usage-line">Answered locally · 0 tokens</div>`);
  const r = m.route;
  if (m.usage && m.usage.rounds) {
    const total = m.usage.input_tokens + m.usage.output_tokens;
    const c = costUsd(r.model || engine.cap?.model, m.usage.input_tokens, m.usage.output_tokens);
    return h(`<div class="usage-line">${esc(r.label)} route · used ${total.toLocaleString()} tokens (${m.usage.input_tokens.toLocaleString()} in, ${m.usage.output_tokens.toLocaleString()} out${m.usage.web_searches ? `, ${m.usage.web_searches} web search${m.usage.web_searches === 1 ? "" : "es"}` : ""})${c != null ? ` · about $${c.toFixed(3)}` : ""} · estimate was ${fmtTokens(r.estimate.total)}</div>`);
  }
  return h(`<div class="usage-line">${esc(r.label)} route · about ${fmtTokens(r.estimate.total)} tokens (estimate${engine.kind === "artifact" ? "; claude.ai doesn't report exact counts, and this draws on your plan's usage limits" : ""})</div>`);
}

function logTokens(m) {
  const day = new Date().toISOString().slice(0, 10);
  const L = (D.tokenLedger[day] ||= { tokens: 0, exact: 0, estimated: 0, cost: 0, turns: 0 });
  L.turns++;
  if (m.usage?.rounds) {
    const t = m.usage.input_tokens + m.usage.output_tokens;
    L.tokens += t; L.exact += t;
    L.cost += costUsd(m.route.model || engine.cap?.model, m.usage.input_tokens, m.usage.output_tokens) || 0;
  } else { L.tokens += m.route.estimate.total; L.estimated += m.route.estimate.total; }
  for (const d of Object.keys(D.tokenLedger).sort().slice(0, -90)) delete D.tokenLedger[d];
}
function tokenTotals(days) {
  const cutoff = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return Object.entries(D.tokenLedger).filter(([d]) => d >= cutoff).reduce((a, [, v]) => ({ tokens: a.tokens + v.tokens, estimated: a.estimated + v.estimated, cost: a.cost + v.cost, turns: a.turns + v.turns }), { tokens: 0, estimated: 0, cost: 0, turns: 0 });
}

function preflight(text, route) {
  const cheaper = ["quick", "standard"].filter((t) => TIERS[t].rounds < TIERS[route.tier].rounds).map((t) => routeFor(text, t)).pop();
  const n = h(`<div><h2 id="modalTitle">This request is larger than your limit</h2>
    <p>The ${esc(route.label.toLowerCase())} route would use ${esc(describeEstimate(route, engine.kind))}. Your limit for sending without asking is ${fmtTokens(D.settings.askAboveTokens)} tokens.</p>
    <ul class="hint">${route.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    ${cheaper ? `<p>The cheaper ${esc(cheaper.label.toLowerCase())} route would use ${esc(describeEstimate(cheaper, engine.kind))}${cheaper.include.sources ? "" : ", without your attached sources"}.</p>` : `<p class="hint">Detaching sources you don't need is the fastest way to shrink it.</p>`}
    <div class="actions"><button type="button" class="btn" data-cancel data-autofocus>Cancel</button>${cheaper ? `<button type="button" class="btn" data-cheap>Use ${esc(cheaper.label.toLowerCase())} route</button>` : ""}<button type="button" class="btn btn-primary" data-go>Send, about ${fmtTokens(route.estimate.total)} tokens</button></div></div>`);
  const close = openModal(n);
  n.querySelector("[data-cancel]").onclick = close;
  n.querySelector("[data-go]").onclick = () => { close(); send(text, { forceTier: route.tier, confirmed: true }); };
  const ch = n.querySelector("[data-cheap]");
  if (ch) ch.onclick = () => { close(); send(text, { forceTier: cheaper.tier, confirmed: true }); };
}

function answerLocally(text, route) {
  const guide = findGuide(text);
  if (guide) { audit.record("guide.shown", { id: guide.id }); const r = addLocalMessages(text, guideMarkdown(guide), { speak: false }); if (D.settings.voiceOn) speaker.speak(`Here are the steps to ${guide.title.toLowerCase()}. I'll go through them with you.`, { mode: "full" }); if (viewMode === "mini") expandHelper(); return r; }
  if (/^(run (the )?(morning|daily) check|verify yourself|self[- ]check|morning check)\b/i.test(text)) { addLocalMessages(text, "Running the morning check now. It uses no Claude tokens.", { speak: false }); return runMorningCheck("manual", { post: true }); }
  const caps = matchCapabilities(text, assessCapabilities(capEnv()));
  if (caps.length) return addLocalMessages(text, `:::understood\nYou're asking whether I can ${caps.map((c) => c.name.toLowerCase()).join(" and ")}. I answered from my own status list, so this used 0 tokens.\n:::\n\n${caps.map(explain).join("\n\n")}`);
  if (engine.kind === "offline") {
    const out = offlineAnswerFor(text);
    return addLocalMessages(text, out);
  }
  addLocalMessages(text, /thank/i.test(text) ? "You're welcome." : "I'm here. What do you need?");
}
function offlineAnswerFor(text) {
  // Same built-in analyzers the offline engine uses, with a 0-token footer
  const plan = planRequest(text, registry, { permissions, settings: D.settings });
  const ctxLite = { rawSources: current.sourceIds.map((id) => D.sources[id]).filter(Boolean), settings: D.settings, capabilities: assessCapabilities(capEnv()) };
  return offlineAnswer({ ctx: ctxLite, userText: text, plan }).text;
}

let routeTimer = null;
function updateRouteHint() {
  clearTimeout(routeTimer);
  routeTimer = setTimeout(() => {
    const t = $("input").value.trim();
    const el = $("routeHint");
    if (!t || !current) { el.textContent = ""; return; }
    const r = routeFor(t);
    el.textContent = r.tier === "local" ? "Route: local · 0 tokens. " : `Route: ${r.label.toLowerCase()} · about ${fmtTokens(r.estimate.total)} tokens${r.estimate.costUsd != null ? ` (~$${r.estimate.costUsd.toFixed(3)})` : ""}. `;
    el.title = r.reasons.join(" ");
  }, 250);
}

// ---------- morning check ----------
async function fetchServerReport(run = false) {
  if (!engine.token) return null;
  try {
    const r = await fetch(run ? "/api/verify/run" : "/api/verify/latest", { method: run ? "POST" : "GET", headers: { "x-otter-token": engine.token } });
    return r.ok ? (await r.json()).report : null;
  } catch { return null; }
}
async function runMorningCheck(trigger, { post = true } = {}) {
  let server = await fetchServerReport(false);
  if (engine.token && (trigger === "manual" || needsCatchUp(server?.ranAt))) server = await fetchServerReport(true);
  const env = { ...capEnv(), engineLabel: engine.label, storage: store.available, pending: gate.list().filter((p) => p.status === "pending"), knowledge: D.knowledge };
  const report = buildReport({ trigger, env, serverReport: server });
  D.lastVerify = report;
  audit.record("verify.ran", { trigger, issues: report.issues.length, tokens: report.tokensUsed });
  store.save();
  if (post) showLocalReply(reportMarkdown(report), { speak: false });
  if (currentView === "abilities") renderAbilities();
  renderDashboard();
  return report;
}

// ---------- voice, conversation and computer volume ----------
let preSpeakState = "idle";
let conversationLive = false; // set by a click; browsers require one before listening
const speaker = new Speaker({
  getSettings: () => ({ ...D.settings, allowCloudVoices: !closedMode() && permissions.check("cloud_voice", "read") }),
  onStart: () => { if (otter.state !== "speaking") preSpeakState = otter.state; setActivity("speaking"); },
  onEnd: (interrupted) => { setActivity(["speaking", "thinking"].includes(preSpeakState) ? "idle" : preSpeakState); if (!interrupted) afterSpeaking(); },
});
const listener = new Listener({
  onInterim: (t) => { $("input").value = t; autosize(); },
  onState: (on) => { $("micBtn").setAttribute("aria-pressed", String(on)); $("micBtn").classList.toggle("on", on); $("micBtn").querySelector(".mic-label").textContent = on ? "Listening… tap to stop" : "Talk"; if (on) setActivity("listening"); else if (otter.state === "listening") setActivity("idle"); },
  onFinal: (t) => { $("input").value = ""; autosize(); heard(t); },
  onError: (code) => {
    if (code === "silence") { if (conversationLive) setTimeout(() => conversationLive && !busy && !speaker.speaking && listener.start(), 300); return; }
    if (code === "idle" && conversationLive && D.settings.autoListen) { listener.noSpeech = 0; setTimeout(() => conversationLive && !busy && !speaker.speaking && listener.start(), 1000); return; }
    conversationLive = false;
    setMiniHint();
    if (code === "idle") banner("I paused listening after a long silence. Click the microphone to talk again.");
    else if (code === "not-allowed" || code === "service-not-allowed") banner("The browser blocked the microphone. Allow it in the address bar's site settings, then click the microphone.");
    else if (code === "network") banner("Listening needs the browser's online speech service, and it couldn't be reached.");
    else toast("Listening stopped (" + code + ").");
  },
});

function recognitionVendor() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Microsoft";
  if (/Chrome\//.test(ua)) return "Google";
  if (/Safari\//.test(ua)) return "Apple";
  return "the browser maker";
}
function voiceEnv() {
  const c = speaker.supported ? speaker.choice() : {};
  return {
    synthesis: speaker.supported, maleVoice: c.voice?.name || null, maleVoiceLocal: !!c.local, maleVoiceNatural: !!c.natural,
    cloudMaleVoice: c.bestCloud?.name || null, cloudVendor: c.bestCloud ? vendorOf(c.bestCloud) : "", cloudVoicesAllowed: permissions.check("cloud_voice", "read"),
    recognition: listener.supported, recognitionAllowed: permissions.check("browser_speech", "read"), onDevice: listener.onDevice,
  };
}
function capEnv() {
  return {
    engineKind: engine.kind, serverRunning: !!engine.token, serviceApproved: serviceApproved(), webResearch: permissions.check("web_research", "read"),
    speech: voiceEnv(), systemVolume: engine.cap?.systemVolume || {}, floatSupported: canFloat(), topLevel: window.top === window, closedMode: closedMode(), systemVolumePermitted: permissions.check("system_volume", "write"), ferpaAttested: D.settings.ferpaAttested,
  };
}
const capability = (id) => assessCapabilities(capEnv()).find((c) => c.id === id);
function advisorEnv() {
  return { engineKind: engine.kind, webResearch: permissions.check("web_research", "read"), voice: { ...voiceEnv(), premiumWanted: (D.usage.capabilityAsks.speak || 0) >= 2 }, skillCount: registry.length, knowledgeCount: D.knowledge.length, connectorsOnAccount: [] };
}

function canListen() { return !isOff && listener.supported && (!!engine.token || window.top === window) && !closedMode() && permissions.check("browser_speech", "read"); }
function afterSpeaking() {
  followUpUntil = Date.now() + 10000; // a reply right after O.T.T.E.R. speaks needs no wake word
  if (conversationLive && canListen() && !busy && !listener.active) listener.start();
}

// Everything the microphone hears comes here. In helper mode only speech addressed to O.T.T.E.R.
// ("Otter, ...") or said right after it spoke is acted on, so side conversations cost nothing.
let followUpUntil = 0;
let pushToTalk = false;
function heard(t) {
  noteActivity();
  const needsWake = D.settings.wakeWord && D.settings.autoListen && !pushToTalk;
  const w = parseWake(t, { followUp: !needsWake || Date.now() < followUpUntil });
  pushToTalk = false;
  if (!w.addressed) {
    $("otterCaption").textContent = "Not for me? Say \u201cOtter\u201d first.";
    setTimeout(() => conversationLive && !busy && !speaker.speaking && !listener.active && listener.start(), 250);
    return;
  }
  if (!w.text) {
    followUpUntil = Date.now() + 10000;
    if (D.settings.voiceOn) speaker.speak("Yes?", { mode: "full" }); else afterSpeaking();
    $("otterCaption").textContent = "Yes?";
    return;
  }
  send(w.text);
}
function startConversation() {
  const cap = capability("listen");
  if (cap.status !== "ready") { showLocalReply(explain(cap)); return; }
  conversationLive = true;
  hideBanner();
  speaker.stop();
  listener.start();
  setMiniHint();
}
function stopConversation() { conversationLive = false; listener.stop(); }

function banner(text, buttons = []) {
  const b = $("convBanner");
  b.replaceChildren(h(`<span class="cb-text">${esc(text)}</span>`));
  for (const { label, fn, primary } of buttons) { const x = h(`<button type="button" class="btn ${primary ? "btn-primary" : ""}">${esc(label)}</button>`); x.onclick = fn; b.append(x); }
  const close = h(`<button type="button" class="icon-btn" aria-label="Dismiss">&times;</button>`);
  close.onclick = hideBanner;
  b.append(close);
  b.hidden = false;
}
function hideBanner() { $("convBanner").hidden = true; }

// Messages O.T.T.E.R. answers itself, without Claude (commands, limits, suggestions).
function addLocalMessages(userText, replyMd, { speak = true, proposalIds = [] } = {}) {
  ensureSaved();
  if (userText) {
    if (!current.messages.length) { current.title = autoTitle(userText); $("convTitle").textContent = current.title; $("messages").replaceChildren(); }
    $("stage").classList.add("compact");
    const um = { id: newId("m"), role: "user", content: userText, ts: Date.now(), local: true };
    current.messages.push(um);
    $("messages").append(messageNode(um));
  } else if (!current.messages.length) $("messages").replaceChildren();
  const am = { id: newId("m"), role: "assistant", content: replyMd, ts: Date.now(), local: true, proposalIds };
  current.messages.push(am);
  current.updatedAt = Date.now();
  $("messages").append(messageNode(am));
  $("messages").scrollTop = $("messages").scrollHeight;
  store.save();
  renderHistory();
  if (speak && D.settings.voiceOn) speaker.speak(replyMd); else afterSpeaking();
}
const showLocalReply = (md, opts) => addLocalMessages(null, md, opts);

async function readSystemVolume() {
  if (!engine.token) return null;
  try { const r = await fetch("/api/system/volume", { headers: { "x-otter-token": engine.token } }); if (!r.ok) return null; lastSystemVolume = (await r.json()).level; return lastSystemVolume; } catch { return null; }
}
async function proposeVolume(level, origin, why) {
  const p = await gate.propose({ type: "set_system_volume", target: "This computer (default audio output)", content: `Set this computer's volume to ${level}%`, consequences: `Changes the volume for every app on this computer. ${why}`, origin });
  p.conversationId = current?.id;
  return p;
}
async function systemVolumeRequest(text, level) {
  const cap = capability("system_volume");
  if (cap.status !== "ready") return addLocalMessages(text, explain(cap));
  level = Math.max(0, Math.min(100, Math.round(level)));
  const p = await proposeVolume(level, "user_request", "You asked for this.");
  addLocalMessages(text, `Queued: set this computer's volume to ${level}%. Approve it on screen. I don't take approvals for system changes by voice, because a misheard word shouldn't change your computer.`, { proposalIds: [p.id] });
  openApproval(p.id);
}

async function handleCommand(cmd, text) {
  const S = D.settings;
  const pct = () => Math.round(S.voiceVolume * 100);
  let reply = "";
  let speak = true;
  if (cmd.kind === "volume_set" && cmd.target === "system") return systemVolumeRequest(text, cmd.level);
  if (cmd.kind === "volume_step" && cmd.target === "system") {
    const cap = capability("system_volume");
    if (cap.status !== "ready") return addLocalMessages(text, explain(cap));
    const cur = await readSystemVolume();
    if (cur == null || Number.isNaN(cur)) return addLocalMessages(text, "I couldn't read the computer's current volume, so I can't raise or lower it by a step. Say a number instead, for example \"set computer volume to 40%\".");
    return systemVolumeRequest(text, cur + cmd.step);
  }
  if (cmd.kind === "ui") {
    if (cmd.ui === "maximize") setViewMode("max");
    if (cmd.ui === "minimize") setViewMode("mini");
    if (cmd.ui === "chat") { if (viewMode === "mini") toggleMiniChat(true); else $("input").focus(); }
    if (cmd.ui === "hide_chat") toggleMiniChat(false);
    if (cmd.ui === "float") return floatWindow();
    return;
  }
  if (cmd.kind === "confirm") return answerLearning(cmd.yes, text);
  if (cmd.kind === "shutdown") return shutOff("you said so");
  if (cmd.kind === "done") { collapseHelper(); return addLocalMessages(text, "Okay. I'll stay small until you need me.", { speak: true }); }
  if (cmd.kind === "screen") {
    if (!cmd.on) { watcher.stop("you asked me to stop looking"); return addLocalMessages(text, "Stopped looking. Nothing on your screen is captured now.", { speak: true }); }
    if (watcher.active) return addLocalMessages(text, "I'm already looking. Ask me what to do next, or where something is.", { speak: true });
    return addLocalMessages(text, "Tap the eye button and pick the screen or window to share. Chrome needs that click; I can't start sharing by voice.", { speak: true });
  }
  if (cmd.kind === "profile") {
    const mine = D.knowledge.filter((k) => k.tags?.includes("profile") || k.tags?.includes("learned"));
    return addLocalMessages(text, mine.length ? `Here's what I know about you (0 tokens):\n\n${mine.map((k) => `- **${k.title}:** ${k.text}`).join("\n")}\n\nTo correct or forget any of it, open Menu > Abilities & growth.` : "Nothing yet.", { speak: false });
  }
  switch (cmd.kind) {
    case "volume_set": S.voiceVolume = cmd.level / 100; S.voiceOn = cmd.level > 0; reply = `Speaking volume is now ${cmd.level}%.`; break;
    case "volume_step": S.voiceVolume = Math.max(0, Math.min(1, Math.round((S.voiceVolume + cmd.step / 100) * 20) / 20)); S.voiceOn = S.voiceVolume > 0; reply = `Speaking volume is now ${pct()}%.${S.voiceVolume >= 1 ? " That's my maximum; for more, raise the computer's volume." : ""}`; break;
    case "mute": S.voiceOn = false; speaker.stop(); reply = "Muted. Say or type \"unmute\" to hear me again."; speak = false; break;
    case "unmute": S.voiceOn = true; if (!S.voiceVolume) S.voiceVolume = 0.2; reply = `I'm back, at ${pct()}% speaking volume.`; break;
    case "listen_off": stopConversation(); reply = "Stopped listening. Click the microphone when you want to talk."; break;
    case "listen_on": { const cap = capability("listen"); if (cap.status !== "ready") { reply = explain(cap); break; } S.conversationMode = true; addLocalMessages(text, "Listening.", { speak: false }); store.save(); renderVoicePop(); return startConversation(); }
    case "volume_query": {
      const sys = capability("system_volume").status === "ready" ? await readSystemVolume() : null;
      reply = `Speaking volume is ${pct()}%.${sys != null ? ` The computer is at ${sys}%.` : ""}`;
      break;
    }
  }
  audit.record("voice.command", { kind: cmd.kind });
  store.save();
  renderVoicePop();
  addLocalMessages(text, reply, { speak });
}

function renderVoicePop() {
  const S = D.settings;
  $("vpOn").checked = S.voiceOn;
  $("vpVol").value = Math.round(S.voiceVolume * 100);
  $("vpVolVal").textContent = Math.round(S.voiceVolume * 100) + "%";
  const c = speaker.supported ? speaker.choice() : null;
  $("vpVoice").textContent = !speaker.supported ? "This browser cannot speak." : c?.voice ? `Voice: ${c.voice.name}${c.local ? "" : " (online)"}` : "No male voice available here. See Abilities.";
  $("vpConv").checked = S.conversationMode;
  const sys = $("vpSys");
  const cap = capability("system_volume");
  if (cap.status === "ready") {
    sys.innerHTML = `<div><b>Computer volume</b> <span class="mono">${lastSystemVolume ?? "?"}%</span></div><div class="toolbar"><button type="button" class="btn" data-d="-10">&minus;10</button><button type="button" class="btn" data-d="10">+10</button><button type="button" class="btn" data-set="${S.launchVolume}">Set to ${S.launchVolume}%</button></div><div class="hint">Each change asks for your approval.</div>`;
    sys.querySelectorAll("[data-d]").forEach((b) => (b.onclick = async () => { const cur = (await readSystemVolume()) ?? lastSystemVolume; if (cur == null) return toast("Couldn't read the current volume."); systemVolumeRequest(`Computer volume ${+b.dataset.d > 0 ? "up" : "down"} 10`, cur + +b.dataset.d); $("voicePop").hidden = true; }));
    sys.querySelector("[data-set]").onclick = () => { systemVolumeRequest(`Set computer volume to ${S.launchVolume}%`, S.launchVolume); $("voicePop").hidden = true; };
  } else {
    sys.innerHTML = `<div><b>Computer volume</b>: ${esc(STATUS_TEXT[cap.status].toLowerCase())}</div><div class="hint">${esc(cap.why)}</div>`;
  }
  $("voiceWaves").style.opacity = S.voiceOn ? 1 : 0.15;
}

async function launchChecks({ volume = true } = {}) {
  const items = [];
  const btns = [];
  if (D.settings.conversationMode) {
    const cap = capability("listen");
    if (cap.status === "ready") { items.push("Conversation mode is on. Browsers need one click before I can listen."); btns.push({ label: "Start talking", fn: startConversation, primary: true }); }
    else if (D.settings.voiceOn) { items.push("I'll answer out loud, but I can't hear you in this version."); btns.push({ label: "Why?", fn: () => { hideBanner(); showLocalReply(explain(cap), { speak: false }); } }); }
  }
  if (volume && D.settings.systemVolumeAtLaunch && capability("system_volume").status === "ready") {
    const lvl = D.settings.launchVolume;
    const existing = gate.list().find((p) => p.type === "set_system_volume" && p.status === "pending" && p.origin === "launch");
    const p = existing || (await proposeVolume(lvl, "launch", "You asked O.T.T.E.R. to start at this level; it asks each launch because one approval never covers future changes."));
    readSystemVolume().then(renderVoicePop);
    items.push(`Set the computer to ${lvl}% volume?`);
    btns.push({ label: `Review ${lvl}%`, fn: () => openApproval(p.id) });
  }
  if (items.length) banner(items.join(" "), btns); else hideBanner();
}

function maybeSuggest() {
  const recs = recommend(D.usage, advisorEnv());
  renderGrowCount(recs);
  const due = dueRecommendation(D.usage, recs);
  if (!due) return;
  markShown(D.usage, due);
  store.save();
  showLocalReply(recommendationMarkdown(due), { speak: false });
}
function renderGrowCount(recs = recommend(D.usage, advisorEnv())) {
  const g = $("growCount");
  g.hidden = !recs.length;
  g.textContent = recs.length;
}

function renderAbilities() {
  const el = $("view-abilities");
  const recs = recommend(D.usage, advisorEnv());
  renderGrowCount(recs);
  const page = h(`<div class="page">
    <div><h2>Abilities and growth</h2><p class="lead">What I can do right now, what I can't and why, and the piece that would unlock it. This updates as you add permissions, connectors or the local server. Recommendations come from counts of what you ask for and where I get stuck, kept on this device. I never read past conversations to make them.</p></div>
    <div class="card"><div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="flex:1;margin:0">Grow O.T.T.E.R.</h3>${engine.kind !== "offline" ? '<button type="button" class="btn" id="askIdeas">Ask Claude for more ideas</button>' : ""}</div><div id="recList" class="findings-list"></div></div>
    <div class="card"><h3>Verifiable log</h3><div id="ledgerBox"></div></div>
    <div class="card"><h3>What I know about you</h3><p class="hint" style="margin:0">From your setup brief and things you said yes to remembering. It travels with every question so I ask less. Forget anything that's wrong.</p><div id="knowBox" class="findings-list"></div></div>
    <div class="card"><div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="flex:1;margin:0">Morning check</h3><button type="button" class="btn" id="runCheck">Run now (0 tokens)</button></div><div id="verifyBox"></div></div>
    <div class="card"><h3>What I can and can't do</h3>${capabilityReport()}</div>
  </div>`);
  const list = page.querySelector("#recList");
  for (const r of recs) {
    const n = h(`<div class="ditem"><div class="row"><b>${esc(r.title)}</b><span class="tag">${esc(r.kind)}</span><span class="conf conf-${r.priority === "high" ? "high" : r.priority === "medium" ? "medium" : "low"}">${esc(r.priority)}</span></div><span><b>What I noticed:</b> ${esc(r.evidence)}</span><span><b>Why it matters:</b> ${esc(r.why)}</span><span><b>The missing piece:</b> ${esc(r.missing)}</span><span><b>With that piece, I could:</b> ${esc(r.unlocks)}</span><span class="hint">Effort: ${esc(r.effort)}</span><div class="row"><button type="button" class="link-btn" data-talk>Discuss</button><button type="button" class="link-btn" data-dismiss style="color:var(--muted)">Not for me</button></div></div>`);
    n.querySelector("[data-dismiss]").onclick = () => { D.usage.dismissed.push(r.id); store.save(); renderAbilities(); };
    n.querySelector("[data-talk]").onclick = () => { showView("chat"); $("input").value = `Walk me through this recommendation and what it would take at BMCC: ${r.title}`; autosize(); $("input").focus(); };
    list.append(n);
  }
  if (!recs.length) list.append(h(`<p class="dempty">No recommendations yet. I suggest connectors and skills after I see where I get stuck (${D.usage.turns} conversation turn${D.usage.turns === 1 ? "" : "s"} so far). Nothing is invented to fill this space.</p>`));
  renderLedgerCard(page.querySelector("#ledgerBox"));
  const kb = page.querySelector("#knowBox");
  for (const k of D.knowledge.filter((x) => x.tags?.includes("profile") || x.tags?.includes("learned"))) {
    const n = h(`<div class="ditem"><div class="row"><b>${esc(k.title)}</b><span class="tag">${k.tags.includes("learned") ? "learned" : "from your brief"}</span><button type="button" class="link-btn danger" style="margin-left:auto">Forget</button></div><span>${esc(k.text)}</span></div>`);
    n.querySelector("button").onclick = () => { D.knowledge = D.knowledge.filter((x) => x !== k); audit.record("knowledge.forgotten", { id: k.id }); store.save(); renderAbilities(); };
    kb.append(n);
  }
  if (!kb.children.length) kb.append(h(`<p class="dempty">Nothing yet.</p>`));
  const vb = page.querySelector("#verifyBox");
  const V = D.lastVerify;
  vb.innerHTML = V ? `<p class="hint" style="margin:0">Last run ${esc(new Date(V.ranAt).toLocaleString())} (${esc(V.trigger)}). ${esc(V.summary)} Claude tokens used: ${V.tokensUsed}.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Check</th><th>Result</th><th>Detail</th><th>How to fix</th></tr></thead><tbody>${V.checks.map((c) => `<tr><td>${esc(c.name)}</td><td><span class="st ${c.status === "pass" ? "st-available" : c.status === "warn" ? "st-unavailable" : "st-restricted"}">${c.status}</span></td><td>${esc(c.detail)}</td><td>${esc(c.fix || "")}</td></tr>`).join("")}</tbody></table></div><p class="hint">It runs at 5 a.m. when the local server is running and the computer is awake. Otherwise it runs the first time you open O.T.T.E.R. after 5 a.m.</p>` : `<p class="dempty">Not run yet.</p>`;
  page.querySelector("#runCheck").onclick = () => runMorningCheck("manual", { post: false });
  const ask = page.querySelector("#askIdeas");
  if (ask) ask.onclick = () => {
    const u = D.usage;
    const stats = { turns: u.turns, intents: u.intents, approvedButNotRun: u.notExecuted, proposed: u.proposed, sourceKinds: u.sourceKinds, limitsAskedAbout: u.capabilityAsks, topicsWithNoSkill: u.noSkillTopics, skillModes: Object.fromEntries(Object.entries(u.skillModes).slice(0, 25)) };
    showView("chat");
    send(`Based only on these usage counts from O.T.T.E.R. (no content), recommend up to three new connectors, skills or setup changes that would help me most. For each: what you noticed, why I can't do it now, the missing piece, and what it would let you do. Only name connectors you know exist; otherwise describe the kind of connector. Counts: ${JSON.stringify(stats)}`);
  };
  el.replaceChildren(page);
}

// ---------- helper window: mini view, floating, learning ----------
const params = new URLSearchParams(location.search);
let viewMode = params.get("mode") === "max" ? "max" : params.get("mode") === "mini" ? "mini" : D.settings.viewMode || "mini";
function setViewMode(m) {
  if (m === "max" && pipWindow) { pipWindow.close(); }
  viewMode = m;
  D.settings.viewMode = m;
  store.save();
  if (m === "mini") toggleMiniChat(false);
  applyPrefs();
  // In the helper's own Chrome window, resize the window too (ignored in ordinary tabs).
  try { if (!pipWindow) m === "mini" ? window.resizeTo(340, 460) : window.resizeTo(Math.min(1280, screen.availWidth), Math.min(900, screen.availHeight)); } catch {}
  setMiniHint();
}
function toggleMiniChat(on) {
  const b = DOC.body;
  const next = on ?? !b.classList.contains("mini-chat");
  b.classList.toggle("mini-chat", next);
  if (next) { $("messages").scrollTop = $("messages").scrollHeight; $("input").focus(); }
}
function setMiniHint() {
  const el = $("miniHint");
  if (!el) return;
  const cap = capability("listen");
  el.textContent = cap.status !== "ready" ? "Tap the chat bubble to type." : conversationLive ? (D.settings.wakeWord && D.settings.autoListen ? "Listening. Say “Otter”, then what you need." : "Listening.") : "Tap the microphone to talk.";
  $("miniMic").classList.toggle("on", conversationLive);
  $("miniMic").setAttribute("aria-pressed", String(conversationLive));
  $("miniFloat").hidden = !canFloat() || !!pipWindow;
}

// Floating: Chrome's Document Picture-in-Picture keeps a small window on top of every other
// window. The whole interface moves into it and moves back when it closes.
let pipWindow = null;
function canFloat() { return "documentPictureInPicture" in window && window.top === window; }
async function floatWindow() {
  if (!canFloat()) return showLocalReply(explain(capability("float")), { speak: false });
  if (pipWindow) return;
  let pip;
  try { pip = await window.documentPictureInPicture.requestWindow({ width: 320, height: 440 }); }
  catch (e) { toast("Chrome needs a click on the float button to pop me out."); return; }
  pipWindow = pip;
  for (const n of document.querySelectorAll('link[rel="stylesheet"], style')) pip.document.head.append(n.cloneNode(true));
  pip.document.title = "O.T.T.E.R.";
  const nodes = ["app", "modalRoot", "toast"].map((id) => document.getElementById(id));
  for (const n of nodes) pip.document.body.append(n);
  DOC = pip.document;
  bindDocEvents(DOC);
  viewMode = "mini";
  applyPrefs();
  const note = h(`<div id="floatNote" class="float-note"><p>O.T.T.E.R. is floating on top of your other windows.</p><button type="button" class="btn btn-primary">Bring it back here</button></div>`);
  note.querySelector("button").onclick = () => pip.close();
  document.body.append(note);
  pip.addEventListener("pagehide", () => {
    for (const n of nodes) document.body.insertBefore(n, note);
    note.remove();
    DOC = document;
    pipWindow = null;
    applyPrefs();
    setMiniHint();
  });
  setMiniHint();
}

// First launch: everything on, as requested, then say exactly what was turned on.
function applyOpenDefaults() {
  const S = D.settings;
  const purpose = "On by default at first launch; turn off in Settings";
  if (service()) approveService();
  if (!closedMode()) { permissions.grant("browser_speech", "read", { purpose }); permissions.grant("cloud_voice", "read", { purpose }); }
  permissions.grant("system_volume", "write", { purpose });
  if (engine.kind === "server") permissions.grant("web_research", "read", { purpose });
  savePerms();
  Object.assign(S, { voiceOn: true, conversationMode: true, autoListen: true, wakeWord: true, onboarded: true, voiceOnboarded: true, openDefaultsApplied: true });
  store.save();
  renderEngine();
  renderVoicePop();
  const listenOk = capability("listen").status === "ready";
  showLocalReply([
    `Hi Arnaud, I'm Otter. Everything is switched on so you can just talk${listenOk ? ": say “Otter”, then what you need" : ""}.`,
    "",
    ":::finding",
    "**On by default** (Menu > Settings turns any of it off)",
    `- Claude answers (${engine.label})`,
    `- Voice at 20% speaking volume, using the most natural male voice ${closedMode() ? "installed on this computer (online voices are off in closed mode)" : "(online voices included)"}`,
    closedMode() ? "- Closed mode: the only outside address is api.anthropic.com, and every call is in the verifiable log" : `- Listening for “Hey Otter”${listenOk ? "" : " where the browser allows it"} (Chrome sends microphone audio to Google for transcription)`,
    "- Screen coaching when you tap the eye button: a picture goes to Claude only when you ask a question while I'm looking",
    "- Computer volume control, starting at 20%, with your OK on each change",
    engine.kind === "server" ? "- Web research on the deep route" : "",
    "",
    "**Still off, on purpose:** student-record processing (FERPA), and sending, posting or changing anything without your OK.",
    ":::",
  ].filter((l) => l !== null).join("\n"), { speak: false });
  if (S.voiceOn) speaker.speak("Hi Arnaud, I'm Otter. Everything's on. Say Otter, then what you need.", { mode: "full" });
}

// Learning: after a turn, offer to remember lasting preferences and facts. Saving is local to
// this device; a spoken or clicked "yes" approves exactly the fact shown.
let pendingLearn = [];
async function offerLearning(text, speakingDone = Promise.resolve()) {
  const facts = extractLearnables(text, D.knowledge);
  if (!facts.length) return;
  pendingLearn = [];
  for (const f of facts) {
    const p = await gate.propose({ type: "save_knowledge", target: "About you", content: f, consequences: "Kept on this device and used to tailor answers. Forget it any time under Abilities & growth.", origin: "learning" });
    p.conversationId = current?.id;
    pendingLearn.push(p.id);
  }
  followUpUntil = Date.now() + 12000;
  addLocalMessages(null, `:::question\nWant me to remember ${facts.length > 1 ? "these" : "this"}?\n${facts.map((f) => `- “${f}”`).join("\n")}\n:::\nSay “yes” or “no”, or use the buttons.`, { proposalIds: [...pendingLearn], speak: false });
  // Ask out loud only after the answer has been spoken, so the question doesn't cut it off.
  speakingDone.then(() => { if (D.settings.voiceOn && pendingLearn.length) speaker.speak(facts.length > 1 ? "Want me to remember those?" : "Want me to remember that?", { mode: "full" }); });
}
async function answerLearning(yes, text) {
  const ids = pendingLearn.filter((id) => gate.get(id)?.status === "pending");
  pendingLearn = [];
  if (!ids.length) return addLocalMessages(text, yes ? "Okay." : "Okay, never mind.", { speak: true });
  for (const id of ids) {
    const p = gate.get(id);
    if (yes) { gate.approve(id, { confirmDigest: p.digest, by: "you (spoken or typed yes)" }); await gate.execute(id); }
    else gate.reject(id, { reason: "declined" });
  }
  addLocalMessages(text, yes ? "Got it. I'll remember that." : "Okay, I won't keep it.");
}

// ---------- screen coaching, closed mode, sleep and shut-off ----------
const watcher = new ScreenWatcher({
  getWindow: () => pipWindow || window,
  onState: (on, why) => {
    ledger.append(on ? "screen.on" : "screen.off", { surface: on ? why : "", reason: on ? "" : why });
    $("miniLook")?.classList.toggle("on", on);
    $("miniLook")?.setAttribute("aria-pressed", String(on));
    $("otterCaption").textContent = on ? "I'm looking. Ask me what's next, or where something is." : "Not looking at your screen.";
    noteActivity();
  },
  onSnapshot: (snap) => ledger.append("screen.snapshot", { kept: "memory only", width: snap.width, height: snap.height, changed: Math.round(snap.changed * 100) / 100 }),
});
async function toggleLook() {
  if (watcher.active) { watcher.stop("you tapped the eye button"); return; }
  if (!watcher.supported) return showLocalReply(":::limitation\n**Look at your screen**\n- **Why I can't:** this browser or page doesn't allow screen sharing (claude.ai pages and some managed browsers block it).\n- **The missing piece:** O.T.T.E.R. opened from its own file or web address in Chrome or Edge, with screen sharing allowed by your browser's policy.\n- **With that piece, I could:** see the step you're on and circle what you're looking for.\n:::", { speak: false });
  try { await watcher.start(); }
  catch (e) { toast(/Permission|NotAllowed/i.test(e.name + e.message) ? "Screen sharing was cancelled or isn't allowed on this computer." : "Couldn't start screen sharing: " + e.message, 5000); }
}

// Pictures are kept in memory for this session only, so circles can be drawn on them.
const snapshots = new Map();
function keepSnapshot(snap) {
  const id = newId("snap");
  snapshots.set(id, snap.url);
  if (snapshots.size > 12) snapshots.delete(snapshots.keys().next().value);
  return id;
}
function snapshotNode(m) {
  const url = snapshots.get(m.snapshotId);
  const pts = m.pointers || [];
  const labels = pts.map((p, i) => `<li><b>${i + 1}</b> ${esc(p.label)}</li>`).join("");
  if (!url) return h(`<div class="snap gone"><span class="hint">Screen picture not kept (pictures are never saved).</span>${labels ? `<ol class="snap-labels">${labels}</ol>` : ""}</div>`);
  const marks = pts.map((p, i) => `<g><circle cx="${p.x * 100}" cy="${p.y * 100}" r="7" class="snap-ring"/><circle cx="${p.x * 100}" cy="${p.y * 100}" r="1.8" class="snap-dot"/><text x="${Math.min(96, p.x * 100 + 5)}" y="${Math.max(5, p.y * 100 - 4)}" class="snap-num">${i + 1}</text></g>`).join("");
  return h(`<figure class="snap"><div class="snap-frame"><img src="${url}" alt="Snapshot of your screen"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${marks}</svg></div>${labels ? `<ol class="snap-labels">${labels}</ol>` : ""}<figcaption class="hint">Circles are drawn on O.T.T.E.R.'s copy of the picture. Nothing on your screen was clicked.</figcaption></figure>`);
}

// Checklists: "- [ ] step" items become checkboxes; ticking them all closes the panel.
function wireChecklist(bubble, m) {
  const boxes = [...bubble.querySelectorAll('input[type="checkbox"][data-task]')];
  if (!boxes.length) return;
  m.checks ||= {};
  boxes.forEach((b) => {
    b.checked = !!m.checks[b.dataset.task];
    b.closest("li").classList.toggle("done", b.checked);
    b.onchange = () => {
      m.checks[b.dataset.task] = b.checked;
      b.closest("li").classList.toggle("done", b.checked);
      store.save();
      noteActivity();
      if (boxes.every((x) => x.checked)) {
        ledger.append("checklist.done", { steps: boxes.length });
        $("otterCaption").textContent = "All steps done. Nice work.";
        if (D.settings.voiceOn) speaker.speak("That's every step. Nice work.", { mode: "full" });
        setTimeout(() => collapseHelper(), 2500);
      }
    };
  });
}

// The helper grows to show an answer, list or question, then shrinks back. Chrome lets a page
// resize its floating window only right after a click, so an expansion that follows a spoken
// request fills the small window and scrolls instead.
function tryResize(w, h) { try { (pipWindow || window).resizeTo(w, h); } catch {} }
function expandHelper() { if (viewMode !== "mini") return; toggleMiniChat(true); tryResize(440, 640); }
function collapseHelper() { if (viewMode !== "mini") return; toggleMiniChat(false); tryResize(320, 420); }

// Awake: while looking, O.T.T.E.R. falls asleep (stops capturing) after a quiet spell.
let lastActivity = Date.now();
function noteActivity() { lastActivity = Date.now(); }
setInterval(() => {
  const mins = +D.settings.awakeMinutes || 10;
  if (watcher.active && Date.now() - lastActivity > mins * 60000) {
    watcher.stop(`asleep after ${mins} quiet minutes`);
    $("otterCaption").textContent = "Fell asleep. I stopped looking at your screen.";
    collapseHelper();
  }
}, 30000);

// One switch turns everything off: microphone, voice, screen capture, timers, floating window.
let isOff = false;
function shutOff(reason) {
  isOff = true;
  conversationLive = false;
  listener.stop();
  speaker.stop();
  watcher.stop("shut off");
  snapshots.clear();
  busy?.abort();
  if (pipWindow) pipWindow.close();
  ledger.append("session.off", { reason });
  setActivity("idle");
  setMiniHint();
  const o = h(`<div id="offScreen" class="off-screen" role="dialog" aria-label="O.T.T.E.R. is off"><div class="ob-otter" aria-hidden="true">${otterMini()}</div><h2>Otter is off.</h2><p>Not listening, not looking, not sending anything. Close this window to end it completely, or start again.</p><button type="button" class="btn btn-primary">Start again</button></div>`);
  o.querySelector("button").onclick = () => { o.remove(); isOff = false; startOtter(); };
  DOC.body.append(o);
}

function closedMode() { return D.settings.closedMode !== false; }
function setClosedMode(on, why) {
  D.settings.closedMode = on;
  if (on) { permissions.revoke("browser_speech"); permissions.revoke("cloud_voice"); stopConversation(); }
  else permissions.grant("browser_speech", "read", { purpose: "Hey Otter listening (Chrome speech service)" });
  savePerms(); store.save();
  ledger.append(on ? "closed_mode.on" : "closed_mode.off", { exception: on ? "" : why });
  renderEngine(); setMiniHint();
}

// Start: browsers need one click before a page may float, listen or speak.
function startOtter() {
  ledger.append("session.start", { engine: engine.kind, closedMode: closedMode(), page: location.protocol === "file:" ? "local file" : location.host });
  if (canFloat() && !pipWindow) floatWindow();
  if (D.settings.autoListen && canListen()) startConversation();
  setMiniHint();
  noteActivity();
}
function showStartCard() {
  if ($("startCard")) return;
  const needsKey = engine.needsKey;
  const c = h(`<div id="startCard" class="start-card" role="dialog" aria-labelledby="startTitle">
    <div class="ob-otter" aria-hidden="true">${otterMini()}</div>
    <h2 id="startTitle">Hi Arnaud. Ready when you are.</h2>
    ${needsKey ? `<label class="field"><span>Anthropic API key</span><input id="startKey" type="password" placeholder="sk-ant-..." autocomplete="off"><small>Kept only in this browser. Sent only to api.anthropic.com. Skip it to use the built-in guides only.</small></label>` : ""}
    <label class="switch"><input id="startHey" type="checkbox" ${!closedMode() ? "checked" : ""} ${listener.supported ? "" : "disabled"}><span>Listen for “Hey Otter”. Chrome sends what the microphone hears to Google to turn it into text, so this is the one exception to closed mode.</span></label>
    <button type="button" class="btn btn-primary start-go">Start Otter</button>
    <p class="hint">Opens a small window that floats on top, usually in the bottom-right corner (Chrome decides where it first appears). Close it or say “Hey Otter, shut down” to turn everything off.</p>
  </div>`);
  c.querySelector(".start-go").onclick = async () => {
    const k = c.querySelector("#startKey")?.value.trim();
    if (k) { writeKey(k); engine = await detectEngine(); approveService(); ledger.append("engine.connected", { engine: engine.kind, host: "api.anthropic.com" }); }
    const hey = c.querySelector("#startHey").checked;
    if (hey !== !closedMode()) setClosedMode(!hey, "Hey Otter listening (Chrome speech service, Google)");
    c.remove();
    renderEngine();
    startOtter();
  };
  DOC.body.append(c);
}

function renderLedgerCard(box) {
  const out = ledger.entries.filter((e) => e.type === "network.out");
  const hosts = [...new Set(out.map((e) => e.detail.host))];
  const blocked = ledger.entries.filter((e) => e.type === "network.blocked").length;
  box.innerHTML = `<p style="margin:0">${ledger.entries.length} entries. Outside addresses contacted: <b>${hosts.length ? esc(hosts.join(", ")) : "none yet"}</b>${hosts.every((x) => ALLOWED_HOSTS.includes(x)) ? " (only the allowed one)" : ""}. Blocked attempts: ${blocked}. Mode: <b>${closedMode() ? "closed" : "closed except Chrome speech (Google)"}</b>.</p>
    <p class="hint" style="margin:0">Latest fingerprint <span class="mono">${esc(ledger.head.slice(0, 20))}</span>. Each entry's fingerprint covers the one before it, so any edit or deletion breaks the chain.</p>
    <div class="toolbar"><button type="button" class="btn" id="lgVerify">Verify the log</button><button type="button" class="btn" id="lgCopy">Copy log (JSON)</button><a class="btn" id="lgDl" download="otter-ledger.json">Download log</a></div>
    <div id="lgResult"></div>
    <div class="audit">${ledger.entries.slice(-80).reverse().map((e) => `<div>#${e.seq} ${esc(new Date(e.ts).toLocaleString())} · ${esc(e.type)} ${esc(Object.entries(e.detail || {}).map(([k, v]) => `${k}=${v}`).join(" "))}</div>`).join("")}</div>`;
  box.querySelector("#lgVerify").onclick = async () => {
    const r = await verifyChain(ledger.entries);
    box.querySelector("#lgResult").innerHTML = r.ok ? `<div class="notice info">Verified: all ${r.count} entries are intact and in order.</div>` : `<div class="notice bad">Broken at entry #${r.brokenAt}: ${esc(r.reason)}.</div>`;
    ledger.append("ledger.verified", { ok: r.ok, count: r.count });
  };
  box.querySelector("#lgCopy").onclick = () => copyText(ledger.export());
  // Pages inside claude.ai can't hand out files; there, Copy is the way to export.
  if (window.top !== window) box.querySelector("#lgDl").remove();
  else try { box.querySelector("#lgDl").href = URL.createObjectURL(new Blob([ledger.export()], { type: "application/json" })); } catch {}
}

// ---------- prefs & wiring ----------
function applyPrefs() {
  const S = D.settings;
  for (const d of new Set([document, DOC])) {
    if (S.theme === "system") d.documentElement.removeAttribute("data-theme");
    else d.documentElement.dataset.theme = S.theme;
    d.body.classList.toggle("reduce-motion", !!S.reduceMotion);
    d.body.classList.toggle("simple", S.layout !== "full");
    d.body.classList.toggle("mini", viewMode === "mini");
  }
  $("app").classList.toggle("side-collapsed", false);
  otter.glasses(S.glasses);
}
function closeSideOnNarrow() { $("app").classList.remove("side-open"); }

// Click-outside and key handlers, bound to whichever document the interface is in.
function bindDocEvents(doc) {
  doc.addEventListener("click", (e) => {
    const a = $("app");
    if (a.classList.contains("side-open") && !$("sidebar").contains(e.target) && !$("openSide").contains(e.target)) a.classList.remove("side-open");
    const vp = $("voicePop");
    if (!vp.hidden && !vp.contains(e.target) && !$("voiceBtn").contains(e.target)) vp.hidden = true;
    const menu = $("convMenu");
    if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true;
  });
  doc.addEventListener("keydown", (e) => { if (e.key === "Escape" && speaker.speaking) speaker.stop(); });
}

function wire() {
  bindDocEvents(document);
  $("miniMax").onclick = () => setViewMode("max");
  $("minBtn").onclick = () => setViewMode("mini");
  $("miniChat").onclick = () => toggleMiniChat();
  $("miniFloat").onclick = () => floatWindow();
  $("miniLook").onclick = () => toggleLook();
  $("miniOff").onclick = () => shutOff("you pressed the power button");
  $("miniMic").onclick = () => { if (conversationLive) { stopConversation(); setMiniHint(); } else { pushToTalk = true; startConversation(); } };
  $("newChat").onclick = newConversation;
  $("searchChats").oninput = () => { historyLimit = PAGE; renderHistory(); };
  $("groupBy").onchange = renderHistory;
  document.querySelectorAll(".nav-btn").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("collapseSide").onclick = () => $("app").classList.toggle("side-collapsed");
  $("openSide").onclick = (e) => { e.stopPropagation(); $("app").classList.toggle("side-open"); };

  const TRICKS = ["Splash! OK, back to work.", "Otters hold hands while they sleep so they don't drift apart. I hold your drafts until you approve them.", "Every otter has a favorite rock. Mine is the Approve button.", "Still here. Still not sending anything without you.", "Fun fact: a group of otters in the water is called a raft. You and me: a very small raft."];
  let trickN = 0;
  $("otterBtn").onclick = () => {
    if (busy) return;
    const waiting = gate.list().find((p) => p.status === "pending");
    if (waiting && otter.state === "awaiting_approval") return openApproval(waiting.id);
    const el = $("otter");
    el.classList.remove("trick");
    void el.offsetWidth;
    el.classList.add("trick");
    setTimeout(() => el.classList.remove("trick"), 1300);
    $("otterCaption").textContent = TRICKS[trickN++ % TRICKS.length];
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setActivity(otter.state), 5000);
  };
  $("dashBtn").onclick = () => { const d = $("dashboard"); d.hidden = !d.hidden; $("dashBtn").setAttribute("aria-expanded", String(!d.hidden)); renderDashboard(); };
  $("dashClose").onclick = () => { $("dashboard").hidden = true; $("dashBtn").setAttribute("aria-expanded", "false"); };
  $("themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    D.settings.theme = dark ? "light" : "dark"; applyPrefs(); store.save();
  };
  $("addSourceBtn").onclick = () => openSourceModal();
  const vp = $("voicePop");
  $("voiceBtn").onclick = (e) => { e.stopPropagation(); vp.hidden = !vp.hidden; $("voiceBtn").setAttribute("aria-expanded", String(!vp.hidden)); if (!vp.hidden) { renderVoicePop(); readSystemVolume().then(renderVoicePop); } };

  $("vpOn").onchange = (e) => { D.settings.voiceOn = e.target.checked; if (!e.target.checked) speaker.stop(); store.save(); renderVoicePop(); };
  $("vpVol").oninput = (e) => { D.settings.voiceVolume = +e.target.value / 100; $("vpVolVal").textContent = e.target.value + "%"; store.save(); };
  $("vpVol").onchange = () => { if (D.settings.voiceOn) speaker.speak(`This is my speaking volume, ${Math.round(D.settings.voiceVolume * 100)} percent.`, { mode: "full" }); };
  $("vpConv").onchange = (e) => { D.settings.conversationMode = e.target.checked; if (!e.target.checked) stopConversation(); store.save(); };
  $("vpTest").onclick = () => { const c = speaker.supported ? speaker.choice() : null; if (!c?.voice && speaker.supported) toast("No male voice is available, so the browser's default voice will be used."); speaker.speak(`Hello, I'm Otter. This is how I sound at ${Math.round(D.settings.voiceVolume * 100)} percent.`, { mode: "full" }); };
  $("micBtn").onclick = () => { if (listener.active) { stopConversation(); return; } pushToTalk = true; startConversation(); };

  $("stopBtn").onclick = () => busy?.abort();
  const input = $("input");
  input.oninput = () => { autosize(); updateRouteHint(); if (!busy) setActivity(input.value.trim() ? "listening" : "idle"); };
  input.onblur = () => { if (!busy && otter.state === "listening") setActivity("idle"); };
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } };
  input.addEventListener("paste", (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (t.length > 600 && /^\s*(From|Subject|Sent)\s*:/im.test(t)) { e.preventDefault(); openSourceModal({ kind: "email", text: t }); toast("That looks like an email thread, so it goes in as a source."); }
  });
  $("composer").onsubmit = (e) => { e.preventDefault(); send(input.value); };
  // conversation menu
  const menu = $("convMenu");
  $("convMenuBtn").onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menu.querySelector('[data-act="pin"]').textContent = current?.pinned ? "Unpin conversation" : "Pin conversation"; };

  menu.onclick = async (e) => {
    const act = e.target.dataset.act;
    if (!act || !current) return;
    menu.hidden = true;
    if (act === "pin") { ensureSaved(); current.pinned = !current.pinned; }
    if (act === "rename") { const v = await promptBox("Rename conversation", "Title", current.title); if (v) { current.title = v; $("convTitle").textContent = v; } }
    if (act === "project") {
      const n = h(`<form><h2 id="modalTitle">Assign to project</h2><label class="field"><span>Project</span><select id="projSel"><option value="">No project</option>${D.projects.map((p) => `<option value="${p.id}" ${current.projectId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>${D.projects.length ? "" : '<p class="hint">No projects yet. Add them under Projects.</p>'}<div class="actions"><button class="btn btn-primary">Save</button></div></form>`);
      const close = openModal(n);
      n.onsubmit = (ev) => { ev.preventDefault(); ensureSaved(); current.projectId = n.querySelector("#projSel").value || null; store.save(); renderHistory(); close(); };
    }
    if (act === "export") {
      const md = `# ${current.title}\n\n${current.messages.map((m) => `## ${m.role === "user" ? "You" : "O.T.T.E.R."} (${new Date(m.ts).toLocaleString()})\n\n${m.content}${m.citations?.length ? "\n\nSources:\n" + m.citations.map((c) => `- ${c.title}: ${c.url}`).join("\n") : ""}`).join("\n\n")}\n`;
      copyText(md);
    }
    if (act === "delete") {
      if (await confirmBox("Delete this conversation?", "Its messages and attached sources are removed from this device. Findings it produced stay on the dashboard until you dismiss them.", "Delete", true)) {
        for (const sid of current.sourceIds) delete D.sources[sid];
        D.conversations = D.conversations.filter((c) => c !== current);
        audit.record("conversation.deleted", { id: current.id });
        store.save();
        newConversation();
        return;
      }
    }
    store.save();
    renderHistory();
  };
}

async function loadRegistry() {
  if (globalThis.OTTER_SKILLS) return globalThis.OTTER_SKILLS.skills;
  try { const r = await fetch("/data/skills.json"); if (r.ok) return (await r.json()).skills; } catch {}
  return [];
}

async function boot() {
  applyPrefs();
  wire();
  setActivity("idle");
  registry = await loadRegistry();
  newConversation();
  renderCounts();
  renderEngine();
  engine = await detectEngine();
  renderEngine();
  await listener.checkOnDevice();
  renderVoicePop();
  renderGrowCount();
  if (currentView === "chat" && !current.messages.length) renderConversation();
  // Morning check: the server runs it at 5 a.m.; the page runs it at first open after 5 a.m.
  if (D.settings.onboarded && needsCatchUp(D.lastVerify?.ranAt)) await runMorningCheck("first open after 5 a.m.");
  if (seedProfile(D.knowledge)) store.save();
  if (!D.settings.openDefaultsApplied) applyOpenDefaults();
  launchChecks();
  ledger.append("page.open", { engine: engine.kind, closedMode: closedMode() });
  if (!engine.token && engine.kind !== "artifact" && window.top === window) showStartCard();
  else if (D.settings.autoListen && canListen()) startConversation();
  setMiniHint();
}
boot();
