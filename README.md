# Piper the Math Penguin

A friendly Claude skill that tutors middle school math (grades 6 to 8). Personal project, separate from any Blue Mountain Community College work.

<img src="piper-math-tutor/assets/piper-avatar.svg" width="180" alt="Piper the Math Penguin">

## What Piper does
- Restates the problem in kid language and confirms it before solving
- Asks for a photo of the problem and of the learner's own work, reads it back to confirm
- Walks through each step with questions and a five-rung hint ladder instead of giving answers
- Adapts on the next message to signals like repeated errors, frustration, fast mastery or one-word replies
- Remembers each learner through a short "Piper's Notebook" profile (strengths, tricky spots, what helps)
- Uses research-based pedagogy (Pólya, CRA, explicit instruction, worked examples, retrieval and spacing, UDL) and accommodations for dyscalculia, dyslexia, ADHD, autism, math anxiety, English learners, low vision and more

## Files
```
piper-math-tutor/
  SKILL.md                              persona, session flow, adaptation rules, safety
  references/pedagogy.md                teaching methods with sources
  references/special-needs.md           accommodations by need
  references/grade-6-8-map.md           Common Core topics, prerequisites, misconceptions
  references/learner-profile-template.md  Piper's Notebook (the memory)
  assets/piper-avatar.svg               the avatar
dist/piper-math-tutor.zip               upload-ready skill package
```

## Setup
**As a skill on claude.ai:** Settings, Capabilities, Skills, upload `dist/piper-math-tutor.zip`. Start a chat with "Hi Piper, I need help with math."

**As a Claude Project (best for memory):** create a project named "Piper", paste the contents of `SKILL.md` (below the front matter) into the project instructions, add the four `references` files as project knowledge, and add a `pipers-notebook.md` file per learner that an adult updates after each session.

## Read before a child uses it
Claude's consumer plans require users to be 18 or older, so a middle schooler should not have their own claude.ai account. Run sessions on a parent's or teacher's account with an adult nearby, or deploy Piper through a platform approved for minors (for example a school-licensed tool built on the Claude API). Keep the notebook free of full names, diagnoses and school details.

## Web app
`piper-app/index.html` is a chat interface for Piper, published as a private claude.ai page: https://claude.ai/artifact/7hWNGJQnaybRBBqh1u2Nnf

New learners start with a short get-to-know-you chat (nickname, grade, interests, how math feels, a time math went well, what helps, voice on or off) that fills the notebook automatically. Piper's replies can offer tap-to-answer buttons, add to a Wins jar, and be spoken aloud with the most natural voice the device has; learners talk back through their keyboard's dictation microphone.

It asks Claude through the viewer's own account (with their permission the first time), accepts photos of problems and work, has quick-help buttons (I'm stuck, Show me a picture, Check my answer, Practice one, I need a break), a Bigger text switch and Read aloud for each message. Piper's Notebook is saved privately per signed-in person, with a copy in the browser as a backup, and "Update from today" rewrites it from the session.
