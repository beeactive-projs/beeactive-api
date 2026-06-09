# Global Search — audit & fix plan (2026-06)

_Companion to `recommendations.md`. That doc decided the long-term architecture; this one audits what's actually built, shows live evidence of the bugs, and gives a concrete, low-risk fix plan I'm confident in._

> **Status (2026-06):** P0 prefix-typeahead **fixed** (`SearchService._buildPrefixTsQuery` + `to_tsquery('<term>:*')`) — verified live: `mot`→MotionHive, `motion`→MotionHive, `tes`→Test Instructor, `stre`→strength now match incrementally. `reindexAll()` now **purges orphans** (clean rebuild). The visible "duplicates" were confirmed to be **real duplicate dev data** (two demo groups, two test-instructor users — different member counts), not index drift. Remaining items (tags, unaccent, highlight, pagination, public search) are still open per the plan below.

## Verdict in one line

**The architecture is right and the frontend is good — but the backend query has one critical bug that makes typeahead feel broken (no prefix matching), plus a few coverage gaps.** No re-platforming needed. Stay on Postgres FTS + `pg_trgm`. The fixes are surgical.

## What we have (and it's mostly good)

- **Backend** (`src/modules/search/`): a denormalized `search_doc` table with a weighted `tsvector` (title=A, tags/subtitle=B, body=C) **and** a `pg_trgm` `search_text` column, GIN-indexed both ways. One endpoint `GET /search?q=&type=&limit=` returns category-grouped results with per-entity boosts (instructor 1.5 › tag 1.3 › group 1.0 › session 0.9 › user 0.7), visibility filtering in the WHERE clause, 30 req/min throttle. This is the GitLab/Supabase pattern — correct for our scale (good to ~250k rows / 18–24 months before considering Meilisearch).
- **Frontend** (`_shared/components/search-modal`, `core/services/search`): ⌘K modal, **250ms debounce**, `switchMap` cancels in-flight requests, **min length 2**, category tabs that re-fire per tab, localStorage recents, hardcoded trending. The response model already declares `matchedFields` and `meta` for future highlighting. Solid; barely needs touching.

## Live tests (run against :3800, authed) — the evidence

```
q='motion'  → {}                         ← MotionHive Demo Group NOT found
q='mot'     → {}                         ← prefix: nothing
q='test'    → instructors + groups       ← only a COMPLETE word works
q='tes'     → {}                         ← prefix: nothing
q='yoga'    → "Test Instructor [functional_training]"  ← trigram NOISE (wrong)
q='yga'     → {}                         ← typo: nothing
q='strength'→ instructors + groups       ← complete word works
q='demo'    → 2× "MotionHive Demo Group" ← duplicate index rows
type='tags' → always []                  ← tags never indexed
sessions    → always 0                   ← sessions never surface
```

## Issues, ranked

### P0 — Typeahead has no prefix matching (the one that makes it feel broken)
Typing partial words returns **nothing** until you complete a whole word. `q='mot'`, `q='tes'`, `q='yog'` → empty. A typeahead that only matches complete words is the single worst search bug — every user types incrementally.

**Root cause:** the query uses `websearch_to_tsquery('simple', q)`. That turns `tes` into the lexeme `tes`, which does **not** match the stored lexeme `test` (no prefix). And the trigram fallback (`similarity(search_text, q) > 0.25`) is below threshold for short strings. So nothing matches until the word is complete.

**Also explains** `q='motion'` → nothing: "MotionHive" is stored as the single lexeme `motionhive`; `motion` isn't a prefix-match, so it misses.

### P1 — Coverage gaps
- **Tags never indexed.** No `entity_type='tag'` rows are written, so the Tags tab is permanently empty (`q='yoga' type=tags` → []). Tag indexing isn't wired (recommendations had it as a materialized view — never built).
- **Sessions never surface.** No session results in any query. Either the session write-hook isn't wired to `SearchIndexService` or there's no public/non-draft session data; needs confirming.
- **Duplicate / stale rows.** "Test Instructor" ×2 and "MotionHive Demo Group" ×2 (2 vs 3 members) in the *same* category. Either dupe seed data or stale index rows that a reindex would clean. Needs a `reindexAll()` run + a look at whether soft-deletes/recreates leave orphans.

### P2 — Quality & polish
- **Trigram noise:** `yoga` matched a `functional_training` instructor — fuzzy fallback fires on weak similarity and pollutes results. Threshold/usage needs tuning (prefix matching will reduce reliance on it).
- **No diacritics/unaccent:** "București" vs "Bucuresti" won't cross-match (the `simple` config doesn't unaccent). Real for Romanian content.
- **`matchedFields` not returned** by the BE, so the modal can't bold the matched substring (model already supports it).
- **Pagination unused:** `nextCursor` is always `null`; "See all 24 →" can't load more.
- **Stale FE comment:** `search.service.ts` says "the endpoint isn't built yet" — it is; update the comment.
- Auth is required (recommendations suggested public-entity search for SEO — deliberate v1 choice, leave for later).

## The fix (confident, surgical — this is the long-term-correct implementation, not a patch)

### Fix 1 — Prefix typeahead (P0). The core change.
Replace `websearch_to_tsquery('simple', q)` with a **prefix tsquery**: split the query into terms, sanitize each, append `:*`, AND them together.

```
'motion'      → to_tsquery('simple', 'motion:*')        → matches 'motionhive' ✓
'mot'         → to_tsquery('simple', 'mot:*')           → matches 'motionhive' ✓
'tes'         → to_tsquery('simple', 'tes:*')           → matches 'test' ✓
'yoga coach'  → to_tsquery('simple', 'yoga:* & coach:*')
```

This is the canonical Postgres typeahead pattern and fixes prefix matching **and** the "MotionHive"/compound-word miss in one change. Build the tsquery string in `SearchService` (strip the tsquery operators `& | ! ( ) : * '` from each term, drop empties, append `:*`, join with ` & `). Keep the existing `similarity()` OR-branch as the **typo** fallback only (so `yga`→`yoga` still works) but it's no longer load-bearing for prefixes. Confidence: high — it's a localized change to one SQL string + a small helper, fully unit-testable, no schema change.

### Fix 2 — Diacritics (P2, small). 
`CREATE EXTENSION unaccent;` and wrap both the indexed `search_text`/vector input and the query in `unaccent(...)` (or add an `unaccent`-based `simple` text-search config). Makes "Bucuresti" match "București". Migration + reindex.

### Fix 3 — Tags as first-class results (P1). 
Materialize a distinct tag list from `instructor.specializations` + `group.tags` and upsert `entity_type='tag'` rows into `search_doc` (title = tag, subtitle = usage count). Refresh in the same write hooks that already touch instructor/group. Low effort, high "feels complete" payoff.

### Fix 4 — Reindex + dedupe audit (P1). 
Run `POST /search/reindex` (SUPER_ADMIN) and compare per-`entity_type` counts to source tables; confirm whether the duplicates are real data or orphaned index rows, and ensure soft-delete/recreate paths call `removeIfExists`.

### Fix 5 — Return `matchedFields` + wire highlight (P2). 
Add the matched field paths to the SELECT (cheap: compare which weighted segment matched) so the modal can bold the matched substring. The FE model already has the field.

## What I'd do now vs later

- **Now (½–1 day, high impact):** Fix 1 (prefix typeahead) + Fix 4 (reindex/dedupe check). This alone makes search feel genuinely good.
- **Soon:** Fix 3 (tags), Fix 2 (unaccent), confirm session indexing.
- **Later (day-30+, already in recommendations.md):** personalization boosts (city/followed), "did you mean", `matchedFields` highlight, cursor pagination, public/SEO search, real trending (needs jobs module — which now exists).
- **Don't:** spin up Elasticsearch/Algolia/Meilisearch. Postgres FTS is the right call until ~250k searchable rows; the denormalized `search_doc` is already the exact shape you'd hand to Meili later if you ever needed to.
