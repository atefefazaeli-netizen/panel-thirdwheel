> **Copy for reference.** The sources of truth are `backend/docs/STAFF_API.md` and `backend/docs/ADMIN_API.md` in the app repo. Where they differ, STAFF_API.md wins (it says so itself); when this copy and the backend files differ, the backend files win: update this copy from them. STAFF_API.md copied on 2026-11-06 from branch `feature/support-remote-config` (with its "As built" notes for §5 and §6); ADMIN_API.md from the same branch. How the panel reads the open points: [ARCHITECTURE.md](ARCHITECTURE.md#12-contract-notes).

---

<!-- backend/docs/STAFF_API.md (feature/support-remote-config) -->

# Admin panel v2 contract: staff accounts, permissions, support workflow, Remote Config

Source of truth for the backend and panel builders (Nov 6). Extends `ADMIN_API.md`; where they differ, this file wins. All routes under `/api/v1`. Errors keep `{ statusCode, message, code?, requestId, retryAt?, details? }`. Lists keep `{ items, meta: { page, limit, total, totalPages } }`.

## 0. Decisions (from the product owner)
- The panel signs in with **username and password** only. No email, no email codes. App-user sign-in (email OTP, Google, Apple) is unchanged.
- **Staff accounts are a separate store** (`staff_accounts`), never app users. `ADMIN_EMAILS` / `CLINICIAN_EMAILS` stop granting anything: app accounts are plain users again (migration strips `admin` / `clinician` from `users.roles`; the env vars are removed from validation with a startup warning if still set).
- Passwords: **Argon2id** (`@node-rs/argon2`; memoryCost 19456 KiB, timeCost 2, parallelism 1 or stronger). Never logged, never returned.
- Sessions: opaque **HttpOnly cookie** `tw_staff_sid`; nothing in localStorage/sessionStorage. **CSRF**: every POST/PUT/PATCH/DELETE on a staff route needs header `X-CSRF-Token` equal to the session's token (timing-safe compare) AND an `Origin` in `PANEL_ORIGINS` (exact match). 403 `CSRF_FAILED` otherwise.
- **TOTP MFA** (RFC 6238, SHA-1, 6 digits, 30 s, ±1 step, a used step can't be reused) is required for every account holding the Owner role; optional for others. 10 single-use recovery codes, stored hashed. No email MFA.
- First Owner: only from env secrets through a CLI (`npm run staff:bootstrap-owner`), only when no Owner exists, no defaults.
- Permissions are enforced in the backend; deny by default; the panel only mirrors them.

## 1. Cookies, CORS, origins
- Cookie `tw_staff_sid`: `HttpOnly`, `Secure` (env `STAFF_COOKIE_SECURE`, default true in production, false otherwise), `SameSite` from `STAFF_COOKIE_SAMESITE` (`strict` default; `none` only for cross-site deployments, then Secure is forced), `Path=/api/v1`, no `Domain`. Max-Age = absolute session lifetime.
- Session lifetime: idle `STAFF_SESSION_IDLE_MINUTES` (default 60), absolute `STAFF_SESSION_MAX_HOURS` (default 12). Stored as SHA-256 of the id in `staff_sessions` with TTL on `expiresAt`.
- `PANEL_ORIGINS`: comma list of exact panel origins (e.g. `https://panel.thirdwheel.app`). CORS allows them with `credentials: true`; staff writes check `Origin` against it. `PANEL_URL` stays the link base for n8n payloads.
- The panel calls the API with `credentials: 'include'`.

## 2. Staff authentication (`staff/auth/*`, public routes with their own guard and rate limits)
Login rate limits: 10 attempts / minute / IP (throttler) and per account: 5 failures → locked 15 min (doubling, max 24 h) → 423 `ACCOUNT_LOCKED` with `retryAt`. Unknown usernames and disabled accounts answer exactly like a wrong password (401 `INVALID_CREDENTIALS`) and cost the same time (dummy Argon2 verify).

| Route | Body | Answer |
|---|---|---|
| `POST staff/auth/login` | `{ username, password }` | `{ status: 'ok', staff: StaffMe, csrfToken }` + cookie, or `{ status: 'mfa_required', challenge }` (no cookie; challenge 5 min, single use), or `{ status: 'mfa_enrollment_required', staff, csrfToken }` + restricted cookie, or `{ status: 'password_change_required', staff, csrfToken }` + restricted cookie |
| `POST staff/auth/login/mfa` | `{ challenge, code }` or `{ challenge, recoveryCode }` | same as `ok` above (or a restricted status if a password change is pending). 401 `MFA_INVALID`; 5 wrong codes kill the challenge |
| `GET staff/auth/session` | | `{ staff: StaffMe, csrfToken, restricted: null \| 'mfa_enrollment' \| 'password_change' }`; 401 `STAFF_SESSION_REQUIRED` when none (the panel then shows sign-in) |
| `POST staff/auth/logout` | | 204, session revoked, cookie cleared |
| `POST staff/auth/password` | `{ currentPassword, newPassword }` | 204; revokes every other session; clears `mustChangePassword` |
| `POST staff/auth/mfa/setup` | `{ password }` | `{ secret (base32), otpauthUrl }` (pending until enabled; allowed in restricted mfa_enrollment) |
| `POST staff/auth/mfa/enable` | `{ code }` | `{ recoveryCodes: string[10] }` shown once; session becomes unrestricted |
| `POST staff/auth/mfa/recovery-codes` | `{ code }` | new `{ recoveryCodes }`, old ones void |
| `POST staff/auth/mfa/disable` | `{ password, code }` | 204; 409 `MFA_REQUIRED_FOR_ROLE` for Owners |
| `GET staff/auth/sessions` | | own sessions `[{ id, current, createdAt, lastSeenAt, userAgent }]` |
| `DELETE staff/auth/sessions/:id` | | 204 (own only) |

`StaffMe = { id, username, displayName, roles: string[], permissions: Permission[], mfaEnabled, mustChangePassword, lastLoginAt }`.
Password policy: 12 to 128 characters, not containing the username, not in a small built-in common-password list → 400 `WEAK_PASSWORD` with `details`.
Restricted sessions can only call `staff/auth/session`, `logout`, `password` and `mfa/setup|enable`.

## 3. Staff and roles (Owner-only permissions)
| Route | Permission | Notes |
|---|---|---|
| `GET admin/staff` | `staff.read` | `[{ id, username, displayName, roles, disabled, mfaEnabled, mustChangePassword, lockedUntil, lastLoginAt, createdAt }]` |
| `POST admin/staff` | `staff.manage` | `{ username (3..40, [a-z0-9._-]), displayName, roles }` → `{ staff, temporaryPassword }` (server-generated, shown once, `mustChangePassword: true`). 409 `USERNAME_TAKEN` |
| `PATCH admin/staff/:id` | `staff.manage` | `{ displayName?, roles? }`. A role change revokes that account's sessions. 409 `SELF_ROLE_CHANGE` on your own roles; 409 `LAST_OWNER` if it would leave no active Owner. Adding Owner forces MFA enrollment at next sign-in |
| `POST admin/staff/:id/disable` / `enable` | `staff.manage` | disable revokes sessions; 409 `SELF_ACTION`; 409 `LAST_OWNER` |
| `POST admin/staff/:id/reset-password` | `staff.manage` | `{ temporaryPassword }` once; revokes sessions; `mustChangePassword` |
| `POST admin/staff/:id/reset-mfa` | `staff.manage` | clears TOTP and recovery codes; revokes sessions (Owner re-enrolls at sign-in) |
| `GET admin/staff/:id/sessions`, `DELETE admin/staff/:id/sessions` | `staff.read` / `staff.manage` | revoke all |
| `GET admin/permissions` | `staff.read` | the catalog with groups, labels, `ownerOnly` |
| `GET admin/roles` | `staff.read` | built-in + custom `[{ key, name, description, permissions, builtin, holders }]` |
| `POST admin/roles` | `roles.manage` | `{ key ([a-z][a-z0-9_]{2,39}), name, description?, permissions }`; 400 `INVALID_PERMISSIONS` (`customRoleProblems`) |
| `PATCH admin/roles/:key` / `DELETE admin/roles/:key` | `roles.manage` | built-ins can't change (409 `BUILTIN_ROLE`); a change revokes holders' sessions; delete only when nobody holds it (409 `ROLE_IN_USE`) |

Every staff, role and session change is audited (`staff.*`, `role.*`), never with passwords, codes or secrets.

## 4. Permissions on existing routes (replace every `@Roles(...)` with `@StaffRoute(...)`)
| Routes | Permission |
|---|---|
| `GET admin/stats` | `dashboard.read` (each part is null unless the caller also holds that area's read permission) |
| `GET admin/content*`, versions, changes, facets | `content.read` |
| `POST admin/content`, `PUT/DELETE .../draft`, `POST admin/content/import` | `content.edit` |
| `POST .../submit` | `content.submit` |
| `POST .../approve`, `POST .../request-changes` | `content.approve` |
| `POST .../unpublish`, `.../restore`, `.../rollback` | `content.unpublish` |
| catalog item writes, `GET catalog/admin/items`, experiences writes, `PUT/DELETE ideas/:id/booking-link`, held-booking venue relay | `catalog.manage` |
| `GET admin/users`, `GET admin/users/:id` | `users.read` (the detail's `safety` part only with `safety.read`, `support` part only with `support.read`) |
| `POST admin/users/:id/sign-out` | `users.signout` |
| `POST .../suspend`, `.../unsuspend` | `users.suspend` |
| `PUT .../tags` | `users.tags` |
| `POST .../unlink` | `users.unlink` |
| `DELETE admin/users/:id` | `users.delete` |
| `POST/DELETE .../plus` | `users.plus` |
| support routes | see §5 |
| `GET admin/safety/*` | `safety.read` (each list and detail view writes an audit entry `safety.view`) |
| `POST admin/safety/flags/:id/*` | `safety.handle` |
| `GET admin/ai/settings*` | `ai.read`; `PUT`, rollback: `ai.edit`; `POST admin/ai/test`: `ai.test` |
| `GET admin/integrations/*` | `integrations.read`; writes: `integrations.manage` |
| `GET admin/audit` | `audit.read` |
| Remote Config | see §6 |
The old `GET admin/me` is removed (use `staff/auth/session`). Content approval keeps every rule (clinician gate = `content.approve`, `expectedRev`, provenance, held acknowledgement, `selfApproved` recorded when the approver last edited the draft). Actor ids in content, audit and AI logs become `staff:<id>` with `byName` (display name) instead of an email. `STAFF_ACCOUNT` / `SELF_ACTION` checks against app users are gone (staff are not app users).

## 5. Support workflow
Statuses `open | in_progress | waiting_for_user | resolved | closed` (migration: existing `open` → `open`, `closed` → `closed`). Priority `low | normal | high | urgent` (default `normal`). Assignee: a staff id or null.
| Route | Permission |
|---|---|
| `GET support/tickets?status=&priority=&assignee=me\|unassigned\|<staffId>&userId=&q=&page=&limit=` | `support.read` |
| `GET support/tickets/:id` | `support.read`: ticket + `timeline` (created, status, assignee, priority, note, reply events, oldest first) |
| `GET support/tickets/:id/screenshot` | `support.read` |
| `GET support/assignees` | `support.read`: active staff holding `support.read` `[{ id, displayName }]` |
| `PUT support/tickets/:id/status` `{ status, expectedVersion }` | `support.resolve` |
| `PUT support/tickets/:id/assignee` `{ staffId \| null, expectedVersion }` | `support.assign` (assignee must hold `support.read`) |
| `PUT support/tickets/:id/priority` `{ priority, expectedVersion }` | `support.prioritize` |
| `POST support/tickets/:id/notes` `{ text 1..4000 }` | `support.note`: internal, never sent |
| `POST support/tickets/:id/replies` `{ text 1..8000 }` | `support.reply`: creates a reply with `delivery: { status: 'pending' \| 'sent' \| 'failed', provider, attempts, lastError, sentAt }` |
| `POST support/tickets/:id/replies/:replyId/retry` | `support.reply` |
Tickets carry `version` (409 `TICKET_CONFLICT` on a stale `expectedVersion`). Replies go out through a `SupportReplySender` port that uses the configured email provider. Without a real provider (`EMAIL_DRIVER=log`, today's only driver) a reply stays **`pending` with `lastError: 'NO_EMAIL_PROVIDER'`** and `GET support/delivery-status` answers `{ provider: 'none', canSend: false }` so the panel shows the dependency. Only a provider's acceptance marks a reply `sent`. Timeline entries never include the user's email address in the panel; the reply goes to the account's email server-side. Status changes, assignment, priority, notes and replies are audited (never with text).

**As built (`feature/support-remote-config`).**
- Ticket (list row): `{ id, ref, userId, kind, topic, text, device, hasScreenshot, status, priority, assignee: staffId | null, assigneeName: string | null, version, createdAt, updatedAt }`. `GET support/tickets/:id` adds `timeline: TimelineEntry[]`, oldest first.
- `TimelineEntry = { id, type, at, actor, actorName }` plus: `status` / `priority` → `from, to`; `assignee` → `from, to, fromName, toName`; `note` → `text`; `reply` → `text, delivery: { status, provider, attempts, lastError, sentAt }`; `created` → nothing more (`actor: 'user'`, `actorName: null`). Staff entries have `actor: 'staff:<id>'` and the display name at the time.
- `version` goes up with every status, assignee or priority change (only those take `expectedVersion`). Notes and replies do not bump it, so writing a note never makes someone else's status change fail. A stale `expectedVersion` (also one lost to a concurrent write) is 409 `TICKET_CONFLICT`. Setting the value a ticket already has is a no-op: 200 with the ticket, no version bump, no entry, no audit.
- Filters: `assignee=me` is the caller; `q` is a ref (`TW-SUP-1A2B3C`, any case, prefix optional) or words in the ticket text (case-insensitive). `userId` is an app user id. All filters combine (AND).
- Assignee: `PUT .../assignee` asks the staff module over the bus (`staff.with-permission { permission: 'support.read' }` → `[{ id, displayName }]`, contract `libs/common/src/messaging/contracts/staff.contracts.ts`). An id not in that list is 400 `ASSIGNEE_NOT_ELIGIBLE`; `null` unassigns. Without a handler (staff module not built yet) or when it fails, `GET support/assignees` answers `[]` and every assignment is refused; it never guesses.
- Delivery: `SupportReplySender` port (`modules/support/delivery/support-reply.sender.ts`). A reply is saved `pending` and a `support.reply.deliver` task is queued (TaskQueue; BullMQ retries a throw). With `EMAIL_DRIVER=log` it stays `pending`, `provider: null`, `attempts: 0`, `lastError: 'NO_EMAIL_PROVIDER'`. With a provider: the task reads the address from `auth.account.contact` (server-side only), and only the provider's acceptance sets `sent` (`attempts` +1, `sentAt`). A refusal sets `failed` + `lastError: 'SEND_FAILED'` (a code, never the provider's message) and throws so the queue retries; an account without an email is `failed` + `NO_RECIPIENT` (no attempt). Retry: 404 `REPLY_NOT_FOUND`, 409 `REPLY_ALREADY_SENT`; otherwise back to `pending` and queued again.
- The reply email: subject `[Thirdwheel] Re: your message <ref>`, the reply text, the reference and a line that support never asks for a password or code. The user's own words are not repeated.
- Audit (target `support_ticket:<id>`, meta always has `userId`): `support.status { from, to }`, `support.assign { from, to }`, `support.priority { from, to }`, `support.note { noteId }`, `support.reply { replyId }` (retry adds `retry: true`). The old `support.ticket_status` is gone.
- Limits: notes 1..4000 and replies 1..8000 characters, never blank (400). A ticket holds at most 500 timeline entries (409 `TICKET_TIMELINE_FULL`).
- Dashboard and user page: `support.admin.stats.open` and `support.admin.user-summary.open` now count tickets still needing staff (`open`, `in_progress`, `waiting_for_user`).
- Privacy export: each ticket now lists the replies sent to the person (`{ text, at, delivery }`); internal notes are not exported.
- App side unchanged: `POST support/messages` / `support/problems`, the receipt, the 20-a-day cap and `support.ticket_created`.
- Migration `20261106-10-support-workflow`: status kept (only unknown values become `open`), `priority: 'normal'`, unassigned, `version: 0`, the stored `ref`, and a timeline with one `created` entry at `createdAt`. Writes only missing fields.

## 6. Remote Config (`app-config` module)
Reconciled on Nov 6 with release v2.0.0 (ARCHITECTURE.md deviation 36): one module with the staff draft → publish → rollback model below, on v2.0.0's public shape and feature catalog, so the released app keeps working unchanged.

Public, read-only (no auth): `GET app-config` → `{ version, updatedAt, features: Record<FeatureKey, boolean>, maintenance: { enabled, message | null }, minAppVersion | null, recommendedAppVersion | null }` with `Cache-Control: public, max-age=30` and an `ETag` (`"v<version>-<hash>"`; `If-None-Match` answers 304). Only public fields: no staff identity, no note, never secrets. `maintenance.message` is `null` while maintenance is off (a drafted notice never shows early). Before anything is published: the defaults as `version: 0`, `updatedAt: 1970-01-01T00:00:00.000Z`. `updatedAt` is the published version's `publishedAt`.

Admin (staff session, StaffRoute; no `@Roles`):
| Route | Permission |
|---|---|
| `GET admin/app-config` | `config.read`: `{ draft: { config, version, changed }, published, features: [{ key, label, description }], limits: { maintenanceMessageMax, noteMax }, updatedAt, updatedBy, updatedByName }` |
| `PUT admin/app-config/draft` `{ config, baseVersion }` | `config.edit` |
| `POST admin/app-config/publish` `{ note?, baseVersion }` | `config.publish`: the draft becomes the next published version |
| `GET admin/app-config/versions?page=&limit=` | `config.read`: published versions, newest first |
| `POST admin/app-config/rollback` `{ version, note?, baseVersion }` | `config.rollback`: republishes an earlier version (`0` = the defaults) as a new version |

`config` (the draft, a published version's `config`, and the body of a draft save) is `{ features, maintenance: { enabled, message }, minAppVersion, recommendedAppVersion }`. The names `minVersion` / `recommendedVersion` and the keys `spicy` / `calendar` are gone.

**Feature keys** (libs/common `FEATURE_KEYS`; labels and descriptions from `FEATURE_DESCRIPTIONS`, served in `features`): `thirdEar`, `aiCreate`, `voiceInput`, `plusPurchases`, `venueBooking`, `league`, `calendarSync`, `photoUploads`. A switch only hides or disables; it never grants access, skips consent or changes a plan, and the API keeps its own checks. Off: the API answers **403 `FEATURE_DISABLED`** (`details`: the keys that are off) on the routes below, after authentication (`@RequiresFeature`, FeatureGateGuard in libs/common: route-level, so it runs after the JWT and staff guards and can only refuse; when the switches can't be read they count as on).

| Key | App (v2.0.0 client, `src/services/remoteConfig.ts`) | API routes refused while off |
|---|---|---|
| `thirdEar` | Tab bar pill says "Third Ear isn’t available right now"; `ThirdEarScreen` shows the unavailable state | `POST chat/messages`, `chat/side-plan`, `chat/pause`, `chat/design/quiz`, `chat/design/game`, `chat/cards/*`. Open: every read, `DELETE chat/messages`, `PUT chat/settings`, `POST chat/transcribe` |
| `aiCreate` | Third Ear's make-a-quiz/game flows (`ThirdEarScreen`, `third-ear/flows.tsx`) | `POST chat/design/quiz`, `chat/design/game`, `chat/cards/quiz`, `chat/cards/game` |
| `voiceInput` | Mic in Third Ear, the recorder (`services/recorder.ts`) | `POST chat/transcribe`, `POST recordings` |
| `plusPurchases` | Purchase and restore buttons (`features/plus`) | `POST subscription/purchase`, `restore`, `resubscribe` (the store webhook always runs) |
| `venueBooking` | Book a place on Do cards (`cards/do/DetailScreen.tsx`) | `GET ideas/:id/booking-link`, `POST bookings`, `POST bookings/by-idea/:id/respond` (cancelling and the staff read `GET ideas/:id/booking-link/admin` stay open) |
| `league` | League entry points and screens (`ExploreScreen`, `us/UsHome`, `us/League`, `us/LeagueLog`) | League writes: series, shelf, stakes, phone stack, results, rematch, share (reads and deletes stay open) |
| `calendarSync` | Plans Connect banner, Settings › Calendar shows the unavailable state | `POST calendar/google` (disconnecting stays open) |
| `photoUploads` | Photo pickers (`services/media.ts`, Third Ear) | Profile, partner, memory, plan and league shelf/result photo uploads (viewing and removing stay open) |

Spicy has no switch: the app has no Remote Config gate for it, and the API already enforces Spicy per couple (18+, both switches, 403 `SPICY_OFF`).

**Rules and flow.**
- `baseVersion` is `draft.version` from `GET admin/app-config` (0 before anyone saved a draft; the draft is then the published config). Every draft save, publish and rollback bumps it; a stale one, or losing a race, is 409 `CONFIG_CONFLICT`. A rollback also makes the rolled-back config the draft, so unpublished draft edits are dropped (their author gets 409 and reloads).
- `PUT admin/app-config/draft` merges: omitted fields keep the draft's value; `features` may name a subset. Validation is libs/common `applyAppConfigUpdate`: known feature keys only (`features.x is not a feature key (known: …)`), booleans, `maintenance` has only `enabled` and `message`, the message trimmed, at most 280 characters, no control characters, required while maintenance is on, versions `MAJOR.MINOR.PATCH` (no prefix, no leading zeros, up to five digits a part) or null, `recommendedAppVersion` not below `minAppVersion`. Every problem → 400 `INVALID_CONFIG` with `details: string[]`. A save that changes nothing saves nothing. The app sees nothing until a publish.
- `POST .../publish` re-checks the draft against today's rules; publishing what the app already gets is 409 `CONFIG_UNCHANGED` (allowed once when nothing was ever published). `POST .../rollback`: `version` 0 = the defaults; an unknown version is 404 `CONFIG_VERSION_NOT_FOUND`; equal to what is live is 409 `CONFIG_UNCHANGED`; the snapshot is re-checked against today's rules. `note` ≤ 300 (one line). Both answer the same view as `GET`.
- `published` and each `versions` item: `{ version, config, kind: 'seed' | 'publish' | 'rollback', note, rolledBackFrom, publishedBy, publishedByName, publishedAt }`. `publishedBy` is `staff:<id>`, `system` (the migration's default) or `user:<id>` for a version saved by v2.0.0's admin route (its `publishedByName` is the admin's email then).
- Caching: each API process keeps the published version in memory for 10 s; a publish or rollback drops it at once and announces `app-config.changed { version, at }` so other instances drop theirs. A failed read serves the last known version. Gated modules read the switches over the bus (`app-config.features`).
- Audit (target `app_config`, never the note or the message text): `config.draft { draftVersion, changed }`, `config.publish { version, previousVersion, changed, featuresOff, featuresTurnedOff, maintenance, minAppVersion, recommendedAppVersion }`, `config.rollback { …the same, from }`.
- Storage and migrations: `app_config_versions` (append-only; v2.0.0's flat row: `features`, `maintenance`, `minAppVersion`, `recommendedAppVersion`, `createdAt`, plus `kind`, `note`, `rolledBackFrom`, `publishedBy`, `publishedByName`, `publishedAt`) and `app_config_draft` (`_id: 'draft'`). `20261106-11-app-config-default` seeds version 1 (`kind: 'seed'`, every feature on) only into an empty collection. `20261107-01-app-config-draft-publish` (repeatable) rewrites rows saved by v2.0.0 (adds the publish fields: `publishedBy: user:<by>`, `publishedByName: byEmail`, `publishedAt: createdAt`, `kind` publish or rollback; removes nothing) and rows and drafts saved before the reconciliation (nested `config` with `minVersion` / `recommendedVersion`, `calendar` → `calendarSync`, `spicy` dropped). The published config, its number and its time are kept; a second run changes nothing.

The app (v2.0.0 client) fetches `GET app-config` at start and when it returns to the foreground (at most every 30 s), caches the last valid config, shows the maintenance screen while enabled, Update required below `minAppVersion`, an update banner below `recommendedAppVersion`, and gates the 8 keys as above.

## 7. Staff AI separation
`POST admin/ai/test` (`ai.test`) never reads app-user data (no profiles, chats, safety data); test runs are not stored in chat collections and are audited without the text. Optional context: `{ contentId }` adds that item's **published** snapshot (read-only) to the test prompt. The panel's AI can never write content; suggestions go through the normal draft and review flow.

## 8. Audit
`audit.recorded` keeps its shape; `actor` = `staff:<id>` (plus `actorName` in views), `apikey:<name>` or `system`. Never passwords, codes, tokens, secrets, ticket text, note text or chat text.

## 9. Environment (names only; no defaults for secrets)
`PANEL_ORIGINS`, `STAFF_COOKIE_SECURE`, `STAFF_COOKIE_SAMESITE`, `STAFF_SESSION_IDLE_MINUTES`, `STAFF_SESSION_MAX_HOURS`, `STAFF_BOOTSTRAP_OWNER_USERNAME`, `STAFF_BOOTSTRAP_OWNER_PASSWORD`, `STAFF_BOOTSTRAP_OWNER_DISPLAY_NAME`, `EMAIL_DRIVER` (`log` only today; built: config key with default `log`, `support/delivery-status` reads it). Removed: `ADMIN_EMAILS`, `CLINICIAN_EMAILS` (warning if set). Panel: `VITE_API_URL` (required for production builds; must be https unless localhost); `VITE_API_MOCKS` is refused by production builds.


---

<!-- backend/docs/ADMIN_API.md (STAFF_API.md replaces its Roles, panel Auth and support sections) -->

# Thirdwheel Admin API · shared contract (v1)

Source of truth for the backend builders and the panel builder. All routes sit under `/api/v1`.
Errors use the existing shape `{ statusCode, message, code?, requestId, retryAt? }`. Every 429 has `code: 'RATE_LIMITED'`, `retryAt` and a `Retry-After` header (seconds), exposed to the panel by CORS.
Lists use the existing pagination: query `page` (1-based), `limit` (≤100); response
`{ items, meta: { page, limit, total, totalPages } }` (`Paginated` / `paginate` in `libs/common/src`).

## Roles
- `admin` (ADMIN_EMAILS) and `clinician` (CLINICIAN_EMAILS). An account can hold both.
- Roles come from the env lists as they are now, on every authenticated request (`JwtStrategy`), every refresh and every sign-in: removing an email from `ADMIN_EMAILS` or `CLINICIAN_EMAILS` (and restarting) takes the staff role away at the next request with the token the person already holds, and adding one grants it the same way. The stored `roles` field is only a cache and never grants staff access. `AdminAccountRow.roles` and the `STAFF_ACCOUNT` check read the current roles.
- A role refusal is 403 with `code: 'INSUFFICIENT_ROLE'` (a suspended account is 403 `ACCOUNT_SUSPENDED`).
- Panel access = admin or clinician. `GET users/me` style check: panel calls `GET admin/me` → `{ userId, email, roles }` (any staff role, 403 otherwise).
- Clinician-only: approve content, request changes. Admin-only: everything that changes accounts, AI settings, integrations, content drafts. Both: read content, review queue, safety log (read, review, notes, escalate), dashboard, audit log (admin only).

## Auth for the panel
Same endpoints as the app: `POST auth/email/start` → `POST auth/email/verify` (check `auth.controller.ts` for exact routes/bodies: the app's sign-in is email OTP, `mode: 'login'`). Refresh via the existing refresh route. A suspended account gets 403 `ACCOUNT_SUSPENDED` at verify, refresh and on every authenticated request.

## Audit
Every admin/clinician/n8n write publishes `audit.recorded` (contract in `admin.contracts.ts`). The admin module stores it.
- `GET admin/audit?actor=&action=&target=&page=&limit=` (admin) → page of `{ id, actor, actorEmail, action, target, meta, at }`. `actor` matches exactly; `action` and `target` match exactly or as a prefix (`content.`, `user:<id>`, `webhook:`).

## Dashboard
- `GET admin/me` (staff) → `{ userId, email, roles }`
- `GET admin/stats` (staff) → `{ accounts, signups7d, suspended, couples, plus, grants, content: { live, inReview, changesRequested, retired, needsReview }, safety: { open, openHigh, last24h }, support: { open }, webhooks: { failed24h } }`. Each part comes from its owner via bus requests; a part that fails reads `null`.

## Users & couples (admin module aggregates; owners write)
- `GET admin/users?q=&plan=free|plus|paid_by_partner|cancelled|payment_problem&linked=true|false&suspended=true|false&tag=&from=&to=&page=&limit=` (admin)
  - `q` matches email (contains) OR name (users module). from/to = registration date (ISO date).
  - Row: `{ userId, email, name, createdAt, plan, plus, linked, partner: { userId, name } | null, suspended, tags }`
- `GET admin/users/:id` (admin) → `{ account: AdminAccountRow, profile: AdminProfileView | null, couple: { coupleId, linkedAt, partner: { userId, name, email } } | null, subscription: AdminSubscriptionView | null, safety: { open, total, lastAt }, support: { total, open }, unavailable: ('profile'|'couple'|'subscription'|'safety'|'support')[] }` (`unavailable` names the parts that are null because their owner failed, not because there is nothing)
- AdminSubscriptionView: `{ userId, state, plus, renewsAt, grant: { until, by, note } | null, experiencesUsed, source: 'store'|'admin_grant'|'partner'|'none', verification: 'mock'|'store'|null }`. `source` says where the current Plus comes from (same precedence as the app's state); `verification` says how the store purchase behind it (own or the partner's) was checked: `mock` while the server runs the development receipt verifier (`mock:<product>:<transaction>`, no App Store or Play check), `store` with a real adapter, null when no store purchase is involved. Show `mock` as unverified. No revenue or billing figures.
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
- `GET admin/safety/flags?status=open|reviewed|escalated&level=&kind=&surface=third-ear|third-ear-server|quiz|answer|other&userId=&from=&to=&page=&limit=` → page of SafetyFlag (every filter runs on the server; an unknown surface is 400)
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
  liveSeeded: boolean, liveApprovalLabel: string | null,   // seeded = approver id 'workbook': NOT a sign-off in this system
  draft: { snapshot: ContentSnapshot, state: 'editing'|'in_review'|'changes_requested', note: string|null, by, at, source: 'panel'|'n8n' } | null,
  retired: boolean,
  rev: number,                       // send back as expectedRev on every write
  provenance: Provenance | null,     // seeded items only
  needsReview: boolean,              // live has parts no clinician has reviewed here
  heldMatch: { reasons: [{ field: 'title'|'category'|'world'|'sub', value, held: { type, world, item, why } }] } | null,
  createdAt, updatedAt
}
Provenance {
  source: 'release1-bundle',
  cleared: string[],                                  // parts that are the workbook's word for word
  flagged: { part, reason }[],                        // what the seed analysis found (never changes)
  needsReview: { part, reason }[],                    // what still needs a clinician for live
  notes: string[],                                    // screen labels, default slider ends, trimmed design notes
  clearedBy: { by, byEmail, at, version, via: 'approved'|'rollback'|'migration' } | null
}
ContentSnapshot { catalog: CatalogFields, body: { intro?, cards?: Card[], steps?: DoPlanStep[], deck?: object, howYouPlay?: 'One phone'|'Two phones', howItPlays?, how?, safety?, need?: string[], followUp? } }
```
`CatalogFields` = the Explore row (`CatalogEntry` in `backend/apps/api/src/modules/explore/domain/release1.ts`): title, meta, emoji?, where[], category, sub?, minutes, duration, vibes[], play?, only?, price, type?, sensitive?, scoring?, screen?, code?… (`id`, `kind`, `pillar`, `code` inside it are always the item's; the server sets them.)
`Card` = a workbook card (`src/features/cards/content/workbook.ts` in the app) without `n` (array order is the card order): text, intro?, secondary?, followUp?, softCheck?, early?, pick?, label?, scale?, item?, items?, list?. Steps are `DoPlanStep` (`src/features/cards/content/doSteps.ts`: title, body, minutes?, swapAt?, lead?, swap?), the source the Do screens build their steps from.
Which body field plays (the seed follows it, the app reads it): `type-*` kinds play `deck` (the `TYPE_IDEAS` deck, with `howYouPlay`, and for games `howItPlays` and `safety`); `quiz-turn` and `quiz-deck` play `cards`; `do-home` and `do-outside` play `steps` with `intro` (the card's blurb) and `need`; Draw Me in 30 and Phone Stack carry the workbook's `how` and `safety`. Every item has `followUp` (the workbook's follow-up chip).
Views also carry `liveApprovedByEmail` and `draft.byEmail`. Seeded content: 170 items (110 quizzes, 28 games, 32 Do cards); venues and shelf games are not content.

**Seeded approval is not a sign-off.** The seed stores approver id `workbook` (kept for compatibility) and version action `seeded`. Views add `liveSeeded` / version `seeded: true` and the label "Seeded from the Release 1 bundle, not a sign-off in this system". Provenance (generated by `backend/scripts/content-provenance.cjs` into `content/domain/content.provenance.ts`) says which parts are the workbook's and which were written elsewhere: `steps` (Do blurb, What you need and steps an AI wrote from research notes, `doSteps.ts`: 30 items), `cards.options` / `deck.options` (answer options set by hand in `scripts/release1-workbook.py` PICK / SCALE / ITEM: 18 items), `deck` (deck lines written in the app's `play/types/content.ts`, including the trivia games' sample answers: 23 items). 70 of 170 items need clinical review. Parts named: `followUp`, `cards`, `deck`, `how`, `howItPlays`, `safety`, `steps`, `cards.options`, `deck.options`.
**Clearing the flags (simplest honest rule).** Any approve after a submit clears `needsReview` for the whole item (the clinician approved the whole snapshot); the change log entry `approved` names the clinician (`by`) and lists `meta.clearedReview`, and `provenance.clearedBy` records who, when and which version. A rollback to a seeded version (approver `workbook`) brings the flags back (`meta.restoredReview`); a rollback to a clinician-approved version clears them (`via: 'rollback'`). Migration `20261105-01-content-provenance` backfills existing databases (`via: 'migration'` when live was already clinician-approved). The app ignores provenance.

Panel routes (read: admin or clinician; write: as noted):
- `GET admin/content?pillar=&q=&state=live|editing|in_review|changes_requested|retired&category=&type=&only=&needsReview=true|false&page=&limit=` → page of ContentSummary `{ id, code, pillar, kind, title, category, type, only, liveVersion, draftState, retired, rev, needsReview, held, updatedAt }`
- `GET admin/content/facets` → `{ categories: string[], types: string[], kinds: string[] }`
- `GET admin/content/:id` → ContentItem
- `POST admin/content` (admin) `{ id (slug), code?, pillar, kind, snapshot }` → ContentItem (new, draft editing). 409 `CONTENT_EXISTS`.
- `PUT admin/content/:id/draft` (admin) `{ snapshot, expectedRev }` → ContentItem. Creates the draft from live when none; editing an in_review or changes_requested draft moves it back to editing.
- `DELETE admin/content/:id/draft?expectedRev=` (admin) → ContentItem
- `POST admin/content/:id/submit` (admin) `{ note?, expectedRev }` → in_review
- `POST admin/content/:id/approve` (clinician) `{ note?, expectedRev, acknowledgeHeld? }` → draft becomes live, liveVersion+1, version saved, event `content.published` (action published). `expectedRev` is the revision of the draft the clinician reviewed. 409 `NOT_IN_REVIEW`, `CONTENT_CONFLICT`, `HELD_CONTENT` (the draft matches the held list and `acknowledgeHeld: true` was not sent; `details` name the matches). Change log `meta`: `selfApproved: true` when the approver is the draft's last editor, `acknowledgedHeld: true`, `clearedReview: string[]`. The same flags go into the audit event.
- `POST admin/content/:id/request-changes` (clinician) `{ note (required), expectedRev }` → changes_requested
- `POST admin/content/:id/unpublish` (admin) `{ expectedRev }` → retired (hidden from the app and Explore). Event action unpublished. 409 `NOT_PUBLISHED` for an item that was never approved (discard its draft instead).
- `POST admin/content/:id/restore` (admin) `{ expectedRev }` → not retired. Event action restored. 409 `NOT_PUBLISHED` when there is no approved version to show.
- `GET admin/content/:id/versions` → `[{ version, publishedAt, approvedBy, approvedByEmail, action: 'published'|'rolled_back'|'seeded', note, by, byEmail, from, seeded, approvalLabel }]` (newest first; a rollback keeps the original approver in `approvedBy`, `by` is the admin who rolled back, `from` the version that went live again)
- `GET admin/content/:id/versions/:version` → `{ version, snapshot, … }`
- `POST admin/content/:id/rollback` (admin) `{ version, note?, expectedRev }` → live = that (already approved) snapshot as a new version (action rolled_back). Event action rolled_back. 409 `ALREADY_LIVE` for the live version, 404 `VERSION_NOT_FOUND`.
- `GET admin/content/:id/changes?page=&limit=` → page of `{ action, by, byEmail, note, at, meta: { version?, summary?: string[], state?, selfApproved?, acknowledgedHeld?, clearedReview?: string[], restoredReview?: string[] } | null }`, newest first. `summary` names what changed ("catalog.title", "body.cards: 2 changed, 1 added"), never the text.
- `POST admin/content/import` (admin) `{ items: ContentImportItem[] (≤200), note?, dryRun? }` → ContentImportResult `{ created, updated, rejected, results: [{ id, status: 'created'|'updated'|'rejected', reason?, details?, replacedDraft?, held? }], dryRun }` (drafts in review, never live). `dryRun: true` checks every item exactly as a real import would (validation, pillar and kind of an existing id, ids listed twice, held list) and writes nothing; the panel uses it for its preview. `replacedDraft` on an update is the draft state that import replaces (null = none). The panel imports JSON only: the workbook is an .xlsx converted by `scripts/release1-workbook.py` (product decision: no xlsx import in the panel).
Validation: snapshot JSON ≤ 256 KB; card text 1..1000 (≤ 100 cards); title 1..120; where ⊂ anywhere|home|out|outside|apart (non-empty); minutes 1..10080 (a week: the seeded week-long Do cards are 10080, so 600 would reject them); step title 1..200 and body 1..1000 (≤ 30 steps); every other string ≤ 1000; `type-*` kinds need a `deck` with a `type`, `quiz-turn` and `quiz-deck` need at least one card. Id: slug `[a-z0-9][a-z0-9-]{0,79}`; code like `Q-1-01`. Rejected with 400 `INVALID_CONTENT` and `details: string[]` (passed through by the error filter).
**Concurrency (client controlled).** Every item view and summary carries `rev`, bumped on every write. Every write on an item (PUT and DELETE draft, submit, approve, request-changes, rollback, unpublish, restore) requires `expectedRev` (400 without it); when the item's `rev` differs, 409 `CONTENT_CONFLICT` with `details: ['rev: you had N, the item is at M']` and nothing changes. Create and import do not take it (an import replaces the draft by design; n8n has no revision to send).
**Held content.** `heldMatch` compares the current snapshot's catalog with the workbook's "Not in this release" sheet (`HELD_CONTENT`, generated from the app's `WB_HELD`): a title containing a held item's name ("Repair walk, 20 minutes"), or a category / world / sub naming Clear the air (`clear-air`, `clear-the-air`). Held rows have no codes, so codes are not matched. Summaries carry `held`. Approve then needs `acknowledgeHeld: true`; nothing is ever published automatically.
Other errors: 404 `CONTENT_NOT_FOUND`, 409 `CONTENT_CONFLICT` (someone else changed the item first: reload), 409 `NO_DRAFT` (discard or submit without a draft), 409 `ALREADY_IN_REVIEW`, 403 `CLINICIAN_ONLY` (also checked in the domain), 400 `NOTE_REQUIRED`, 409 `ALREADY_RETIRED` / `NOT_RETIRED`, 409 `PILLAR_MISMATCH` (an import can't change an item's pillar or kind).
Notes: approving a draft of a retired item updates live but keeps it hidden (not in `content/published` items, not in Explore; the event carries `retired: true`). An account with both roles may approve its own draft (not decided by the product owner; recorded as `selfApproved`). The panel list sorts by pillar, code, id; `title`, `category`, `type`, `only` come from the draft when there is one, else live. `POST admin/content/import` from the panel stores `source: 'panel'`; n8n's `content.import` stores `source: 'n8n'`.
App routes:
- `GET content/manifest` (user) → `{ revision, updatedAt }` (global counter that goes up on every publish / rollback / unpublish / restore)
- `GET content/published?since=<revision>` (user) → `{ revision, items: PublishedContentItem[], retired: string[] }` (items whose live changed after `since`; since=0 returns everything that differs from the bundled seed: versions after the seed, items made in the panel and approved (their version 1), restored items, plus all retired). Each item stores the revision its live state last changed at; the revision is read before the items, so a publish racing the read is fetched again next time.
Seed: migration `20261104-01-seed-content` loads the bundled Release 1 content (generated `content.data.ts`) as live version 1 (`approvedBy: 'workbook'`, action seeded). Insert-only: never overwrites an existing item.

## AI engine (admin; clinician read-only)
- `GET admin/ai/settings` → `{ current: AiRuntimeSettings, defaults: { provider, anthropic, openai, prompts: { modes: Record<mode,string>, quizStyle: string }, supports: { temperature: { anthropic: false, openai: true } } }, keys: { anthropic: boolean, openai: boolean }, modes: string[], locked: { chatRules: string, chatOutput: string, quizRules: string } }`. Before any save `current` is the environment's settings with `version: 0`. `supports` says which client takes a temperature (the Anthropic client takes none; effort is its control).
- `PUT admin/ai/settings` (admin) `{ provider, anthropic, openai, fallbackOnly, prompts, note? }` → AiRuntimeSettings (version+1). 400 `PROVIDER_NOT_CONFIGURED` when the chosen provider (anthropic or openai) has no API key. Prompt text ≤ 1500 chars each; null or blank = default. `prompts.modes` keys must be in `modes` (else 400 `INVALID_AI_SETTINGS`); missing keys are stored as null. `openai.temperature` 0..2 or null. `anthropic.effort` low|medium|high|xhigh|max. `note` ≤ 300. Optional `baseVersion` (integer ≥ 0): the version the change was made on (`current.version` when the page loaded); when another save landed since, 409 `SETTINGS_CONFLICT` and nothing is saved. Without it the save goes over whatever is current, and two saves at the same moment still answer 409 `SETTINGS_CONFLICT`.
- `GET admin/ai/settings/history?page=&limit=` → page of `{ version, updatedAt, updatedBy, updatedByEmail, note, settings }` (newest first; `settings` is the full AiRuntimeSettings of that version)
- `POST admin/ai/settings/rollback` (admin) `{ version, baseVersion? }` (409 `SETTINGS_CONFLICT` as for PUT) → AiRuntimeSettings (as a new version, note "Rollback to version N"). 404 `VERSION_NOT_FOUND`; 400 `PROVIDER_NOT_CONFIGURED` if that version's provider has lost its key.
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
- `content.published`: `{ itemId, code, pillar, title, version, action, by, at, retired }` (`retired: true` = the item is unpublished, so this version is not visible in the app: do not announce it)
- `user.subscription.changed`: `{ userId, state, plus, at }`
- `ping`: `{ message: 'Thirdwheel webhook test', at }`
API keys (incoming):
- `GET admin/integrations/api-keys` → `[{ id, name, prefix, scopes, createdAt, lastUsedAt, revokedAt }]` (`lastUsedAt` is written at most once a minute)
- `POST admin/integrations/api-keys` `{ name (1..80), scopes: ('users.flag'|'content.import')[] (≥ 1) }` → 201 `{ apiKey, key }` (key shown once: `twk_<prefix8>_<secret>`; stored as SHA-256 hash)
- `DELETE admin/integrations/api-keys/:id` → revokes (204; revoking again is a no-op). 404 `API_KEY_NOT_FOUND`.
Incoming action (public route, API key):
- `POST integrations/n8n/action` headers `X-Api-Key: twk_…`, optional `Idempotency-Key` (8..80 of `A-Za-z0-9_-`; the shared idempotency mechanism, per API key: a retry within 24 h gets the first answer with `Idempotent-Replay: true`, a duplicate while the first runs gets 409 `REQUEST_IN_PROGRESS`). Body `{ action, data }`:
  - `user.suspend` `{ userId, reason (1..300) }` (scope users.flag) → `auth.admin.suspend`. Never a staff account (admin or clinician): 409 `STAFF_ACCOUNT`, so an automation can't lock the team out of the panel.
  - `user.unsuspend` `{ userId }` (users.flag) → `auth.admin.unsuspend`
  - `user.tag` `{ userId, add?: string[], remove?: string[] }` (users.flag; each tag 1..32 of `[a-z0-9-]`, ≤ 20 per list, at least one tag in all) → `auth.admin.tags`
  - `content.import` `{ items: ContentImportItem[] 1..200, note? ≤ 500 }` (content.import) → `content.import` → drafts in review only
  - Response 200 `{ ok: true, action, result }` (`result` = the owner's answer). 401 `API_KEY_INVALID`, 403 `API_KEY_SCOPE`, 400 `UNKNOWN_ACTION`, 400 `INVALID_ACTION_DATA` (with `details`), 400 `IDEMPOTENCY_KEY_INVALID` (an `Idempotency-Key` that is not 8..80 of `A-Za-z0-9_-`; nothing runs), 503 `ACTION_UNAVAILABLE` (the owning module does not answer); the owner's own errors pass through. Throttle 60/min per key; 20 failed key checks a minute from one address get 429 `RATE_LIMITED` (also for a valid key from that address until the minute ends). Audit actor `apikey:<name>`, action `n8n.<action>`.
Bus: the integrations module answers `integrations.admin.stats` → `{ webhooks (enabled), failed24h }`.

## Support (admin)
**Superseded by `STAFF_API.md` §5 (panel v2 support workflow, `feature/support-remote-config`)**: staff permissions, statuses, priority, assignee, `expectedVersion`, notes, replies, timeline, filters, `support/assignees`, `support/delivery-status`, audit actions `support.status|assign|priority|note|reply`. The text below is the v1 inbox, kept for history.

`GET support/tickets?status=&page=&limit=`, `GET support/tickets/:id` (one ticket, for deep links; 404 `TICKET_NOT_FOUND`), `PUT support/tickets/:id/status` `{ status: open|closed }` (404 `TICKET_NOT_FOUND`; audit `support.ticket_status`, target `support_ticket:<id>`, meta `{ userId, status }`), `GET support/tickets/:id/screenshot` (404 `TICKET_NOT_FOUND` or `SCREENSHOT_NOT_FOUND`). Ticket: `{ id, ref, userId, kind: message|problem, topic, text, device, hasScreenshot, status, createdAt }`. The support module publishes `support.ticket_created` after a ticket is saved.
Not built and not in the requirements (open product decisions): replies to the person from the panel, internal notes, assignment, priority. The app tells the person "Support will reply by email" (Help & legal › Contact support), and each ticket is emailed to `SUPPORT_INBOX_EMAIL` when set; nothing in PROJECT_CONTEXT §10 or the Figma-derived screens asks for in-panel replies.

## Remote Config (panel v2)
See `STAFF_API.md` §6: `GET app-config` (public), `GET admin/app-config`, `PUT admin/app-config/draft`, `POST admin/app-config/publish`, `GET admin/app-config/versions`, `POST admin/app-config/rollback` (permissions `config.*`, audit `config.draft|publish|rollback`, target `app_config`).

## Legacy catalog and experiences (existing routes, admin)
`GET/POST catalog/items`, `PATCH/DELETE catalog/items/:id`; `GET/POST experiences`, `PATCH/DELETE experiences/:id`. Read the controllers/DTOs for exact shapes. Venue booking links: `PUT/DELETE ideas/:id/booking-link`.
- `GET catalog/admin/items?where=&kind=&maxUsd=&page=&limit=` (admin) → page of the ideas with `tags` and `refPrefix` (the public `GET catalog/items` strips both), read fresh.
- `POST catalog/items`: `id` is optional; without it the server takes the next free id after every id ever used (retired ideas keep theirs). 409 `CATALOG_ITEM_EXISTS`. `PATCH` and `DELETE`: 404 `CATALOG_ITEM_NOT_FOUND`. A `null` optional field in a PATCH clears it (the panel sends null for fields the admin emptied). `per` (the price suffix the app appends to the price) is stored with exactly one leading space, whatever was sent; migration `20261104-30` repairs suffixes an earlier save had trimmed.
- Experiences: 409 `EXPERIENCE_EXISTS`, 404 `EXPERIENCE_NOT_FOUND`; null clears an optional field as above. `DELETE ideas/:id/booking-link`: 404 `BOOKING_LINK_NOT_FOUND`.
- Every write is audited: `catalog.item.create|update|retire` (`catalog_item:<id>`, update meta `fields`), `experience.create|update|retire` (`experience:<id>`), `booking_link.set|remove` (`booking_link:<card id>`, set meta `{ host, paid, venue }`, never the full URL).

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
