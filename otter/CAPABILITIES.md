# O.T.T.E.R. capability report

Checked on 2026-10-14 in the build environment (a Claude Code cloud container). "Working" means exercised by an automated test or the browser smoke test, not just written.

## What discovery found
- **38 Claude skills** on disk (`~/.claude/skills/synced/...`, plus two plugin skills), 25 of them BMCC-specific. All are in the Skill Registry with inferred dependencies and sensitivity.
- **No Claude in Chrome tools** in this environment, and no supported interface for a web page or local server to drive the Chrome extension. The bridge is reported as unavailable, not simulated.
- **No ANTHROPIC_API_KEY** in this environment, so the local server was tested against a scripted fake client. The claude.ai artifact path was tested against a fake `window.claude` runtime. Neither test spent Claude usage.
- **Connectors** (Gmail, Google Calendar, Google Drive, Canva) exist on the account but were not used, per your rule to ask first. O.T.T.E.R. does not declare any of them.

## Working
| Feature | Notes |
|---|---|
| Chat with Claude (claude.ai artifact) | Uses your claude.ai account inside a private artifact. Asks permission on first use. |
| Chat with Claude (local server) | `claude-opus-5-5`, adaptive thinking, medium effort, server-side refusal fallback. Needs your API key. |
| Web research with citations | Local server only, after you allow it. Sources listed with links and dates when the search result gives one. |
| Email analysis from pasted or uploaded threads | Explicit vs inferred deadlines, your commitments, others' commitments, asks, possibly unanswered questions, conflicting figures. Works offline. |
| Discrepancy detection | Conflicting dollar amounts and counts across sources, and stated totals that don't match line items. Claude findings must quote sources verbatim or they are rejected. |
| Skill Registry and orchestration | 38 skills, searchable, with status. Each request gets a plan: in-app, hand-off or blocked. |
| Skill hand-off briefs | For Chrome and desktop skills: an approval-gated brief to paste into Claude in Chrome or Cowork. |
| Executive dashboard | Action queue, priorities, discrepancies, email intelligence, research, projects, skill status, security. |
| Approval gate | Approve / Revise / Cancel, hash-bound, single use, re-verified at execution. |
| Permissions | Per system, none / read / write, purpose required for protected systems, revocation immediate, sign-in ignored. |
| Privacy guard | Blocks secrets, SSNs, card numbers; blocks student-record details unless FERPA processing is attested; redacts contact details; checked again on the server. |
| History, projects, tasks, knowledge base | Local to the browser. Search, pin, group, export, delete, retention purge. |
| Animated otter | 15 states driven by real events, 8 rotating thinking activities, reduced-motion option, light and dark. |
| Audit log | Proposals, approvals, results, blocks, permission and privacy changes. No content. |

## Unavailable, and why
| Feature | Reason | What would change it |
|---|---|---|
| Reading Outlook directly | BMCC does not allow Claude's Microsoft 365 connector. | BMCC IT approval of a connector or Graph API app registration. |
| Driving Claude in Chrome from O.T.T.E.R. | No supported interface exists for a web app to control the extension. | An official API from Anthropic for that. Until then, hand-off briefs. |
| Sending, replying, forwarding, posting, submitting forms | No authorized integration. Approved items come back to you as final text. | An approved integration per system, added as an executor behind the same gate. |
| Running skill scripts (docx, xlsx, PDF, form fillers) | They execute inside Claude Code, Cowork or Claude in Chrome, not in a browser page. | Run them there; O.T.T.E.R. prepares the brief. |
| Web research in the claude.ai version | The artifact runtime gives Claude no web access. | Use the local server with an API key. |
| Syncing history across devices | Deliberately local to keep institutional content off outside databases. | A BMCC-approved storage location. |

## Authorization-dependent
| Feature | Needs |
|---|---|
| Any Claude call | Your confirmation that BMCC permits the service (setup question 1 or Settings). |
| Web research | Permission toggle (Settings > Permissions > Public web research). |
| Student education-record content | FERPA lawful basis and a named BMCC approver recorded in Settings. Off by default. `synergy-parent-notification` stays restricted until then. |
| Skills that touch protected systems | A per-system grant with a stated purpose. Grants today only let plans reference them; no integration runs. |

## Compliance statement
O.T.T.E.R. applies privacy-by-design safeguards. It has not been reviewed by BMCC IT, BMCC's FERPA officer or counsel, and it is not certified FERPA-compliant. Pattern-based detection misses things, such as a student named in plain prose without an ID. Treat its privacy guard as a seatbelt, not a license.
