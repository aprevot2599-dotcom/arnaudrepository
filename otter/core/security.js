// O.T.T.E.R. security core: permissions, approval gate, audit log.
// Runs unchanged in Node (tests, server) and in the browser. The model never gets a handle
// to approve() or execute(); it can only call propose(). Approval is bound to a SHA-256
// digest of {type, target, content}, is single use, and execute() re-hashes the payload it
// is handed, so a changed recipient or body cannot ride on an old approval.

export class SecurityError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ---------- hashing ----------
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newId(prefix) {
  const r = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return prefix + "_" + [...r].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- systems and permissions ----------
// Every system starts at "none". Granting is a UI-only operation. An existing browser
// sign-in is deliberately not an input to any check: authentication is not authorization.
export const SYSTEMS = {
  anthropic_api: { label: "Claude API (local server, your API key)", protected: false, kind: "ai_service" },
  claude_ai: { label: "Claude on claude.ai (your account)", protected: false, kind: "ai_service" },
  web_research: { label: "Public web research", protected: false, kind: "research" },
  outlook: { label: "Outlook / Microsoft 365 mail", protected: true, kind: "institutional" },
  sharepoint: { label: "SharePoint / OneDrive", protected: true, kind: "institutional" },
  teams: { label: "Microsoft Teams", protected: true, kind: "institutional" },
  banner: { label: "Banner (student information system)", protected: true, kind: "institutional" },
  synergy: { label: "Synergy (K-12 student records)", protected: true, kind: "institutional" },
  paycom: { label: "Paycom", protected: true, kind: "institutional" },
  intacct: { label: "Sage Intacct", protected: true, kind: "institutional" },
  jotform: { label: "Jotform", protected: true, kind: "institutional" },
  google_forms: { label: "Google Forms", protected: true, kind: "institutional" },
  ms_forms: { label: "Microsoft Forms", protected: true, kind: "institutional" },
  website_cms: { label: "bluecc.edu WordPress / Elementor", protected: true, kind: "institutional" },
  google_drive: { label: "Google Drive", protected: true, kind: "personal_cloud" },
  gmail: { label: "Gmail", protected: true, kind: "personal_cloud" },
  calendar: { label: "Calendar", protected: true, kind: "personal_cloud" },
  canva: { label: "Canva", protected: true, kind: "personal_cloud" },
  chrome: { label: "Claude in Chrome (browser extension)", protected: true, kind: "browser" },
  builtin_browser: { label: "Claude desktop built-in browser", protected: true, kind: "browser" },
  desktop: { label: "Desktop control (computer use)", protected: true, kind: "browser" },
  claude_memory: { label: "Claude memory", protected: false, kind: "ai_service" },
  local_knowledge: { label: "O.T.T.E.R. local knowledge base", protected: false, kind: "local" },
  system_volume: { label: "This computer's volume (local server only)", protected: false, kind: "device" },
  browser_speech: { label: "Listening: browser speech recognition (audio may go to Google, Microsoft or Apple)", protected: false, kind: "ai_service" },
  cloud_voice: { label: "Online voices: answer text sent to Microsoft or Google to be spoken", protected: false, kind: "ai_service" },
};

const SCOPE_RANK = { none: 0, read: 1, write: 2 };

export class PermissionRegistry {
  constructor(state = {}, { audit, now = () => Date.now() } = {}) {
    this.audit = audit;
    this.now = now;
    this.grants = {};
    for (const key of Object.keys(SYSTEMS)) {
      const g = state[key];
      this.grants[key] = g && SCOPE_RANK[g.scope] !== undefined ? { ...g } : { scope: "none" };
    }
    // Local knowledge is O.T.T.E.R.'s own store; reading it is always allowed, writing goes
    // through the approval gate like everything else.
    if (this.grants.local_knowledge.scope === "none") this.grants.local_knowledge = { scope: "write", purpose: "built-in" };
  }
  toJSON() {
    return this.grants;
  }
  scope(system) {
    return (this.grants[system] || { scope: "none" }).scope;
  }
  grant(system, scope, { purpose = "", expiresAt = null } = {}) {
    if (!SYSTEMS[system]) throw new SecurityError("unknown_system", `Unknown system: ${system}`);
    if (!(scope in SCOPE_RANK)) throw new SecurityError("bad_scope", `Unknown scope: ${scope}`);
    if (SYSTEMS[system].protected && scope !== "none" && !purpose.trim())
      throw new SecurityError("purpose_required", `Granting ${SYSTEMS[system].label} needs a stated purpose and scope.`);
    this.grants[system] = { scope, purpose, grantedAt: this.now(), expiresAt };
    this.audit?.record("permission.grant", { system, scope, purpose });
  }
  revoke(system) {
    this.grants[system] = { scope: "none", revokedAt: this.now() };
    this.audit?.record("permission.revoke", { system });
  }
  // `context` may carry {authenticatedSession: true}; it is ignored on purpose.
  check(system, needed = "read", context = {}) {
    void context;
    const g = this.grants[system];
    if (!g) return false;
    if (g.expiresAt && this.now() > g.expiresAt) return false;
    return SCOPE_RANK[g.scope] >= SCOPE_RANK[needed];
  }
  require(system, needed = "read", context = {}) {
    if (!this.check(system, needed, context)) {
      const label = SYSTEMS[system]?.label || system;
      throw new SecurityError("not_authorized", `Locked door: ${label} is not authorized for ${needed}. Grant it in Settings > Permissions if BMCC policy allows.`);
    }
  }
}

// ---------- audit log ----------
// Records what happened without storing the content itself: payloads are kept as digests
// and short redacted labels only.
export class AuditLog {
  constructor(entries = [], { redact = (s) => s, now = () => Date.now(), limit = 2000 } = {}) {
    this.entries = entries;
    this.redact = redact;
    this.now = now;
    this.limit = limit;
    this.listeners = new Set();
  }
  record(event, details = {}) {
    const safe = {};
    for (const [k, v] of Object.entries(details)) {
      if (["content", "body", "text", "payload"].includes(k)) continue; // never logged
      safe[k] = typeof v === "string" ? this.redact(v).slice(0, 160) : v;
    }
    const entry = { ts: this.now(), event, ...safe };
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
    for (const fn of this.listeners) fn(entry);
    return entry;
  }
  toJSON() {
    return this.entries;
  }
}

// ---------- actions ----------
// Every consequential action type. `system` is the system it would touch; `external` means
// it leaves O.T.T.E.R. Unknown types are refused outright.
export const ACTION_TYPES = {
  send_email: { label: "Send email", system: "outlook", external: true },
  reply_email: { label: "Reply to email", system: "outlook", external: true },
  forward_email: { label: "Forward email", system: "outlook", external: true },
  modify_email: { label: "Archive, delete, flag or move email", system: "outlook", external: true },
  schedule_meeting: { label: "Schedule meeting", system: "outlook", external: true },
  send_invitation: { label: "Send invitation", system: "outlook", external: true },
  post_content: { label: "Post content", system: "website_cms", external: true },
  submit_form: { label: "Submit form", system: "chrome", external: true },
  upload_file: { label: "Upload file", system: "sharepoint", external: true },
  download_file: { label: "Download institutional file", system: "sharepoint", external: true },
  create_record: { label: "Create record", system: "sharepoint", external: true },
  modify_record: { label: "Modify record", system: "sharepoint", external: true },
  edit_document: { label: "Edit document or spreadsheet", system: "sharepoint", external: true },
  delete_item: { label: "Delete information", system: "sharepoint", external: true },
  move_item: { label: "Move information", system: "sharepoint", external: true },
  transaction: { label: "Initiate transaction", system: "intacct", external: true },
  run_automation: { label: "Run external automation", system: "chrome", external: true },
  change_settings: { label: "Change system settings", system: "sharepoint", external: true },
  modify_permissions: { label: "Modify permissions", system: "sharepoint", external: true },
  skill_handoff: { label: "Hand off to a Claude skill", system: "claude_ai", external: true },
  save_knowledge: { label: "Save to O.T.T.E.R. knowledge base", system: "local_knowledge", external: false },
  create_task: { label: "Add task to O.T.T.E.R. task list", system: "local_knowledge", external: false },
  set_system_volume: { label: "Change this computer's volume", system: "system_volume", external: true },
};

export const STATUS_LABELS = {
  pending: "Proposed: waiting for your approval",
  approved: "Approved: not yet run",
  rejected: "Cancelled by you",
  superseded: "Replaced by a revised proposal",
  executed: "Done",
  not_executed: "Approved, but not run: no authorized integration",
  failed: "Failed",
};

export function describeProposalStatus(p) {
  const done = p.status === "executed";
  return { label: STATUS_LABELS[p.status] || p.status, isCompleted: done, isProposal: p.status === "pending" || p.status === "approved" };
}

export class ApprovalGate {
  constructor({ permissions, audit, executors = {}, proposals = [], now = () => Date.now() }) {
    this.permissions = permissions;
    this.audit = audit;
    this.executors = executors;
    this.proposals = new Map(proposals.map((p) => [p.id, p]));
    this.now = now;
    this.listeners = new Set();
  }
  list() {
    return [...this.proposals.values()];
  }
  get(id) {
    return this.proposals.get(id);
  }
  _emit(p) {
    for (const fn of this.listeners) fn(p);
  }
  static payloadOf(p) {
    return { type: p.type, target: p.target, content: p.content };
  }
  async propose({ type, target, content, consequences = "", origin = "assistant", untrustedContext = false, skill = null }) {
    const spec = ACTION_TYPES[type];
    if (!spec) throw new SecurityError("unknown_action", `Unknown action type "${type}". Nothing was proposed.`);
    if (typeof target !== "string" || !target.trim()) throw new SecurityError("bad_target", "An action needs an explicit target.");
    if (typeof content !== "string") content = JSON.stringify(content ?? "");
    const p = {
      id: newId("act"),
      type,
      label: spec.label,
      system: spec.system,
      external: spec.external,
      target: target.trim(),
      content,
      consequences: String(consequences || (spec.external ? "Leaves O.T.T.E.R. and changes an external system." : "Changes O.T.T.E.R.'s local records.")),
      origin,
      skill,
      untrustedContext: !!untrustedContext,
      status: "pending",
      createdAt: this.now(),
    };
    p.digest = await sha256(canonical(ApprovalGate.payloadOf(p)));
    this.proposals.set(p.id, p);
    this.audit?.record("action.proposed", { id: p.id, type, target: p.target, digest: p.digest, origin, untrustedContext: p.untrustedContext });
    this._emit(p);
    return p;
  }
  // Called only from the approval panel. confirmDigest is the digest the panel displayed,
  // which ties the approval to exactly what the user looked at.
  approve(id, { confirmDigest, by = "user" } = {}) {
    const p = this.proposals.get(id);
    if (!p) throw new SecurityError("not_found", "No such proposal.");
    if (p.status !== "pending") throw new SecurityError("not_pending", `This proposal is ${p.status}; it cannot be approved.`);
    if (confirmDigest !== p.digest) throw new SecurityError("digest_mismatch", "The proposal changed after it was shown. Review it again.");
    p.status = "approved";
    p.approval = { by, at: this.now(), digest: p.digest, used: false };
    this.audit?.record("action.approved", { id, type: p.type, target: p.target, digest: p.digest, by });
    this._emit(p);
    return p;
  }
  reject(id, { reason = "" } = {}) {
    const p = this.proposals.get(id);
    if (!p) throw new SecurityError("not_found", "No such proposal.");
    if (!["pending", "approved"].includes(p.status)) throw new SecurityError("not_open", `This proposal is already ${p.status}.`);
    p.status = "rejected";
    p.rejectedAt = this.now();
    if (p.approval) p.approval.used = true;
    this.audit?.record("action.rejected", { id, type: p.type, reason });
    this._emit(p);
    return p;
  }
  // A revision is a new proposal; the old one can never execute.
  async revise(id, changes) {
    const old = this.proposals.get(id);
    if (!old) throw new SecurityError("not_found", "No such proposal.");
    if (!["pending", "approved"].includes(old.status)) throw new SecurityError("not_open", `This proposal is already ${old.status}.`);
    old.status = "superseded";
    if (old.approval) old.approval.used = true;
    const next = await this.propose({
      type: changes.type ?? old.type,
      target: changes.target ?? old.target,
      content: changes.content ?? old.content,
      consequences: changes.consequences ?? old.consequences,
      origin: "user_revision",
      untrustedContext: old.untrustedContext,
      skill: old.skill,
    });
    next.revises = old.id;
    this.audit?.record("action.revised", { id: old.id, next: next.id });
    this._emit(old);
    return next;
  }
  // payload is what will actually run. It must hash to the approved digest.
  async execute(id, payload) {
    const p = this.proposals.get(id);
    if (!p) throw new SecurityError("not_found", "No such proposal.");
    if (p.status !== "approved" || !p.approval) {
      this.audit?.record("action.blocked", { id, reason: "not_approved", status: p.status });
      throw new SecurityError("not_approved", "Blocked: this action has not been approved.");
    }
    if (p.approval.used) throw new SecurityError("approval_used", "Blocked: approvals are single use.");
    const run = payload ?? ApprovalGate.payloadOf(p);
    const digest = await sha256(canonical({ type: run.type, target: run.target, content: run.content }));
    if (digest !== p.approval.digest) {
      this.audit?.record("action.blocked", { id, reason: "payload_changed", digest });
      throw new SecurityError("payload_changed", "Blocked: the destination or content differs from what you approved.");
    }
    p.approval.used = true;
    const spec = ACTION_TYPES[p.type];
    const executor = this.executors[p.type];
    try {
      if (!executor) {
        p.status = "not_executed";
        p.result = { ok: false, message: `No authorized integration for "${spec.label}" exists in O.T.T.E.R. Nothing was sent or changed. The approved content is ready for you to use yourself.` };
      } else {
        this.permissions.require(spec.system, "write");
        const result = await executor(run, p);
        p.status = result?.ok === false ? "not_executed" : "executed";
        p.result = result || { ok: true };
      }
    } catch (e) {
      p.status = e instanceof SecurityError ? "not_executed" : "failed";
      p.result = { ok: false, message: e.message, code: e.code || "error" };
    }
    p.finishedAt = this.now();
    this.audit?.record("action.result", { id, type: p.type, status: p.status, message: p.result?.message || "" });
    this._emit(p);
    return p;
  }
}

// ---------- skills ----------
export function skillStatus(skill, { permissions, settings = {} }) {
  const disabled = (settings.disabledSkills || []).includes(skill.name);
  if (disabled) return { status: "disabled", runnable: false, reason: "Disabled in Settings." };
  if (skill.sensitivity?.includes("ferpa_student_records") && !settings.ferpaAttested)
    return { status: "restricted", runnable: false, reason: "Touches student education records. Blocked until a FERPA basis and institutional approval are recorded in Settings." };
  const missing = (skill.systems || []).filter((s) => SYSTEMS[s] && !permissions.check(s, "read"));
  if (skill.needsBrowser)
    return { status: "handoff", runnable: false, handoff: true, missing, reason: "Runs in Claude in Chrome or the desktop app, which this app cannot reach. O.T.T.E.R. prepares a hand-off brief for your approval." };
  if (missing.length) return { status: "unavailable", runnable: false, missing, reason: "Needs authorization: " + missing.map((m) => SYSTEMS[m].label).join(", ") };
  return { status: "available", runnable: true, reason: "Ready for in-app analysis." };
}

export function assertSkillRunnable(skill, ctx) {
  const st = skillStatus(skill, ctx);
  if (!st.runnable) throw new SecurityError("skill_" + st.status, `Skill ${skill.name} cannot run: ${st.reason}`);
  return st;
}
