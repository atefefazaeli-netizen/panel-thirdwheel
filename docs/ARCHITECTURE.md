# Architecture

How the Thirdwheel panel is put together, why, and where it departs from the original brief.

## 1. Layers

```
Route component (features/*/routes)          one per page, reads search params, composes
  └─ Feature components (features/*/components) the screen's parts: editor tabs, drawers, dialogs
       └─ Shared composites (components/shared)  AppShell, DataTable, FormField*, ConfirmDialog, RoleGate, ...
            └─ Primitives (components/ui)        shadcn/ui on Radix, styled only through theme tokens
```

Rules that keep it small and predictable:

- **Primitives** know nothing about Thirdwheel. They are the shadcn new-york sources (see 4) and are only changed where the project needs it (theme from zustand, controlled sidebar).
- **Shared composites** know the panel (roles, the API error shape, the table conventions) but no feature. A composite takes data and callbacks; it never fetches.
- **Feature folders** own one area of the API: `api/` (DTO types that match ADMIN_API.md, typed fetchers, TanStack Query hooks and a key factory), `schemas/` (Zod for forms and search params), `lib/` (pure logic with unit tests: workflow rules, diffs, codecs), `components/` and `routes/`. Features may import another feature's `api/` (the dashboard reads content, safety and integrations) but not its components.
- **Pure logic is pulled out and tested on its own**: which workflow buttons a role sees (`content/lib/workflow.ts`), live vs draft diffs (`content/lib/diff.ts`), the editor's snapshot codec (`content/schemas/editor.ts`, round-trips all 170 seeded items byte for byte), webhook signatures (`integrations/lib/signature.ts`), the word diff for prompts.

### Shared composites

| Composite                                                                                            | Purpose                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell` (+ `AppSidebar`, `Breadcrumbs`, `ThemeToggle`, `UserMenu`)                                | Sidebar filtered by role with live counts, top bar, skip link. Breadcrumbs come from each route's `staticData.crumb`.                                                                                                              |
| `DataTable` (+ toolbar, faceted filter, pagination, view options)                                    | One generic, server-driven table on TanStack Table v9. The API pages, searches and filters; the table renders one page and owns selection (kept across pages, by id) and column visibility (remembered per table in localStorage). |
| `PageHeader`, `StatCard`, `MetricBadge`, `StatusBadge`, `EmptyState`, `ErrorState`, `ForbiddenState` | Page furniture. `StatCard` shows "Not available" for a `null` stat; `ErrorState` shows the request id.                                                                                                                             |
| `ConfirmDialog`, `DangerConfirmDialog`, `FormDialog`, `DrawerPreview`                                | Confirmations (the safe option names what is kept), type-to-confirm, a small RHF + Zod form in a dialog, and a side drawer for details. All stay open when the action fails.                                                       |
| `FormFieldText`, `Textarea`, `Number`, `Select`, `MultiSelect`, `Switch`, `Tags`                     | Labelled, described, validated fields on `react-hook-form` with the shadcn `Form` primitives (label, `aria-describedby`, `aria-invalid`, message).                                                                                 |
| `JsonEditor`                                                                                         | Textarea with JSON validation (line and column), Format, extra Zod checks, Tab indents. Used for type decks and imports.                                                                                                           |
| `RoleGate`                                                                                           | Hides (or disables with a tooltip) UI by role. The API enforces the same rules; the gate only keeps people from trying.                                                                                                            |
| `CopyButton`, `SecretReveal`                                                                         | Copy to clipboard; show a secret once (webhook secret, API key) with a clear warning.                                                                                                                                              |

## 2. State: where each kind lives

| State                                                  | Where                                                         | Why                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Data from the API (lists, items, settings)             | TanStack Query                                                | Caching, dedupe, retries, background refresh, invalidation after writes. Never copied into component state.                          |
| List filters, page, page size, open drawer, editor tab | The URL (typed search params, Zod-validated per route)        | Shareable and bookmarkable views, back/forward works, a reload keeps the view. Bad values fall back to defaults instead of crashing. |
| Form input (editors, dialogs)                          | React Hook Form + Zod                                         | Field-level validation and dirty tracking without re-rendering the page on every key.                                                |
| Who is signed in, theme, sidebar                       | zustand                                                       | Read synchronously by route guards and `RoleGate`; theme and sidebar persist in localStorage.                                        |
| Tokens                                                 | Module memory + sessionStorage (see 5)                        | Never in React state or localStorage.                                                                                                |
| Row selection, column visibility                       | Table state (visibility remembered per table in localStorage) | Per-viewer conveniences.                                                                                                             |

Writes go through mutation hooks that update the item cache and invalidate the lists and the dashboard, so badges and counts follow without manual refreshes.

## 3. Routing

TanStack Router with a code-based tree in `src/app/router.tsx` (no generator step). The `_app` layout route checks the session in `beforeLoad` and redirects to `/login?redirect=…`. Pages are loaded lazily (`lazyRouteComponent`), so the first load is about 260 kB of JS; the mock API is a separate chunk that production builds drop unless `VITE_API_MOCKS=1`.

Two routes exist for links the API sends out: `/safety/<flagId>` (the `crisis.alert` panelUrl) and `/support/<ticketId>` (the `support.ticket.created` panelUrl).

## 4. shadcn/ui and the theme

- `components.json` uses the new-york style with the standard aliases (`@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`) and lucide icons, so the CLI can add more components later.
- The registry (ui.shadcn.com) was blocked where this was built, so the primitives are written by hand from the current new-york sources: Radix through the single `radix-ui` package, `class-variance-authority`, `tailwind-merge`, `clsx`, `cmdk`, `sonner`.
- Changes from upstream, kept small: `sonner` reads the theme from the zustand store instead of `next-themes`; `SidebarProvider` is controlled (`open`, `openMobile`) so the sidebar state lives in zustand rather than a cookie; `useIsMobile` uses `useSyncExternalStore`; `SidebarMenuSkeleton` has a fixed width (no `Math.random` in render); `DialogContent` scrolls when taller than the viewport. The classic `Form` primitive (`FormField`, `FormItem`, `FormControl`, ...) is used for React Hook Form.
- **Brand tokens** (Tailwind v4 CSS variables in OKLCH, light and dark) come from the app's `src/theme/tokens.ts`: `primary` = navy `#1A2B4C`, `destructive` = cherry `#C42A3A` (4.5:1 with white), a `brand` token = cherry red `#EC0137` for highlights (active nav marker, counts, charts), `success` = mint `#2B6A47` with a soft `#C9EAD6`, plus `warning` and `info`. Muted text `#626B7F` and field borders `#7D879D` keep 4.5:1 and 3:1. The sidebar is navy. Font: Manrope Variable (`@fontsource-variable/manrope`, self-hosted).
- shadcn's `accent` stays a quiet hover colour. Using cherry for every hover would fight the destructive colour, so "accents = cherry" is the separate `brand` token.
- Accessibility: visible focus rings everywhere, a skip link, labelled icon buttons, `aria-live` on statuses, tables with names, `prefers-reduced-motion` respected. The phone preview in the content editor uses the app's own colours on purpose, in both themes.

## 5. Auth and tokens

1. `POST auth/login/start { email }` sends a 6-digit code (`{ ok: false, reason: 'not_found' }` when no account uses the email).
2. `POST auth/verify { session, code }` returns `{ ok, mode: 'login', token, refreshToken, expiresIn }` or a code failure (`CODE_INCORRECT` with attempts left, `CODE_LOCKED`, `CODE_EXPIRED`, `SESSION_NOT_FOUND`), each with its own copy and Resend.
3. `GET admin/me` returns `{ userId, email, roles }`, or 403 for an account without a staff role: the panel then revokes that session (`auth/logout`) and shows "This account has no panel access".
4. Roles follow `ADMIN_EMAILS` / `CLINICIAN_EMAILS` on every API request, so they can change mid-session. A call refused for the role answers 403 `INSUFFICIENT_ROLE`: the panel shows "Not available for your role" in place of the error and re-reads `admin/me` (single flight, at most every 5 seconds, `recheckRoles` in `features/auth/api/session.ts`), so `RoleGate` and the sidebar follow; with no staff role left it moves to the no-access screen.

**Token storage.** The access token (short-lived) lives only in module memory: no script can read it from storage, and it disappears on reload. The refresh token lives in `sessionStorage`, so a reload restores the session (refresh, then `admin/me`) but closing the tab signs out, and other tabs do not share it.

The trade-off: `sessionStorage` is readable by script on the page, so an XSS could take the refresh token. An `HttpOnly` cookie would be safer, but the API issues bearer tokens in JSON and deliberately uses no cookies (its CSRF stance is bearer plus an Origin check), so a cookie would need an API change. Mitigations here: no `dangerouslySetInnerHTML`, no third-party scripts at runtime, the refresh token rotates on every use (a stolen one is single-use and the API detects reuse), and closing the tab ends the session. A suspended account gets 403 `ACCOUNT_SUSPENDED` on any call, which ends the session at once.

**The client** (`src/lib/api/client.ts`):

- Base URL `VITE_API_URL` (default `/api/v1`, proxied by Vite in development).
- Bearer token on every call; with no valid token in memory it refreshes first.
- On 401 it refreshes **once for all callers** (a shared promise) and retries each call once; if another call already refreshed, it just retries with the new token. A refused refresh ends the session and returns to sign-in with the page to come back to.
- Mutating calls (POST, PUT, PATCH, DELETE) send an `Idempotency-Key` (`panel-<uuid>`, within the API's 8 to 80 characters). A retry after a refresh reuses the same key, so the server never applies a write twice.
- Errors become `ApiError` with `status`, `code`, `requestId`, `retryAt` and `details` (validation arrays are joined; `INVALID_CONTENT` details are listed in the editor).
- Reads retry on network errors and 5xx (twice, with backoff); 4xx never retries; mutations never retry on their own.
- Lists accept both page shapes the contract mentions (`{ items, meta }` from `libs/common` and the flat `{ items, total, page, limit, pages }`), see `normalizePage`.

## 6. The content workflow

- One React Hook Form holds the whole snapshot (catalog fields, cards, steps, the deck as JSON text, the screen text). The codec writes back exactly what it read for fields nobody touched, keeps unknown keys and keeps the original key order, because the API compares snapshots as JSON: a no-op save must not read as a change.
- The Zod schema per kind mirrors the server: title 1..120, Where non-empty, minutes 1..10080 (week-long Do cards), card text 1..1000 and at most 100 cards, steps at most 30 with title and body, a `deck` with a `type` for type items, at least one card for Your turn and Card deck quizzes, 256 KB per snapshot.
- `workflowFor(item, roles, { dirty, valid, busy })` decides which buttons show and why one is disabled. Admins: Save draft, Discard, Submit for review, Unpublish / Restore. Clinicians: Approve and publish, Request changes (note required) on a draft in review. Both roles see both sets.
- Leaving with unsaved edits asks first (router blocker and `beforeunload`).
- The review queue compares live and draft field by field; cards, steps and deck rounds compare one by one.

## 7. The mock API

`src/mocks/` implements the whole contract with MSW, statefully, so the panel can be used end to end and tests run against the same handlers:

- One in-memory database (`db()`), reset after every test.
- Routes, bodies, status codes and error codes follow ADMIN_API.md and the existing controllers; this is how drift shows up when the panel meets the real API.
- The content rules are a port of the backend's pure domain (`backend/apps/api/src/modules/content/domain/content.ts`): validation, transitions, versions, change log summaries and error codes. The seed is the backend's generated `content.data.ts` (170 items), plus drafts in every state.
- Ids are ObjectId-shaped like the API's (`uid('sara')`), because some routes validate them.
- Modules publish events (`content.published`, `crisis.alert`, `user.subscription.changed`) on a small bus; the integrations mock turns them into deliveries for enabled, subscribed webhooks, which settle a moment later (URLs containing "fail" answer 502).
- AI settings follow the backend's `normalizeSettings`; the test console flags risky text and answers with canned replies. Model ids are placeholders (`anthropic-default`): the real ones come from the API's environment.

## 8. Tests

Vitest with jsdom and the MSW node server. They cover logic, not snapshots: the API client (single-flight refresh, error mapping, Idempotency-Key reuse, suspended accounts), pagination shapes, every Zod schema, the editor codec over all seeded items, workflow buttons per role and state (as a pure function and through the real editor), the live vs draft diff, the word diff, DataTable behaviour (paging, debounced search, faceted filters, selection and batch actions, column visibility, empty and error states), RoleGate, DangerConfirmDialog, webhook signatures (checked against `node:crypto`, and the n8n snippet is executed), and one or more flows per screen against the mock API. Tests type-check with their own config (`tsconfig.test.json`, Node types) so app code stays browser-only.

## 9. Deviations from the brief, and why

| Brief                    | Here                                                                                                  | Why                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js (original brief) | Vite SPA                                                                                              | The panel is an authenticated tool behind a login with no SEO or server rendering needs; a static build deploys anywhere and keeps the API the only server.                                  |
| Router left open         | TanStack Router, code-based                                                                           | Typed routes and typed, validated search params for list filters; no file generator step in CI.                                                                                              |
| shadcn CLI               | Primitives written by hand, `components.json` kept                                                    | The registry was blocked. The CLI works later with the same config.                                                                                                                          |
| Latest TypeScript        | TypeScript 6.0                                                                                        | typescript-eslint supports up to 6.0; 7.0 (the native compiler) is not supported by it yet.                                                                                                  |
| Calendar component       | Native date inputs                                                                                    | Date range filters only need a date; the native control is accessible and localised.                                                                                                         |
| Safety filter by surface | Server-side `surface` query                                                                           | Added to the API in the accounts audit (Nov 4); it filters every page and the total. Before, the panel narrowed only the loaded page.                                                        |
| Support ticket view      | Drawer from the list; `/support/<id>` calls `GET support/tickets/:id`                                 | Added to the API in the accounts audit; before, the panel scanned at most 5 pages of 100 and missed older tickets. No replies, notes, assignment or priority: open product decisions.        |
| Legacy edits             | PATCH sends `null` to clear optional fields; ranking tags and the booking ref prefix only when edited | The public list hides `tags` and `refPrefix`, so sending empty values would wipe them.                                                                                                       |
| Login routes             | `auth/login/start` and `auth/verify`                                                                  | ADMIN_API.md names `auth/email/start` / `auth/email/verify`, which in `auth.controller.ts` are the email change routes for a signed-in user. The panel uses the sign-in routes the app uses. |

Improvements beyond the brief: sidebar counts (review queue, open high flags, open tickets), deep links for webhook URLs, a review queue with a per-item diff, a JSON import preview with per-item problems, venue booking links on the legacy page, a batch "Submit drafts for review", batch sign-out and tag for users, lazy routes, and mocks removed from production builds.

## 10. Contract notes

Places where ADMIN_API.md left room, and what the panel assumes:

- **Pagination shape**: the intro names `{ items, total, page, limit, pages }` but tells builders to copy `libs/common` `Paginated`, which is `{ items, meta: { page, limit, total, totalPages } }`. The panel reads both.
- **Audit filters**: exact or prefix matching for `action` and `target` is not specified; the mock matches exactly or as a prefix (`content.` finds every content action).
- **Webhook events**: an empty `events` list is allowed by the DTO; the panel asks for at least one.
- **Plus source**: `AdminSubscriptionView.source` / `verification` (accounts audit). The user page shows where Plus comes from and labels a store purchase "receipt verification is mocked in this build" with an Unverified badge while the API's receipt verifier is the mock. No revenue or billing figures.
- **Unavailable parts**: `GET admin/users/:id` lists in `unavailable` the parts whose owner failed; the page says "Not available" for those instead of "No profile yet" / "Not linked".
- **Staff ids**: the mock gives staff accounts that exist in the users list the same id, so `SELF_ACTION` and `STAFF_ACCOUNT` can be tried.
