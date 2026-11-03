import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { N8N_SNIPPET, NODE_SNIPPET, signPayload, verifySignature, WEBHOOK_HEADERS } from './signature';

const secret = 'whsec_test_secret_0123456789';
const body = JSON.stringify({
  id: 'evt_1',
  type: 'ping',
  createdAt: '2026-11-03T08:00:00.000Z',
  data: { message: 'Thirdwheel webhook test' },
});
const ts = 1_793_000_000;
const node = (s: string, t: number, b: string) => `v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`;

describe('webhook signatures', () => {
  it('signs exactly like the server (HMAC-SHA256 over "<timestamp>.<raw body>")', async () => {
    expect(await signPayload(secret, ts, body)).toBe(node(secret, ts, body));
  });

  it('accepts a valid signature within the tolerance', async () => {
    await expect(verifySignature(secret, node(secret, ts, body), String(ts), body, ts + 299)).resolves.toBe(true);
  });

  it('rejects a changed body, a wrong secret, an old timestamp and a missing header', async () => {
    const sig = node(secret, ts, body);
    await expect(verifySignature(secret, sig, ts, body.replace('test', 'tést'), ts)).resolves.toBe(false);
    await expect(verifySignature('whsec_other', sig, ts, body, ts)).resolves.toBe(false);
    await expect(verifySignature(secret, sig, ts, body, ts + 301)).resolves.toBe(false);
    await expect(verifySignature(secret, null, ts, body, ts)).resolves.toBe(false);
    await expect(verifySignature(secret, sig, 'not-a-number', body, ts)).resolves.toBe(false);
  });

  it('accepts any one of several signatures (secret rotation)', async () => {
    const header = `${node('whsec_old', ts, body)}, ${node(secret, ts, body)}`;
    await expect(verifySignature(secret, header, ts, body, ts)).resolves.toBe(true);
  });

  it('the snippets compute the same HMAC and check the timestamp', () => {
    for (const s of [N8N_SNIPPET, NODE_SNIPPET]) {
      expect(s).toContain("createHmac('sha256', SECRET)");
      expect(s).toContain('${ts}.${raw}');
      expect(s).toContain("'v1='");
      expect(s).toContain('timingSafeEqual');
      expect(s).toMatch(/300/);
    }
    expect(N8N_SNIPPET.toLowerCase()).toContain('x-thirdwheel-signature');
    expect(WEBHOOK_HEADERS.map(([h]) => h)).toEqual([
      'Content-Type',
      'User-Agent',
      'X-Thirdwheel-Event',
      'X-Thirdwheel-Delivery',
      'X-Thirdwheel-Timestamp',
      'X-Thirdwheel-Signature',
    ]);
  });

  it('the n8n snippet actually runs and verifies a delivery', async () => {
    const nodeCrypto = await import('node:crypto');
    const run = new Function(
      'require',
      '$env',
      '$input',
      'helpers',
      `return (async function () { ${N8N_SNIPPET} }).call({ helpers });`,
    ) as (...a: unknown[]) => Promise<{ json: { valid: boolean; deliveryId: string } }[]>;
    const now = Math.floor(Date.now() / 1000);
    const headers = {
      'x-thirdwheel-timestamp': String(now),
      'x-thirdwheel-signature': node(secret, now, body),
      'x-thirdwheel-delivery': 'dlv_1',
    };
    const helpers = { getBinaryDataBuffer: async () => Buffer.from(body) };
    const out = await run(
      (m: string) => (m === 'crypto' ? nodeCrypto : null),
      { THIRDWHEEL_WEBHOOK_SECRET: secret },
      { first: () => ({ json: { headers } }) },
      helpers,
    );
    expect(out[0]!.json).toMatchObject({ valid: true, deliveryId: 'dlv_1' });
  });
});
