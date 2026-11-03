# n8n integration

The full guide lives in the backend repo: **`backend/docs/N8N_INTEGRATION.md`** (app repo `atefefazaeli-netizen/app`). It covers setting up a webhook in n8n, every event and its payload, retries and duplicates, calling Thirdwheel from n8n with an API key, example workflows (in `backend/docs/n8n/`) and security notes. Read that one for anything about the API side; this page covers what the panel does.

## What the panel's Integrations screen does

`/settings/integrations` (admins only) has four tabs.

### Webhooks (Thirdwheel → n8n)

- **New webhook**: name (1 to 80), URL (http or https, no user name or password; production needs https and a public host), events, enabled. Events:
  - `crisis.alert`: high and medium safety flags, and every escalation (metadata only).
  - `support.ticket.created`: a new Contact support message or problem report.
  - `content.published`: content went live, was rolled back, unpublished or restored.
  - `user.subscription.changed`: a plan changed (store, admin grant or partner).
- The **signing secret** (`whsec_…`) is shown **once**, in a dialog with copy, right after creating the webhook or rotating its secret. The API keeps only what it needs to sign; the list shows the last 4 characters.
- **Enable switch**, **Edit**, **Rotate secret** (the old secret stops working at once), **Send test** (a `ping`, sent even when the webhook is disabled or not subscribed) and **Delete** (queued retries fail; the log keeps its deliveries until they expire).
- **How to verify signatures**: the headers, an n8n Code node and a Node.js receiver, with copy buttons. The check is `v1=` + hex HMAC-SHA256 over `"<X-Thirdwheel-Timestamp>.<raw body>"` with the webhook's secret, compared in constant time, with timestamps more than 5 minutes off rejected. Dedupe on `X-Thirdwheel-Delivery` (the same on every retry).

### Deliveries

The log of every attempt (kept 30 days): filters for status (pending, delivered, failed), event and webhook, the attempts so far (6 at most: 1m, 5m, 30m, 2h, 6h backoff), the last HTTP status and error, and a drawer with the exact JSON payload. **Retry** starts a fresh run of 6 attempts with the same delivery id. Pending deliveries refresh on their own every few seconds.

### API keys (n8n → Thirdwheel)

Keys for `POST /api/v1/integrations/n8n/action` (header `X-Api-Key`). Create one per workflow with only the scopes it needs:

- `users.flag`: `user.suspend`, `user.unsuspend`, `user.tag`.
- `content.import`: `content.import` (drafts land in review; a clinician still approves them).

The key (`twk_<prefix>_<secret>`) is shown **once**; the API stores a hash. The list shows the prefix, scopes, last use and revoked state. **Revoke** makes calls with the key fail at once with 401 `API_KEY_INVALID`.

### Verify signatures

The same help as on the Webhooks tab, on its own.

## Where n8n meets the rest of the panel

- `crisis.alert` payloads carry `panelUrl` = `PANEL_URL/safety/<flagId>`; the panel opens that flag on its own page.
- `support.ticket.created` payloads carry `panelUrl` = `PANEL_URL/support/<ticketId>`; the panel opens that ticket in the inbox.
- Drafts imported by n8n show "From n8n" in the content editor and the review queue, and the audit log shows the actor as `apikey:<name>`.
- The dashboard counts failed deliveries in the last 24 hours and lists the latest ones.
