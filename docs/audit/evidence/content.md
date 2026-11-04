# Audit: content and clinical approval

Date: 2026-11-05 (UAE). Scope: Release 1 content in MongoDB, the clinician gate, the panel's content screens, the app's published-content overlay.

Branches (committed, not merged, not pushed):

| Repo | Branch | Commits |
|---|---|---|
| app (`/home/user/wt/a-content`) | `bugfix/audit-content` from develop `a21451c` | `f4c76fe` feat(content): generate seed provenance and the held list · `ef97a38` fix(content): honest seeded approval, client-controlled concurrency, held content |
| panel (`/home/user/wt/a-panel`) | `fix/audit-content` from develop `3a4c63f` | `41bfbea` fix(content): concurrency, clinical review, held content and import checks |

Real environment used: MongoDB 8 replica set (`tw-mongo`), databases `audit_content` (live API on port 3101, built from the branch) and `audit_content_e2e` (E2E). `backend/docs/API.md` was not regenerated (as instructed).

Lead's baseline, re-verified: seed `content.data.ts` has 170 items (110 quizzes, 28 games, 32 Do); the workbook module `workbook.ts` has 598 quiz cards; no title of the 18 `WB_HELD` rows is in the seed (checked by `heldMatchOf` over all 170: zero matches; "Slow Burn" (Q-4-05) is a different item from the held "Slow-burn week" and is not matched because matching is "title contains the held name", not the reverse). The original `.xlsx` is not in the environment.

---

## (a) Capability matrix

Status: A implemented and verified with the real backend; B mock only or unverified; C partial; D missing or incompatible; E needs a product decision; F blocked by a missing source.

| # | Capability | Purpose | Panel route + files | Backend endpoint / controller / DTO / service / role | App consumer | Mock vs real | Status | Evidence | Impact | Prio | Owner | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Seed provenance per item | Say which parts are the workbook's and which were written elsewhere | `/content/$id` · `components/review-status.tsx` (ProvenancePanel) | `GET admin/content/:id` → `provenance`, `needsReview`, `liveSeeded`, `liveApprovalLabel` · `content.service.ts itemView` · admin, clinician | none (never in the feed) | real + mock | A | `content.provenance.ts` (generated); live API after old-code migrate: 69 flagged, comfort-kit cleared via migration; E2E "seeded provenance" | Staff saw 170 items "approved by the workbook" though 70 have parts nobody cleared | P0 | content | Clinician works through the 70 flagged items |
| 2 | Provenance generator | Recompute provenance when the bundle changes | n/a | `backend/scripts/content-provenance.cjs` | n/a | real (script) | A | Output: 170 items, 70 flagged (`steps` 30, `deck` 23, `cards.options` 10, `deck.options` 8), 18 held rows | Keeps provenance honest after regeneration | P2 | content | Run after every `release1-content.cjs` |
| 3 | Backfill for existing DBs | Same provenance on databases seeded by v1.5.0 | n/a | migration `20261105-01-content-provenance` (`backfillProvenance`) | n/a | real | A | Old API built from develop seeded `audit_content`, a clinician approved comfort-kit; new `migrate` flagged 69 and cleared comfort-kit (`via: migration`), `rev` unchanged (3) | Upgrade path without touching released migration | P0 | content | none |
| 4 | Seeded approval label | "Seeded from the Release 1 bundle, not a sign-off in this system" | History tab, item page, review queue | versions `seeded`, `approvalLabel`; item `liveSeeded` | n/a | real + mock | A | E2E rollback asserts `seeded: true`; panel test "history labels seeded versions" | Removes the false "clinician-cleared" sign-off | P0 | content | none |
| 5 | Needs clinical review filter + badge | Find what still needs a clinician | `/content?needsReview=true` · `content-list-page.tsx`, `content-columns.tsx`, `schemas/search.ts` | `GET admin/content?needsReview=true|false` (DTO `IsIn`), summary `needsReview`, `admin/stats.content.needsReview` | n/a | real + mock | A | Live: total 69/70; E2E `needsReview=maybe` → 400; panel test 30 Do rows all badged | Triage | P1 | content | Dashboard tile could show the count (not built) |
| 6 | Clearing review flags | A clinician approval clears the item's flags, recorded | approve dialog explains it | `approveDraft` → `meta.clearedReview`, `provenance.clearedBy`; rollback to seed restores (`restoredReview`) | n/a | real + mock | A | Unit + E2E + live (`clearedReview: ["steps"]` in log and audit) | Honest trail | P1 | content | See decision D3 (whole item rule) |
| 7 | Optimistic concurrency (client controlled) | No silent lost updates; approve exactly what was reviewed | item page, review queue, list batch submit · `use-content-editor.ts`, `conflict-banner.tsx`, `content-api.ts`, `queries.ts` | `expectedRev` required (400 without) on PUT/DELETE draft (query), submit, approve, request-changes, rollback, unpublish, restore → 409 `CONTENT_CONFLICT` with `details` | n/a | real + mock | A | E2E "two editors" and "approve of a draft changed after review is refused"; live stale unpublish → 409 `rev: you had 0, the item is at 7`; panel tests (editor, review queue) | Was P0: two staff overwrote each other; a clinician could approve a changed draft | P0 | content | none |
| 8 | Conflict UX | Keep local edits, copy JSON, reload | `ConflictBanner`; writes disabled while stale (`workflow.ts`) | n/a | n/a | mock (UI) + real (409 contract) | A | panel tests; the 409 shape is the real API's | No lost work | P0 | content | none |
| 9 | Self-approval | Record and warn; policy unchanged | `approve-dialog.tsx` warning | `meta.selfApproved` in change log and audit | n/a | real + mock | A (record) / E (policy) | Live: `both@` approved own draft → 200, `selfApproved: true` in change log and `admin/audit` | One person can author and publish clinical copy | P1 | product | Decision D1 |
| 10 | Retired + approve | Approving a hidden item must not show it | workflow bar copy | `approveDraft` on retired; event `content.published.retired` | `live.ts` hides retired ids | real | A | E2E "approving a draft of a retired item": not in `content/published` items, in `retired`, Explore 404; unit: event `retired: true` | n8n would have announced hidden content | P1 | content | n8n workflow should skip `retired: true` |
| 11 | Rollback | Earlier approved snapshot live again; keep approver; record who | History tab (disabled while unsaved edits) | `POST admin/content/:id/rollback` | feed | real | A | unit "rollback keeps the original approver"; E2E | Audit trail correct | P2 | content | none |
| 12 | Never-approved content | Can't be unpublished/restored/rolled back into the app | n/a | 409 `NOT_PUBLISHED` (new), 404 `VERSION_NOT_FOUND` | n/a | real | A | E2E "never-approved content"; unit | Before: unpublish/restore of a draft-only item fired `content.published` with version 0 | P2 | content | none |
| 13 | Held content warning | Warn on held titles / Clear the air, require acknowledgement | `HeldBanner`, `HeldBadge`, approve checkbox | item `heldMatch`, summary `held`, approve `acknowledgeHeld` (409 `HELD_CONTENT`), import `results[].held` | n/a | real + mock | A (title, world) / F (codes) | E2E repair-walk; live dry run `clear-air` → held; panel test | Held content could be imported and approved with no signal | P1 | content | Codes: decision D5 |
| 14 | Import (JSON) | Bulk drafts in review | `/content/import` · `content-import-page.tsx`, `schemas/import.ts` | `POST admin/content/import` (≤200) + `dryRun`, `results[]` | n/a | real + mock | A | E2E dry run (nothing written, `rev` unchanged), 201 items → 400; panel test (duplicate in file, existing id, results) | Duplicates and replaced drafts were invisible before import | P1 | content | none |
| 15 | Import from .xlsx | Workbook straight into the panel | n/a | n/a (`scripts/release1-workbook.py` converts) | n/a | n/a | E | Not built by design | Manual conversion step | P3 | product | Decision D6 |
| 16 | Editor round trip | Unknown fields and key order survive | `schemas/editor.ts` | `PUT draft` | n/a | real + mock | A | Live API: 170/170 codec identical, 170/170 schema valid, 170 no-op saves with empty server summary | No accidental changes on save | P1 | content | none |
| 17 | Field-level server errors | Show `INVALID_CONTENT` on the field | `lib/review.ts detailsToFieldErrors`, item page | `details: string[]` | n/a | mock (UI) + real (shape from E2E) | A | panel unit + page test | Faster fixes | P2 | content | none |
| 18 | Unsaved-work guard | Don't lose edits on navigation | `use-unsaved-guard.ts` | n/a | n/a | mock | B | Code read (router blocker + beforeunload); existing panel tests; not driven in a browser this round | Low | P3 | content | Browser check |
| 19 | Preview | Read all cards / steps / entries | `preview-panel.tsx`, `lib/preview.ts` | n/a | n/a | mock | A (panel-only) | panel test (deck entries for every seeded deck shape) | Labelled "Approximate preview, not the app's rendering" | P3 | content | none |
| 20 | Structured deck editor | Edit question decks without JSON | `components/deck-tab.tsx`, `lib/deck.ts` | n/a | type screens read `q`, `intro`, `followUp`, `pick` (model.ts) | real + mock | A (10 types) / C (14 types JSON) | 62 of 106 seeded decks structured; real API 62/62 byte identical | Fewer JSON mistakes | P2 | content | Other 14 types: see list below |
| 21 | App overlay | Published change, retired id, needsReview irrelevant | n/a | `GET content/manifest`, `content/published?since=` | `src/services/content.ts`, `features/cards/content/live.ts` | real | A | Node script on the live feed (see checks) | Delivery works | P1 | app | none |
| 22 | Do steps clinical review | AI-written steps reviewed by a clinician | review queue | flags `steps` on 30 items | app ships them | n/a | E | `doSteps.ts`, PROJECT_CONTEXT §4/§8 | Unreviewed instructions in production (incl. Spicy D-PV) | P0 | clinician | Decision D2 |
| 23 | Trivia sample answers | L-TY decks score guesses against fixed sample answers | review queue | flags `deck` ("sample answers") on 6 items | `TypedRace.tsx` uses `q.answer` | n/a | D / E | `play/types/content.ts` (e.g. "Biscuit", "Dayton"), `TypedRace.tsx` L40, L60 | A partner's real answer is never used; guesses scored against demo data | P1 | product/app | Decision D7 |
| 24 | Original workbook | Verify cleared text against the xlsx | n/a | n/a | n/a | n/a | F | `.xlsx` not available | Provenance compares with `workbook.ts` (generated from it), not the xlsx | P2 | product | Provide the xlsx to re-run the generator |

Structured deck types (verified in `src/features/cards/play/types/model.ts` and the seed): V-TX, V-SL, V-RK, V-AV, V-SC, V-NEW-PL, V-PR, V-GU (`questions`), V-FL, V-NH (`statements`). JSON only: V-YNM, V-GN, V-2T, L-PP, L-TY, L-SP, L-AC, L-RK, L-TD, L-DC, L-WJ, L-DR, D-PV, D-WK.

---

## (b) Findings

| id | Title | Evidence | Impact | Current (before) | Expected | Fix done or spec | Repo | Prio | Depends on | Verification |
|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | Seeded approval reads as a clinical sign-off | `domain/content.ts seedRecords` (`approvedBy: 'workbook'`), panel `history-tab.tsx` "Workbook (clinician-cleared)" | 170 items shown as clinician-approved | Every seed item "approved" | Seed marked as seeded, not a sign-off | Fixed: `liveSeeded`, `seeded`, `approvalLabel`, panel copy; approver id kept for compatibility | both | P0 | none | Unit, E2E, live, panel test |
| C-02 | AI-written Do steps live as "approved" | `src/features/cards/content/doSteps.ts` header; PROJECT_CONTEXT §4, §8 | 30 Do cards (23 home/outside, 7 Spicy D-PV) never reviewed | No signal | Flag until a clinician approves | Fixed: provenance `steps` on all 30; cleared only by a clinician approval | backend | P0 | C-01 | `provenance.spec.ts`, E2E, live |
| C-03 | Hand-set answer options not flagged | `scripts/release1-workbook.py` PICK / SCALE / ITEM | 18 items carry options no card spells out | No signal | Flag | Fixed: `cards.options` (10), `deck.options` (8 incl. duel rounds built from them) | backend | P1 | none | `provenance.spec.ts` |
| C-04 | Deck lines written in the app | `play/types/content.ts` (trivia, dice, truth or dare, rank-off…) | 23 items with text outside the workbook | No signal | Flag | Fixed: `deck` flag with line counts | backend | P1 | none | generator output, unit |
| C-05 | Trivia games score against sample answers | `content.ts` L-TY decks (`answer: 'Biscuit'`, `'Dayton'`…), `TypedRace.tsx` L60 `fuzzyMatch(answer, q.answer, q.accept)` | Partners' real answers are never used | Shipped | Answers from the partner (or no scoring) | Spec only (out of scope: app game logic). Flagged in provenance | app | P1 | product D7 | Code read |
| C-06 | Lost updates between staff | `content.service.ts apply` (rev only guarded one request) | Two editors overwrite silently | No client revision | `expectedRev` on every write, 409 | Fixed: DTOs require it, `checkRev`, panel sends it, conflict banner keeps edits | both | P0 | none | E2E, live, panel tests |
| C-07 | Clinician could approve a changed draft | same | Approval of text never seen | Approve took no revision | Approve carries the reviewed rev | Fixed: approve requires `expectedRev`; review queue pins the copy on screen | both | P0 | C-06 | E2E, panel test |
| C-08 | Editor silently replaced unsaved edits on a newer server copy | panel `use-content-editor.ts` reset on `updatedAt` change | Lost work on refetch | Reset regardless of dirty | Keep edits, show conflict | Fixed | panel | P1 | C-06 | panel test |
| C-09 | Self-approval allowed with no trace | `isClinician`, E2E "both may approve" | Same person authors and publishes | Allowed, not recorded | Recorded, warned; policy for product | Fixed (record + warning); policy unchanged | both | P1 | D1 | Live: 200 + `selfApproved: true` in log and audit |
| C-10 | `content.published` announced hidden versions | `content.service.ts` event payload | n8n push could announce unpublished content | No flag | `retired` in event and webhook | Fixed: `retired` field (event, `integrations/domain/payloads.ts`, docs) | backend | P2 | none | Unit |
| C-11 | Unpublish/restore of never-approved items | `unpublishItem`, `restoreItem` | Event with version 0, revision bump | Allowed | 409 `NOT_PUBLISHED` | Fixed | both | P2 | none | Unit, E2E |
| C-12 | No held-content guard | none before | Held / Clear the air content could be imported and approved | No signal | `heldMatch`, `acknowledgeHeld` | Fixed for titles and worlds; codes not matchable (held rows have no codes) | both | P1 | D5 | E2E, live, panel test |
| C-13 | Import gave no per-item preview from the server | `content.service.ts import` | Replaced drafts and server rejects found only after import | Counts only | Dry run, per item results | Fixed: `dryRun`, `results[]` (status, details, replacedDraft, held) | both | P1 | none | E2E, panel test |
| C-14 | Preview showed only the first card/step | `preview-panel.tsx` | Reviewers miss content | First entry | All entries, honest label | Fixed | panel | P3 | none | panel test |
| C-15 | Server validation errors only as a list | item page | Slower fixes | List | Field-level | Fixed | panel | P3 | none | panel test |
| C-16 | Deck editing only as raw JSON | `deck-tab.tsx` | Error-prone | JSON | Structured where the shape is verified | Fixed for 10 types | panel | P2 | none | real API 62/62 identical |
| C-17 | Approving clears flags for the whole item | design choice | A clinician approving a title change also clears step flags | n/a | Documented rule, recorded with the clinician id | Implemented as instructed (simplest honest rule) | backend | P2 | D3 | Unit, live |
| C-18 | Self-approval also clears review flags | live check: `both@` self-approval logged `clearedReview: ["steps"]` | One account can author, approve and clear AI-step flags | n/a | Product decision | Recorded; not blocked | backend | P1 | D1 | Live |
| C-19 | Shared git stash stack across worktrees | `git stash` in a-panel popped the platform engineer's stash | Work displaced between engineers | n/a | Never use `git stash` in shared worktrees | Their work restored from commit `730cbd0` (lead informed); mine from `37f6079` | process | P1 | none | `git diff` equals stash commits |
| C-20 | Panel full-suite timeouts | full run: 2 of 304 time out at 5 s (ai-engine baseline, one content test); content alone 219/219 | Flaky CI under load | Baseline develop had 3 timeouts too | Higher timeout or less parallel load | Not changed (shared config) | panel | P3 | none | Runs listed below |

---

## (c) Checks run

Real API and real MongoDB:

| Check | Where | Outcome |
|---|---|---|
| Backend `npm run typecheck` | a-content/backend | passed |
| Backend `npm run lint` | a-content/backend | passed |
| Backend `npm test` (unit, fakes, no DB) | a-content/backend | passed: 64 suites, 699 tests (content module 52: new `content.audit.spec.ts` 14, `provenance.spec.ts` 8) |
| E2E `npm run test:e2e -- "content.e2e|admin.e2e|admin-ai-integrations|explore-v4"` on Mongo 8 (`audit_content_e2e`) | a-content/backend | passed: 4 suites, 29 tests (content 12, of which 7 new) |
| Upgrade path: old API (develop `a21451c`) `migrate`, a clinician approves comfort-kit, then branch `migrate` | live `audit_content` | passed: `20261105-01-content-provenance` applied; 69 flagged, comfort-kit `clearedBy.via = migration`, `rev` 3 unchanged |
| Panel codec over all live items (esbuild bundle of `schemas/editor.ts` + `lib/deck.ts`, data from `GET admin/content/:id`) and a no-op `PUT draft` of each, then `DELETE draft` | live API | passed: 170/170 identical, 170/170 valid, 62/62 structured decks identical, 170/170 server change summaries empty |
| App overlay (Node, app's `live.ts`, `release1.ts`, `do/fixtures.ts` fed from live `content/published`) | live API | passed: approved edit of blind-taste-test (needsReview item) shows title and step 1 in Explore and Do; retired recreate-a-movie-scene hidden (185 → 184); feed fields `body,catalog,code,id,kind,pillar,publishedAt,version` (no review fields); rollback to seed → v3 with bundle text, server `needsReview` true again, app unaffected; restore → back (185) |
| Live rules | live API | self-approval 200 with `selfApproved` in change log and `admin/audit`; stale `expectedRev` → 409 `CONTENT_CONFLICT`; held dry run (`clear-air`) → `held` |
| App `npx tsc --noEmit`, `npx expo lint` | a-content (no app code changed) | passed |

Mock (MSW) only, panel:

| Check | Outcome |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm run build` | passed |
| `npm test` full | 302 of 304 passed; 2 timeouts at 5 s (ai-engine "edits a task line", content-item-page "clinician sees only Approve…"); both pass alone. Baseline develop also had 3 timeout failures (117 tests). |
| `npx vitest run src/features/content` | passed: 9 files, 219 tests (new: `content-audit.test.tsx` 10, `roundtrip.test.ts` 171, `deck.test.ts` 4, `review.test.ts` 2) |

Not run: browser walk-through of the panel against the live API this round (time; the contract was checked by the real-API scripts and E2E instead). Native app builds (out of scope).

---

## (d) Open product and clinical decisions

| id | Decision | Options | Who |
|---|---|---|---|
| D1 | May an account with admin and clinician approve its own draft (and clear review flags with it)? | Keep (recorded, warned) · block self-approval (needs a second clinician) · allow only for non-flagged items | Product owner + clinician |
| D2 | Review of the 30 AI-written Do step sets (incl. 7 Spicy D-PV) | Clinician approves each in the panel (submit unchanged draft, approve) · rewrite from the research notes · pull them until reviewed | Clinician |
| D3 | Clearing rule: one approval clears the whole item | Keep (simple, recorded) · per-part acknowledgement in the approve dialog | Product owner |
| D4 | Do the 18 hand-set option cards and the 23 app-written deck lines need clinical sign-off, or only product sign-off? Generator default slider ends (Disagree / Agree, No / Yes) are listed as notes, not flags. | Clinician · product | Clinician |
| D5 | Held content by code: held rows have no codes; Clear the air has no world number in the bundle | Add codes to the held sheet · reserve a world number for Clear the air · keep title/world matching | Product owner (needs the xlsx) |
| D6 | Import from .xlsx in the panel | Keep the script step (current) · build xlsx import | Product owner |
| D7 | Trivia games (6 L-TY decks) use fixed sample answers for scoring | Build from the partner's real answers · reveal and talk with no scoring · keep as demo | Product owner |
| D8 | Make provenance part of the Release process: re-run `content-provenance.cjs` whenever `release1-content.cjs` regenerates the seed | Yes / no | Lead |

Other notes: `expectedRev` is required on every panel write route (old panels get 400, which fails safe); create and import do not take it (n8n has no revision). `content.published` gained `retired` (one-line change in `integrations/domain/payloads.ts`); `admin/stats.content` gained `needsReview` (one-line change in `admin/admin.service.ts`). Docs updated: `backend/docs/ADMIN_API.md`, `APP_CONTRACT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `N8N_INTEGRATION.md`; panel `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`.
