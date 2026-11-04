# Thirdwheel admin audit: accounts, sessions, roles, users, subscriptions, support, safety

Date: 2026-11-04 (UAE). Auditor: engineer B (accounts area).
Scope: authentication, sessions and roles; users and couples; subscriptions; support; safety. Content, AI engine and integrations are other engineers' areas.

Repos and branches (nothing merged or pushed):
- App + backend: `/home/user/wt/b-people`, branch `bugfix/audit-accounts` from `develop` @ a21451c
  - `8d8d437` fix(auth): derive staff roles from the env lists on every request and refresh
  - `fa7664d` feat(support): get one ticket by id and audit status changes
  - `35a4257` feat(safety): filter flags by surface on the server
  - `e98b088` feat(subscription): say where Plus comes from and how the receipt was checked
  - `782d79e` feat(admin): INSUFFICIENT_ROLE code and unavailable parts in user detail
  - `7eb5c3e` docs: admin contract for the accounts audit changes
- Panel: `/home/user/wt/b-panel`, branch `fix/audit-accounts` from `develop` @ 3a4c63f
  - `eeec16e` fix(auth): show a role state on 403 INSUFFICIENT_ROLE and re-read roles
  - `c28692b` fix(support): open deep-linked tickets with GET support/tickets/:id
  - `88eb235` fix(safety): filter flags by surface on the server
  - `2de9deb` feat(users): show where Plus comes from and flag mocked store receipts
  - `c0fe875` docs: contract copy and notes for the accounts audit

Evidence environment: live API built from the worktree (`node dist/apps/api/src/main.js`, port 3102, `NODE_ENV=development`, `QUEUE_DRIVER=inline`, no Redis), MongoDB 8 replica set `tw-mongo`, database `audit_people` (live) and `tw_e2e_*` databases created and dropped by the E2E harness from `TEST_MONGO_URI=.../audit_people_e2e`. For bulk testing the live env raised `AUTH_RATE_LIMIT=1000` and `RATE_LIMIT=5000` (route-specific throttles such as support's 5/min stay as coded). Panel checked in headless Chrome 153 (CDP) on the Vite dev server (port 5181, `VITE_API_MOCKS=0`, proxy to 3102). Only isolated `*@audit.test` accounts and the `*@thirdwheel.test` staff accounts were used. Raw log: `/tmp/claude-0/-home-user/3c345a2a-5fdc-5e52-92fb-def3b02b3317/scratchpad/bpeople/evidence.md`.

Status legend: A implemented and verified against the real backend, B mock only or unverified, C partial, D missing or incompatible, E proposed, needs a product decision, F blocked.

## (a) Capability matrix

| # | Capability | Purpose | Panel route + files | Backend endpoint / controller / DTO / service / role | App consumer | Mock vs real | Status | Evidence | Impact | Priority | Owner | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Staff sign-in (email code) | Panel access | `/login`; `features/auth/{routes/login-page,components/*,api/auth-api,api/session}.ts(x)` | `POST auth/login/start`, `auth/signup/start`, `auth/verify`; `auth.controller.ts`, `auth.dto.ts`, `AuthService`; public | `src/services/auth.ts` | Real | A | Live: admin@, clinician@, both@ sign in, `admin/me` 200 with roles | Entry point | P1 | Backend auth | None |
| 2 | Staff roles from env | admin / clinician from `ADMIN_EMAILS` / `CLINICIAN_EMAILS` | `stores/session.ts`, `RoleGate`, `nav.ts` | `JwtStrategy.validate`, `AuthService.refresh`, `AccountsService.syncRoles/currentRoles`, `rolesFor` | none | Real | A (fixed) | Before: removed admin kept 200 on `admin/users` with the old token and after refresh. After: 403 on both, DB roles rewritten, re-added email works with no sign-in (F-01) | Revocation of staff access | P0 | Backend auth | Merge `bugfix/audit-accounts` |
| 3 | Role refusal code | Tell role 403 from suspension | `lib/api/{client,errors}.ts`, `components/shared/error-state.tsx`, `features/auth/api/session.ts` (`recheckRoles`), `app/app.tsx` | `RolesGuard` 403 `{ code: 'INSUFFICIENT_ROLE' }` (`libs/common/src/guards/roles.guard.ts`) | none (app routes are not role-gated) | Real | A (added) | Live: user and clinician 403 `INSUFFICIENT_ROLE`; panel mid-session tests in Chrome (F-02) | Clear permission states, stale panel roles | P1 | Backend common + panel | Merge both branches |
| 4 | Refresh rotation + reuse detection | Session safety | `lib/api/client.ts` (single-flight refresh) | `POST auth/refresh`; `TokenService.consume` | `src/services/api/client.ts` | Real | A | Live: R1 to R2 200; reuse R1 401 `REFRESH_REUSED`; R2 then 401 (family revoked) | Token theft containment | P1 | Backend auth | None |
| 5 | Logout / logout-all | End sessions | `features/auth/api/session.ts` `signOut` | `POST auth/logout` (204), `POST auth/logout-all` (204, bumps token version) | `src/services/api/*` | Real | A | Live: logout 204, refresh after 401; logout-all 204, both devices' access tokens 401, both refresh 401. Access token after plain logout stays valid until expiry (F-10) | Session end | P2 | Backend auth | Product decision on F-10 |
| 6 | Suspension | Block an account | `features/users/components/user-actions.tsx` | `POST admin/users/:id/suspend` `SuspendDto`, `unsuspend`; `AccountsAdminService`; admin | app handles 403 `ACCOUNT_SUSPENDED` | Real | A | Live: 403 `ACCOUNT_SUSPENDED` on requests, refresh, OTP verify and Google sign-in; unsuspend lets sign-in work, old refresh stays 401 | Abuse response | P1 | Backend auth/admin | None |
| 7 | Non-staff and clinician route guards | Least privilege | `RoleGate` on `/users`, `/users/$id`, `/support`, `/audit`, `/settings/integrations`; `nav.ts` roles | `@Roles` on admin, support, safety, content, ai, integrations controllers | none | Real | A | Live role matrix (section c): user 403 on every admin route; clinician 403 on users, audit, support, integrations; 200 on me, stats, safety, content, ai settings. Panel `RoleGate` matches for every route touched | Data exposure | P1 | Backend + panel | None |
| 8 | Users list: search, filters, pagination | Find people | `/users`; `features/users/routes/users-list-page.tsx`, `api/*`, `schemas/users.ts` | `GET admin/users` `AdminUsersQueryDto`; `AdminService.users`; admin | none | Real | A | Live: name "quillfeather" finds Zorya Quillfeather with partner; email part "u.gam"; `linked`, `suspended`, `tag`, `plan=plus|paid_by_partner`, `from/to`; meta `{page:2,limit:2,total:4,totalPages:2}`; `q=u.` literal (no regex); bad `plan`, `limit=500`, bad tag 400 | Support work | P2 | Backend admin | None |
| 9 | User detail and null parts | One person's view | `/users/$id`; `user-detail-page.tsx` | `GET admin/users/:id`; `AdminService.user`; adds `unavailable: AdminUserPart[]` | none | Real | A (improved) | Live: `unavailable: []`; unit + panel tests for failed owners; before, a failed profile or partners owner read "No profile yet" / "Not linked" (F-08) | Misleading support answers | P3 | Backend admin + panel | None |
| 10 | Sign out a user everywhere | Account recovery | user actions menu | `POST admin/users/:id/sign-out`; admin | none | Real | A | Live: 200, user's token 401, audit `user.sign_out` | | P2 | Backend | None |
| 11 | Tags | Staff labels | user actions, `FormFieldTags` | `PUT admin/users/:id/tags` `TagsDto` | none | Real | A | Live: set `["beta","vip"]`, bad tag 400, 21 tags 400, `tag=vip` filter; audit `user.tags` | | P3 | Backend | None |
| 12 | Grant / end Plus incl. partner sharing | Comp Plus | user actions | `POST/DELETE admin/users/:id/plus` `GrantPlusDto`; `SubscriptionAdminService.grant/revoke` | `src/services/subscription.ts` (`GET subscription` shows `paid_by_partner`) | Real | A | Live: grant 30 days, partner app view `paid_by_partner`, admin filters; 400 days 400; end grant, partner back to free; end again is a no-op 200; audits `user.plus_grant`, `user.plus_revoke` (x2, F-13) | Revenue-neutral comps | P2 | Backend subscription | F-13 spec |
| 13 | Unlink couple | End relationship link | user actions | `POST admin/users/:id/unlink` (`couples.unlink`) | partners screens | Real | A | Live: `{unlinked:true}`, then `{unlinked:false}`; partner `GET partners/couple` `{linked:false}`; audit with meta | | P2 | Backend partners | None |
| 14 | Delete user with guards | Erasure | user actions, `DangerConfirmDialog` | `DELETE admin/users/:id` `DeleteUserDto`; `AdminService.deleteUser` (`STAFF_ACCOUNT` now uses current roles) | self-deletion path | Real | A | Live: 400 `CONFIRM_MISMATCH`, 409 `STAFF_ACCOUNT`, 409 `SELF_ACTION` (delete and suspend self), case-insensitive email deletes, then 404 `USER_NOT_FOUND` and the token 401; audit `user.delete`. E2E: a removed admin becomes deletable, a newly listed one is not (F-07) | Irreversible action | P1 | Backend admin | None |
| 15 | Audit of user, support and safety actions | Accountability | `/audit`; `features/audit/*` | `GET admin/audit`; `audit.recorded` | none | Real | A (support added) | Live: every user action above has an entry; safety note/review/escalate entries carry no note text (grep 0); `support.ticket_status` added (F-05) | Compliance | P2 | Backend | None |
| 16 | Admin Plus view: source + verification | Do not present mocked purchases as verified | user detail Subscription card; `features/users/lib/labels.ts` `plusSourceLabel` | `AdminSubscriptionView.source` (`store|admin_grant|partner|none`), `verification` (`mock|store|null`) from `plusSource()` + `ReceiptVerifier.mode` | none | Real | A (added) | Live: none/null, then after `mock:plus_yearly:AUDIT0001` purchase store/mock, partner partner/mock, grant admin_grant/null. Chrome: "Store purchase (receipt verification is mocked in this build)" + "Unverified" (F-03) | Trust in subscription data | P1 | Backend subscription + panel | None |
| 17 | Real store receipt verification | Verify App Store / Play purchases | none | `ReceiptVerifier` port, only `MockReceiptVerifier` (`mock:<product>:<transaction>`); ARCHITECTURE deviation 12 | `src/services/subscription.ts` | Mock only | F | Code read; `subscription.module.ts` wires the mock in every environment | Anyone can mint Plus with a mock receipt where the mock is wired, including production | P1 (before launch) | Backend subscription | Needs App Store Server API / Play Developer API credentials (blocked); then a `mode: 'store'` adapter and an env switch that refuses the mock in production |
| 18 | Support inbox list + status | Handle tickets | `/support`; `features/support/*` | `GET support/tickets`, `PUT support/tickets/:id/status` `TicketStatusDto`; admin | `src/services/settings.ts` (send) | Real | A | Live: 64 tickets seeded through the API from 4 users; list meta total 64; close 200 with audit; daily cap: 21st ticket 429 `SUPPORT_RATE_LIMITED` | Support | P2 | Backend support | None |
| 19 | Support ticket by id (deep links) | `support.ticket.created` panelUrl | `/support/$id` to drawer; `support-api.ts` `get/find` | `GET support/tickets/:id` (new), 404 `TICKET_NOT_FOUND`; admin | none | Real | A (added) | Live: oldest of 64 (page 4 at limit 20) 200; unknown 404 `TICKET_NOT_FOUND`; bad id 400; clinician 403. Chrome: drawer opens it, no `limit=100` scans; unknown reads "Ticket not found" (F-04) | Webhook links to old tickets failed | P2 | Backend support + panel | None |
| 20 | Support screenshot | View attachment | `ticket-detail.tsx` (`useScreenshot`, bearer fetch) | `GET support/tickets/:id/screenshot`; 404 `TICKET_NOT_FOUND` / `SCREENSHOT_NOT_FOUND` (codes added) | app upload | Real (404 path); upload path unit + E2E | C | Live 404 `SCREENSHOT_NOT_FOUND` via E2E; upload path covered by `support-legal` E2E, not exercised live | | P3 | Backend support | None |
| 21 | Support replies, internal notes, assignment, priority | Ticket workflow | none (panel does not simulate replies) | none | App copy: "Support will reply by email." (`HelpLegal.tsx`) | n/a | E | Searched PROJECT_CONTEXT §10, ADMIN_API, panel code and docs: not required; tickets go to `SUPPORT_INBOX_EMAIL` | Workflow lives in email | P3 | Product | Decide (section d) |
| 22 | Safety signal intake | Metadata-only flags | none | `POST safety/signals` `SafetySignalDto` (user, 30/h) | `src/services/safety.ts` | Real | A | Live: 202 for the four app surfaces; extra `text` 400; `third-ear-server` 400 | Privacy by design | P1 | Backend safety | None |
| 23 | Safety list with server filters incl. surface | Triage | `/safety`; `safety-page.tsx`, `schemas/safety.ts` | `GET admin/safety/flags` `SafetyFlagQueryDto.surface` (new), repository filter, index `surface_1_lastAt_-1`; admin + clinician | none | Real | A (added) | Live: each of 5 surfaces returns only its flags; `chat` 400; user 403; clinician and admin 200. Chrome: `surface=quiz` shows "1 result" from the server (F-06) | Wrong counts before | P2 | Backend safety + panel | None |
| 24 | Safety review / notes / escalate | Follow-up | `flag-detail.tsx`, `/safety/$id` | `POST admin/safety/flags/:id/{review,notes,escalate}` | none | Real | A | Live: 200 each; audit `safety.note/review/escalate`, meta `{userId,kind,level,status}`, no note text | Duty of care | P1 | Backend safety | None |
| 25 | Safety retention + schema | 180-day TTL, no text field | none | `safety_flags` schema, TTL index on `expiresAt` | none | Real | A | Live DB: index `{expiresAt:1}` `expireAfterSeconds:0`; `expiresAt - lastAt` = 180 days; stored keys contain no text field | Privacy | P1 | Backend safety | Privacy policy sentence still open (PROJECT_CONTEXT §10) |
| 26 | Panel states: empty / error / permission / partial | UX correctness | `ErrorState`, `ForbiddenState`, `DataTable` | n/a | n/a | Mock tests + real Chrome | A | Chrome on the real API: clinician pages show "Not available for your role" with 0 failed calls; mid-session revocation (section c). Mock tests: empty, 500 error, 403 role, summary-fails partial | | P2 | Panel | None |
| 27 | Dashboard stats for staff | Overview | `/`; `features/dashboard/*` | `GET admin/stats` (admin + clinician) | none | Real | A (access only) | Live: clinician and admin 200; counts not audited (other areas) | | P3 | Backend admin | None |
| 28 | n8n `user.suspend` / `user.tag` | Automations | `/settings/integrations` | `POST integrations/n8n/action` to `auth.admin.*` | none | Not run live by this audit | B | Unit and E2E exist (`admin-ai-integrations`); integrations is another area | | P3 | Integrations audit | Covered by that audit |

## (b) Findings

| ID | Title | Evidence (paths) | Impact | Current (before) | Expected | Fix done / spec | Repo | Priority | Dependencies | Verification result |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Staff roles survived removal from the env lists | `auth/strategies/jwt.strategy.ts` returned `account.roles`; `auth.service.ts` `refresh` issued without a role sync; only `verify` / social sign-in called `syncRoles` | A removed admin or clinician kept full staff access (users, deletion, safety notes) until they chose to sign in again, which a refresh never forces | Live, develop a21451c: after restart without admin@ / clinician@, old tokens 200 on `admin/me`, `admin/users`, `admin/safety/flags`; refresh 200 and the new token kept roles; DB roles unchanged | Staff access ends at the next request after the env change | Fixed `8d8d437`: `AccountsService.currentRoles` + `syncRoles` in `JwtStrategy`, refresh and sign-in; returned roles never depend on the stored copy; `toAdminRow` uses current roles. 5 unit tests (fail on old code, pass on new), `staff-roles.e2e-spec.ts` (3 tests). Docs: ADMIN_API, APP_CONTRACT, ARCHITECTURE (32.3, 33.1), DATABASE, DEPLOYMENT, PROJECT_CONTEXT | app | P0 | Restart with the new env (the env is read at boot) | Live after fix: old tokens 403, refresh 200 but new token 403, fresh sign-in 403, DB rewritten to `[user]`; re-adding works with the existing token. E2E pass |
| F-02 | Role 403 carried no code; panel kept stale roles | `libs/common/src/guards/roles.guard.ts` `ForbiddenException('Insufficient role')`; panel `errors.ts` mapped a `FORBIDDEN` code the API never sends; mock answered `FORBIDDEN` (mock drift) | After F-01, a staff member losing a role mid-session got raw "Insufficient role" errors and kept seeing admin navigation | No code; panel roles loaded once from `admin/me` | Distinct code; panel shows a permission state and follows the new roles | Fixed: API `INSUFFICIENT_ROLE` (`782d79e`); panel `onRoleRefused` + `recheckRoles` (single flight, ≤ every 5 s), `ErrorState` renders `ForbiddenState`, error copy for every admin code, mock guard aligned (`eeec16e`) | app + panel | P1 | F-01 | Live Chrome: admin removed mid-session, click Users, then the no-access screen; both@ losing admin, click Users, then "Not available for your role", sidebar drops admin items, Safety still loads |
| F-03 | Panel could present an unverified store purchase as a normal subscription | `subscription/receipts/receipt-verifier.ts` (mock only), `subscription.module.ts`; ARCHITECTURE deviation 12; panel subscription card showed plan and renewal only | Staff could trust a Plus that no store ever checked | No source or verification in `AdminSubscriptionView` | Server says where Plus comes from and whether receipts are mocked; panel labels it | Fixed: `plusSource()` (same precedence as `resolve()`), `ReceiptVerifier.mode`, view fields `source`, `verification` (`e98b088`); panel label "Store purchase (receipt verification is mocked in this build)" + Unverified badge (`2de9deb`). No revenue or billing figures | app + panel | P1 | Real verifier (matrix row 17) | Live API + Chrome as in matrix row 16; unit tests for all precedence cases and a `store` verifier |
| F-04 | Support deep links scanned pages | panel `features/support/api/support-api.ts` `find`: up to 5 requests of 100; no `GET support/tickets/:id` | Tickets older than the newest 500 showed "Ticket not found"; up to 5 list requests per link | Page scan | One request by id | Fixed: API route + `TICKET_NOT_FOUND` (`fa7664d`); panel uses it (`c28692b`) | app + panel | P2 | none | Live: 64 seeded tickets, oldest on page 4 of 20 found by id; Chrome drawer shows it with no `limit=100` calls. Note: 64 tickets would also have been inside the old 500 window; the panel test seeds 600 newer tickets to prove the old limit is gone |
| F-05 | Ticket status changes were not audited | `support.controller.ts` `setStatus` had no actor; ADMIN_API: "Every admin/clinician/n8n write publishes `audit.recorded`" | No record of who closed a ticket | No entry | `support.ticket_status`, target `support_ticket:<id>`, meta `{userId,status}`, never text | Fixed `fa7664d` (+ unit, E2E) | app | P2 | none | Live: entry present after close |
| F-06 | Safety "Where" filter narrowed only the loaded page | panel `safety-page.tsx` (client filter, label "Where (this page)"); `SafetyFlagQueryDto` had no `surface` | Wrong totals and missing flags on later pages | Client-side only | Server filter over every page | Fixed: DTO enum `FLAG_SURFACES`, repository, index `surface + lastAt` (built by the repeatable `20261025-01-sync-indexes` migration) (`35a4257`); panel sends it (`88eb235`) | app + panel | P2 | none | Live: per-surface results, 400 on unknown, index present in `audit_people.safety_flags` |
| F-07 | `STAFF_ACCOUNT` and admin rows used stored roles | `auth/services/accounts-admin.service.ts` `toAdminRow`, `admin/admin.service.ts` `deleteUser` | A removed admin who never signed in again could not be deleted; a newly listed admin could be | Stored roles | Current env roles | Fixed with F-01 (`8d8d437`) | app | P2 | F-01 | E2E `staff-roles` test 3 |
| F-08 | Null profile / couple was ambiguous | `admin.service.ts` `user()`; panel showed "No profile yet" / "Not linked" for owner failures | Staff tell a person something false during an outage | null for both cases | Distinguish failure from absence | Fixed: `unavailable` list (`782d79e`), panel copy (`2de9deb`) | app + panel | P3 | none | Unit + panel tests; live `unavailable: []` |
| F-09 | Support 404s had no `code` | `support.service.ts` `NotFoundException('Ticket not found')` | Panel could not give specific copy | Plain message | `TICKET_NOT_FOUND`, `SCREENSHOT_NOT_FOUND` | Fixed `fa7664d` | app | P3 | none | Live + E2E |
| F-10 | Plain logout leaves the access token valid until expiry | `auth.service.ts` `logout` revokes the refresh family only | Up to 15 minutes of access after "Sign out" on a stolen token | 200 on `auth/me` after logout | Product choice: acceptable for short JWTs, or bump a per-family version | Not changed. Spec option: track `familyId` in the JWT and reject revoked families in `JwtStrategy` (one indexed lookup per request) | app | P3 | none | Live: 200 after logout |
| F-11 | Refresh after logout answers `REFRESH_REUSED` | `token.service.ts` `consume`: any revoked token reads as reuse | Clients may treat a normal sign-out as an attack | 401 `REFRESH_REUSED` | 401 `REFRESH_REVOKED` for tokens revoked by logout | Spec: store `revokedReason` (`rotated|logout|admin|suspend`) and only call `rotated` reuse | app | P3 | none | Live |
| F-12 | Invalid receipt 402 without `code` | `subscription.service.ts` `verify` | App cannot tell a declined receipt from `PLUS_REQUIRED` | 402 `{code:null}` | 402 `RECEIPT_INVALID` | Spec only (app contract change; app consumer `src/services/subscription.ts`) | app | P3 | none | Live: `[402,null]` |
| F-13 | No-op grant revoke and unlink are audited as actions | `admin.service.ts` `revokePlus`, `unlink` | Audit log shows revokes that changed nothing (`unlink` has `unlinked:false`, `plus_revoke` has no flag) | Two `user.plus_revoke` entries for one real revoke | Meta `{ changed: boolean }` on `plus_revoke` | Spec only | app | P3 | Contract `subscription.admin.revoke-grant` would need to say whether it ended a grant | Live audit listing |
| F-14 | User page "Open inbox" is not filtered to the person | panel `user-detail-page.tsx`; `GET support/tickets` has no `userId` | Staff scan the inbox by hand | Link to all tickets | `?userId=` filter | Spec: add `userId` (IsMongoId) to `TicketInboxQueryDto`, index `userId + createdAt` exists | app + panel | P3 | none | Code read |
| F-15 | Support throttle is per IP per route | `support.controller.ts` `@Throttle 5/min` | People behind one NAT (office, carrier) share 5 tickets a minute | Seeding hit 429 across different users | Per-user tracker for authenticated routes | Spec: `getTracker` returning `req.user.userId` when present | app | P3 | none | E2E and live seeding hit 429 across users |
| F-16 | Full E2E run runs out of heap at the default size | `npm run test:e2e` (38 suites, `--runInBand`) | CI flake risk | V8 OOM after a few suites | Passes | Not changed; passes with `NODE_OPTIONS=--max-old-space-size=4096` | app | P3 | none | 177/177 with 4 GB heap |
| F-17 | Panel tests time out under CPU load | panel UI tests with 5 s default timeouts (ai-engine, content editor, integrations, legacy) | Flaky CI on busy runners | 3 to 4 timeouts at load average about 9 | Stable | Not changed (files outside this area); they pass serially or alone | panel | P3 | none | See section c |

## (c) Checks run

### Real API + MongoDB (live, port 3102, DB `audit_people`)

Role revocation (P0):
| Check | Before fix (develop a21451c) | After fix |
|---|---|---|
| Old admin token, `GET admin/me` / `admin/users` after removal | 200 / 200 (failed) | 403 `INSUFFICIENT_ROLE` / 403 (passed) |
| Old clinician token, `admin/me` / `admin/safety/flags` | 200 / 200 (failed) | 403 / 403 (passed) |
| Refresh after removal, then `admin/me` | refresh 200, then 200 with roles (failed) | refresh 200 (app session kept), then 403 (passed) |
| Fresh sign-in after removal | not run on old build | 403 (passed) |
| Stored `users.roles` | still admin / clinician | rewritten to `[user]` |
| Re-add to env, same token | n/a | 200 `[user, admin]` (passed) |

Sessions:
| Check | Result |
|---|---|
| Rotation R1 to R2 | 200 passed |
| Reuse of R1 | 401 `REFRESH_REUSED` passed |
| R2 after reuse (family revoked) | 401 passed |
| Logout | 204; refresh after it 401 (code `REFRESH_REUSED`, F-11); access token still 200 until expiry (F-10) |
| Logout-all | 204; this device's and a second device's access tokens 401; both refresh tokens 401, passed |
| Suspend | 200; request 403 `ACCOUNT_SUSPENDED`; refresh 403 `ACCOUNT_SUSPENDED`; OTP verify 403 `ACCOUNT_SUSPENDED`; Google mock sign-in 403 `ACCOUNT_SUSPENDED`, passed |
| Unsuspend | 200; sign-in ok; pre-suspension refresh token stays 401, passed |

Role matrix (status codes; user = plain account; `<missingId>` = unknown ObjectId, so 4xx past the guard means the guard allowed it):
| Route | user | clinician | admin | both |
|---|---|---|---|---|
| GET admin/me | 403 | 200 | 200 | 200 |
| GET admin/stats | 403 | 200 | 200 | 200 |
| GET admin/users | 403 | 403 | 200 | 200 |
| GET admin/users/:id | 403 | 403 | 200 | 200 |
| GET admin/audit | 403 | 403 | 200 | 200 |
| POST admin/users/<missingId>/sign-out | 403 | 403 | 404 | 404 |
| PUT .../tags `{}` | 403 | 403 | 400 | 400 |
| POST .../plus `{}` | 403 | 403 | 400 | 400 |
| DELETE .../plus | 403 | 403 | 404 | 404 |
| POST .../unlink | 403 | 403 | 404 | 404 |
| DELETE admin/users/<missingId> `{}` | 403 | 403 | 400 | 400 |
| POST .../suspend `{}` | 403 | 403 | 400 | 400 |
| POST .../unsuspend | 403 | 403 | 404 | 404 |
| GET admin/safety/flags | 403 | 200 | 200 | 200 |
| GET admin/safety/summary | 403 | 200 | 200 | 200 |
| GET admin/safety/flags/<missingId> | 403 | 404 | 404 | 404 |
| POST admin/safety/flags/<missingId>/notes `{}` | 403 | 400 | 400 | 400 |
| GET support/tickets | 403 | 403 | 200 | 200 |
| PUT support/tickets/<missingId>/status `{}` | 403 | 403 | 400 | 400 |
| GET support/tickets/<missingId>/screenshot | 403 | 403 | 404 | 404 |
| GET admin/content | 403 | 200 | 200 | 200 |
| GET admin/ai/settings | 403 | 200 | 200 | 200 |
| GET admin/integrations/webhooks | 403 | 403 | 200 | 200 |

Users, subscriptions, support, safety: every row marked A in the matrix was run live with the outcomes listed in its Evidence column (all passed, except the observations recorded as F-10 to F-13 and F-15).

Panel against the real API (headless Chrome, Vite proxy to 3102, mocks off):
| Check | Result |
|---|---|
| Admin user detail, store purchase via mock receipt | "Store purchase (receipt verification is mocked in this build)" + "Unverified", 0 failed API calls, passed |
| Clinician on `/users`, `/users/:id`, `/support`, `/support/:id`, `/audit`, `/settings/integrations` | "Not available for your role", 0 API calls failed (RoleGate stops the calls), passed |
| Clinician `/safety?surface=quiz` | "1 result" from the server, passed |
| Admin `/support/<oldest of 64>` | drawer shows TW-SUP-F5D726 with its text, no `limit=100` scan, passed |
| Admin `/support/<unknown>` | "Ticket not found" (expected 404), passed |
| Mid-session: admin@ removed from both lists, click Users | 403 `admin/users`, then `admin/me` 403, then "This account has no panel access", passed. The logout 403 in that run was my setup: that env file predated adding the panel's port 5181 to `CORS_ORIGINS` |
| Mid-session: both@ loses admin, keeps clinician | Users: "Not available for your role"; sidebar drops Users, Support, Integrations, Audit; Safety loads 4 results, passed |

### Automated suites
| Suite | Result |
|---|---|
| Backend `npm run typecheck` | passed |
| Backend `npm run lint` | passed |
| Backend `npm test` | 62 suites, 688 tests passed |
| New E2E `staff-roles`, `admin-accounts-audit` (real Mongo 8) | 6 passed |
| Targeted E2E (admin, auth, safety, support-legal, subscription, plus, staff-roles, social-auth, privacy, partners, users) | 14 suites, 61 passed |
| Full E2E `npm run test:e2e` | default heap: V8 OOM (F-16); with `NODE_OPTIONS=--max-old-space-size=4096`: 38 suites, 177 passed |
| Panel `npm run typecheck`, `npm run lint`, `npm run build`, prettier on changed files | passed |
| Panel `npm test` (MSW mocks, not proof of API behaviour) | 130 tests. Parallel run at load average about 9: 127 passed, 3 timeouts in untouched files. Serial run: 129 passed, 1 timeout (ai-engine), which passes alone. The 4 timing-out files pass serially on both the base and this branch (F-17) |
| App `npx tsc --noEmit && npx expo lint` | not run: no app code changed (only `docs/PROJECT_CONTEXT.md`) |

### Not run
- Real store receipt verification: blocked, no adapter or credentials (matrix row 17).
- Screenshot upload on the live API: covered by the `support-legal` E2E only.
- n8n account actions: the integrations audit's area.

## (d) Open product decisions

1. **Support replies, internal notes, assignment, priority.** Not in PROJECT_CONTEXT §10, ADMIN_API or the Figma-derived app copy, which says "Support will reply by email". Not built, and the panel does not simulate replies. Options: keep email-only (today), or add in-panel replies (needs an outbound email template, a thread model and an app inbox), notes / assignment / priority (staff-only fields plus audit).
2. **Store receipt verification before launch.** The mock verifier is wired in every environment. Decide when to connect the App Store Server API and Play Developer API. Recommended: refuse the mock in production (boot check) so a mock receipt can never grant Plus there.
3. **Logout strength (F-10).** Is up to 15 minutes of access-token validity after "Sign out" acceptable, or should logout revoke the access token at once (per-family check on every request)?
4. **Role changes need a restart.** Roles now apply on the next request, but env lists are read at boot. Moving staff lists into the database (managed in the panel, audited) would remove the restart. That is a product and security choice.
5. **Support inbox per person (F-14)** and a per-user support throttle (F-15).
6. **Privacy policy sentence** about safety-flag metadata kept 180 days (already open in PROJECT_CONTEXT §10; not edited).
