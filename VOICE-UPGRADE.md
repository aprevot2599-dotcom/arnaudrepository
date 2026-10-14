# Giving Piper a truly natural voice: every step

## The short version
The Piper page on claude.ai can only use the voices built into the device it runs on, because claude.ai pages are not allowed to contact outside voice services. Those built-in voices range from nearly human (Edge "Natural" voices, Apple "Premium" voices) to robotic. Two paths:

- **Path A, today, free:** set up the device so Piper gets its best built-in voice. 15 minutes. Done in the current app.
- **Path B, the real fix:** move Piper into her own small web app that uses a professional voice service (ElevenLabs recommended) and real hands-free listening. Her voice then sounds human on every device, changes with her emotions, and her lips move with the actual audio. About 1 to 2 weeks of part-time work plus running costs of roughly $1 to $2 per 30-minute session.

---

## Path A: the best voice the device can give (do this now)

The current app already picks the most natural voice it finds, says fractions like a teacher ("three fourths," not "3 over 4"), reads "+" as "plus," and shows a yellow notice under **Piper's voice** when the selected voice is likely to sound robotic, with the fix for that device.

| Device | Steps |
|---|---|
| Windows computer | 1. Open the Piper link in **Microsoft Edge** (not Chrome). 2. Under Piper's voice, pick **Ava Online (Natural)**, **Emma Online (Natural)** or **Jenny Online (Natural)**. 3. Click Test voice. |
| iPad or iPhone | 1. Settings, Accessibility, Spoken Content, Voices, English. 2. Download **Ava (Premium)** or **Zoe (Premium)** (about 300 to 500 MB each, use Wi-Fi). 3. Reload Piper, pick the voice, Test voice. |
| Mac | 1. System Settings, Accessibility, Spoken Content, System voice, Manage Voices. 2. Download **Ava (Premium)** or **Zoe (Premium)**. 3. Reload Piper in Safari, pick the voice, Test voice. |
| Chromebook or Android | Pick a **Google** voice. This is the weakest option; use a Windows laptop with Edge or an iPad if you can. |

Then set **Speed** to about 0.9 to 0.95. Slightly slower sounds warmer and is easier for learners who process language more slowly.

Limits that remain on Path A: the voice does not change tone with Piper's emotions, quality varies by device, and the learner still speaks through keyboard dictation.

---

## Path B: Piper's own app with a professional voice

### What changes
| | Now (claude.ai page) | Piper's own app |
|---|---|---|
| Voice | Device voices, quality varies | Human-quality voice, identical on every device |
| Emotion in the voice | None | Warmer, softer or more excited to match her face |
| Lip movement | Random mouth flaps | Driven by the real audio volume |
| Learner talking | Keyboard dictation, press Send | Hands-free: talk, pause, Piper answers; talking over her stops her |
| Who pays | The adult's claude.ai plan | Pay-as-you-go API accounts |
| Where it lives | claude.ai link | Your own web address with a passcode |

### How it fits together
```
Browser (Piper page) ──► /api/chat  ──► Claude API (Anthropic)     text, streamed
        │            ──► /api/speak ──► ElevenLabs text-to-speech   audio, streamed
        │            ──► /api/photo ──► small key-value store       phone QR handoff
        └── microphone ──► browser speech recognition (built in)
```
The `/api/...` pieces are small server functions. They keep the secret API keys off the learner's device.

### Decisions to make first (recommended choices in bold)
1. **Voice service.** **ElevenLabs** for the most natural, expressive voice. Alternatives: Azure AI Speech neural voices (cheaper, 0.5 million free characters a month, built-in "cheerful" and "empathetic" speaking styles on some voices) or OpenAI gpt-4o-mini-tts (you can describe the tone in words, e.g. "warm and gentle").
2. **Claude model.** **claude-opus-5-5** (best teaching quality). claude-sonnet-5-5 costs half as much and is faster; worth testing once things work.
3. **Listening.** **The browser's built-in speech recognition** (free; Chrome, Edge and Safari). Upgrade to a paid service such as Deepgram only if it struggles with the learner's speech, which is more common with children.
4. **Hosting.** **Vercel** (free tier, connects to this GitHub repository). Cloudflare Pages is a fine alternative.
5. **Who uses it.** One family or a few families. Schools change the privacy requirements (step 7).

### Step 1. Accounts and keys (about 1 hour, the adult)
1. **Anthropic API**: go to console.anthropic.com, create an account, add a payment method, set a **monthly spend limit** (start with $20), and create an API key. This is separate from a claude.ai subscription.
2. **ElevenLabs**: create an account at elevenlabs.io and choose a paid plan with API access. In the Voice Library, find a warm, friendly adult female US English voice that fits Piper, and add it to your voices. Copy its **Voice ID**. Create an API key.
3. **Vercel**: sign up with your GitHub account and import the `arnaudrepository` repository.
4. In Vercel, Project Settings, Environment Variables, add: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `PIPER_PASSCODE` (a family passcode you choose).
5. In Vercel, Storage, add a small key-value store (for example Upstash Redis from the marketplace) for the notebook and phone photos.

Never paste API keys into the page, a chat or the repository.

### Step 2. Server functions (build; Claude can write all of this)
1. `/api/chat`: checks the passcode, sends Piper's rules, the notebook, the conversation and any photo to Claude with the official Anthropic SDK, and streams the answer back.
2. `/api/speak`: checks the passcode, sends one sentence plus Piper's current mood to ElevenLabs' streaming text-to-speech, and streams the audio back. Use the low-latency Flash model for quick replies; test the higher-quality model for warmth.
3. `/api/notebook`: saves and loads each learner's notebook in the key-value store.
4. `/api/photo`: the phone posts a compressed photo under a random pairing code shown in the QR code; the main screen collects it and deletes it.
5. Basic protection: passcode on every call, a per-day request cap, and no logging of conversation text.

### Step 3. Natural, emotional voice in the page (build)
1. Speak sentence by sentence as Claude streams: send the first sentence to `/api/speak` while the rest is still being written, so Piper starts talking within about 1 to 2 seconds.
2. Play the audio through the browser's audio system and measure its volume many times a second; open Piper's mouth in proportion. This gives real lip sync.
3. Map moods to voice settings: empathy slower and softer, celebrate brighter and more lively, thinking calm. With ElevenLabs this is done with its stability and style settings per request; test each mood by ear.
4. Keep the current fraction-to-words and symbol-to-words conversion before sending text to the voice.
5. Keep the device voice as an automatic backup when the voice service is unavailable.

### Step 4. Hands-free conversation (build)
1. Add a large **Talk to Piper** button that turns on listening mode (the browser asks for microphone permission once).
2. While listening, show live captions of what the learner is saying and Piper's listening face.
3. After about 1.2 seconds of silence, send what was said automatically.
4. If the learner starts talking while Piper is speaking, stop her audio (barge-in) and listen.
5. Keep typing, tap buttons and photos working exactly as now.
6. Show the words Piper heard before sending, so a misheard number can be fixed with a tap.

### Step 5. Move the rest of Piper over (build)
1. Copy the current page (`piper-app/index.html`): the animated face, the get-to-know-you chat, the notebook, the Wins jar, the quick buttons, the accessibility options.
2. Replace the claude.ai-only pieces: `claude.use("sample")` becomes `/api/chat`, the claude.ai database becomes `/api/notebook` and `/api/photo`.
3. Change the QR code to open the new address with the pairing code.
4. Add a passcode screen.
5. Keep the claude.ai version as a backup.

### Step 6. Test (about 1 week, with the learner and adult)
1. Voice: does Piper sound like a person? Do empathy and celebrate sound different?
2. Speed: Piper starts speaking within about 2 seconds of the learner finishing.
3. Listening: how often numbers like "fifteen" and "fifty" are misheard; keep the caption check if it happens.
4. Devices: the main device, the phone for photos, a quiet and a noisy room.
5. Teaching: one real homework session per day; note anything Piper says that a teacher wouldn't.
6. Cost: compare the Anthropic and ElevenLabs dashboards with the estimates below after a week.

### Step 7. Safety, privacy and rules
1. Anthropic's usage policy has specific requirements for products used by minors. Read the current version before letting your learner use the API version; for a family-run app with an adult present, keep Piper's safety rules, the passcode and no personal data.
2. Send only nicknames and math to the services; no last names, school names or faces.
3. Check each service's data retention settings and turn off training on your data wherever offered.
4. If other families or a school will use it, children's privacy laws (COPPA, and FERPA for schools) apply; get that reviewed before sharing.

### Running costs (estimates, check current prices before budgeting)
Assumptions for one 30-minute session: about 40 Piper replies, about 16,000 characters spoken, a few photos.

| Item | Rough cost per session |
|---|---|
| Claude, claude-opus-5-5 ($4 per million input tokens, $20 per million output, cached input much cheaper) | about $0.50 to $1.00 |
| ElevenLabs Flash (about $0.05 per 1,000 characters) | about $0.80 |
| ElevenLabs higher-quality model (about $0.10 per 1,000 characters) | about $1.60 |
| Azure neural voice instead (about $15 to $16 per million characters, 0.5 million free per month) | about $0.25, often free |
| Hosting and storage at family scale | $0 on free tiers |

Daily 30-minute sessions with ElevenLabs Flash come to roughly $30 to $55 a month. The voice and Claude prices come from third-party summaries of ElevenLabs, Azure and OpenAI rates and Anthropic's current price list. Confirm on each provider's pricing page.

### Timeline
| Week | Work |
|---|---|
| 1 | Accounts and keys (Step 1); server functions and natural voice (Steps 2 to 3) |
| 2 | Hands-free talking and moving the rest of Piper over (Steps 4 to 5); start testing (Step 6) |
| 3 | Fix what testing finds; safety review (Step 7); daily use |
