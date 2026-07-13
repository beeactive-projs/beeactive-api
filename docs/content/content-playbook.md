# MotionHive Content Playbook

The standard for writing and editing MotionHive blog content (EN and RO) so it reads as
human, credible, and useful. Applies to every post in the `blog_post` table and to any
future drafting done through the `draft-post` skill.

This document is written to be followed literally. If a rewrite conflicts with a rule
here, the rule wins unless we change the rule first.

> Note on style: this document deliberately uses no em dashes or en dashes as
> punctuation, because Rule 1 below bans them. It is meant to model the target style.

---

## How to use this

1. Draft or start from the existing AI draft.
2. Run the **House rules** pass (Section 1). These are the two things a reader notices first.
3. Run the **Kill-list** pass (Section 2). Search-and-destroy the words, phrases, and patterns.
4. Apply the **Editing method** (Section 3) to add substance and voice back in.
5. Check the piece against the **Structure template and non-negotiables** (Sections 4 and 5).
6. Sanity-check the **strategy reality** notes (Section 6) so we do not optimize for the wrong thing.

---

## 1. House rules (the two that matter most)

These are stricter than everything else in this document. They come first because they
are the tells a normal reader spots instantly, before any word choice.

### Rule 1: No dashes as sentence punctuation

The em dash (`—`) and the en dash (`–`) used mid-sentence are the single most recognizable
"this was written by AI" signal to ordinary readers, even when the grammar is correct.
We do not use them. Ever. Not even when they would be technically fine.

What is banned:
- Em dash used as a pause or aside: `The plan works — most of the time.`
- Em dash pair used as parentheses: `The plan — which we tested — works.`
- En dash used the same way.

How to rewrite instead (in order of preference):
1. Split into two sentences. `The plan works. Most of the time.`
2. Use a comma. `The plan, which we tested, works.`
3. Use a colon when introducing an explanation. `The plan works: we tested it for a month.`
4. Use parentheses, sparingly, for a genuine aside. `The plan works (we tested it).`

What is still allowed:
- The hyphen in compound modifiers: `well-known`, `30-minute workout`, `full-body`. That is
  not a dash and not a tell.
- Number ranges in tables or specs may use a hyphen (`10-15 reps`). In flowing prose, prefer
  the word "to": `10 to 15 reps`, `three to four sets`.

Editing tip: search the draft for the literal characters `—` and `–` and remove every one.

### Rule 2: No bullet lists in article bodies

AI over-lists. It turns every paragraph into bullets and every idea into a numbered set.
MotionHive articles are written as prose. A reader should move through ideas in sentences and
paragraphs, not scan a stack of bullets.

Rules:
- **No bulleted lists in article bodies.** If the draft has bullets, rewrite them as prose.
  Four bulleted questions become one flowing paragraph that asks them. A bulleted "grocery list"
  becomes a sentence or two that names the items.
- **Numbered steps are allowed only in a genuine step-by-step tutorial** where the order is the
  point, for example a five-step Sunday meal-prep routine. Even then keep them short, and only if
  prose would genuinely read worse.
- If content feels unavoidably list-shaped, that is usually a sign it needs a distinct visual
  treatment later (a styled checklist or step component), not raw bullets dropped into the body.
  Flag it rather than defaulting to bullets.
- The one accepted exception is the final Sources list, which is a bibliography, not body copy.
- No rule-of-three tics: not every idea needs exactly three parallel items or three adjectives.

The test: if you would not say it out loud as a bulleted list to a client, do not write it as one.

---

## 2. Kill-list

Search for these and remove or replace them. One instance is coincidence. A cluster is the tell.

### 2a. Words (hollow, overused, or AI-signature)

Classic tells:
delve, dive into, unlock, unleash, elevate, supercharge, boost, harness, leverage, robust,
seamless, holistic, myriad, plethora, testament, underscore, pivotal, crucial, vital,
essential, game-changer, empower, embark, journey, realm, landscape, tapestry, navigate
(figurative), ever-evolving, fast-paced.

Data-confirmed spikes in AI text (FSU / arXiv 2412.11385):
meticulous, garner, boast, surpass, strategically, intricate, intricacies, showcase,
showcasing, groundbreaking, advancements, align with, aligns, foster, fostering, enhance,
enhancing, vibrant, interplay, streamline, streamlined, optimize, ecosystem, paradigm,
synergy, scalable, cutting-edge, future-ready, demystify, uncover, ignite, nuanced, nuance,
unpack, comprehensive, multifaceted, unwavering, dynamic, profound, renowned, diverse array.

Newer, sneakier tells (Forbes 2026 tracking, use judgment since some are ordinary words):
quietly, shift, matters (used as a verb of importance), shape, land (figurative), actually,
real (as an unearned intensifier), "the work," compound (as a verb), signal (as an abstract
noun), "built different."

Fitness and wellness hype to avoid specifically:
transform, revolutionary, powerful, ultimate, perfect, effortless, secret, hack, "the key to,"
"take it to the next level," "crush your goals," "unlock your potential."

### 2b. Phrases and sentence frames

Openers and filler:
- "In today's fast-paced world" / "In the world of fitness" / "In a world where" / "In the digital age"
- "Whether you're a beginner or a seasoned athlete"
- "It's important to note" / "It's worth noting" / "It's worth mentioning"
- "The truth is" / "Let's be real" / "Let's dive in"
- "At the end of the day" / "When all is said and done"
- "Picture this" / "Imagine this" / "Imagine a world where"
- "Buckle up" / "Look no further than"

Connectors and reframes:
- "That said," / "Furthermore," / "Moreover," / "Additionally," (cap stock transitions hard)
- "Not only... but also..."
- "This isn't just X, it's Y" and "It's not about X, it's about Y" used reflexively
- "In essence" / "Essentially" / "In summary"
- "aims to" (hedged verb)

Therapist-mode and chat-leakage (never in published copy):
- "You're not alone" / "you're not broken" / "you're not imagining it"
- "I hope this helps" / "Let me know if you need anything else" / "Here's the breakdown"

Vague authority (always fix, see Section 3):
- "studies suggest" / "experts agree" / "research shows" / "industry experts say" with no source

### 2c. Structural patterns

- Intro that restates the title, then says "in this article we'll cover."
- Copula avoidance: "serves as," "stands as," "marks," "represents" instead of plain "is" or "has."
- Participial add-ons: a main clause with a comma plus an "-ing" clause tacked on, repeatedly.
- Faux balance: presenting both sides and then refusing to take a stance.
- "Generic specificity": examples that sound concrete but contain no real detail.
- "Despite its [positives], X faces several challenges" formula closers.
- Uniform sentence length, sentences that march in formation.
- Every H2 built to the same template.

### 2d. Punctuation and formatting

- Dashes as punctuation. See Rule 1. This is the top priority.
- Scare quotes for emphasis: the "best" trainer.
- Title Case Headings Where Every Word Is Capitalized. Use sentence case.
- Cutesy parentheticals for tone: "(and that's okay)", "(seriously)".
- Mechanical bolding of nearly every key term.

### 2e. Copy-paste smoking guns (always grep for these before publishing)

Literal artifacts that prove text came straight out of a chat tool: `oaicite`, `turn0search0`,
`contentReference`, `attached_file`, stray raw markdown like `**bold**` or `#` inside HTML
content, and emoji used as bullet points.

### 2f. Banned closers

Do not end an article with a heading called "Conclusion," "In Conclusion," "Final Thoughts,"
"The Bottom Line," "Key Takeaways" (as a closer), or "Wrapping Up." A 1,000-URL study found
"Conclusion" headers had the strongest negative engagement correlation in the dataset. See
Section 4 for what to do instead.

---

## 3. Editing method

Ranked by how consistently professional editors and the research named each technique. The
first two carry the most weight.

1. **Add detail only a human could supply.** One real number, named study, date, price, or
   concrete example per section. This is the single biggest thing that separates human copy
   from AI copy. It also raises E-E-A-T (Section 5).
2. **Cut hedging and vague authority.** Replace "studies suggest" with the actual named source,
   or delete the claim. Replace "a number of" with the number.
3. **Break the rhythm.** Vary sentence length on purpose. Follow a long sentence with a short
   one. AI clusters everything at a similar length, which reads smooth but oddly even.
4. **Read it aloud.** The cheapest and most reliable way to catch dead phrasing and unnatural
   transitions. If you stumble reading it, rewrite it.
5. **Commit to a point of view.** Pick an angle and say it plainly. Do not default to the
   balanced middle that offends no one and says nothing.
6. **Edit in separate passes.** Structure pass first (does this have a real point, is it
   specific enough), then a line and word-choice pass, then a final human pass for voice and
   factual accuracy. Do not try to do all three at once.

Voice anchor: match the MotionHive brand voice defined in the `draft-post` skill. Write like a
knowledgeable coach talking to a real person, not like a brand talking to a market.

### Facts and statistics (woven in, never boxed)

Every article should teach the reader something they did not already know, backed by a real
source, and it must feel like part of the writing.

- **Weave facts into the prose.** A statistic or study finding goes inside a sentence that
  makes an argument, in the flow of the section. Do not box it out as a "Did you know?" callout
  or a trivia sidebar. The reader should learn the fact while reading the point it supports, not
  as a decorative interruption.
- **At least one genuinely interesting, verifiable fact per article**, chosen because it
  supports the article's view, not to pad. Prefer a concrete number or a specific study finding
  over a vague "research shows".
- **Real sources only. No invented studies, ever.** Every factual claim that leans on research
  gets an inline `[source](url)` link to a real, checkable source (the study, a PubMed/DOI page,
  or an authoritative body). If you cannot find a real source, cut the claim.
- **Everything is verified at the end.** `scripts/build-blog-migration.mjs` writes
  `docs/content/CITATIONS.md`, a checklist of every external reference. Before the migration
  ships, each link is opened and confirmed to (a) resolve and (b) actually support the claim it
  is attached to. Nothing ships with an unchecked citation.

### SEO (both languages)

- Pick one primary keyword and a few secondary/semantic terms per article, **for EN and for RO
  separately** (they are different search markets, not translations of each other).
- Place the primary keyword naturally in the title, the first paragraph, at least one heading,
  the excerpt/meta, and the slug. Do not stuff; unnatural repetition is itself an AI tell.
- Cover the topic's related terms so the piece reads as genuinely about the subject, and link
  out to sibling articles with descriptive anchor text.
- Data-backed keyword research needs the Ahrefs or Semrush connector. Until one is authorized,
  keyword choices are informed but not volume-validated; revisit once it is available.

---

## 4. Article structure template

Applies to all four categories (Guide, Nutrition, Science, Wellness).

1. **Title.** Sentence case. Lead with the benefit or outcome. Aim for about 60 characters.
2. **Byline and credential line.** Author name plus a relevant credential or role. Add a
   reviewer credit when the piece makes a clinical or nutritional claim.
3. **Meta description / excerpt.** About 150 to 160 characters. Put the value in the first 100.
4. **Intro, written last.** Write or rewrite the intro after the body exists. It must:
   name the reader's real problem, state why it matters now, give one concrete proof point
   (a number, a named mistake, a specific scenario, not "studies show"), then preview
   specifically what the article delivers. Never restate the title.
5. **Optional Key Takeaways box.** Allowed, and useful for pieces over about 1,200 words, but
   only if it is genuinely specific: three to five real takeaways from the actual article. A
   Key Takeaways box that just restates the title is an AI tell. Placed right after the intro.
6. **Body, H2 sections.** Each H2 answers one meaningful sub-question. The first one or two
   sentences under the heading answer it directly, so a scanner gets the point. Sections should
   not overlap and together should leave no obvious gap. Mix declarative headings and
   question-form headings based on how a real reader would phrase the sub-topic, not for
   uniformity. Paragraphs stay short, roughly one to three sentences. Use lists only per Rule 2.
7. **Sourcing woven through the body.** Attribute or link specific claims and statistics where
   they appear, not batched at the end.
8. **Optional FAQ.** Three to six real reader questions not already answered in the body, each
   answered in one to three sentences. Mark up with FAQPage schema where the site supports it.
9. **Closing.** A short recap that sets up one clear, specific next step for the reader. No
   heading called "Conclusion." End on the next action, not a motivational summary.
10. **Metadata footer.** Published date, and an updated date plus reviewer credit whenever the
    post is later revised.

Frameworks to pick from for the intro and overall shape:
- **Inverted pyramid** (answer first, detail after). Best default for Guide and reference posts
  where the reader wants the answer fast and may not read to the end.
- **PAS (Problem, Agitate, Solution).** For Wellness or persuasion pieces where the reader does
  not yet feel the problem's urgency. Keep the agitation honest, never fear-mongering, since
  this is health content.
- **Topic, why it matters, game plan.** The simple reliable fallback for explainer content.

---

## 5. Structure non-negotiables

These are load-bearing, not polish. Every post must respect them.

- **Front-load the payoff** in the intro, in every heading, and in the first line of every
  paragraph. A reader scanning only the first few words of each line should still get the gist.
- **Real byline plus credential.** Fitness, nutrition, and health are YMYL ("Your Money or Your
  Life") topics, so Google and readers hold the trust bar higher here than for a hobby blog.
- **Cite sources for specific claims.** Name or link the study or organization. Vague
  "studies show" is exactly what low-trust content does.
- **Short paragraphs, and headings that read as a standalone outline.** Someone reading only the
  headings should understand the shape of the article.
- **Depth matched to the question, not a word count.** Guide pieces usually land between about
  1,200 and 2,500 words, but length follows from fully answering the question. Do not pad to hit
  a number, and do not stop short of resolving it.
- **End on one clear next step.**

Known product gap to track: the `blog_post` entity has publish and updated dates and a byline,
but no field for an author credential or a "reviewed by" line. YMYL health content wants both.
Decide separately whether the frontend should surface a credential and reviewer line.

---

## 6. Strategy reality (so we do not optimize for the wrong thing)

- **Do not chase AI-detector scores.** Detectors are unreliable, and Stanford found they
  falsely flag about 61 percent of human-written non-native-English essays as AI. Since we write
  English as Romanian speakers, optimizing for a detector would work against us. OpenAI shut down
  its own detector at about 26 percent accuracy. Treat any detector score as a weak nudge to
  edit, never as a pass or fail bar.
- **Google does not penalize AI content as such.** A 600,000-page Ahrefs study found the
  correlation between percent-AI content and ranking was 0.011, which is negligible. What Google
  actually penalizes is thin, low-effort, low-originality, no-authority content produced at scale.
- **So the winning move is substance and E-E-A-T,** which is exactly the research-and-write plan:
  original detail, a real byline, cited sources, genuine usefulness. That is what earns rankings
  and reader trust, regardless of whether AI helped with the draft.
- **The em dash is a fading detector signal, but we still ban it** (Rule 1) because ordinary
  readers recognize it, and reader perception is what we care about, not the detector.
- **Legal:** do not copy or closely paraphrase other people's articles. Facts and ideas are free
  to use; the specific expression is not. The EU has no broad "fair use," so close paraphrase of
  a source is riskier for our RO content than people assume. Draw facts from public-domain
  sources (US federal health agencies), permissively licensed content (mind CC-BY-SA share-alike
  and CC-NC non-commercial), and peer-reviewed research, then write it fresh.

---

## Sources

Editing craft and tells:
- Wikipedia, Signs of AI writing: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- Ann Handley, How to Write Like Robots Can't: https://annhandley.com/how-to-write-like-robots-cant/
- Contently, How to Edit the AI-isms Out of Your Content: https://contently.com/2025/10/14/how-to-edit-the-ai-isms-out-of-your-content-no-detectors-needed/
- Content Marketing Institute, Good Editing Makes AI Content Memorable: https://contentmarketinginstitute.com/ai-content-creation-tools/editing-ai-content
- FSU / arXiv, Why Does ChatGPT Delve So Much (word-spike data): https://arxiv.org/html/2412.11385v1
- SearchEngineLand, AI writing tics engagement study: https://searchengineland.com/ai-writing-tics-engagement-study-470051

Structure and scannability:
- Backlinko, How to Write a Blog Post: https://backlinko.com/write-a-blog-post
- Ahrefs, How to Format a Blog Post: https://ahrefs.com/blog/how-to-format-a-blog-post/
- Animalz, Content Writing Guide: https://www.animalz.co/blog/content-writing-guide
- NN/g, F-Shaped Pattern: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/
- Semrush, How Long Should a Blog Post Be: https://www.semrush.com/blog/how-long-should-a-blog-post-be/

SEO and credibility:
- Google, Creating Helpful, Reliable, People-First Content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google, Guidance on AI-generated content: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- Ahrefs, AI content does not hurt rankings (600k pages): https://ahrefs.com/blog/ai-generated-content-does-not-hurt-your-google-rankings/
- Healthline, Editorial Process (health-content benchmark): https://www.healthline.com/about/process
- Stanford / Tech&Learning, detectors discriminate against non-native speakers: https://www.techlearning.com/news/ai-detectors-discriminate-against-non-native-speakers-says-stanford-research
