# O.T.T.E.R. capability report

Checked on 2026-10-14 (voice and volume added the same day) in the build environment (a Claude Code cloud container). "Working" means exercised by an automated test or the browser smoke test, not just written.

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
| Spoken answers in a male voice | Browser speech. Picks the most natural male voice; never falls back to a female or novelty voice. 20% speaking volume by default. Works in both versions. |
| Local voice commands | Louder, quieter, set volume, mute, listening on and off. No Claude usage. |
| Self-knowledge of limits | Every limit explained as why / missing piece / what it unlocks, from live status. Claude is told the same list and must use the same format. |
| Cheapest-route-first routing | Local, quick, standard, deep. Estimate shown while typing; confirm step above your limit; "Go deeper" offered with its estimate. |
| Token reporting | Exact per-answer counts and cost on the local server (summed over tool rounds); estimates on claude.ai, labeled as such. Daily, 7-day and 30-day totals. |
| Interpretation, clarification, improvement | Each answer states what it understood, asks when something material is unclear, and ends with "You can make this experience better if you…". |
| Morning check | 5 a.m. on the local server, catch-up on start and at first open, or on demand. Issues, fixes and today's limits. 0 tokens by default. |
| Helper window | Otter-only start, maximize, mini chat, wake word "Otter", always-on listening, one-command launcher with microphone and sound pre-allowed in its own Chrome profile. |
| Floating on top | Chrome/Edge Document Picture-in-Picture from the helper (local server). Not on claude.ai. |
| Learning | Seeded from your brief; offers to remember stated preferences and keeps them only on yes; viewable and forgettable. |
| Growth recommendations | Connector, skill and setup suggestions from usage counts, with evidence, paced to one every three days unless urgent. |

## Unavailable, and why
| Feature | Reason | What would change it |
|---|---|---|
| Reading Outlook directly | BMCC does not allow Claude's Microsoft 365 connector. | BMCC IT approval of a connector or Graph API app registration. |
| Driving Claude in Chrome from O.T.T.E.R. | No supported interface exists for a web app to control the extension. | An official API from Anthropic for that. Until then, hand-off briefs. |
| Sending, replying, forwarding, posting, submitting forms | No authorized integration. Approved items come back to you as final text. | An approved integration per system, added as an executor behind the same gate. |
| Running skill scripts (docx, xlsx, PDF, form fillers) | They execute inside Claude Code, Cowork or Claude in Chrome, not in a browser page. | Run them there; O.T.T.E.R. prepares the brief. |
| Web research in the claude.ai version | The artifact runtime gives Claude no web access. | Use the local server with an API key. |
| Listening in the claude.ai version | claude.ai pages are not allowed to use the microphone. | The local server version in Chrome, Edge or Safari. |
| Computer volume in the claude.ai version | No web page may change the computer's volume. | The local server version, which uses the operating system's own volume command. |
| Exact token counts in the claude.ai version | The claude.ai runtime does not report usage to the page. | The local server version, which reads counts from the API. |
| A guaranteed 5 a.m. run | A sleeping or shut-down computer runs nothing. | Leave the server running, or schedule `npm run verify` with launchd (Mac catches up on wake) or Task Scheduler. |
| Studio-quality voice | Browser voices are the ceiling without an outside text-to-speech service. | A text-to-speech provider account, BMCC approval to send answer text to it, and a build step. |
| Syncing history across devices | Deliberately local to keep institutional content off outside databases. | A BMCC-approved storage location. |

## Authorization-dependent
| Feature | Needs |
|---|---|
| Any Claude call | Your confirmation that BMCC permits the service (setup question 1 or Settings). |
| Conversation mode (listening) | Local server version, Chrome/Edge/Safari, your OK in setup (audio goes to Google, Microsoft or Apple for transcription), and the browser's microphone permission. |
| Most natural voices | Your OK in setup to send spoken text to Microsoft or Google. Otherwise only on-device voices are used. |
| Computer volume | Local server version and your permission; then one approval per change, including the 20% setting at launch. Windows and macOS commands not yet run on a real machine. |
| Web research | Permission toggle (Settings > Permissions > Public web research). |
| Student education-record content | FERPA lawful basis and a named BMCC approver recorded in Settings. Off by default. `synergy-parent-notification` stays restricted until then. |
| Skills that touch protected systems | A per-system grant with a stated purpose. Grants today only let plans reference them; no integration runs. |

## Compliance statement
O.T.T.E.R. applies privacy-by-design safeguards. It has not been reviewed by BMCC IT, BMCC's FERPA officer or counsel, and it is not certified FERPA-compliant. Pattern-based detection misses things, such as a student named in plain prose without an ID. Treat its privacy guard as a seatbelt, not a license.
