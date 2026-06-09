# Access-aware search redirects — design

_Problem: clicking a search result should take you to **that item**, with the right view for **your access** — the real page if you can see it, a "details + request access" view if you can't. Never a generic Discover list showing everything._

## The key insight

**The access-aware destination pages already exist.** We don't need new screens (so no Claude Design needed — the pages render the right thing per access; we just have to route to them and feed the router enough info):

- **Session showcase** (`/sessions/:instanceId`) already returns **full detail** OR a **redacted "blocked" variant** ("join the group to see this") OR 404, based on the viewer — via `GET /sessions/instances/:id/public`. The component switches on `isBlockedInstance()`.
- **Group preview** (`/groups/preview/:id`) already shows public info + join/request for non-members, and "invite only" disabled for invite-only.
- **Group detail** (`/groups/:id`) is the members-only inside (403s non-members).

So the right approach is **route to the item's own page**, picking detail-vs-preview / full-vs-blocked by access. The "Discover with the search on" idea is only the *last-resort* fallback (e.g. a session with no upcoming instance) — the preview/showcase are strictly better because they show the specific item.

## Access models (what determines "can I see it")

**Sessions** (`SessionAccess`): `OPEN`/`FREE` = anyone · `CLIENTS_ONLY` = active clients of the instructor · `GROUP_ONLY` = members of the group.
- **Crucial simplifier:** search indexes a session as `is_public = (access OPEN|FREE)`. The search query returns `is_public=true OR owner`. **So a normal user only ever sees OPEN/FREE sessions in search** — CLIENTS_ONLY/GROUP_ONLY simply don't appear for them. That means a clicked session result is (almost always) fully viewable → route to the showcase, full view.

**Groups**: `isPublic` + `joinPolicy` (OPEN/APPROVAL/INVITE_ONLY). Member → inside; public non-member → preview (join/request); private → not in search.

## The redirect matrix

| Result | Viewer state | Destination | Page shows |
|---|---|---|---|
| **Group** | member / owner | `/groups/:id` (inside) | full group |
| **Group** | non-member, public | `/groups/preview/:id` | info + Join/Request |
| **Group** | non-member, invite-only | `/groups/preview/:id` | info + "Invite only" (disabled) |
| **Session** | OPEN/FREE (the only kind they see) | `/sessions/:instanceId` (showcase) | full detail + Book |
| **Session** | owner | `/sessions/:instanceId` (or their coaching view) | full |
| **Session** | no upcoming instance | `/sessions/discover` *filtered to it* (fallback) | the item in context |

## Gaps to close (the actual work)

**Groups — need a per-viewer "am I a member" flag on the result.** The search result has none today, so the FE can't choose detail vs preview.
- **Fix:** the search query already carries `viewerId` — add an `EXISTS(group_member …)` subquery to return `viewerIsMember` per group row (query-time, **no migration**). FE routes member→`/groups/:id`, else→`/groups/preview/:id`.
- Minor: search also returns INVITE_ONLY public groups (Discover filters them out; search doesn't). Add `joinPolicy != 'INVITE_ONLY'` to the group branch, or keep + let preview show the disabled state.

**Sessions — need to reach the showcase from a template id.** Search has the template id; the showcase wants an instance id. There's `GET /sessions/public/:instructorHandle/:templateSlug` which resolves a template → its next instance (for OPEN/FREE only — exactly what users see).
- **Fix:** include the instructor **handle** + template **slug** on the session search result, then on click call `getPublicBySlug(handle, slug)` → get the instance → navigate to `/sessions/:instanceId` (showcase renders full/blocked). Fallback to `/sessions/discover` if no upcoming instance.
- This pairs with the **instructor `/@handle`** fix that's already half-done (the FE is handle-ready) — both want `handle` on the search row.

## Implementation plan

1. **BE search query** (`search.service.ts`): add to the SELECT — `viewerIsMember` (EXISTS group_member) for groups; `handle` (instructor/user) and `slug` (session template) for the others. `handle`/`slug` come from the index; `viewerIsMember` is computed live from `viewerId`. → response carries them.
2. **Search index** (`search-index.service.ts`) + **migration**: add `handle` + `slug` columns to `search_doc`, populate in `upsertInstructor`/`upsertUser`/`upsertSession`, backfill existing rows in the migration (one `UPDATE … FROM`). (Same migration lights up instructor `/@handle`.)
3. **FE model + modal** (`search.model.ts`, `search-modal.ts`): carry the new fields; route per the matrix (group member→detail/else→preview; session→resolve slug→showcase; instructor/user→`/@handle`).
4. **Verify live** for each access state.

Scope: moderate, ~1 day. One migration (adds `handle`+`slug`, backfills). No new screens.

## Do we need Claude Design?

**No.** The destinations (preview, showcase-with-blocked, detail) already exist and already render the correct per-access view. This is routing + surfacing access flags, not new UI. The only place a *new* screen could help is a prettier "locked / request access" state — but the existing blocked-showcase + preview cover it. Worth a Claude Design pass later only if we want to polish that locked state; not needed to make the redirects correct.
