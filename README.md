# Thirdwheel panel

The admin and content panel for Thirdwheel, the couples app. Staff use it to edit the Release 1 quizzes, games and Do cards (with a clinician approving every change), look after accounts and couples, read the safety log, answer support, tune the AI engine and connect n8n.

It is a single-page app built against the Admin API contract ([docs/API_CONTRACT.md](docs/API_CONTRACT.md), source of truth: `backend/docs/ADMIN_API.md` in the app repo). Until the API is deployed, it runs on a stateful mock API in the browser.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173 with the mock API (no VITE_API_URL set)
```

Sign in with **any email** and the code **123456**.

| Email                                     | Roles             | Use it to try                                               |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------- |
| anything else, e.g. `lead@thirdwheel.app` | admin + clinician | everything                                                  |
| `admin-only@…`                            | admin             | edit and submit drafts, no approve                          |
| `clinician@…`                             | clinician         | review queue, approve, request changes; read-only elsewhere |
| `nostaff@…`                               | none              | the "This account has no panel access" screen               |
| `nobody@…`                                | (no account)      | the "No Thirdwheel account uses this email" error           |

The mock keeps its data in memory: a reload starts again from the seed (the 170 Release 1 items, Sara and Alex, flags, tickets, webhooks and deliveries).

### Against a real API

```bash
# API running on http://localhost:3000 (backend repo: npm run start:dev)
VITE_API_URL=/api/v1 npm run dev                    # same origin through the dev proxy
VITE_API_URL=/api/v1 VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev
```

For a deployed panel, build with the API's full URL: `VITE_API_URL=https://api.thirdwheel.app/api/v1 npm run build`. Add the panel's origin to the API's `CORS_ORIGINS`. That build has no mock code, no `mockServiceWorker.js` and no source maps. Every `VITE_` value ends up in the public bundle, so never put a secret in one.

## Environment variables

| Variable                | Default                 | What it does                                                                                                                                                                                              |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`          | empty (= `/api/v1`)     | Base URL of the API including `/api/v1`. Empty in development turns the mock API on.                                                                                                                      |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Where `npm run dev` proxies `/api` (no CORS needed in development).                                                                                                                                       |
| `VITE_API_MOCKS`        | empty                   | `1` always uses the mock API (also in a production build, for demos: every screen then shows a permanent "Demo data, not the real API" banner and the tab title starts with [DEMO DATA]). `0` never does. |
| `VITE_SOURCEMAP`        | empty                   | `1` writes hidden source maps (no `sourceMappingURL`) for an error tracker. Do not deploy the `.map` files.                                                                                               |

Copy `.env.example` to `.env.local` to set them.

## Staff access on the API

The panel signs in with the app's own email code routes (`auth/login/start` → `auth/verify`), then calls `GET admin/me`. Who is staff comes from the API's environment:

- `ADMIN_EMAILS`: comma-separated emails with the **admin** role.
- `CLINICIAN_EMAILS`: emails with the **clinician** role. An email can be in both.
- Roles are re-read at every sign-in, so after changing these, sign out and in again.
- `CORS_ORIGINS` must include the panel's origin when the panel is served from another origin than the API, and `PANEL_URL` must be the panel's public URL (webhooks link to `PANEL_URL/safety/<flagId>` and `PANEL_URL/support/<ticketId>`, which this panel serves).

## Scripts

| Script              | What it does                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server with the `/api` proxy (and the mock API when `VITE_API_URL` is empty). |
| `npm run dev:mocks` | Dev server with the mock API forced on.                                                |
| `npm run build`     | Type-checks (app, tests, config) and builds to `dist/`.                                |
| `npm run preview`   | Serves `dist/`.                                                                        |
| `npm run typecheck` | `tsc -b` for the app, the tests and the Node config.                                   |
| `npm run lint`      | ESLint (flat config, typescript-eslint, React hooks, React refresh).                   |
| `npm run test`      | Vitest with jsdom and the MSW node server (`test:watch` to watch).                     |
| `npm run format`    | Prettier (with the Tailwind class sorter); `format:check` to check.                    |

## What is in it

| Page                                      | Route                                         | Who                                                 |
| ----------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Sign in                                   | `/login`                                      | everyone                                            |
| Dashboard                                 | `/`                                           | staff                                               |
| Content (Catalog & Workbook CMS)          | `/content`, `/content/$id`, `/content/import` | staff read; admins edit, import; clinicians approve |
| Review queue                              | `/review`                                     | staff (approve and request changes: clinicians)     |
| Users and couples                         | `/users`, `/users/$id`                        | admins                                              |
| Safety log                                | `/safety`, `/safety/$id`                      | staff                                               |
| Support inbox                             | `/support`, `/support/$id`                    | admins                                              |
| AI engine                                 | `/ai-engine`                                  | admins; clinicians read only                        |
| Integrations (n8n)                        | `/settings/integrations`                      | admins                                              |
| Legacy (round 1): date ideas, experiences | `/catalog`, `/experiences`                    | admins                                              |
| Audit log                                 | `/audit`                                      | admins                                              |

## Architecture in short

- **Vite + React 19 + TypeScript strict**, Tailwind CSS v4, shadcn/ui primitives (new-york) on Radix.
- **TanStack Router** (code-based route tree in `src/app/router.tsx`): every list keeps its filters, page and open drawer in typed, Zod-validated search params, so a filtered view is a link you can share.
- **TanStack Query v5** for server state, with a query key factory per feature. Reads retry on network errors and 5xx, never on 4xx.
- **TanStack Table v9** behind one generic `DataTable` (server pagination, search, faceted filters, column visibility, row selection and batch actions).
- **React Hook Form + Zod v4** for every form; Zod schemas mirror the API's validation rules.
- **zustand** only for UI state: session (who is signed in), theme and sidebar.
- **MSW** mocks the whole contract statefully, in the browser (dev) and in Node (tests).

```
src/
  app/          router, providers, layout, sidebar counts
  components/
    ui/         shadcn/ui primitives, untouched in spirit (see components.json)
    shared/     app composites: AppShell, DataTable, dialogs, form fields, RoleGate, ...
  features/<feature>/
    api/        DTO types, typed fetchers, query and mutation hooks
    components/ feature UI
    schemas/    Zod schemas (forms, search params)
    lib/        pure logic (workflow rules, diffs, codecs)
    routes/     page components
  lib/api/      fetch client, ApiError, tokens, pagination
  mocks/        MSW handlers and seed data (follows ADMIN_API.md)
  stores/       zustand stores
```

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). n8n: [docs/N8N_INTEGRATION.md](docs/N8N_INTEGRATION.md).

## shadcn/ui

`components.json` is set up for the CLI (style new-york, aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`, icons lucide), so `npx shadcn@latest add <component>` works where the registry is reachable. In the environment this panel was built in, ui.shadcn.com was blocked, so the primitives in `src/components/ui/` were written by hand from the current new-york sources (Radix via the `radix-ui` package).

The shadcn agent skills install with `npx skills add shadcn/ui` (it worked here; they are not committed).
