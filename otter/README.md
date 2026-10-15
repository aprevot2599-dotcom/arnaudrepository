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
Optional: `OTTER_MODEL` (default `claude-opus-5-5`), `OTTER_QUICK_MODEL` (quick route; default same as `OTTER_MODEL`), `OTTER_EFFORT` (default `medium`, used when the router sends none), `OTTER_VERIFY_LIVE=1` (adds a tiny live Claude call to the morning check), `OTTER_FALLBACKS=off` to disable the server-side refusal fallback (on by default), `OTTER_SKILLS_DIR` to add skill folders, `PORT`.

The server listens on 127.0.0.1 only, requires a per-launch token on every API call, rejects requests from other web origins, and refuses any request containing passwords, SSNs, card numbers or API keys even if the browser sent it.

## First run
O.T.T.E.R. opens with five short setup questions: whether BMCC permits sending non-protected work content to the Claude service in use, how email reaches it, your priority projects, your briefing format, and how long to keep history. Nothing is sent to Claude until the first question is answered yes. Run the questions again from **Settings**.

## Voice and conversation
- **Voice.** O.T.T.E.R. speaks with the most natural male voice your browser has, at **20% speaking volume** by default. It reads the bottom line and first points, then says "The rest is on screen" (switch to reading everything in Settings > Voice). Press Esc, or start talking, to stop it.
- **Most natural voices are online.** In Edge, voices like "Microsoft Andrew (Natural)" sound close to human but send the spoken text to Microsoft; Chrome's male voice sends it to Google. Setup asks first. Mac users can download Evan or Nathan (Enhanced), which run on the device.
- **Conversation mode (on by default).** After O.T.T.E.R. speaks, it listens, waits for you to pause, and answers. Browsers require one click first, so a banner offers **Start talking** when the app opens. This works only in the **local server version** in Chrome, Edge or Safari: claude.ai pages are not allowed to use the microphone. Your audio goes to the browser maker (Google, Microsoft or Apple) for transcription, which setup also asks about.
- **Commands it handles itself, with no Claude usage:** "louder", "quieter", "volume to 40%", "mute", "unmute", "stop listening", "start listening", "what's the volume". Add "computer" ("set computer volume to 50%", "turn up the computer volume") to change the computer's own volume.
- **Computer volume (local server only).** When O.T.T.E.R. opens it offers to set the computer to 20%, and the speaker button in the top bar has -10 / +10 / 20% controls. Every change opens the approval panel, one approval per change; it never accepts approval by voice, because a misheard word shouldn't change your computer. macOS uses `osascript`, Linux uses `pactl` or `amixer`, Windows uses the Core Audio interface through PowerShell. **The Windows and macOS paths have not been run on a real machine yet; please try one change and tell me if it fails.**

## Abilities and growth
- **What it can't do, in three parts.** Ask for something it can't do and it answers with *Why I can't*, *The missing piece*, and *With that piece, I could*. The **Abilities & growth** page lists every capability with its live status; statuses change as you add permissions, connectors or the local server.
- **Recommendations.** O.T.T.E.R. counts what you ask for and where it gets stuck (counts only, never message content) and suggests connectors, skills and setup changes, each with the evidence that triggered it. It raises one in chat at most every three days, or right away for a high-priority one. "Not for me" dismisses a suggestion for good; **Ask Claude for more ideas** sends the counts, not your conversations, to Claude for more ideas.

## Token-aware routing
Every request takes the cheapest route that can do the job, and you see the number before and after.

| Route | When | Typical size |
|---|---|---|
| Local | Commands, small talk, "can you…" questions about things it can't do, the morning check, everything when no Claude is connected | 0 tokens |
| Quick | Short questions with no sources; low effort, last 4 turns, 3 tools | about 4-6k tokens |
| Standard | Attached sources, email or discrepancy work, decisions, your skills; medium effort | about 8-25k tokens |
| Deep | Only when you ask for depth or press **Go deeper**; high effort, web research on the local server | about 25-80k tokens |

- **Before sending:** the line under the message box shows the route and estimate as you type. Requests above your limit (Settings > Data, default 15k tokens) stop and offer a cheaper route.
- **After:** each answer shows its route and tokens. The local server version shows exact counts from the API, summed over every tool round, with the dollar cost. The claude.ai version shows an estimate, because claude.ai doesn't report counts; that usage draws on your plan's limits rather than a bill.
- **Lowest first:** a decision or research question runs on standard first. If more would help, the answer offers **Go deeper** with its estimate. The dashboard's Claude usage panel totals today, 7 days and 30 days.
- Estimates assume about 4 characters per token and can be off by about 25%. The fixed overhead (instructions and tools, about 4k tokens) was measured from the real prompt on 2026-10-14.

## How it talks with you
Every Claude answer opens with **What I understood** (including how it read dictation slips like a spoken "period"), asks up to two clarifying questions when something material is unclear (on the quick route it asks and stops, to save tokens), answers bottom line first, and closes with one **"You can make this experience better if you…"** suggestion.

## Morning check (5 a.m.)
O.T.T.E.R. tests itself and reports issues, how to fix each one, and today's limits given your current setup. It uses **0 Claude tokens** unless you turn on the live test (`OTTER_VERIFY_LIVE=1`, about 100-300 tokens).

Checks: Claude API key and connection (a free model lookup), skill inventory (new or missing skills since yesterday), the 16 approval and privacy fail-safe tests, computer volume control, report storage, Claude connection and approval in the page, local storage, voice, listening, stale approvals, expired knowledge, and a privacy-guard self-test.

When it runs:
1. At 5:00 a.m. local time while `npm start` is running and the computer is awake.
2. If the server starts after a missed 5 a.m., it runs immediately (catch-up).
3. The first time you open O.T.T.E.R. after 5 a.m., the page runs its own checks, pulls the server report, and posts the morning report in chat.
4. Any time: **Abilities & growth > Morning check > Run now**, or type "morning check".

To run it at 5 a.m. without leaving the server open, schedule `npm run verify` (set `ANTHROPIC_API_KEY` in the scheduled environment):
- **macOS** (runs on wake if the Mac slept through 5 a.m.): create `~/Library/LaunchAgents/edu.bmcc.otter.verify.plist` with `ProgramArguments` = `/usr/local/bin/node`, `/path/to/otter/scripts/verify.js` and `StartCalendarInterval` Hour 5 Minute 0, then `launchctl load` it.
- **Windows**: `schtasks /Create /SC DAILY /ST 05:00 /TN "OTTER morning check" /TR "cmd /c cd /d C:\path\to\otter && node scripts\verify.js"`, then in Task Scheduler tick "Run task as soon as possible after a scheduled start is missed".
- **Linux**: `crontab -e`, add `0 5 * * * cd /path/to/otter && node scripts/verify.js >> data/local/verify.log 2>&1`.

Reports are kept for 30 days in `data/local/verification/` (git-ignored).

## Decisions
Every open decision, with my recommendation and the current default: [DECISIONS.md](DECISIONS.md).

## The screen
The default **Simple** layout puts the otter in the middle with six starting points (Just talk, What's on my plate?, Make sense of an email, Check some numbers, Help me decide, What can you do?) and three buttons under the message box: **Talk**, **Add email or doc**, **Send**. A brown "needs your OK" button appears at the top whenever something is waiting for approval. Tap the otter when it says "tap to review" to open what's waiting; tap it any other time and it does a trick. History, projects, skills, tasks, research, abilities and settings live under the **menu** (top left); your dashboard is **My day**. Each answer's token count is one line under it, with **details** for the skill plan. Prefer the old three-pane view? Settings > Personal > Layout > Full.

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
npm test          # 38 tests: the 15 required fail-safes, email parsing, server boundaries, voice commands,
                  # volume control, self-knowledge, recommendations, routing, token estimates, morning check
npm run verify    # the morning check, once, from the command line
npm run test:ui   # browser smoke test (needs Playwright): onboarding, voice setup, launch volume prompt, voice
                  # commands, approval flow, abilities page, privacy block, phone layout
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
core/capabilities.js      what O.T.T.E.R. can and can't do right now, and why
core/advisor.js           usage counts -> connector, skill and setup recommendations
core/voicecmd.js          local volume, voice and listening commands
core/router.js            cheapest-route-first routing and token estimates
core/verify.js            morning check: schedule, browser checks, report
lib/verify-server.js      morning check: server checks, scheduler, report storage
scripts/verify.js         morning check for an operating-system scheduler
lib/sysvolume.js          computer volume through the operating system (local server)
public/                   interface: index.html, styles.css, app.js, otter.js (avatar), voice.js, markdown.js, store.js
scripts/discover-skills.js  skill discovery -> data/skills.json
scripts/build-artifact.js   single-file bundle -> dist/otter.html
tests/                    fail-safe, server and UI tests
```

## Troubleshooting
- **No voice.** Click anywhere in the page once (browsers block sound until you interact), check the speaker button is on and the speaking volume isn't 0, and remember speaking volume is a share of the computer's volume.
- **The voice sounds robotic.** Allow online voices in Settings > Voice, or on a Mac download Evan or Nathan (Enhanced) and reload.
- **It doesn't hear me.** Listening needs the local server version in Chrome, Edge or Safari, permission in Settings > Voice, and the browser's microphone permission. Firefox has no speech recognition.
- **"Not approved yet" on the engine pill.** Settings > Engine: confirm BMCC permits the service, or answer yes in setup.
- **Claude never answers on claude.ai.** The first message asks for permission to use Claude; choosing Don't allow disables Claude for that page load. Reload and choose Allow.
- **Privacy guard blocked a message.** The notice says why. Remove the item, use Redact in the source dialog, or (for student records only, with written approval) authorize FERPA processing in Settings.
- **"Locked door."** A system or service is not authorized. Grant it in Settings > Permissions if BMCC policy allows.
- **Approved but "not run".** Expected for email, forms, SharePoint and similar: no authorized integration exists. Copy the approved content and send it yourself, or paste a hand-off brief into Claude in Chrome.
- **History vanished.** Data lives in this browser only. Private windows, cleared site data, or a different browser or device start empty. Pinned conversations are never auto-deleted; others follow the retention setting.
- **Local server says no API key.** Export `ANTHROPIC_API_KEY` in the same terminal before `npm start`.
