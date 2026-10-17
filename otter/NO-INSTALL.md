# O.T.T.E.R. without installing anything

One file, `otter-web.html`, opened in Chrome or Edge. No Node.js, no server, no admin rights, no browser extension, no Microsoft 365 connection. It talks to exactly one outside address, `api.anthropic.com`, and writes everything it does to a log you can check.

## Steps

**On a personal computer first.** Until BMCC IT says otherwise, don't run it on a BMCC laptop and don't let it look at BMCC Outlook, Excel, Forms or Power Automate screens (see "Before you use it on BMCC work").

1. **Get an API key.** On a personal device, go to console.anthropic.com, sign in or create an account, add a payment method or credits under Billing, then API Keys > Create Key. Copy the key (it starts with `sk-ant-`). Set a monthly spend limit under Limits.
2. **Save the file.** Save `otter-web.html` (sent to you in chat, or built with `npm run build:artifact` into `otter/dist/`) to your Desktop or Documents.
3. **Open it.** Right-click > Open with > Google Chrome (or Microsoft Edge).
4. **Start.** Paste the API key into the start card. Leave "Listen for Hey Otter" unticked if you want a fully closed system (see below). Click **Start Otter**.
5. **The otter floats.** A small always-on-top window opens with just the otter. Chrome decides where it first appears; it's usually the bottom-right corner. If not, drag it there. The original tab says O.T.T.E.R. is floating and has a button to bring it back.
6. **Use it:**
   - Type or tap the chat bubble to ask something.
   - Say "Hey Otter…" (if you allowed listening) or press the **microphone** and just say what you need. "Hey" is optional after a press.
   - Ask "what did you spot?" or tap the otter when its lightbulb is on. It lists deadlines, unanswered questions, commitments and numbers that don't agree in what you've given it (0 tokens).
   - The **eye** (screen coaching) is hidden and **on hold** until BMCC gives full permission. See "Screen coaching is on hold" below.
   - Ask "how do I send Forms responses to Excel in Power Automate?" (or about approvals, schedules, failed flows, branching forms, XLOOKUP, PivotTables, drop-downs, totals that don't add up, highlighting). Built-in guides answer for 0 tokens.
   - The window grows to show answers, checklists and questions, and shrinks back when you tick the last step or say "done".
7. **Make it open with Chrome (optional).** In O.T.T.E.R., Menu > Settings > **Open with Chrome** shows the file's exact address with a Copy button. In Chrome: ⋮ > Settings > On startup > **Open a specific page or set of pages** > **Add a new page**, paste, Add. (Edge: Settings > Start, home, and new tabs > Open these pages.) From then on O.T.T.E.R. opens with Chrome; click **Start Otter** once and it floats. Chrome won't open a floating window without that click, and no page can get around it. Note that this setting replaces "Continue where you left off", so Chrome stops reopening yesterday's tabs. If you'd rather keep those, leave the setting alone, open O.T.T.E.R. once, right-click its tab > **Pin**, and choose "Continue where you left off": the pinned tab comes back each time. If you move or rename the file, update the address. **On other computers:** signing in to your Chrome account syncs bookmarks but not pinned tabs, and a file address only works on the computer that holds the file. Each computer needs its own copy of the file, its own pin, and the API key typed in once (the key never syncs, on purpose).
8. **Turn it off:** the red power button, "Hey Otter, shut down", or just close the window. Everything stops: microphone, screen capture, voice, timers. Closing the browser tab ends it completely.

## The web-address version (pin it once, open it anywhere)

The same page, without your skill list, is served at **https://aprevot2599-dotcom.github.io/arnaudrepository/** once GitHub Pages is switched on (one-time, below). It behaves exactly like the file: same closed policy, same log, the API key stays in that browser only. Advantages over the file: Chrome remembers the microphone permission, the bookmark follows your Chrome account to every computer, and there's nothing to copy around.

- **Switch on GitHub Pages (once):** github.com/aprevot2599-dotcom/arnaudrepository > Settings > Pages > Build and deployment > Source: **Deploy from a branch** > Branch: `claude/trusting-fermi-2l0f6k`, folder `/docs` > Save. The address works a minute or two later. After the work is merged, switch the branch to `main`.
- **Pin it:** open the address in Chrome, right-click the tab > **Pin**, and set Settings > On startup > **Continue where you left off**. Or add the address under "Open a specific page or set of pages".
- **Updating it:** `npm run build:site` rebuilds `docs/index.html`; pushing it updates the address.
- The repository is public, so the page is too. It holds no keys, no conversations and no skill list. Anyone who opens it gets an empty otter that needs their own API key.

## An advisor, not an actor

O.T.T.E.R. only sees what you give it (pasted emails, documents, your tasks) and makes recommendations on top of it. It never logs into, reads from, or changes anything on BMCC systems. This is enforced in the code, not just promised: at startup a check (`assertAdvisorOnly`) refuses to run if any action O.T.T.E.R. can carry out would touch an outside system. The only things it can do are on its own side: remember a note, add a task, change the volume, and each needs your OK.

The **spotter** is the advisor part: it looks over what you've already given it, every 30 minutes, after each answer and after you add an email, and flags what you may not have spotted yet, each with the quote it came from. It runs on your computer for 0 tokens and acts on none of it.

## Screen coaching: on hold for BMCC, available for personal screens

Out of the box, O.T.T.E.R. doesn't look at your screen at all: the eye button is hidden, nothing is captured, and no picture is sent. Asking it to look gets an explanation instead.

**Personal screens, now:** Menu > Settings > Screen coaching > tick the promise (no BMCC content, no student or personnel information) > **Allow for personal screens**. The log records it as personal only. Then tap the eye, choose a **Chrome tab** (or window) in Chrome's picker, and either ask a question or tap the **bulb** for recommendations on what's visible. Claude is told that if a picture looks like a BMCC system or student data, it must not describe it and should tell you to stop sharing. When BMCC approves, go to Menu > Settings > Screen coaching, enter who approved and the date, tick the box and press **Release the hold**. The log records that release with the approver's name. **Put back on hold** reverses it, also logged.

## What "closed" means here, and how to check it

- **Only one outside address.** The file carries a Content Security Policy that tells Chrome to refuse every network connection except `https://api.anthropic.com`, and to refuse every outside script, font and style. Chrome enforces this, not O.T.T.E.R.
- **A second check in the code.** Every request also goes through a gate that refuses other hosts and writes the request to the log.
- **What's stored:** conversations, settings and the log stay in this browser's storage on this computer. Screen pictures are never stored: the latest one is kept in memory and discarded when sharing stops.
- **The API key** is kept in its own browser slot. It is never exported or written to the log, and it is sent only to Anthropic.
- **The log** (Menu > Abilities & growth > Verifiable log) records each session start and stop, microphone on/off, screen sharing on/off, each snapshot taken and each one sent, every request (size, fingerprint, tokens) and every approval. It never records what you said or what was on screen. Each entry's fingerprint covers the previous one, so editing or deleting any entry breaks the chain. **Verify the log** checks it in the app. To check it independently, **Download log**, then on any computer with Node.js run `node scripts/verify-log.mjs otter-ledger.json`. It reports VERIFIED or BROKEN and lists every outside address ever contacted.
- **You can watch it yourself:** press F12 > Network in Chrome while using O.T.T.E.R. Every request shown should go to api.anthropic.com.

## The one exception: your voice

Chrome turns speech into text by sending microphone audio to Google's servers, outside O.T.T.E.R.'s control and outside the Content Security Policy. So in closed mode, O.T.T.E.R. doesn't listen on its own. Two ways to talk to it anyway:

- **Press the microphone** any time. It listens for that one request, then stops. Each press is written to the log as a closed-mode exception, naming where the audio went.
- **"Hey Otter"**: tick "Listen for Hey Otter" and it listens continuously, acting only on speech that begins with "Hey Otter". The log records that you turned the exception on.

Speaking answers out loud uses only voices installed on your computer while closed mode is on.

**If it doesn't hear you:** Menu > Settings > Voice > **Test my microphone**. It checks, in order, that the browser can turn speech into text, that the microphone is allowed, that sound is coming in, and that the speech service answers. Then it repeats back what it heard, or names the step that failed and how to fix it. Nothing from the test goes to Claude, and the log records only pass or fail. The claude.ai link can never hear you; use the file.

## Before you use it on BMCC work

- **Screen pictures are content.** A snapshot of Outlook, Excel, Forms or Power Automate sent to Claude is BMCC Microsoft 365 content going to Claude, which is exactly what BMCC hasn't approved yet. That's why screen coaching ships on hold. After release, O.T.T.E.R. sends a picture only when you ask a question while the eye is on, and logs each one, but it can't tell what's on the picture before it goes.
- **Student records.** If a FERPA-protected screen is visible, don't ask while looking. The privacy guard can scan text, but it cannot scan pictures.
- **A BMCC computer.** Opening an HTML file isn't installing software, but it is still an AI tool sending data from a BMCC machine. Ask IT before using it there. Their browser policy may also block screen sharing, the microphone, or floating windows; O.T.T.E.R. will say so if it does.

## What it can't do in this version, and why

| It can't | Why | The missing piece | With it, it could |
|---|---|---|---|
| Point at your real screen | A web page can't draw over other apps | A small desktop app (needs installing) | Put a circle on the real button instead of on a picture |
| Click or type for you | By design: it only explains | Nothing; this is deliberate | |
| Change the computer's volume | Web pages can't | The local server version (needs Node.js) | Set 20% at start, change on request |
| Listen while fully closed | Chrome's speech service is Google's | A speech engine that runs inside the page (about 40-75 MB, a future build) | "Hey Otter" with nothing leaving the computer |
| Always open in the bottom-right corner | Chrome chooses the floating window's first position | Nothing a page can do; drag it once | |
| Grow the floating window after a spoken request | Chrome allows resizing only right after a click | Nothing a page can do | It fills the small window and scrolls instead; any click lets it grow |
| Read Outlook or Excel files directly | No Microsoft 365 connection, by BMCC policy | BMCC IT approval of a connector | Work from your files without screenshots or copy and paste |
