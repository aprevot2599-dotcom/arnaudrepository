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
