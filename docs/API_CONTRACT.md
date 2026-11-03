> **Copy for reference.** The source of truth is `backend/docs/ADMIN_API.md` in the app repo (`atefefazaeli-netizen/app`). When they differ, the backend file wins; update this copy from it. Copied on 2026-11-03. Notes on how the panel reads the open points are in [ARCHITECTURE.md](ARCHITECTURE.md#10-contract-notes).

# Thirdwheel Admin API · shared contract (v1)

Source of truth for the backend builders and the panel builder. All routes sit under `/api/v1`.
Errors use the existing shape `{ statusCode, message, code?, requestId, retryAt? }`.
Lists use the existing pagination: query `page` (1-based), `limit` (≤100); response
`{ items, meta: { page, limit, total, totalPages } }` (`Paginated` / `paginate` in `libs/common/src`).

## Roles
- `admin` (ADMIN_EMAILS) and `clinician` (CLINICIAN_EMAILS). An account can hold both.
- Roles are re-synced from env at every sign-in (email OTP verify and social sign-in), so env changes apply on the next sign-in. Access tokens already carry roles through `JwtStrategy` (it reads the account).
- Panel access = admin or clinician. `GET users/me` style check: panel calls `GET admin/me` → `{ userId, email, roles }` (any staff role, 403 otherwise).
- Clinician-only: approve content, request changes. Admin-only: everything that changes accounts, AI settings, integrations, content drafts. Both: read content, review queue, safety log (read, review, notes, escalate), dashboard, audit log (admin only).

## Auth for the panel
Same endpoints as the app: `POST auth/email/start` → `POST auth/email/verify` (check `auth.controller.ts` for exact routes/bodies: the app's sign-in is email OTP, `mode: 'login'`). Refresh via the existing refresh route. A suspended account gets 403 `ACCOUNT_SUSPENDED` at verify, refresh and on every authenticated request.

## Audit
Every admin/clinician/n8n write publishes `audit.recorded` (contract in `admin.contracts.ts`). The admin module stores it.
- `GET admin/audit?actor=&action=&target=&page=&limit=` (admin) → page of `{ id, actor, actorEmail, action, target, meta, at }`.

## Dashboard
- `GET admin/me` (staff) → `{ userId, email, roles }`
- `GET admin/stats` (staff) → `{ accounts, signups7d, suspended, couples, plus, grants, content: { live, inReview, changesRequested, retired }, safety: { open, openHigh, last24h }, support: { open }, webhooks: { failed24h } }`. Each part comes from its owner via bus requests; a part that fails reads `null`.

## Users & couples (admin module aggregates; owners write)
- `GET admin/users?q=&plan=free|plus|paid_by_partner|cancelled|payment_problem&linked=true|false&suspended=true|false&tag=&from=&to=&page=&limit=` (admin)
  - `q` matches email (contains) OR name (users module). from/to = registration date (ISO date).
  - Row: `{ userId, email, name, createdAt, plan, plus, linked, partner: { userId, name } | null, suspended, tags }`
- `GET admin/users/:id` (admin) → `{ account: AdminAccountRow, profile: AdminProfileView | null, couple: { coupleId, linkedAt, partner: { userId, name, email } } | null, subscription: AdminSubscriptionView | null, safety: { open, total, lastAt }, support: { total, open } }`
- `POST admin/users/:id/sign-out` (admin) → `{ ok: true }` (revokes refresh tokens, bumps token version)
- `POST admin/users/:id/suspend` `{ reason (1..300) }` → AdminAccountRow. Also signs out.
- `POST admin/users/:id/unsuspend` → AdminAccountRow
- `PUT admin/users/:id/tags` `{ tags: string[] (≤20, each 1..32, [a-z0-9-]) }` → AdminAccountRow
- `POST admin/users/:id/plus` `{ days: 1..365, note?: ≤200 }` → AdminSubscriptionView. Plus by admin grant until now+days; follows the existing "one plan covers both partners" rule; emits `subscription.changed`. No trial concept.
- `DELETE admin/users/:id/plus` → AdminSubscriptionView (ends the admin grant now)
- `POST admin/users/:id/unlink` → `{ unlinked: boolean }` (same path as the person ending the relationship: `couples.unlink`)
- `DELETE admin/users/:id` `{ confirmEmail }` (must equal the account email, else 400 `CONFIRM_MISMATCH`) → `{ deleted: true }`. Same erase path as self-deletion (`account.deletion_requested`). Staff accounts cannot be deleted here (409 `STAFF_ACCOUNT`).
- Staff can't suspend or delete themselves (409 `SELF_ACTION`).

## Safety (metadata only, never text or matched words)
App → API:
- `POST safety/signals` (user) `{ kind: 'crisis'|'safety'|'heat', surface: 'third-ear'|'quiz'|'answer'|'other', helplineShown: boolean }` → 202 `{ ok: true }`. Throttle 30/hour/user. Extra fields rejected (global whitelist pipe).
Server side: `chat.risk_detected` → flag with surface `third-ear-server`; `chat.pause_started` → heat flag.
Folding: same user + kind with an open flag whose lastAt is within 10 min → `count++`, `lastAt` updated, no new event.
Levels: crisis high, safety medium, heat low. Retention: deleted 180 days after lastAt (TTL), and on account deletion. Included in the person's data export (kind, level, surface, dates, status; staff notes included).
Panel (admin or clinician):
- `GET admin/safety/flags?status=open|reviewed|escalated&level=&kind=&userId=&from=&to=&page=&limit=` → page of SafetyFlag
- `GET admin/safety/flags/:id` → SafetyFlag
- `POST admin/safety/flags/:id/review` `{ note?: ≤2000 }` → SafetyFlag (status reviewed)
- `POST admin/safety/flags/:id/notes` `{ text: 1..2000 }` → SafetyFlag
- `POST admin/safety/flags/:id/escalate` `{ note?: ≤500 }` → SafetyFlag (status escalated; event `safety.flag_escalated`)
- `GET admin/safety/summary` → `{ open, openHigh, openMedium, openLow, last24h, last7d }`
SafetyFlag: `{ id, userId, userEmail, kind, level, surface, helplineShown, count, status, firstAt, lastAt, notes: [{ id, by, byEmail, text, at }], reviewedBy, reviewedAt, escalations: [{ by, at, note }] }`

## Content (Release 1 quizzes, games, Do cards; clinician gate)
Item (admin/clinician view):
```
ContentItem {
  id, code, pillar: 'quiz'|'play'|'do', kind,
  live: ContentSnapshot | null, liveVersion: number, livePublishedAt, liveApprovedBy,
  draft: { snapshot: ContentSnapshot, state: 'editing'|'in_review'|'changes_requested', note: string|null, by, at, source: 'panel'|'n8n' } | null,
  retired: boolean, createdAt, updatedAt
}
ContentSnapshot { catalog: CatalogFields, body: { intro?, cards?: Card[], steps?: DoPlanStep[], deck?: object, howYouPlay?: 'One phone'|'Two phones', howItPlays?, how?, safety?, need?: string[], followUp? } }
```
`CatalogFields` = the Explore row (`CatalogEntry` in `backend/apps/api/src/modules/explore/domain/release1.ts`): title, meta, emoji?, where[], category, sub?, minutes, duration, vibes[], play?, only?, price, type?, sensitive?, scoring?, screen?, code?… (`id`, `kind`, `pillar`, `code` inside it are always the item's; the server sets them.)
`Card` = a workbook card (`src/features/cards/content/workbook.ts` in the app) without `n` (array order is the card order): text, intro?, secondary?, followUp?, softCheck?, early?, pick?, label?, scale?, item?, items?, list?. Steps are `DoPlanStep` (`src/features/cards/content/doSteps.ts`: title, body, minutes?, swapAt?, lead?, swap?), the source the Do screens build their steps from.
Which body field plays (the seed follows it, the app reads it): `type-*` kinds play `deck` (the `TYPE_IDEAS` deck, with `howYouPlay`, and for games `howItPlays` and `safety`); `quiz-turn` and `quiz-deck` play `cards`; `do-home` and `do-outside` play `steps` with `intro` (the card's blurb) and `need`; Draw Me in 30 and Phone Stack carry the workbook's `how` and `safety`. Every item has `followUp` (the workbook's follow-up chip).
Views also carry `liveApprovedByEmail` and `draft.byEmail`. Seeded content: 170 items (110 quizzes, 28 games, 32 Do cards); venues and shelf games are not content.

Panel routes (read: admin or clinician; write: as noted):
- `GET admin/content?pillar=&q=&state=live|editing|in_review|changes_requested|retired&category=&type=&only=&page=&limit=` → page of ContentSummary `{ id, code, pillar, kind, title, category, type, only, liveVersion, draftState, retired, updatedAt }`
- `GET admin/content/facets` → `{ categories: string[], types: string[], kinds: string[] }`
- `GET admin/content/:id` → ContentItem
- `POST admin/content` (admin) `{ id (slug), code?, pillar, kind, snapshot }` → ContentItem (new, draft editing). 409 `CONTENT_EXISTS`.
- `PUT admin/content/:id/draft` (admin) `{ snapshot }` → ContentItem. Creates the draft from live when none; editing an in_review or changes_requested draft moves it back to editing.
- `DELETE admin/content/:id/draft` (admin) → ContentItem
- `POST admin/content/:id/submit` (admin) `{ note? }` → in_review
- `POST admin/content/:id/approve` (clinician) `{ note? }` → draft becomes live, liveVersion+1, version saved, event `content.published` (action published). 409 `NOT_IN_REVIEW`.
- `POST admin/content/:id/request-changes` (clinician) `{ note (required) }` → changes_requested
- `POST admin/content/:id/unpublish` (admin) → retired (hidden from the app and Explore). Event action unpublished.
- `POST admin/content/:id/restore` (admin) → not retired. Event action restored.
- `GET admin/content/:id/versions` → `[{ version, publishedAt, approvedBy, approvedByEmail, action: 'published'|'rolled_back'|'seeded', note, by, byEmail, from }]` (newest first; a rollback keeps the original approver in `approvedBy`, `by` is the admin who rolled back, `from` the version that went live again)
- `GET admin/content/:id/versions/:version` → `{ version, snapshot, … }`
- `POST admin/content/:id/rollback` (admin) `{ version, note? }` → live = that (already approved) snapshot as a new version (action rolled_back). Event action rolled_back. 409 `ALREADY_LIVE` for the live version, 404 `VERSION_NOT_FOUND`.
- `GET admin/content/:id/changes?page=&limit=` → page of `{ action, by, byEmail, note, at, meta: { version?, summary?: string[], state? } | null }`, newest first. `summary` names what changed ("catalog.title", "body.cards: 2 changed, 1 added"), never the text.
- `POST admin/content/import` (admin) `{ items: ContentImportItem[] (≤200), note? }` → ContentImportResult (drafts in review, never live)
Validation: snapshot JSON ≤ 256 KB; card text 1..1000 (≤ 100 cards); title 1..120; where ⊂ anywhere|home|out|outside|apart (non-empty); minutes 1..10080 (a week: the seeded week-long Do cards are 10080, so 600 would reject them); step title 1..200 and body 1..1000 (≤ 30 steps); every other string ≤ 1000; `type-*` kinds need a `deck` with a `type`, `quiz-turn` and `quiz-deck` need at least one card. Id: slug `[a-z0-9][a-z0-9-]{0,79}`; code like `Q-1-01`. Rejected with 400 `INVALID_CONTENT` and `details: string[]` (passed through by the error filter).
Other errors: 404 `CONTENT_NOT_FOUND`, 409 `CONTENT_CONFLICT` (someone else changed the item first: reload), 409 `NO_DRAFT` (discard or submit without a draft), 409 `ALREADY_IN_REVIEW`, 403 `CLINICIAN_ONLY` (also checked in the domain), 400 `NOTE_REQUIRED`, 409 `ALREADY_RETIRED` / `NOT_RETIRED`, 409 `PILLAR_MISMATCH` (an import can't change an item's pillar or kind).
Notes: approving a draft of a retired item updates live but keeps it hidden. An account with both roles may approve its own draft. The panel list sorts by pillar, code, id; `title`, `category`, `type`, `only` come from the draft when there is one, else live. `POST admin/content/import` from the panel stores `source: 'panel'`; n8n's `content.import` stores `source: 'n8n'`.
App routes:
- `GET content/manifest` (user) → `{ revision, updatedAt }` (global counter that goes up on every publish / rollback / unpublish / restore)
- `GET content/published?since=<revision>` (user) → `{ revision, items: PublishedContentItem[], retired: string[] }` (items whose live changed after `since`; since=0 returns everything that differs from the bundled seed: versions after the seed, items made in the panel and approved (their version 1), restored items, plus all retired). Each item stores the revision its live state last changed at; the revision is read before the items, so a publish racing the read is fetched again next time.
Seed: migration `20261104-01-seed-content` loads the bundled Release 1 content (generated `content.data.ts`) as live version 1 (`approvedBy: 'workbook'`, action seeded). Insert-only: never overwrites an existing item.

## AI engine (admin; clinician read-only)
- `GET admin/ai/settings` → `{ current: AiRuntimeSettings, defaults: { provider, anthropic, openai, prompts: { modes: Record<mode,string>, quizStyle: string }, supports: { temperature: { anthropic: false, openai: true } } }, keys: { anthropic: boolean, openai: boolean }, modes: string[], locked: { chatRules: string, chatOutput: string, quizRules: string } }`. Before any save `current` is the environment's settings with `version: 0`. `supports` says which client takes a temperature (the Anthropic client takes none; effort is its control).
- `PUT admin/ai/settings` (admin) `{ provider, anthropic, openai, fallbackOnly, prompts, note? }` → AiRuntimeSettings (version+1). 400 `PROVIDER_NOT_CONFIGURED` when the chosen provider (anthropic or openai) has no API key. Prompt text ≤ 1500 chars each; null or blank = default. `prompts.modes` keys must be in `modes` (else 400 `INVALID_AI_SETTINGS`); missing keys are stored as null. `openai.temperature` 0..2 or null. `anthropic.effort` low|medium|high|xhigh|max. `note` ≤ 300. Two saves at the same moment: 409 `SETTINGS_CONFLICT`.
- `GET admin/ai/settings/history?page=&limit=` → page of `{ version, updatedAt, updatedBy, updatedByEmail, note, settings }` (newest first; `settings` is the full AiRuntimeSettings of that version)
- `POST admin/ai/settings/rollback` (admin) `{ version }` → AiRuntimeSettings (as a new version, note "Rollback to version N"). 404 `VERSION_NOT_FOUND`; 400 `PROVIDER_NOT_CONFIGURED` if that version's provider has lost its key.
- `POST admin/ai/test` (admin) `{ mode, text ≤ 1000, draft?: settings }` → 200 `{ source: 'ai'|'fallback'|'risk', reply, latencyMs, provider, model }`. `mode` is a Third Ear mode or `quiz` (the quiz result writer). Runs `detectRisk` first (and on the model's reply); nothing is stored. `draft` is validated like PUT. AI off (fallbackOnly, provider none) or a failed or malformed reply → `source: 'fallback'` with an explanation in `reply`. Throttle 10/min.
- Editable: the task line per Third Ear mode and the quiz result style. Locked (returned read-only in `locked`): who Third Ear is, the safety rules, the JSON output contracts, the quiz privacy rules. The AI quiz and game question prompt is not editable.
- Every save and rollback publishes `ai-engine.settings_changed` and `audit.recorded` (actions `ai.settings.update`, `ai.settings.rollback`, target `ai-settings:<version>`).
API keys stay in env and are never returned.

## Integrations (n8n) (admin)
Setup, examples and n8n workflows: [N8N_INTEGRATION.md](N8N_INTEGRATION.md).
Webhooks:
- `GET admin/integrations/webhooks` → `[Webhook]`; Webhook `{ id, name, url, events: WebhookEvent[], enabled, createdAt, lastDeliveryAt, lastStatus: 'delivered'|'failed'|null, secretHint (last 4) }`. `lastStatus` is the outcome of the latest attempt.
- `POST admin/integrations/webhooks` `{ name (1..80), url, events, enabled }` → 201 `{ webhook, secret }` (secret shown once, `whsec_` + 32 random bytes base64url). URL rules (400 `WEBHOOK_URL_INVALID`): http(s) only, no user name or password, ≤ 2000 chars; in production https only and the host must not be or resolve to a loopback, private, link-local, CGNAT, multicast or metadata address (checked again before every attempt; redirects are not followed). `events` may not contain `ping`.
- `PATCH admin/integrations/webhooks/:id` `{ name?, url?, events?, enabled? }` → Webhook
- `DELETE admin/integrations/webhooks/:id` → 204 (its deliveries stay in the log until they expire; queued attempts fail with "The webhook was deleted")
- `POST admin/integrations/webhooks/:id/rotate-secret` → 200 `{ webhook, secret }`
- `POST admin/integrations/webhooks/:id/test` → 200 Delivery (event `ping`, status pending; sent even when the webhook is disabled or not subscribed)
- `GET admin/integrations/deliveries?webhookId=&event=&status=pending|delivered|failed&page=&limit=` → page of Delivery `{ id, webhookId, event, status, attempts, lastStatusCode, lastError, nextAttemptAt, createdAt, deliveredAt, payload }`, newest first
- `POST admin/integrations/deliveries/:id/retry` → 200 Delivery: a fresh run of 6 attempts with the same delivery id, in any status (attempts still queued from the earlier run are dropped). 404 `DELIVERY_NOT_FOUND`.
- Not found: 404 `WEBHOOK_NOT_FOUND`. Every write publishes `audit.recorded` (`webhook.create`, `webhook.update`, `webhook.delete`, `webhook.rotate_secret`, `webhook.test`, `webhook.delivery_retry`; never the secret).
WebhookEvent: `crisis.alert`, `support.ticket.created`, `content.published`, `user.subscription.changed` (+ `ping` for tests only).
Envelope (JSON body): `{ id: 'evt_<random>', type, createdAt, data }`. `id` is shared by every webhook that gets the event; `X-Thirdwheel-Delivery` is per webhook and stays the same across retries (dedupe on it).
Headers: `Content-Type: application/json`, `User-Agent: Thirdwheel-Webhooks/1`, `X-Thirdwheel-Event`, `X-Thirdwheel-Delivery` (delivery id), `X-Thirdwheel-Timestamp` (unix seconds), `X-Thirdwheel-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>`.
Retries: 2xx = delivered. Otherwise retry with backoff 1m, 5m, 30m, 2h, 6h (6 attempts total), then failed. Timeout 10 s. Deliveries kept 30 days, and deleted with the account of the person their payload names.
Payload `data`:
- `crisis.alert`: `{ flagId, userId, kind, level, surface, helplineShown, count, at, escalated: boolean, escalatedBy: string|null, note: string|null, panelUrl }` (only high and medium flags, plus every escalation). `panelUrl` = `PANEL_URL/safety/<flagId>`.
- `support.ticket.created`: `{ ticketId, ref, userId, kind, topic, text, hasScreenshot, at, panelUrl }`. `panelUrl` = `PANEL_URL/support/<ticketId>`.
- `content.published`: `{ itemId, code, pillar, title, version, action, by, at }`
- `user.subscription.changed`: `{ userId, state, plus, at }`
- `ping`: `{ message: 'Thirdwheel webhook test', at }`
API keys (incoming):
- `GET admin/integrations/api-keys` → `[{ id, name, prefix, scopes, createdAt, lastUsedAt, revokedAt }]` (`lastUsedAt` is written at most once a minute)
- `POST admin/integrations/api-keys` `{ name (1..80), scopes: ('users.flag'|'content.import')[] (≥ 1) }` → 201 `{ apiKey, key }` (key shown once: `twk_<prefix8>_<secret>`; stored as SHA-256 hash)
- `DELETE admin/integrations/api-keys/:id` → revokes (204; revoking again is a no-op). 404 `API_KEY_NOT_FOUND`.
Incoming action (public route, API key):
- `POST integrations/n8n/action` headers `X-Api-Key: twk_…`, optional `Idempotency-Key` (8..80 of `A-Za-z0-9_-`; the shared idempotency mechanism, per API key: a retry within 24 h gets the first answer with `Idempotent-Replay: true`, a duplicate while the first runs gets 409 `REQUEST_IN_PROGRESS`). Body `{ action, data }`:
  - `user.suspend` `{ userId, reason (1..300) }` (scope users.flag) → `auth.admin.suspend`
  - `user.unsuspend` `{ userId }` (users.flag) → `auth.admin.unsuspend`
  - `user.tag` `{ userId, add?: string[], remove?: string[] }` (users.flag; each tag 1..32 of `[a-z0-9-]`, ≤ 20 per list, at least one tag in all) → `auth.admin.tags`
  - `content.import` `{ items: ContentImportItem[] 1..200, note? ≤ 500 }` (content.import) → `content.import` → drafts in review only
  - Response 200 `{ ok: true, action, result }` (`result` = the owner's answer). 401 `API_KEY_INVALID`, 403 `API_KEY_SCOPE`, 400 `UNKNOWN_ACTION`, 400 `INVALID_ACTION_DATA` (with `details`), 503 `ACTION_UNAVAILABLE` (the owning module does not answer); the owner's own errors pass through. Throttle 60/min per key. Audit actor `apikey:<name>`, action `n8n.<action>`.
Bus: the integrations module answers `integrations.admin.stats` → `{ webhooks (enabled), failed24h }`.

## Support (existing, unchanged routes)
`GET support/tickets?status=&page=&limit=`, `PUT support/tickets/:id/status`, `GET support/tickets/:id/screenshot` (admin). New: the support module publishes `support.ticket_created` after a ticket is saved.

## Legacy catalog and experiences (existing routes, admin)
`GET/POST catalog/items`, `PATCH/DELETE catalog/items/:id`; `GET/POST experiences`, `PATCH/DELETE experiences/:id`. Read the controllers/DTOs for exact shapes. Venue booking links: `PUT/DELETE ideas/:id/booking-link`.

## CORS
Add the panel origin (`PANEL_URL`) to `CORS_ORIGINS` in deployment docs. The panel's dev server proxies `/api` to the API instead.

## Changes from v1 (`feature/admin-users-safety`)
What the users, auth, subscription, partners, support, safety and admin builds changed or pinned down:
- Pagination is the existing `{ items, meta: { page, limit, total, totalPages } }` (fixed above).
- Request names are the ones in `admin.contracts.ts` (`auth.admin.sign-out`, `auth.admin.suspend`, `auth.admin.unsuspend`, `auth.admin.tags`), not `auth.admin.accounts.*` for the actions.
- `AdminAccountQuery` gains `qIds` (name matches from `users.admin.find-by-name`, OR-ed with the email match) and `excludeIds` (plan=free and linked=false leave the owner's list out). `from` / `to` there are instants, `to` exclusive.
- `GET admin/users`: `from` / `to` take `YYYY-MM-DD` (a UTC day, both ends inclusive) or an ISO instant. `plan=free` means "not in plus, paid_by_partner, cancelled or payment_problem"; `subscription.admin.ids-by-state` can only list people who have or had Plus (and their partners). Owner lists are capped at 5000 ids. `name`, `plan`, `plus` and `linked` read null when that owner fails; `name` is null when the profile has none.
- `GET admin/users/:id`: `profile`, `couple`, `subscription`, `safety` and `support` each read null when their owner fails or has no handler yet. Unknown id: 404 `USER_NOT_FOUND` (also on every user action).
- `GET admin/stats`: `content` and `webhooks` read null until the content and integrations modules answer.
- User actions (`POST`) answer 200, not 201. `DELETE admin/users/:id/plus` with no running grant changes nothing and answers the current view.
- `AdminAccountRow.suspendedReason` is null when not suspended. A suspended account is also refused at Google / Apple sign-in. Suspend and tags are validated again at the bus for n8n: 400 `INVALID_REASON`, `INVALID_TAGS` (tags are trimmed and lower-cased there; the HTTP route takes `[a-z0-9-]{1,32}` as is). `subscription.admin.grant`: 400 `INVALID_DAYS`, `INVALID_NOTE`.
- Admin grant: a running grant reads `plus` for the person (also over a cancelled store plan) and `paid_by_partner` for the partner; `renewsAt` is the person's own store plan only. `subscription.changed` is published at the grant, at revoke and when it ends on its own date. The app's `GET subscription` gains `grant: { until } | null`.
- Audit actions written by the admin module: `user.sign_out`, `user.suspend` (meta `reason`), `user.unsuspend`, `user.tags` (meta `tags`), `user.plus_grant` (meta `days`, `until`, `note`), `user.plus_revoke`, `user.unlink` (meta `unlinked`), `user.delete`; target `user:<id>`. The safety module writes `safety.review`, `safety.note`, `safety.escalate` with target `safety_flag:<id>` and meta `{ userId, kind, level, status }` (never the note). Owners called over the bus do not write audit entries; the caller does. Audit `meta` over 2 KB is dropped.
- Safety: `chat.pause_started` flags use surface `third-ear-server`, and server flags have `helplineShown: false`. A repeat that folds sets `helplineShown` once any repeat showed it. `from` / `to` on the flag list filter `lastAt` (a date counts its whole UTC day); `last24h` / `last7d` count flags with activity (`lastAt`) in the window. Review works on open and escalated flags and its note becomes a staff note; escalate works from any status and can repeat (each one is an event). Unknown flag: 404 `FLAG_NOT_FOUND`. The 30-an-hour limit is per person; the app's `surface` cannot be `third-ear-server`.
