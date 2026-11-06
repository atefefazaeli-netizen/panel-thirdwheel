# Architecture

How the Thirdwheel panel is put together, why, and where it departs from the original brief.

## 1. Layers

```
Route component (features/*/routes)          one per page, reads search params, composes
  └─ Feature components (features/*/components) the screen's parts: editor tabs, drawers, dialogs
       └─ Shared composites (components/shared)  AppShell, DataTable, FormField*, ConfirmDialog, Can, ...
            └─ Primitives (components/ui)        shadcn/ui on Radix, styled only through theme tokens
```

Rules that keep it small and predictable:

- **Primitives** know nothing about Thirdwheel. They are the shadcn new-york sources (see 4) and are only changed where the project needs it (theme from zustand, controlled sidebar).
- **Shared composites** know the panel (permissions, the API error shape, the table conventions) but no feature. A composite takes data and callbacks; it never fetches.
- **Feature folders** own one area of the API: `api/` (DTO types that match ADMIN_API.md, typed fetchers, TanStack Query hooks and a key factory), `schemas/` (Zod for forms and search params), `lib/` (pure logic with unit tests: workflow rules, diffs, codecs), `components/` and `routes/`. Features may import another feature's `api/` (the dashboard reads content, safety and integrations) but not its components.
- **Pure logic is pulled out and tested on its own**: which workflow buttons a set of permissions shows (`content/lib/workflow.ts`), the Remote Config diff (`app-config/lib/diff.ts`), the production guard and bundle scanner (`scripts/prod-guard.mjs`), live vs draft diffs (`content/lib/diff.ts`), the editor's snapshot codec (`content/schemas/editor.ts`, round-trips all 170 seeded items byte for byte), webhook signatures (`integrations/lib/signature.ts`), the word diff for prompts.

### Shared composites

| Composite                                                                                            | Purpose                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell` (+ `AppSidebar`, `Breadcrumbs`, `ThemeToggle`, `UserMenu`)                                | Sidebar filtered by the session's permissions with live counts, top bar, skip link, My account. Breadcrumbs come from each route's `staticData.crumb`.                                                                                                           |
| `DataTable` (+ toolbar, faceted filter, pagination, view options)                                    | One generic, server-driven table on TanStack Table v9. The API pages, searches and filters; the table renders one page and owns selection (kept across pages, by id) and column visibility (remembered per table in localStorage).                               |
| `PageHeader`, `StatCard`, `MetricBadge`, `StatusBadge`, `EmptyState`, `ErrorState`, `ForbiddenState` | Page furniture. `StatCard` shows "Not available" for a `null` stat; `ErrorState` shows the request id.                                                                                                                                                           |
| `ConfirmDialog`, `DangerConfirmDialog`, `FormDialog`, `DrawerPreview`                                | Confirmations (the safe option names what is kept), type-to-confirm, a small RHF + Zod form in a dialog, and a side drawer for details. All stay open when the action fails.                                                                                     |
| `FormFieldText`, `Textarea`, `Number`, `Select`, `MultiSelect`, `Switch`, `Tags`, `CheckboxGroup`    | Labelled, described, validated fields on `react-hook-form` with the shadcn `Form` primitives (label, `aria-describedby`, `aria-invalid`, message). `CheckboxGroup` (roles, permissions by area) is new; `FormFieldText` gained `type="password"` and `listId`.   |
| `JsonEditor`                                                                                         | Textarea with JSON validation (line and column), Format, extra Zod checks, Tab indents. Used for type decks and imports.                                                                                                                                         |
| `Can`, `RequirePermission`                                                                           | Hide (or disable with a tooltip) UI by **permission** from the session, any-of or all-of; `RequirePermission` shows "Not available for your role" for a whole page. The API enforces the same rules; the gate only keeps people from trying. Never by role name. |
| `CopyButton`, `SecretReveal`                                                                         | Copy to clipboard; show a secret once (webhook secret, API key, temporary staff password) with a clear warning.                                                                                                                                                  |

Primitives added: `NativeSelect` (shadcn's styled native select, for the ticket's status, priority and assignee) and an `Alert` `warning` variant (a dependency that is not an error, like the missing email provider).

## 2. State: where each kind lives

| State                                                       | Where                                                               | Why                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Data from the API (lists, items, settings)                  | TanStack Query                                                      | Caching, dedupe, retries, background refresh, invalidation after writes. Never copied into component state.                          |
| List filters, page, page size, open drawer, editor tab      | The URL (typed search params, Zod-validated per route)              | Shareable and bookmarkable views, back/forward works, a reload keeps the view. Bad values fall back to defaults instead of crashing. |
| Form input (editors, dialogs)                               | React Hook Form + Zod                                               | Field-level validation and dirty tracking without re-rendering the page on every key.                                                |
| Who is signed in (StaffMe with permissions), theme, sidebar | zustand                                                             | Read synchronously by route guards and `Can`; theme and sidebar persist in localStorage. The session itself is never stored.         |
| Session, CSRF token                                         | HttpOnly cookie set by the API; CSRF token in module memory (see 5) | Nothing about auth in localStorage, sessionStorage or React state.                                                                   |
| Row selection, column visibility                            | Table state (visibility remembered per table in localStorage)       | Per-viewer conveniences.                                                                                                             |

Writes go through mutation hooks that update the item cache and invalidate the lists and the dashboard, so badges and counts follow without manual refreshes.

## 3. Routing and permission gating

TanStack Router with a code-based tree in `src/app/router.tsx` (no generator step). The `_app` layout route restores the session in `beforeLoad` (`GET staff/auth/session`) and redirects to `/login?redirect=…` when there is none or when the session is restricted (two-factor enrollment or a password change is pending: `/login` shows that step). Pages are loaded lazily (`lazyRouteComponent`).

**Permissions decide everything, roles nothing.** The server sends `permissions` with the session (the union of the account's roles, built-in or custom). The panel never looks at role names to decide:

- **Routes**: each route names its permission in `staticData.permission` (one, or any of a list). `AppLayout` checks every matched route and shows "Not available for your role" instead of the page, so a deep link, a bookmark or a role changed mid-session never shows a broken page. Without `dashboard.read`, `/` opens the first page the account can see.
- **Navigation**: every sidebar item names the same permission (`components/shared/app-shell/nav.ts`).
- **Actions**: `Can` (hide or disable) around each button, `useCan()` in logic. The content workflow is a pure function of the permissions (`workflowFor`). One exception is not a decision but a fact the server states: Owners must keep two-factor on, and only the Owner role holds owner-only permissions, so `mfaRequired()` hides "Turn off" when the session holds one.
- **Drift**: a 403 `INSUFFICIENT_PERMISSION` re-reads the session (single flight, at most every 5 s), so gates follow an Owner's role change without a reload.
- `src/lib/permissions.ts` mirrors the backend catalog and the built-in roles (labels, groups, owner-only, the custom-role rules) for the role editor, the mocks and the tests.

| Permission                                                                                        | UI it opens                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard.read`                                                                                  | Dashboard (each count and preview also needs `users.read`, `content.read`, `safety.read`, `support.read` or `integrations.read`) |
| `content.read`                                                                                    | Content, item editor (read only), Review queue                                                                                   |
| `content.edit`                                                                                    | Save draft, Discard, New item, Import                                                                                            |
| `content.submit`                                                                                  | Submit for review (also the batch action)                                                                                        |
| `content.approve`                                                                                 | Approve and publish, Request changes (disabled with a hint otherwise)                                                            |
| `content.unpublish`                                                                               | Unpublish, Restore, Roll back a version                                                                                          |
| `catalog.manage`                                                                                  | Date ideas, Experiences, booking links                                                                                           |
| `users.read`                                                                                      | Users, user detail, user links from tickets and flags                                                                            |
| `users.signout` / `users.suspend` / `users.tags` / `users.unlink` / `users.delete` / `users.plus` | The matching item in the user Actions menu                                                                                       |
| `safety.read` / `safety.handle`                                                                   | Safety log / Mark reviewed, Escalate, Add note; also the safety card on a user                                                   |
| `support.read`                                                                                    | Support inbox, ticket page; also the support card on a user                                                                      |
| `support.resolve` / `support.assign` / `support.prioritize`                                       | Status / Assignee / Priority pickers (read-only text otherwise)                                                                  |
| `support.note` / `support.reply`                                                                  | Internal note / Reply composer, Retry                                                                                            |
| `config.read` / `config.edit` / `config.publish` / `config.rollback`                              | Remote Config page / switches and Save draft / Publish / Roll back                                                               |
| `ai.read` / `ai.edit` / `ai.test`                                                                 | AI settings and history / Save, Roll back / Test console (alone: a console-only page)                                            |
| `integrations.read` / `integrations.manage`                                                       | Integrations / New webhook, Edit, Rotate, Delete, Enabled switch, New API key, Revoke, Retry                                     |
| `audit.read`                                                                                      | Audit log                                                                                                                        |
| `staff.read` / `staff.manage` / `roles.manage`                                                    | Staff accounts and Roles / Add staff and account actions / New, Edit, Delete custom role                                         |

Two routes exist for links the API sends out: `/safety/<flagId>` (the `crisis.alert` panelUrl) and `/support/<ticketId>` (the `support.ticket.created` panelUrl, now the full ticket page).

## 4. shadcn/ui and the theme

- `components.json` uses the new-york style with the standard aliases (`@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`) and lucide icons, so the CLI can add more components later.
- The registry (ui.shadcn.com) was blocked where this was built, so the primitives are written by hand from the current new-york sources: Radix through the single `radix-ui` package, `class-variance-authority`, `tailwind-merge`, `clsx`, `cmdk`, `sonner`.
- Changes from upstream, kept small: `sonner` reads the theme from the zustand store instead of `next-themes`; `SidebarProvider` is controlled (`open`, `openMobile`) so the sidebar state lives in zustand rather than a cookie; `useIsMobile` uses `useSyncExternalStore`; `SidebarMenuSkeleton` has a fixed width (no `Math.random` in render); `DialogContent` scrolls when taller than the viewport. The classic `Form` primitive (`FormField`, `FormItem`, `FormControl`, ...) is used for React Hook Form.
- **Brand tokens** (Tailwind v4 CSS variables in OKLCH, light and dark) come from the app's `src/theme/tokens.ts`: `primary` = navy `#1A2B4C`, `destructive` = cherry `#C42A3A` (4.5:1 with white), a `brand` token = cherry red `#EC0137` for highlights (active nav marker, counts, charts), `success` = mint `#2B6A47` with a soft `#C9EAD6`, plus `warning` and `info`. Muted text `#626B7F` and field borders `#7D879D` keep 4.5:1 and 3:1. The sidebar is navy. Font: Manrope Variable (`@fontsource-variable/manrope`, self-hosted).
- shadcn's `accent` stays a quiet hover colour. Using cherry for every hover would fight the destructive colour, so "accents = cherry" is the separate `brand` token.
- Accessibility: visible focus rings everywhere, a skip link, labelled icon buttons, `aria-live` on statuses, tables with names, `prefers-reduced-motion` respected. The phone preview in the content editor uses the app's own colours on purpose, in both themes.

## 5. Auth, sessions and CSRF

Staff accounts are separate from app users and sign in with **username and password** (STAFF_API.md §2):

1. `POST staff/auth/login` answers `ok`, `mfa_required` (a 5-minute single-use challenge, no cookie yet), `mfa_enrollment_required` or `password_change_required`. The last two come with a **restricted** session that can only finish its step.
2. `POST staff/auth/login/mfa` takes a 6-digit TOTP code or one recovery code.
3. Enrollment (Owners without two-factor): confirm the password (`mfa/setup`), scan the QR code (drawn client-side from the `otpauth://` URL with `uqr`, no image service) or type the key, confirm one code (`mfa/enable`), then the 10 recovery codes are shown once with Copy and Download and an explicit "I saved them" before going on.
4. Temporary passwords: the new password is checked against the policy first (12 to 128 characters, not containing the username); `WEAK_PASSWORD` details from the server are listed.
5. Wrong password, unknown username and disabled account all read the same ("The username or password is not right."); a lockout (423 `ACCOUNT_LOCKED`) says until when.

**Where the session lives.** The API sets an `HttpOnly`, `Secure`, `SameSite` cookie (`tw_staff_sid`, `Path=/api/v1`) and every call sends `credentials: 'include'`. The panel cannot read the cookie, so an XSS cannot steal the session. The CSRF token from the login and session answers lives **only in module memory** (`lib/api/csrf.ts`) and goes out as `X-CSRF-Token` on POST, PUT, PATCH and DELETE (never on GET); the API also checks `Origin` against `PANEL_ORIGINS`. A reload loses the token on purpose and gets it back with `GET staff/auth/session`.

**Why nothing in web storage.** The previous build kept a refresh token in `sessionStorage`, readable by any script on the page. With the cookie there is nothing to store: no access token, no refresh token, no refresh logic, and `localStorage`/`sessionStorage` hold no auth data at all (a test asserts both are empty after sign-in).

**The client** (`src/lib/api/client.ts`):

- Base URL `VITE_API_URL` (`/api/v1` through the Vite proxy in development).
- On 401 it re-checks the session **once for all callers** (a shared promise): if the session is alive it retries the call once, otherwise the session ends and the layout sends the person to sign-in with the page to come back to.
- On 403 `CSRF_FAILED` it reads the session again (fresh token) and retries once.
- On 403 `INSUFFICIENT_PERMISSION` it tells listeners; the session's permissions are re-read and the gates follow.
- Writes send an `Idempotency-Key`; a retry reuses it, so the server never applies a write twice.
- Errors become `ApiError` with `status`, `code`, `requestId`, `retryAt` and `details`; every staff, support and config code has its own copy (`lib/api/errors.ts`).

**My account** (`/account`): change password (other sessions end), turn two-factor on or off (off is hidden when the role requires it), make new recovery codes, see and revoke own sessions, sign out.

## 6. The content workflow

- One React Hook Form holds the whole snapshot (catalog fields, cards, steps, the deck as JSON text, the screen text). The codec writes back exactly what it read for fields nobody touched, keeps unknown keys and keeps the original key order, because the API compares snapshots as JSON: a no-op save must not read as a change.
- The Zod schema per kind mirrors the server: title 1..120, Where non-empty, minutes 1..10080 (week-long Do cards), card text 1..1000 and at most 100 cards, steps at most 30 with title and body, a `deck` with a `type` for type items, at least one card for Your turn and Card deck quizzes, 256 KB per snapshot.
- `workflowFor(item, permissions, { dirty, valid, busy })` decides which buttons show and why one is disabled: `content.edit` Save draft and Discard, `content.submit` Submit for review, `content.unpublish` Unpublish / Restore, `content.approve` Approve and publish and Request changes (note required) on a draft in review. The draft, review, approve, provenance, held-content and `expectedRev` rules are unchanged; actor ids are `staff:<id>` and views show the staff `byName`.
- Leaving with unsaved edits asks first (router blocker and `beforeunload`).
- The review queue compares live and draft field by field; cards, steps and deck rounds compare one by one.
- **Concurrency (audit, Nov 5).** The editor is based on one revision of the item (`rev`) and sends it as `expectedRev` on every write. A newer server copy replaces the form only when there are no unsaved edits; otherwise, and on a 409 `CONTENT_CONFLICT`, the page shows "Changed by someone else", keeps the local edits, offers "Copy my edits (JSON)" and disables writes until the latest is loaded. The review queue pins the copy the clinician is reading and approves exactly that revision.
- **Clinical review and held content.** Seeded items show "Needs clinical review" with the server's provenance (AI-written Do steps, hand-set options, deck lines written in the app) and the label "Seeded from the Release 1 bundle, not a sign-off in this system". The list filters on it. A held-list match shows a red banner; the approve dialog requires the acknowledgement, warns when the clinician last edited the draft (self-approval is allowed and recorded), and says which review flags the approval clears.
- **Server field errors.** `INVALID_CONTENT` details are mapped onto the editor's fields (`content/lib/review.ts`) and listed above the tabs.
- **Deck editor.** Decks that play a list of questions (V-TX, V-SL, V-RK, V-AV, V-SC, V-NEW-PL, V-PR, V-GU, and V-FL / V-NH statements: 62 of the 106 seeded decks) get a Questions editor (text, intro, follow-up, options; add, remove, reorder; other keys kept). The other 14 types stay JSON (`content/lib/deck.ts`).
- **Preview.** Every card, step or deck entry in a scrollable phone frame, labelled "Approximate preview, not the app's rendering".
- **Import.** JSON only (the workbook .xlsx goes through `scripts/release1-workbook.py`). The preview flags ids listed twice; "Check against the server" runs the import as a dry run (existing ids, server validation, held list) and the result lists each item.

## 7. Support workflow and Remote Config

**Support** (STAFF_API.md §5). The inbox filters on the server by status (default open), priority, assignee (me, unassigned or a person from `GET support/assignees`), user id and text. The ticket page (`/support/<id>`) shows the message, device, screenshot (fetched through the API client, kept as a data URL only while open), the **timeline** (created, status, assignee, priority, notes, replies; oldest first) and pickers for status, priority and assignee that send the ticket's `version` as `expectedVersion`. A 409 `TICKET_CONFLICT` changes nothing, says so next to the pickers and loads the latest. Internal notes are a separate composer mode with a dashed amber look and the label "Internal, never sent"; replies show their delivery as **Pending, Sent or Failed** exactly as the API reports it (never "Sent" unless the API says so), the reason (`NO_EMAIL_PROVIDER` in words) and Retry. `GET support/delivery-status` drives the notice "No email provider is configured: replies stay pending until one is set up". The panel never shows the user's email address.

**Remote Config** (STAFF_API.md §6, its own nav group "App"). One form edits the draft: the feature switches the server lists (a switch only hides an entry point), the maintenance screen and its message (280 characters, required when on), minimum and recommended version (`x.y.z`, recommended not below minimum). "Changes to publish" lists the saved draft against the published version in words; Publish takes an optional note. Published versions are listed with Roll back (republishes an earlier version as a new one). Every write sends `baseVersion` (the published version the page loaded); 409 `CONFIG_CONFLICT` keeps the edits, shows "Changed by someone else" and offers the latest.

## 8. Production build hardening

- `vite.config.ts` calls `checkProductionEnv` (`scripts/prod-guard.mjs`) for `vite build` in production mode and throws unless `VITE_API_URL` is an absolute https URL (http only for localhost) and `VITE_API_MOCKS` is not set at all.
- The mock API, its seed data, the dev banner and the dev sign-in hint are imported only inside `if (import.meta.env.DEV)` in `main.tsx` and registered into an empty UI slot (`config/dev-ui.ts`), so the production bundle never contains them; `env.useMocks` is always false in production. `mockServiceWorker.js` is deleted from `dist/` after every build.
- `npm run check:prod-bundle` builds and scans `dist/` for markers (`msw`, `mockServiceWorker`, `setupWorker`, seed names, the demo code, "Demo data", the dev password and banner) and fails on any hit. The scanner and the guard have unit tests.

## 9. The mock API (development and tests only)

`src/mocks/` implements the whole contract with MSW, statefully, so the panel can be used end to end and tests run against the same handlers:

- One in-memory database (`db()`), reset after every test; a reload in the browser starts again from the seed (and signs you out).
- **Staff sessions**: the HttpOnly cookie is simulated by `db().staff.jar` (the mock's cookie jar), the same in the browser and in Node. Every guarded route checks the session, the restriction, `X-CSRF-Token` on writes and the permission (403 `INSUFFICIENT_PERMISSION`, deny by default), so the UI gating can be tested against real refusals.
- Staff auth: Argon2 is not modelled; lockout after 5 failures (423 with `retryAt`), TOTP verification (RFC 6238 with ±1 step and no step reuse, on WebCrypto, `mocks/totp.ts`), single-use recovery codes, enrollment and password change. Staff and roles: temporary passwords, `SELF_ROLE_CHANGE`, `SELF_ACTION`, `LAST_OWNER`, `USERNAME_TAKEN`, `BUILTIN_ROLE`, `ROLE_IN_USE`, `INVALID_PERMISSIONS`, session revocation on role changes.
- Support workflow with versions, timeline, notes, replies and a switchable email provider (`none` keeps replies pending with `NO_EMAIL_PROVIDER`). Remote Config with versions, draft, publish, rollback and the public `GET app-config`.
- The content rules are a port of the backend's pure domain (clinician gate = `content.approve`). Ids are ObjectId-shaped like the API's. Modules publish events on a small bus; the integrations mock turns them into deliveries.

## 10. Tests

Vitest with jsdom and the MSW node server. They cover logic and flows, not snapshots: the API client (cookies, CSRF on writes only, single-flight session re-check, CSRF retry, permission refusals, error copy), every sign-in path (ok, wrong password, lockout, TOTP, recovery code, enrollment, password change, reload, revoked session), empty web storage after sign-in, permission gating for every built-in role (sidebar, routes, key buttons), staff and role management, the support workflow (filters, status, assignee, priority, notes vs replies, delivery states, retry, conflict), Remote Config (validation, diff, publish, rollback, conflict, read-only), the AI console, the production guard and bundle scanner, and the earlier content, users, safety, integrations, legacy, audit and dashboard flows. Tests type-check with their own config (`tsconfig.test.json`, Node types) so app code stays browser-only.

## 11. Deviations from the brief, and why

| Brief                    | Here                                                                                                  | Why                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (original brief) | Vite SPA                                                                                              | The panel is an authenticated tool behind a login with no SEO or server rendering needs; a static build deploys anywhere and keeps the API the only server.      |
| Router left open         | TanStack Router, code-based                                                                           | Typed routes and typed, validated search params for list filters; no file generator step in CI.                                                                  |
| shadcn CLI               | Primitives written by hand, `components.json` kept                                                    | The registry was blocked. The CLI works later with the same config.                                                                                              |
| Latest TypeScript        | TypeScript 6.0                                                                                        | typescript-eslint supports up to 6.0; 7.0 (the native compiler) is not supported by it yet.                                                                      |
| Calendar component       | Native date inputs                                                                                    | Date range filters only need a date; the native control is accessible and localised.                                                                             |
| Safety filter by surface | Server-side `surface` query                                                                           | Added to the API in the accounts audit (Nov 4); it filters every page and the total. Before, the panel narrowed only the loaded page.                            |
| Support ticket view      | A ticket page at `/support/<id>` (`GET support/tickets/:id` with the timeline)                        | The workflow (STAFF_API.md §5) needs room for the timeline, the composer and the pickers; the drawer was too small. Deep links from webhooks open the same page. |
| Legacy edits             | PATCH sends `null` to clear optional fields; ranking tags and the booking ref prefix only when edited | The public list hides `tags` and `refPrefix`, so sending empty values would wipe them.                                                                           |
| Login routes             | `staff/auth/*` with username and password                                                             | STAFF_API.md §0: staff accounts are a separate store; the email-code sign-in and the token storage are gone.                                                     |

Improvements beyond the brief: sidebar counts (review queue, open high flags, open tickets), deep links for webhook URLs, a review queue with a per-item diff, a JSON import preview with per-item problems, venue booking links on the legacy page, a batch "Submit drafts for review", batch sign-out and tag for users, lazy routes, and mocks removed from production builds.

## 12. Contract notes

Places where ADMIN_API.md left room, and what the panel assumes:

- **Pagination shape**: the intro names `{ items, total, page, limit, pages }` but tells builders to copy `libs/common` `Paginated`, which is `{ items, meta: { page, limit, total, totalPages } }`. The panel reads both.
- **Audit filters**: exact or prefix matching for `action` and `target` is not specified; the mock matches exactly or as a prefix (`content.` finds every content action).
- **Webhook events**: an empty `events` list is allowed by the DTO; the panel asks for at least one.
- **Plus source**: `AdminSubscriptionView.source` / `verification` (accounts audit). The user page shows where Plus comes from and labels a store purchase "receipt verification is mocked in this build" with an Unverified badge while the API's receipt verifier is the mock. No revenue or billing figures.
- **Unavailable parts**: `GET admin/users/:id` lists in `unavailable` the parts whose owner failed; the page says "Not available" for those instead of "No profile yet" / "Not linked".
- **Staff ids**: the mock gives staff accounts that exist in the users list the same id, so `SELF_ACTION` and `STAFF_ACCOUNT` can be tried.
- **Staff ids in old fields**: views still carry `byEmail` / `actorEmail` (null for staff now); the panel shows `byName` / `actorName` first, then the email, then the id.

### Staff, support and Remote Config (STAFF_API.md, Nov 6)

Places where STAFF_API.md leaves room, and what the panel assumes (each is one place in the code, easy to change when the backend settles it):

- **Permission refusal code**: §4 does not name it. The panel treats 403 `INSUFFICIENT_PERMISSION` (and the older `INSUFFICIENT_ROLE` / `FORBIDDEN`) as "Not available for your role" and re-reads the session.
- **Restricted session refusal**: §2 says restricted sessions can only call a few routes but not with which code. The panel treats 403 `SESSION_RESTRICTED` like a permission refusal (re-read the session, which then shows the setup step); the mock uses that code.
- **Dead MFA challenge**: after 5 wrong codes or 5 minutes the challenge dies; the code is not named. Any 401 from `login/mfa` other than `MFA_INVALID` sends the person back to the password with "This sign-in timed out" (the mock answers `MFA_CHALLENGE_EXPIRED`).
- **`GET admin/permissions` shape**: "the catalog with groups, labels, ownerOnly". The panel accepts a list of `{ key, group, label, ownerOnly }`, a map keyed by permission, or `{ permissions: [...] }`, and falls back to its mirrored catalog.
- **Ticket assignee field**: §5 says "a staff id or null" and the PUT body uses `staffId`. The panel reads `assigneeId` (and `assigneeName` when present, else the name from `GET support/assignees`).
- **Timeline event shape**: the panel reads `{ id, type: created|status|assignee|priority|note|reply, at, by, byName, from?, to?, text?, delivery? }`; a reply's `id` is the `replyId` for Retry. After every note, reply, retry or change the panel reads the ticket again, so the exact answer bodies of those writes do not matter.
- **Ticket `version`**: only status, assignee and priority take `expectedVersion`; the panel always sends the version of the ticket on screen.
- **Remote Config `baseVersion`**: taken as the **published** version the page loaded, for the draft PUT, publish and rollback. The draft has no revision of its own in §6, so two people editing the same draft between publishes overwrite each other (last save wins); the panel shows who saved the draft last.
- **Remote Config versions rows**: read as `{ version, config, publishedAt, publishedBy, publishedByName?, note, rolledBackFrom? }`.
- **AI test context**: `contentId` is an item id (slug); suggestions come from the content list (needs `content.read`), otherwise the id is typed. A never-published item is the server's error to give.
- **Production `VITE_API_URL`**: must be absolute (https, or http on localhost). A same-origin relative path such as `/api/v1` is refused by the build guard, as the brief asks; serve the API on its own https origin.
