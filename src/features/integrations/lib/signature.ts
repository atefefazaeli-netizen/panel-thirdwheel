// Webhook signature check, as a receiver does it (ADMIN_API.md › Integrations):
// X-Thirdwheel-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>.
// Web Crypto here so the panel can check a payload in the browser; the snippets below are what
// receivers (n8n Code node, Node.js) run.

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const WEBHOOK_HEADERS = [
  ['Content-Type', 'application/json'],
  ['User-Agent', 'Thirdwheel-Webhooks/1'],
  ['X-Thirdwheel-Event', 'The event type, e.g. crisis.alert'],
  ['X-Thirdwheel-Delivery', 'Delivery id: the same on every retry, dedupe on it'],
  ['X-Thirdwheel-Timestamp', 'Unix seconds when this attempt was signed'],
  ['X-Thirdwheel-Signature', 'v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>'],
] as const;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function signPayload(secret: string, timestamp: number, rawBody: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  return `v1=${hex(mac)}`;
}

/** Constant-time string compare (same length first). */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the header carries a valid signature for this raw body and the timestamp is within
 * the tolerance. A header may hold several signatures (during a secret rotation): any may match.
 */
export async function verifySignature(
  secret: string,
  header: string | null | undefined,
  timestamp: string | number | null | undefined,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): Promise<boolean> {
  const ts = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (!header || !Number.isInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = await signPayload(secret, ts, rawBody);
  return header
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((sig) => equal(sig, expected));
}

/** The n8n Code node (Webhook node with Raw Body on), the same as backend/docs/N8N_INTEGRATION.md. */
export const N8N_SNIPPET = `// Verifies X-Thirdwheel-Signature, then passes the event on with \`valid\`.
const crypto = require('crypto');
const SECRET = $env.THIRDWHEEL_WEBHOOK_SECRET; // whsec_...
const TOLERANCE_SECONDS = 300;

const item = $input.first();
const headers = item.json.headers || {};
let raw;
try {
  raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); // Raw Body on
} catch (e) {
  raw = JSON.stringify(item.json.body); // Raw Body off: same bytes for Thirdwheel's compact JSON
}
const ts = Number(headers['x-thirdwheel-timestamp']);
const expected = 'v1=' + crypto.createHmac('sha256', SECRET).update(\`\${ts}.\${raw}\`).digest('hex');
const fresh = Number.isInteger(ts) && Math.abs(Date.now() / 1000 - ts) <= TOLERANCE_SECONDS;
const valid = fresh && String(headers['x-thirdwheel-signature'] || '')
  .split(/[\\s,]+/)
  .some((s) => Buffer.byteLength(s) === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));

let event = {};
try { event = JSON.parse(raw); } catch (e) { /* not JSON: invalid anyway */ }
return [{ json: { valid, deliveryId: headers['x-thirdwheel-delivery'] || null, event } }];`;

/** Any Node.js receiver (Express shown): verify over the raw body before parsing it. */
export const NODE_SNIPPET = `import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.THIRDWHEEL_WEBHOOK_SECRET; // whsec_...
const app = express();

app.post('/thirdwheel', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  const ts = Number(req.get('X-Thirdwheel-Timestamp'));
  const expected = 'v1=' + crypto.createHmac('sha256', SECRET).update(\`\${ts}.\${raw}\`).digest('hex');
  const fresh = Number.isInteger(ts) && Math.abs(Date.now() / 1000 - ts) <= 300;
  const ok = fresh && (req.get('X-Thirdwheel-Signature') || '')
    .split(/[\\s,]+/)
    .some((s) => Buffer.byteLength(s) === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return res.status(401).end();
  const event = JSON.parse(raw); // { id, type, createdAt, data }
  // Dedupe on req.get('X-Thirdwheel-Delivery'): it stays the same across retries.
  res.status(204).end();
});`;
