# Piper the Math Teacher

An animated, emotionally expressive math teacher for grades 6 to 8, built on Claude. Personal project, separate from any Blue Mountain Community College work.

<img src="piper-math-tutor/assets/piper-avatar.svg" width="180" alt="Piper, a smiling math teacher with two curly hair puffs, a pencil in her hair and star earrings">

**App:** https://claude.ai/artifact/7hWNGJQnaybRBBqh1u2Nnf
**Full setup and use guide:** [INSTRUCTIONS.md](INSTRUCTIONS.md)
**Natural voice upgrade plan:** [VOICE-UPGRADE.md](VOICE-UPGRADE.md)

## What Piper does
- Opens with a get-to-know-you conversation (nickname, grade, interests, how math feels, a time math went well, what helps, voice on or off) and saves it to her notebook
- Full-body animated character in her own classroom: walks, waves, dances, jumps, spins, nods, stretches, follows you with her eyes and plays back when tapped; 14 emotions (calm, hello, happy, celebrate, proud, thinking, idea, empathy, encourage, curious, surprised, listening, silly, oops) with confetti, hearts, a lightbulb and more
- Talks with the most natural voice the device has; learners answer by typing, tapping answer buttons, or keyboard dictation
- Takes photos from the same device or from a phone by scanning a QR code, then reads the problem back before teaching
- Walks through each step with questions and a five-rung hint ladder instead of giving answers, and adapts on the next message
- Rebuilds how math feels: a Wins jar, feelings tracked over time, no "math person" myth, mistakes as rough drafts
- Uses research-based pedagogy (Pólya, CRA, explicit instruction, worked examples, retrieval and spacing, UDL) and accommodations for dyscalculia, dyslexia, ADHD, autism, math anxiety, English learners and low vision

## Files
```
INSTRUCTIONS.md                          complete adult guide: setup, voice, phone photos, faces, troubleshooting
piper-app/index.html                     the web app (published to the claude.ai link above)
piper-app/piper-rig.js                   Piper's animated character: body, faces, movement, effects
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
Piper's look, emotions and movement live in `piper-app/piper-rig.js`; the conversation, notebook, voice and photos live in `piper-app/index.html`. Publish `index.html` to the same claude.ai link with `piper-rig.js` as a supporting file. The skill's avatar (`piper-math-tutor/assets/piper-avatar.svg`) is the rig's portrait exported as a static image.

## Important
Claude's consumer plans require users to be 18 or older, so Piper runs on an adult's claude.ai account with that adult nearby. Keep the notebook and photos free of full names, diagnoses and school details.
