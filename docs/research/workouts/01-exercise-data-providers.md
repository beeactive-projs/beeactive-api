# Exercise Data Providers — Market Analysis

**Date verified:** May 2026
**Recommendation in one line:** Seed V1 from **Free Exercise DB** (public domain), plan **MuscleWiki** as a V2 licensed media-overlay partnership, never integrate **API-Ninjas / RapidAPI ExerciseDB** as runtime dependencies.

## Decision criteria

For each provider, we evaluated:
- **License of the data** (not the code) — can we store rows in our DB and serve them via our API?
- **Coverage** — exercise count, taxonomy granularity, multilingual support
- **Media** — image vs GIF vs video, hotlink-only vs downloadable, resolution
- **Maintenance** — is the dataset still being updated?
- **Cost in 2026** — verified, current
- **Caching policy** — does the TOS let us cache?
- **Lock-in risk** — what unique IDs would we bake in, what happens if they shut down

## Provider comparison table

| Provider | License | Count | Media | $/mo | Cache OK? | Lock-in | V1 verdict |
|---|---|---|---|---|---|---|---|
| **Free Exercise DB** | **Unlicense (public domain)** | ~870 | JPG pairs | $0 | ✅ Own it | None | ✅ **Primary seed** |
| **wger** | CC-BY-SA 3.0 (data) | ~1,000 | Mixed images | $0 | ⚠️ Share-alike | Low | Gap-filling only |
| **MuscleWiki** | Proprietary, partnership available | 1,900+ / 7,500+ videos | Pro videos | $5+ + license | Email to ask | High | V2 partnership target |
| **ExerciseDB (RapidAPI)** | Unclear redistribution; GIF rights murky | ~1,300 | GIFs | ~$25–$150 | ⚠️ Unclear | High | ❌ Skip |
| **API-Ninjas** | TOS forbids caching below Enterprise | Several thousand | None | $0 free tier | ❌ Forbidden | Medium (no cache) | ❌ Skip |
| **Hevy / Strong / Trainerize APIs** | Not licensors | — | — | — | — | — | ❌ Competitors, not data sources |

## Provider deep-dives

### Free Exercise DB (yuhonas/free-exercise-db) — V1 PRIMARY SEED

- **License:** [Unlicense](https://unlicense.org/) — public domain dedication. No attribution required, no share-alike, commercial use explicitly allowed, redistribution explicitly allowed.
- **Source:** [github.com/yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
- **Coverage:** ~870 exercises with JSON metadata: `force` (push/pull/static), `level` (beginner/intermediate/expert), `mechanic` (compound/isolation), `equipment`, `primaryMuscles`, `secondaryMuscles`, `instructions[]`, `category`. The shape is **almost identical** to what we need — minimal mapping work.
- **Media:** Two static JPG images per exercise (start position + end position), bundled in the repo at `exercises/<Slug>/0.jpg` and `1.jpg`. Quality is functional, not premium — community-contributed.
- **Maintenance:** Lightly maintained. Dataset is essentially stable. Since we one-time-ingest, abandonment doesn't break us.
- **Lock-in risk:** **Zero.** Once seeded, the data is ours. The project disappearing changes nothing.
- **Action:** Download JSON, rehost JPGs to Cloudinary at seed time (Cloudinary is already a project dependency), map to our enums in a seed script.

### wger (wger.de) — GAP-FILLING ONLY

- **Code license:** AGPL-3.0+
- **Data license:** **CC-BY-SA 3.0** — attribution required, **share-alike viral on any derived database**. This is a real legal trap: if we ingest wger data wholesale into our DB and then build our DB up, the CC-BY-SA share-alike clause arguably forces our combined DB to be CC-BY-SA. Lawyers disagree on how viral SA is for databases, but the conservative read makes wger inappropriate as a primary seed for a commercial SaaS.
- **Source:** [wger.de/en/software/api](https://wger.de/en/software/api), [github.com/wger-project/wger](https://github.com/wger-project/wger)
- **API:** Public REST, no auth required (`exercise`, `exerciseinfo`, `muscle`, `equipment`, etc.).
- **Coverage:** ~1,000+ exercises with translations (EN/DE/ES/FR/PT/RU+). Quality is uneven — the maintainers describe the list as "incredibly long, of varying quality, and with a lot of duplicates."
- **Media:** Community-contributed images, variable quality. Some videos.
- **Maintenance:** Actively maintained, version 2.6 docs dated April 2026.
- **Use case for MotionHive:** Pull *specific* exercises into our DB to fill gaps in Free Exercise DB. Mark those rows `source='wger'`, accept CC-BY-SA on those rows only, attribute in the UI. Do NOT ingest the whole DB.

### MuscleWiki (musclewiki.com) — V2 PARTNERSHIP TARGET

This is the option I underrated in my first research pass. Updated take:

- **Business:** Real, profitable — **$5M ARR with 6 employees in 2024** ([Latka profile](https://getlatka.com/companies/musclewiki.com)). They'll be around in 5 years.
- **Coverage:** **1,900+ exercises, 7,500+ video demonstrations across 45 muscle groups** — the largest, highest-quality catalog in the market. They film all content themselves with trained professionals.
- **Mobile presence:** Native iOS + Android apps (not just a website).
- **API:** Launched ~late 2024. RESTful, paginated, search endpoint, video-only endpoint to reduce bandwidth.
- **Pricing tiers ([api.musclewiki.com](https://api.musclewiki.com)):**

  | Tier | Cost | Calls/mo | Access |
  |---|---|---|---|
  | BASIC | Free | 500 | Playground only — **no direct API key** |
  | TESTING | $5/mo | 1,000 | Direct API access |
  | Higher | Custom | — | Enterprise on request |

- **License — the key clarification:** From their [terms](https://musclewiki.com/terms): "Content that cannot be redistributed without prior written consent of MuscleWiki includes the male and female front/back muscle map illustrations…If you wish to discuss using this content, email [their address] with your contact information, exactly which content you are interested in presenting and the URL on which it will appear. Once you are granted permission, we will require acknowledgements stating 'images/content created by musclewiki.com and are used here with permission from MuscleWiki' along with a link to musclewiki.com."

  So it's **not "no redistribution"** — it's **"ask permission, get a license, attribute."** That's a normal B2B relationship.

- **The blocker:** $5/mo for 1,000 calls is trivial **if we cache locally**. The terms page doesn't explicitly say whether the TESTING tier license permits local caching. We need to email and ask.
- **Lock-in risk:** High if we use their IDs and hotlinked video URLs as foreign keys. **Mitigated by our `source` + `source_id` + `exercise_media` overlay design** (see [05-db-schema.md](./05-db-schema.md)): if MuscleWiki shuts down or terms change, we drop the `exercise_media WHERE provider='musclewiki'` rows and our catalog is unaffected.

**Action items (see [07-open-questions.md](./07-open-questions.md)):**
1. Email MuscleWiki: (a) can the catalog be cached locally? (b) can videos be embedded in a paid SaaS app? (c) what does a startup-tier license cost? (d) is attribution the only obligation?
2. Decide based on their response, not in advance.

**Unofficial scrapers exist** ([LeManhDuy/MuscleWikiAPI](https://github.com/LeManhDuy/MuscleWikiAPI), [Saranjen/MuscleWikiAPI](https://github.com/Saranjen/MuscleWikiAPI)) — **do not use these.** Legally it's the hiQ-v-LinkedIn grey zone for public data, but doing this at scale for a commercial SaaS is the textbook cease-and-desist setup. Don't.

### ExerciseDB on RapidAPI (justin-WFnsXH_t6) — SKIP

- **Coverage:** ~1,300 exercises with GIFs, target body part, equipment, instructions.
- **Pricing ([RapidAPI page](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb/pricing)):** BASIC (free, hard-limited) / PRO ($25/mo) / ULTRA ($75/mo) / MEGA ($150/mo) with overage billing. **JS-rendered page — verify before committing.**
- **License:** Governed by [RapidAPI's standard TOS](https://rapidapi.com/page/terms) — a "limited non-exclusive non-transferable license to use the API." **No explicit grant to bulk-cache the dataset and serve it from our own DB.** The GIFs are streamed per-request and are the publisher's commercial moat.
- **Why skip:** Unclear redistribution rights on the GIFs themselves (likely sourced from third parties), no bulk-cache clause, proprietary string IDs (e.g. `"0001"`) that would lock us in if we baked them in.
- **The community-forked repos** that claim 11,000+ exercises with GIFs — assets originate from this paid dataset and have no clear license. Legally risky for production.

### API-Ninjas Exercises (api-ninjas.com/api/exercises) — SKIP

- **Coverage:** Several thousand exercises with `name`, `type` (strength/cardio), `primary muscle`, `difficulty`, `equipment[]`, `instructions`. **Text only — no images, no GIFs, no videos.**
- **Pricing ([api-ninjas.com/pricing](https://api-ninjas.com/pricing)):** Free tier (limited monthly), Developer tier (~100k calls/mo).
- **Why skip — the deal-breaker:** Their TOS **explicitly forbids data caching/storing on plans below Enterprise**. Only the Unlimited Enterprise tier allows local storage. There's also an explicit "no building a competing API/database" clause. This means every read in our app would hit their API live forever — a hard dependency we can't shed cheaply and a SPOF on their infrastructure.

### Hevy, Strong, Trainerize, FitnessAI, TrainHeroic, Wodify — NOT LICENSORS

These are competitors. Their APIs are designed for *users* (or partners syncing user data), not for licensing the exercise catalog itself:

- **Hevy** has a public REST API gated behind Hevy Pro subscription. API exposes user-level data (templates, routines, workouts) — not licensable as a catalog.
- **Strong** — no public API.
- **FitnessAI** — no public API.
- **Trainerize** — partner API for *customer data sync*, not catalog licensing.
- **TrainHeroic** — no open API.
- **Wodify** — Zapier integration ecosystem only, no catalog API.

## Decision logic

```
                     ┌─── V1 seed ───► Free Exercise DB (Unlicense)
                     │                  ~870 exercises, JPG pairs, $0
                     │
                     ├─── V1 gap-fill ► wger per-exercise with attribution
                     │                  (CC-BY-SA only on those rows)
Catalog architecture │
                     ├─── V2 polish ──► MuscleWiki via licensed partnership
                     │                  1,900+ exercises, 7,500+ videos
                     │                  ($ TBD — email them)
                     │                  Layered as exercise_media overlay,
                     │                  NEVER as a foreign key
                     │
                     └─── Always on ──► User-generated custom exercises
                                        with YouTube URL (V1)
                                        Upload via Cloudinary (V2)
```

## The architectural insurance policy

Whatever provider we add must slot into this shape (defined in [05-db-schema.md](./05-db-schema.md)):

```sql
-- exercise table:
exercise.source        VARCHAR(50)  -- 'free-exercise-db' | 'wger' | 'system' | 'user' | 'admin'
exercise.source_id     VARCHAR(255) -- e.g. 'Barbell_Squat' from Free Exercise DB
-- ^ Traceability only. Never a foreign key. Provider can disappear; we keep the row.

-- exercise_media table:
exercise_media.exercise_id     UUID FK exercise(id)  -- ours
exercise_media.provider        VARCHAR(50)            -- 'musclewiki' | 'wger' | 'cloudinary' | 'youtube'
exercise_media.provider_asset_id VARCHAR(255)
exercise_media.url             TEXT
exercise_media.kind            ENUM('VIDEO','GIF','IMAGE','THUMBNAIL')
exercise_media.licensed_until  DATE NULLABLE
-- Drop the rows when a license expires; the exercise stays.
```

This pattern is non-negotiable. It's the single decision that protects us from every "the provider raised prices / shut down / changed terms" scenario.

## Sources

- [Free Exercise DB GitHub](https://github.com/yuhonas/free-exercise-db)
- [Unlicense](https://unlicense.org/)
- [wger GitHub](https://github.com/wger-project/wger)
- [wger 2.6 documentation](https://wger.readthedocs.io/)
- [wger REST API page](https://wger.de/en/software/api)
- [MuscleWiki homepage](https://musclewiki.com/)
- [MuscleWiki about / 2000+ free exercise videos](https://musclewiki.com/about)
- [MuscleWiki terms](https://musclewiki.com/terms)
- [MuscleWiki API home](https://api.musclewiki.com/)
- [MuscleWiki API documentation](https://api.musclewiki.com/documentation)
- [MuscleWiki API demo](https://api.musclewiki.com/demo)
- [Latka — MuscleWiki $5M ARR 6-person team (2024)](https://getlatka.com/companies/musclewiki.com)
- [LinkedIn — MuscleWiki API launch](https://www.linkedin.com/posts/leonardohermoso_musclewiki-api-exercise-database-with-video-activity-7430669192883904512-Ax-o)
- [ExerciseDB on RapidAPI](https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb)
- [RapidAPI standard TOS](https://rapidapi.com/page/terms)
- [API-Ninjas Exercises](https://api-ninjas.com/api/exercises)
- [API-Ninjas TOS](https://api-ninjas.com/tos)
- [Hevy API Swagger](https://api.hevyapp.com/docs/)
- [Trainerize API help](https://help.trainerize.com/hc/en-us/articles/37082084919060-Using-API-and-Webhooks-With-ABC-Trainerize)
