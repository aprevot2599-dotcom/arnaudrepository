# Piper the Math Teacher

An animated, emotionally expressive math teacher for grades 6 to 8, built on Claude. Personal project, separate from any Blue Mountain Community College work.

<img src="piper-math-tutor/assets/piper-avatar.svg" width="180" alt="Piper, a smiling math teacher with curly hair in a bun, round glasses and a red scarf with a pi symbol">

**App:** https://claude.ai/artifact/7hWNGJQnaybRBBqh1u2Nnf (private until shared)
**Full setup and use guide:** [INSTRUCTIONS.md](INSTRUCTIONS.md)
**Natural voice upgrade plan:** [VOICE-UPGRADE.md](VOICE-UPGRADE.md)

## What Piper does
- Opens with a get-to-know-you conversation (nickname, grade, interests, how math feels, a time math went well, what helps, voice on or off) and saves it to her notebook
- Shows emotion with an animated face (calm, listening, thinking, empathy, encourage, curious, happy, celebrate, surprised), blinks, breathes, waves, nods, and moves her mouth while she talks
- Talks with the most natural voice the device has; learners answer by typing, tapping answer buttons, or keyboard dictation
- Takes photos from the same device or from a phone by scanning a QR code, then reads the problem back before teaching
- Walks through each step with questions and a five-rung hint ladder instead of giving answers, and adapts on the next message
- Rebuilds how math feels: a Wins jar, feelings tracked over time, no "math person" myth, mistakes as rough drafts
- Uses research-based pedagogy (Pólya, CRA, explicit instruction, worked examples, retrieval and spacing, UDL) and accommodations for dyscalculia, dyslexia, ADHD, autism, math anxiety, English learners and low vision

## Files
```
INSTRUCTIONS.md                          complete adult guide: setup, voice, phone photos, faces, troubleshooting
piper-app/index.html                     the web app (published to the claude.ai link above)
piper-math-tutor/
  SKILL.md                               persona, session flow, emotion, adaptation rules, safety
  references/pedagogy.md                 teaching methods with sources
  references/math-identity.md            rebuilding how math feels, with sources
  references/special-needs.md            accommodations by need
  references/grade-6-8-map.md            Common Core topics, prerequisites, misconceptions
  references/learner-profile-template.md Piper's Notebook (the memory)
  assets/piper-avatar.svg                Piper, with all expressions built in
dist/piper-math-tutor.zip                upload-ready skill package
```

## Updating the app
`piper-app/index.html` contains the avatar inline. After editing `piper-math-tutor/assets/piper-avatar.svg`, replace the `<svg ... class="pv"...>...</svg>` block inside `#stageAv` in the app with the new file contents, then republish to the same link.

## Important
Claude's consumer plans require users to be 18 or older, so Piper runs on an adult's claude.ai account with that adult nearby. Keep the notebook and photos free of full names, diagnoses and school details.
