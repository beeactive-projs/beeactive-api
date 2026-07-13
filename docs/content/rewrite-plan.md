# Blog Content Rewrite Plan

How the 24 seeded articles (12 topics, EN and RO) get rewritten. Pairs with
[content-playbook.md](content-playbook.md), which is the writing standard. This document is
the production plan: pipeline, per-article specs, and the theme review.

Written dash-free per playbook Rule 1.

---

## 1. Production pipeline

We author each article as Markdown with a metadata header, keep those files in the repo as the
source of truth, and generate the database migration from them with a build script. This gives
us the Markdown format the team wants, version control, easy future edits, and correct HTML
storage all at once.

```
docs/content/articles/<slug>.en.md   (YAML front matter + Markdown body)
docs/content/articles/<slug>.ro.md
        |
        v
scripts/build-blog-migration.mjs      (Markdown -> HTML, escapes quotes, emits SQL)
        |
        v
migrations/0NN_blog_content_rewrite.sql
   UPDATE blog_post SET title=?, excerpt=?, content=?, cover_image=?, read_time=?,
          tags=?, updated_at=now() WHERE slug=? AND language=?
        |
        v
node migrations/run.js   ->   then trigger ONE website rebuild
```

Why this shape:
- **Markdown source in repo.** Readable, diffable, and the canonical version. HTML is a build
  artifact, not something we hand-edit.
- **Build script, not hand-written SQL.** 24 HTML bodies with escaped quotes is error prone by
  hand. The script converts Markdown to semantic HTML and handles `''` escaping.
- **UPDATE, matched on slug AND language.** RO reuses the same slugs as EN, so slug alone would
  hit both rows. See the playbook and the project memory.
- **One rebuild after.** A migration bypasses `blog.service` `triggerWebsiteRebuild()`, and the
  public blog is prerendered, so nothing shows until a rebuild fires.

### Front matter shape (per file)

```yaml
---
slug: how-to-choose-the-right-personal-trainer   # unchanged, this is the match key
language: en
title: ...            # optimized, sentence-ish case, benefit-led, about 60 chars
excerpt: ...          # meta description, 150 to 160 chars, value in first 100
category: Guide       # unchanged
coverImage: https://images.unsplash.com/...      # audited, upgraded only if clearly better
readTime: 8           # recomputed from final word count (about 200 wpm)
tags: [..., ...]      # refined for search
reviewer: ...         # optional, for YMYL clinical/nutrition claims
---
```

---

## 2. Locked design calls

- **Slugs do not change.** They are the migration match key and the live indexed URLs. Changing
  them would break SEO and require redirects. We keep every slug and improve everything else.
- **Storage stays HTML.** The Quill editor and the prerendered site expect HTML in
  `blog_post.content`. Markdown is only our authoring format. The build script outputs semantic
  HTML (`<h2>`, `<p>`, `<ul>`, `<a>`), with a `lead` class on the intro paragraph to match the
  existing render.
- **Facts are woven in, never boxed.** Every article carries at least one genuinely interesting,
  verifiable statistic or study finding that supports its argument, integrated into the prose (no
  "Did you know?" callouts or trivia boxes). Each factual claim gets an inline `[source](url)`
  link, plus the source repeats in the closing `## Sources` list. Real sources only.
- **All references are verified before ship.** The build script writes `docs/content/CITATIONS.md`,
  a checklist of every external link. Each one is opened and confirmed to resolve and to actually
  support its claim. No invented studies. Nothing ships with an unchecked citation.
- **Frameworks are realized in prose.** The framework names in Section 3 (listicle, comparison,
  taxonomy, and so on) describe the structure of the argument, not literal bullet lists. They are
  written as H2 prose sections. The only `-` list is the Sources bibliography. Tables are avoided
  until the article CSS styles them.
- **Formatting is consistent but not templated.** Every article respects the same house rules
  and metadata shape, but each uses a different structural framework (see the briefs) so they do
  not read as one template stamped 12 times. Same standard, varied shape.
- **Images: Unsplash, audited and upgraded.** Unsplash license allows commercial use with no
  attribution required. We keep a current cover only if it is genuinely on topic, otherwise
  replace it with a more specific shot. Every image URL is verified to resolve before it ships.
  Add at most one or two inline images where they carry information, never decoration.
  Note: there is no Unsplash API connector available in this environment, so image picks are
  found and verified individually rather than pulled programmatically.
- **SEO block per article, per language.** EN and RO are different search markets, so each gets
  its own primary keyword and secondary terms, not a translation of the other. Place the primary
  keyword in the title, first paragraph, one heading, the excerpt, and the slug, plus refined
  tags, two to three genuine internal links, an optional real FAQ with schema, and a recomputed
  read time. Data-backed keyword volumes need the Ahrefs or Semrush connector authorized; until
  then keyword choices are informed, not volume-validated.
- **RO is written as native Romanian**, sharing the same research and structure as its EN twin,
  not machine-translated from the English draft.

---

## 3. Framework variation map

Each topic gets a distinct structure so the set reads varied. Frameworks are defined in the
playbook Section 4.

| # | Slug | Audience | Category | Framework |
|---|------|----------|----------|-----------|
| 1 | how-to-choose-the-right-personal-trainer | Consumer | Guide | How-to checklist, inverted pyramid |
| 2 | nutrition-habits-that-actually-stick | Consumer | Nutrition | Listicle done right (habit + evidence + action) |
| 3 | hiit-vs-strength-vs-cardio | Consumer | Science | Comparison with a decision matrix |
| 4 | accountability-secret-to-fitness-results | Consumer | Wellness | PAS (problem, agitate, solution) |
| 5 | beginners-guide-to-meal-prep | Consumer | Nutrition | Step-by-step with a starter template |
| 6 | finding-your-fitness-style | Consumer | Guide | Taxonomy, match by goal and personality |
| 7 | small-changes-big-results-daily-movement | Consumer | Wellness | Narrative plus evidence |
| 8 | online-vs-in-person-training | Consumer | Guide | Honest head-to-head, hybrid verdict |
| 9 | how-to-build-online-fitness-community | Instructor | Guide | Playbook, step-by-step |
| 10 | real-reason-fitness-clients-quit | Instructor | Science | Myth-bust plus retention research |
| 11 | science-of-group-workouts | Consumer + Instructor | Science | Science explainer |
| 12 | fitness-habits-that-stick-research | Consumer | Science | Research roundup, systems over motivation |

---

## 4. Per-article briefs (theme review)

Each brief: current state, the angle we take, primary keyword and intent, sources to research and
cite (types plus known credible anchors, exact citations verified at write time), image
direction, and internal links.

### 1. how-to-choose-the-right-personal-trainer (Consumer, Guide)
- **Now:** Decent conversational draft, but generic advice, no data, formulaic H2s, a "Bottom Line" closer, heavy dash use.
- **Angle:** A practical decision checklist. What actually predicts a good trainer-client fit, and the specific questions to ask before you pay.
- **Keyword / intent:** "how to choose a personal trainer", informational, high consumer intent.
- **Sources:** recognized certification bodies (NASM, ACE, ISSA, NSCA) for what credentials mean; research on the trainer-client alliance and adherence.
- **Image:** a real coaching interaction, not a stock posed gym shot. Audit current cover.
- **Internal links:** online-vs-in-person-training, accountability-secret-to-fitness-results, app "find a trainer" page.

### 2. nutrition-habits-that-actually-stick (Consumer, Nutrition)
- **Now:** Listicle of 5 habits, fine bones, no evidence, fad-diet framing.
- **Angle:** Five habits that survive real life, each with why it works and one concrete action. Adherence over perfection.
- **Keyword / intent:** "healthy eating habits that stick", informational.
- **Sources:** habit and adherence research, protein and satiety evidence, USDA MyPlate for structure. YMYL, so cite carefully.
- **Image:** honest home-cooked plate, not a glossy salad.
- **Internal links:** beginners-guide-to-meal-prep, fitness-habits-that-stick-research.

### 3. hiit-vs-strength-vs-cardio (Consumer, Science)
- **Now:** Comparison, claims "what science says" but cites nothing.
- **Angle:** What each training style is best at, with an honest comparison table and a "pick by your goal" matrix. No single winner.
- **Keyword / intent:** "HIIT vs strength vs cardio", comparison intent.
- **Sources:** ACSM guidance, meta-analyses on HIIT versus moderate cardio for fat loss and VO2 max, resistance training for body composition and EPOC.
- **Image:** a split or three-way visual of the modalities.
- **Internal links:** finding-your-fitness-style, small-changes-big-results-daily-movement.

### 4. accountability-secret-to-fitness-results (Consumer, Wellness)
- **Now:** Motivational, thin, no data.
- **Angle:** Motivation fades, systems and social accountability last. PAS structure. Why a person in your corner changes adherence.
- **Keyword / intent:** "accountability fitness", informational.
- **Sources:** research on social support and exercise adherence, accountability and goal-commitment studies, group versus solo adherence data.
- **Image:** two people training together or a check-in moment.
- **Internal links:** science-of-group-workouts, real-reason-fitness-clients-quit, app group or client features.

### 5. beginners-guide-to-meal-prep (Consumer, Nutrition)
- **Now:** Friendly how-to, no template, no food-safety facts.
- **Angle:** A first-timer system with a copyable starter template. Time, storage, and variety without burnout.
- **Keyword / intent:** "meal prep for beginners", how-to.
- **Sources:** USDA safe food storage times, batch-cooking and adherence evidence. YMYL for food safety, cite precisely.
- **Image:** realistic prep containers, not a magazine spread.
- **Internal links:** nutrition-habits-that-actually-stick.

### 6. finding-your-fitness-style (Consumer, Guide)
- **Now:** Survey of styles, opinionated tone, no structure for choosing.
- **Angle:** Match a training style to your goal, schedule, and personality, with a short match table. Adherence beats the "best" workout.
- **Keyword / intent:** "types of workouts to find your fit", informational.
- **Sources:** enjoyment and adherence research, energy-expenditure ranges by modality.
- **Image:** a montage or a single distinctive style shot.
- **Internal links:** hiit-vs-strength-vs-cardio, small-changes-big-results-daily-movement.

### 7. small-changes-big-results-daily-movement (Consumer, Wellness)
- **Now:** Motivational, "literally" tic, no numbers.
- **Angle:** Why non-exercise movement compounds. NEAT, the truth about the 10,000-step figure, and the WHO activity floor.
- **Keyword / intent:** "benefits of daily movement", informational.
- **Sources:** WHO physical activity guidelines (150 minutes per week), NEAT research, step-count and mortality studies.
- **Image:** ordinary daily movement, walking or stairs, not a gym.
- **Internal links:** finding-your-fitness-style, accountability-secret-to-fitness-results.

### 8. online-vs-in-person-training (Consumer, Guide)
- **Now:** Comparison, teases "the answer isn't what you think", delivers little.
- **Angle:** Honest pros and cons of each, and when a hybrid wins. Cost, accountability, form feedback, convenience.
- **Keyword / intent:** "online vs in person personal training", comparison.
- **Sources:** remote coaching and telehealth adherence evidence, cost and access data.
- **Image:** a split of a screen session versus a gym session.
- **Internal links:** how-to-choose-the-right-personal-trainer, accountability-secret-to-fitness-results.

### 9. how-to-build-online-fitness-community (Instructor, Guide)
- **Now:** Instructor B2B playbook, decent, no data, ad-free hook.
- **Angle:** A concrete step-by-step for instructors to grow a community without ad spend. This is a core MotionHive B2B topic, so tie to product value naturally, not as a pitch.
- **Keyword / intent:** "build an online fitness community", instructor how-to.
- **Sources:** community and retention research, creator and membership growth benchmarks.
- **Image:** an instructor engaging a group online or in person.
- **Internal links:** real-reason-fitness-clients-quit, science-of-group-workouts, app group and community features.

### 10. real-reason-fitness-clients-quit (Instructor, Science)
- **Now:** Strong hook ("your program is lonely"), claims research, cites none.
- **Angle:** Myth-bust. Clients quit from isolation and lack of feedback, not laziness. Retention levers an instructor controls.
- **Keyword / intent:** "why fitness clients quit", instructor retention.
- **Sources:** dropout and churn statistics for gyms and coaching, social connection and retention research.
- **Image:** an empty or a full class to contrast retention.
- **Internal links:** how-to-build-online-fitness-community, accountability-secret-to-fitness-results.

### 11. science-of-group-workouts (Consumer + Instructor, Science)
- **Now:** Good science hook, names the Kohler effect in tags but not substantiated.
- **Angle:** Why people work harder with others. The Kohler effect, social facilitation, and adherence, explained cleanly.
- **Keyword / intent:** "science of group workouts", informational.
- **Sources:** Kohler effect studies (Kansas State, Irwin and Feltz), social facilitation literature, group exercise adherence data.
- **Image:** a genuine group class mid-effort.
- **Internal links:** accountability-secret-to-fitness-results, real-reason-fitness-clients-quit.

### 12. fitness-habits-that-stick-research (Consumer, Science)
- **Now:** "10 years of research" claim, no citations, systems-over-motivation framing.
- **Angle:** Research roundup. What habit science actually says about building consistency. Cue, routine, reward, implementation intentions, and realistic timelines.
- **Keyword / intent:** "how to build fitness habits", informational.
- **Sources:** Lally et al. 2010 on habit formation timelines, Gollwitzer on implementation intentions, cue-based habit research.
- **Image:** a calendar, a streak, or a small repeated action.
- **Internal links:** nutrition-habits-that-actually-stick, accountability-secret-to-fitness-results.

---

## 5. Execution

Two ways to produce the 24 articles. Both follow this plan and the playbook.

- **Batches (me directly).** I write in waves (for example the 8 consumer EN posts first, then
  their RO twins, then the 4 instructor posts and RO). You review a wave before I continue.
  Full control, slower wall clock, no extra setup.
- **Workflow (opt-in).** A fan-out that runs per topic: research sources, write EN, write RO,
  self-check against the kill-list, emit both Markdown files. I assemble and build the migration.
  Much faster, more tokens. Requires you to say "use a workflow".

Recommended: workflow for the first drafts, then a human review pass by us on voice and on every
cited fact before the migration is built. Writing is cheap to fan out; fact-checking and voice
are where we stay in the loop.

## 6. Order of work once the path is chosen

1. Build the `scripts/build-blog-migration.mjs` converter and confirm it renders one sample
   article to correct HTML.
2. Write article 1 EN and RO as the calibration pair, review voice and format together.
3. Produce the rest per the chosen execution path.
4. Human review pass: voice, and verify every source and image URL resolves.
5. Build the migration, run it on a copy or staging, then production, then trigger one rebuild.
