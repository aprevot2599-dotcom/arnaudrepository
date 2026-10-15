# Decisions for Dr. Prevot

> **Update (helper window):** at your request every default is now on at first launch: Claude service approval, online voices, always-on listening, computer volume control and (local server) web research. Rows 1, 3, 4, 11 and 15 below are therefore set to "on" until you turn them off in Settings. Two new decisions are at the bottom (24, 25).

Everything O.T.T.E.R. needs from you, in the order I'd make the calls. Each row has the options, my recommendation, what the build does until you decide, and what stays blocked meanwhile. Nothing here was decided on your behalf except safe defaults that can be changed in Settings.

## 1. Before using it for real BMCC work (needs BMCC, not just you)

| # | Decision | Options | My recommendation | Until you decide | Blocks |
|---|---|---|---|---|---|
| 1 | May non-protected BMCC work content go to Claude? | claude.ai account / API key / neither | Ask IT which one BMCC sanctions; the API (local server) keeps billing and data terms separate from your personal plan | Nothing is sent until you confirm in setup | All Claude answers |
| 2 | Request a Microsoft 365 mail connection from BMCC IT | Ask for read-only first / read and send / don't ask | Read-only first. It's the single biggest time saver and the smallest ask | Email is paste or upload only | Inbox triage, sending approved replies |
| 3 | May listening send your audio to Google, Microsoft or Apple? | Yes / No / Only for non-BMCC topics | Yes for convenience, but don't dictate student or personnel details | Pre-ticked in setup because you asked for conversation mode; untick to stop | Hands-free conversation |
| 4 | May online voices receive the text being spoken? | Yes / No (on-device voices only) | Yes on Windows (Edge's natural voices are far better); on a Mac, download Evan (Enhanced) and say no | Pre-ticked in setup; untick to stop | The most human-sounding voice |
| 5 | Student education records (FERPA) | Keep off / record a basis and approver | Keep off | Off. Anything that looks like a student record is stopped before it leaves the device | Student-level analysis |
| 6 | The `synergy-parent-notification` skill (Pendleton SD, K-12 records) | Move it out of your BMCC setup / keep it restricted | Move it out. It's a different employer and a different records regime | Restricted, never runs | Nothing at BMCC |

## 2. Setup choices (yours alone)

| # | Decision | Options | My recommendation | Until you decide | Blocks |
|---|---|---|---|---|---|
| 7 | Run the local server version? | claude.ai link only / local server too | Local server too. Only it can hear you, control the computer's volume, research the web, report exact token counts, and run the 5 a.m. check | claude.ai link works with those limits | Listening, volume, web research, exact counts, 5 a.m. check |
| 8 | Where the API key lives | Environment variable / a password manager feeding it in | Environment variable set in your terminal profile or startup script, never in a file in this repo | No key, no API mode | Local Claude answers |
| 9 | Quick-route model | Claude Opus 5.5 at low effort / Claude Haiku 5.5 | Opus 5.5 at low effort (default). Haiku 5.5 costs about 1/40th as much but is noticeably weaker on judgment calls. Try Haiku for a week if cost matters (`OTTER_QUICK_MODEL=claude-haiku-5-5`) | Opus 5.5 at low effort | Nothing |
| 10 | Ask-before-sending limit | 5k / 15k / 30k / 60k tokens / never | 15k (default). Most quick answers are 4-6k tokens; a thread plus a decision runs 10-25k | 15k | Nothing; larger requests ask first |
| 11 | Web research | On / off | On, once the local server runs. It only fires on the deep route, which you choose | Off | Cited research |
| 12 | How the 5 a.m. check runs | Leave the server running overnight / an operating-system schedule / only at first open | Operating-system schedule (README has the steps). A sleeping laptop runs nothing at 5 a.m.; launchd on a Mac catches up on wake | Runs at first open after 5 a.m., plus 5 a.m. whenever the server is up | Nothing |
| 13 | Live API test in the morning check | Off / on (`OTTER_VERIFY_LIVE=1`) | Off. The free model lookup already proves the key and connection; the live test adds about 100-300 tokens a day | Off, 0 tokens | Nothing |
| 14 | Computer volume at launch | Ask each launch (current) / set automatically | Ask each launch. Automatic would break your own rule that one approval never covers future actions. If you want automatic anyway, say so and it becomes one switch | Asks each launch | Nothing |
| 15 | Conversation mode as default | On / off | On, as you asked | On | Nothing |
| 16 | History retention | 30 / 90 / 180 / 365 days / never | 90 days. Pin anything you want kept | 90 days | Nothing |

## 3. Repository and release

| # | Decision | Options | My recommendation | Until you decide | Blocks |
|---|---|---|---|---|---|
| 17 | The GitHub repository is public | Make it private / keep public | Make it private. The code holds no secrets, but it describes BMCC workflows and your role | Generated skill registry and bundle are kept out of git | Nothing |
| 18 | Merge the work branch | Open a pull request into main / keep on the branch | Open a PR after you've tried the app for a day; I can create it and watch it | Everything is on `claude/trusting-fermi-2l0f6k` | Nothing |
| 19 | Who else may open the app link | Only you / named colleagues | Only you for now. Shared viewers would use their own Claude usage and their own local storage | Private to your account | Team use |
| 20 | Test the Windows and macOS volume commands | Try one change and report / skip volume control | Try one change; only the Linux path was exercised, and only against a stand-in | Untested on your OS | Reliable volume control |

## 4. Where O.T.T.E.R. goes next

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 21 | Package O.T.T.E.R. as a Cowork plugin | Yes / later | Later, after a month of use. It's the route by which hand-off skills (forms, website, Word files) could run without copy and paste |
| 22 | Premium neural voice | A text-to-speech vendor / browser voices | Browser voices first. A vendor means BMCC approval to send answer text out, plus a monthly bill |
| 23 | A cloud scheduled task as well as the 5 a.m. check | Yes / no | No. It would cost Claude credits every morning and can't see your computer, only this repository |

## 5. Helper window

| # | Decision | Options | My recommendation | Until you decide |
|---|---|---|---|---|
| 24 | Always-on listening | Wake word "Otter" (current) / push-to-talk only / no wake word | Keep the wake word. Without it every word near your desk goes to Google and is sent to Claude, costing tokens and risking student or personnel details | Wake word on |
| 25 | Where the helper runs | Your BMCC laptop / a personal computer | Ask BMCC IT before running it on a BMCC-managed machine: it installs Node.js, runs a local server, and opens Chrome with auto-allowed microphone in a separate profile | Your call |
