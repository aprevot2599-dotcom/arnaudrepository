# O.T.T.E.R.

**Operational Task, Triage, Evaluation & Research.** A browser-based executive assistant for Dr. Arnaud Prevot, Executive Director of Community Education and Workforce Training at Blue Mountain Community College. It analyzes what you give it, coordinates your Claude skills, flags discrepancies, drafts communications and proposes actions. It never sends, submits, posts or changes anything on its own: every consequential action stops at an approval panel enforced in code.

**Open it now:** https://claude.ai/artifact/SHhkRdugADnMJQPGC99rhD (private to your account)

What works today, what doesn't, and why: [CAPABILITIES.md](CAPABILITIES.md).

## Three ways to run it

| Mode | How | Claude | Web research | Where data lives |
|---|---|---|---|---|
| claude.ai artifact | Open the link above while signed in | Your claude.ai account (asks permission on first use) | No | This browser, on this device |
| Local server | `npm install` then `ANTHROPIC_API_KEY=... npm start`, open http://127.0.0.1:4317 | Claude API, `claude-opus-5-5` | Yes, with citations, once you allow it | This browser, on this device |
| Offline | Local server without a key, or any browser with no Claude connection | None | No | This browser, on this device |

The engine pill under the conversation title always says which mode is active. In offline mode, the built-in email parser and discrepancy checker still work and say plainly that no AI is connected.

### Local server setup
```bash
cd otter
npm install
export ANTHROPIC_API_KEY=sk-ant-...      # never put this in the browser or a file in the repo
npm start                                 # http://127.0.0.1:4317
```
Optional: `OTTER_MODEL` (default `claude-opus-5-5`), `OTTER_EFFORT` (default `medium`), `OTTER_FALLBACKS=off` to disable the server-side refusal fallback (on by default), `OTTER_SKILLS_DIR` to add skill folders, `PORT`.

The server listens on 127.0.0.1 only, requires a per-launch token on every API call, rejects requests from other web origins, and refuses any request containing passwords, SSNs, card numbers or API keys even if the browser sent it.

## First run
O.T.T.E.R. opens with five short setup questions: whether BMCC permits sending non-protected work content to the Claude service in use, how email reaches it, your priority projects, your briefing format, and how long to keep history. Nothing is sent to Claude until the first question is answered yes. Run the questions again from **Settings**.

## Daily use
- **Chat.** Enter sends, Shift+Enter adds a line. Answers come bottom line first, with labeled cards for recommendations, discrepancies, opportunities, risks, questions and drafts. Long answers collapse; every answer has Copy.
- **Add source (+).** Paste or upload an email thread or document you are authorized to analyze. A privacy scan runs as you paste: passwords, SSNs and card numbers cannot be added, student-record details stay local unless FERPA processing is authorized, and contact details are replaced with placeholders before sending. Pasting a long email into the message box moves it into a source automatically.
- **Skill plan.** Each answer shows which of your discovered skills apply and how: *in-app* (informs the answer), *hand-off* (runs in Claude in Chrome or the desktop app after you approve a brief), or *blocked* (with the reason).
- **Approvals.** Proposed actions appear as cards. **Review and decide** opens the panel: Action, Target, Content, Consequences, a fingerprint of exactly what you're approving, and Approve / Revise / Cancel. Approve is disabled for a moment after opening so a stray keypress cannot approve. Revising creates a new proposal that needs its own approval.
- **Dashboard.** Action queue, priorities, discrepancy monitor, email intelligence, research, projects, skill status and security. Every item traces to something real; empty sections say so.
- **History.** Searchable (titles and message text), grouped by date or project, pinnable, renameable, exportable as Markdown, deletable. Long histories load in pages as you scroll.
- **Skills.** Searchable registry of every discovered skill: purpose, capabilities, dependencies, permissions, status and overlap. Click a row to see detail or disable the skill.
- **Settings.** AI service approval, privacy switches, per-system permissions (none / read / read and write, with a required purpose for protected systems), personal preferences, retention, export, delete-everything, knowledge base, capability report and audit log.

## Security model, in one paragraph
The model can call exactly six tools (plus web search in local-server mode when allowed): search the local knowledge base, parse an attached email, compare figures across sources, look up a skill, record a finding, and propose an action. There is no tool to approve or execute. Findings are rejected unless their quotes appear verbatim in a source you attached (or, for research, at a URL the web search actually returned). Proposals are hashed (SHA-256 over type, target and content); approval is bound to the hash you saw, is single use, and execution re-hashes the payload, so a changed recipient or body is blocked. Permissions start at none, are per system, and ignore browser sign-in state. Content from emails, documents and web pages is wrapped as untrusted data, scanned for injection phrases, and anything proposed while such content is in play is flagged in the approval panel. The audit log stores events and fingerprints, never content.

## Tests
```bash
npm test          # 21 tests: the 15 required fail-safes, email parsing, and server boundaries
npm run test:ui   # browser smoke test (needs Playwright): onboarding, source intake, approval flow, privacy block, phone layout
```

## Updating
- New or changed skills: `npm run discover` regenerates `data/skills.json`, then `npm run build:artifact` rebuilds `dist/otter.html`. Republish that file to the same artifact link.
- `data/skills.json` and `dist/` are generated on your machine and git-ignored, because this repository is public and they contain your skill descriptions. `npm start` creates the registry automatically if it is missing.
- The registry ships names, descriptions, inferred dependencies and a short summary only. Full skill instructions stay on disk; the local server reads them on demand for skills that can run in-app.

## Files
```
server.js                 local server (static files, Claude API relay, skill instructions)
core/security.js          permissions, approval gate, audit log, skill status
core/privacy.js           sensitive-data detection, redaction, outbound policy, untrusted-content wrapping
core/analysis.js          email parser, figure extraction, discrepancy detection, evidence verification
core/orchestrator.js      request -> skill plan, hand-off briefs
core/agent.js             system prompt, model tools, transports (claude.ai, API, offline)
public/                   interface: index.html, styles.css, app.js, otter.js (avatar), markdown.js, store.js
scripts/discover-skills.js  skill discovery -> data/skills.json
scripts/build-artifact.js   single-file bundle -> dist/otter.html
tests/                    fail-safe, server and UI tests
```

## Troubleshooting
- **"Not approved yet" on the engine pill.** Settings > Engine: confirm BMCC permits the service, or answer yes in setup.
- **Claude never answers on claude.ai.** The first message asks for permission to use Claude; choosing Don't allow disables Claude for that page load. Reload and choose Allow.
- **Privacy guard blocked a message.** The notice says why. Remove the item, use Redact in the source dialog, or (for student records only, with written approval) authorize FERPA processing in Settings.
- **"Locked door."** A system or service is not authorized. Grant it in Settings > Permissions if BMCC policy allows.
- **Approved but "not run".** Expected for email, forms, SharePoint and similar: no authorized integration exists. Copy the approved content and send it yourself, or paste a hand-off brief into Claude in Chrome.
- **History vanished.** Data lives in this browser only. Private windows, cleared site data, or a different browser or device start empty. Pinned conversations are never auto-deleted; others follow the retention setting.
- **Local server says no API key.** Export `ANTHROPIC_API_KEY` in the same terminal before `npm start`.
