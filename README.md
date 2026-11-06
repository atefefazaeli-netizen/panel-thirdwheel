# Thirdwheel panel

The admin and content panel for Thirdwheel, the couples app. Staff use it to edit the Release 1 quizzes, games and Do cards (with a content reviewer approving every change), look after accounts and couples, read the safety log, work the support inbox, run Remote Config, tune the AI engine, connect n8n and manage staff accounts and roles.

It is a single-page app built against the staff and admin API contract ([docs/API_CONTRACT.md](docs/API_CONTRACT.md), a copy of `backend/docs/STAFF_API.md` and `backend/docs/ADMIN_API.md` in the app repo; the backend files are the source of truth).

## Production setup

### 1. Build

```bash
npm ci
VITE_API_URL=https://api.thirdwheel.app/api/v1 npm run build   # writes dist/
npm run check:prod-bundle                                      # CI: builds again and scans dist/
```

The production build **refuses to run** unless:

- `VITE_API_URL` is set to the API's absolute URL including `/api/v1`, over **https** (plain http only for `localhost`, for a local `npm run preview`);
- `VITE_API_MOCKS` is **not set at all** (any value is refused).

The bundle has no mock API, no mock data, no demo credentials and no dev-only copy: they are imported only behind `import.meta.env.DEV`, so the build drops them, and `mockServiceWorker.js` is removed from `dist/`. `npm run check:prod-bundle` proves it on every CI run (it fails on markers such as `msw`, `mockServiceWorker`, `setupWorker`, seed names, demo codes and "Demo data"). No source maps are shipped unless `VITE_SOURCEMAP=1` (hidden maps for an error tracker; do not deploy the `.map` files).

Serve `dist/` as static files with a fallback to `index.html` for client-side routes (`/support/<id>` and `/safety/<id>` are deep links the API's webhooks send out).

### 2. API settings the panel depends on (backend environment)

| Variable                                                | What to set                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PANEL_ORIGINS`                                         | The panel's exact origin(s), comma separated, e.g. `https://panel.thirdwheel.app`. CORS allows them with credentials, and every staff write must come from one (Origin check) with a matching `X-CSRF-Token`. |
| `STAFF_COOKIE_SECURE`                                   | `true` in production (the default there).                                                                                                                                                                     |
| `STAFF_COOKIE_SAMESITE`                                 | `strict` (default) when the panel and the API share a site (`panel.thirdwheel.app` and `api.thirdwheel.app`). `none` only when they are on different sites; the cookie is then forced `Secure`.               |
| `STAFF_SESSION_IDLE_MINUTES`, `STAFF_SESSION_MAX_HOURS` | Session lifetimes (defaults 60 minutes idle, 12 hours absolute).                                                                                                                                              |
| `PANEL_URL`                                             | The panel's public URL: n8n webhook payloads link to `PANEL_URL/safety/<flagId>` and `PANEL_URL/support/<ticketId>`.                                                                                          |
| `EMAIL_DRIVER`                                          | Support replies go out through the configured email provider. With today's `log` driver they stay **Pending** and the panel says no provider is configured.                                                   |

The session is an `HttpOnly` cookie (`tw_staff_sid`, `Path=/api/v1`) that the API sets; the panel never sees it. `ADMIN_EMAILS` and `CLINICIAN_EMAILS` grant nothing any more: staff accounts are a separate store.

### 3. The first Owner

Owners are created only by the backend CLI, from secrets in the API's environment, and only while no Owner exists:

```bash
# in the backend, with STAFF_BOOTSTRAP_OWNER_USERNAME, STAFF_BOOTSTRAP_OWNER_PASSWORD and
# STAFF_BOOTSTRAP_OWNER_DISPLAY_NAME set from your secret store (no defaults)
npm run staff:bootstrap-owner
```

The Owner signs in to the panel with that username and password, sets up two-factor sign-in (TOTP, required for Owners) and saves the 10 recovery codes. Then remove the bootstrap secrets from the environment. Every other staff account is made in the panel (**Staff accounts › Add staff**): the server makes a temporary password, shown once, that the person must change at the first sign-in.

## Development only

```bash
npm install
npm run dev          # http://localhost:5173 with the in-browser mock API (no VITE_API_URL set)
```

The mock API (MSW, `src/mocks/`) implements the whole contract in memory, so a reload starts again from the seed and signs you out. The sign-in page lists the dev usernames (shown only in development). Every dev account uses the password `panel-dev-password`:

| Username     | Role (built-in unless noted)                              |
| ------------ | --------------------------------------------------------- |
| `owner`      | Owner, two-factor on: the dev hint shows the current code |
| `new.owner`  | Owner without two-factor yet: the enrollment step         |
| `editor`     | Content editor                                            |
| `reviewer`   | Content reviewer (clinical approval)                      |
| `support`    | Support agent                                             |
| `safety`     | Safety reviewer                                           |
| `moderator`  | User moderator                                            |
| `analyst`    | Read-only analyst                                         |
| `temp.agent` | Support agent with a temporary password: the change step  |

Against a real API in development:

```bash
# API on http://localhost:3000 (backend repo: npm run start:dev)
VITE_API_URL=/api/v1 npm run dev                    # same origin through the dev proxy, no mocks
VITE_API_URL=/api/v1 VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev
```

Through the dev proxy the cookie and the Origin are the dev server's, so add `http://localhost:5173` to `PANEL_ORIGINS` and run the API with `STAFF_COOKIE_SECURE=false`.

## Environment variables (panel)

| Variable                | Default                 | What it does                                                                                                                      |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | empty                   | API base URL including `/api/v1`. **Required for production builds** (https, or http on localhost). Empty in development = mocks. |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Where `npm run dev` proxies `/api`.                                                                                               |
| `VITE_API_MOCKS`        | empty                   | Development only: `1` forces the mock API on, `0` off. **A production build refuses it.**                                         |
| `VITE_SOURCEMAP`        | empty                   | `1` writes hidden source maps (no `sourceMappingURL`) for an error tracker.                                                       |

Every `VITE_` value ends up in the public bundle: never put a secret in one. Copy `.env.example` to `.env.local` to set them.

## Scripts

| Script                      | What it does                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`               | Vite dev server with the `/api` proxy (and the mock API when `VITE_API_URL` is empty). |
| `npm run dev:mocks`         | Dev server with the mock API forced on.                                                |
| `npm run build`             | Type-checks (app, tests, config) and builds to `dist/` (needs `VITE_API_URL`).         |
| `npm run check:prod-bundle` | Production build plus a scan of `dist/` for mock, demo and dev markers (CI).           |
| `npm run preview`           | Serves `dist/`.                                                                        |
| `npm run typecheck`         | `tsc -b` for the app, the tests and the Node config.                                   |
| `npm run lint`              | ESLint (flat config, typescript-eslint, React hooks, React refresh).                   |
| `npm run test`              | Vitest with jsdom and the MSW node server (`test:watch` to watch).                     |
| `npm run format`            | Prettier (with the Tailwind class sorter); `format:check` to check.                    |

## What is in it

Every page and button is gated by the **permissions** the API sends with the session (STAFF_API.md §4); the API enforces the same rules.

| Page                                      | Route                                         | Permission                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in (password, TOTP, setup steps)     | `/login`                                      | everyone                                                                                                                                       |
| My account                                | `/account`                                    | any staff session                                                                                                                              |
| Dashboard                                 | `/`                                           | `dashboard.read` (each count also needs its area's read permission)                                                                            |
| Content (Catalog & Workbook CMS)          | `/content`, `/content/$id`, `/content/import` | `content.read`; edit/import `content.edit`, submit `content.submit`, approve `content.approve`, unpublish/restore/rollback `content.unpublish` |
| Review queue                              | `/review`                                     | `content.read`; approve and request changes `content.approve`                                                                                  |
| Users and couples                         | `/users`, `/users/$id`                        | `users.read`; actions `users.signout`, `.suspend`, `.tags`, `.unlink`, `.delete`, `.plus`                                                      |
| Safety log                                | `/safety`, `/safety/$id`                      | `safety.read`; review, notes, escalate `safety.handle`                                                                                         |
| Support inbox and tickets                 | `/support`, `/support/$id`                    | `support.read`; `support.resolve`, `.assign`, `.prioritize`, `.note`, `.reply`                                                                 |
| Remote Config                             | `/app-config`                                 | `config.read`; `config.edit`, `config.publish`, `config.rollback`                                                                              |
| AI engine                                 | `/ai-engine`                                  | `ai.read` (settings) or `ai.test` (console); edit and rollback `ai.edit`                                                                       |
| Integrations (n8n)                        | `/settings/integrations`                      | `integrations.read`; writes `integrations.manage`                                                                                              |
| Audit log                                 | `/audit`                                      | `audit.read`                                                                                                                                   |
| Staff accounts, Roles                     | `/staff`, `/staff/roles`                      | `staff.read`; `staff.manage`, `roles.manage` (Owner only)                                                                                      |
| Legacy (round 1): date ideas, experiences | `/catalog`, `/experiences`                    | `catalog.manage`                                                                                                                               |

## Architecture in short

- **Vite + React 19 + TypeScript strict**, Tailwind CSS v4, shadcn/ui primitives (new-york) on Radix.
- **TanStack Router** (code-based route tree in `src/app/router.tsx`): list filters live in typed, Zod-validated search params; each route names the permission it needs (`staticData.permission`).
- **TanStack Query v5** for server state; **React Hook Form + Zod v4** for every form; **zustand** for the session (who is signed in and their permissions), theme and sidebar.
- **Auth**: an HttpOnly session cookie set by the API, a CSRF token kept only in memory, nothing in localStorage or sessionStorage. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#5-auth-sessions-and-csrf).
- **MSW** mocks the whole contract statefully, in the dev server and in tests only.

```
src/
  app/          router, providers, layout (route permission guard), sidebar counts
  components/
    ui/         shadcn/ui primitives
    shared/     app composites: AppShell, DataTable, dialogs, form fields, Can, RequirePermission, ...
  config/       env, the dev-only UI slot
  features/<feature>/
    api/        DTO types, typed fetchers, query and mutation hooks
    components/ feature UI
    schemas/    Zod schemas (forms, search params)
    lib/        pure logic (workflow rules, diffs, codecs)
    routes/     page components
  lib/api/      fetch client (cookies, CSRF, session re-check), ApiError, pagination
  lib/permissions.ts  mirror of the backend permission catalog and built-in roles
  mocks/        MSW handlers and seed data (development and tests only)
  stores/       zustand stores
scripts/        production build guard and bundle scanner
```

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). n8n: [docs/N8N_INTEGRATION.md](docs/N8N_INTEGRATION.md).

## shadcn/ui

`components.json` is set up for the CLI (style new-york, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`, icons lucide), so `npx shadcn@latest add <component>` works where the registry is reachable. In the environment this panel was built in, ui.shadcn.com was blocked, so the primitives in `src/components/ui/` were written by hand from the current new-york sources (Radix via the `radix-ui` package).
