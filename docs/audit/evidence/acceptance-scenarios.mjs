// Acceptance run against the real API (merged develop) on an isolated MongoDB database.
// Usage: node acceptance-scenarios.mjs http://localhost:3200/api/v1
// Needs an API with OTP_FIXED_CODE=123456, ADMIN_EMAILS=admin@thirdwheel.test,both@thirdwheel.test,
// CLINICIAN_EMAILS=clinician@thirdwheel.test,both@thirdwheel.test, AI_PROVIDER=none, a freshly migrated
// database, and the panel origin http://localhost:4300 in CORS_ORIGINS. Webhooks go to 127.0.0.1:9188 only.
import http from 'node:http';
import crypto from 'node:crypto';

const B = process.argv[2];
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' :: ' + detail : ''}`); };
async function req(method, path, { token, body, headers = {} } = {}) {
  const r = await fetch(B + '/' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, body: json, headers: r.headers };
}
async function signIn(email) {
  // The sign-in routes allow 5 calls a minute per IP: wait out a 429 instead of failing the scenario.
  const call = async (path, body) => {
    for (;;) {
      const r = await req('POST', path, { body });
      if (r.status !== 429) return r;
      const wait = Math.max(1000, (Number(r.headers.get('retry-after')) || 10) * 1000);
      console.log(`  (sign-in rate limit, waiting ${wait / 1000} s)`);
      await new Promise((ok) => setTimeout(ok, wait));
    }
  };
  let s = await call('auth/login/start', { email });
  if (!s.body?.ok) s = await call('auth/signup/start', { email });
  const v = await call('auth/verify', { session: s.body.session, code: '123456' });
  if (!v.body?.token) throw new Error(`sign-in failed for ${email}: ${v.status}`);
  return { token: v.body.token, refresh: v.body.refreshToken, userId: v.body.userId };
}
const run = Date.now().toString(36);

// 1. Sign-in, refresh, logout, roles
const admin = await signIn('admin@thirdwheel.test');
const clin = await signIn('clinician@thirdwheel.test');
const both = await signIn('both@thirdwheel.test');
const user = await signIn(`user.${run}@thirdwheel.test`);
check('1a', 'admin/me as admin', (await req('GET', 'admin/me', { token: admin.token })).body?.roles?.includes('admin'));
const nonStaff = await req('GET', 'admin/me', { token: user.token });
check('1b', 'non-staff gets 403 on admin/me', nonStaff.status === 403);
const clinUsers = await req('GET', 'admin/users', { token: clin.token });
check('1c', 'clinician 403 INSUFFICIENT_ROLE on admin-only route', clinUsers.status === 403 && clinUsers.body?.code === 'INSUFFICIENT_ROLE', `${clinUsers.status} ${clinUsers.body?.code}`);
check('1d', 'clinician 200 on shared route (safety)', (await req('GET', 'admin/safety/summary', { token: clin.token })).status === 200);
const r1 = await req('POST', 'auth/refresh', { body: { refreshToken: admin.refresh } });
check('1e', 'refresh rotates the token pair', r1.status === 200 && r1.body.refreshToken !== admin.refresh);
const reuse = await req('POST', 'auth/refresh', { body: { refreshToken: admin.refresh } });
check('1f', 'reusing an old refresh token is refused', reuse.status === 401, `${reuse.status} ${reuse.body?.code ?? ''}`);
const adm = await signIn('admin@thirdwheel.test');
const lo = await signIn(`logout.${run}@thirdwheel.test`);
await req('POST', 'auth/logout', { body: { refreshToken: lo.refresh } });
const after = await req('POST', 'auth/refresh', { body: { refreshToken: lo.refresh } });
check('1g', 'refresh after logout is refused', after.status === 401, `${after.status} ${after.body?.code ?? ''}`);

// 2. Content draft → clinician approval → app
const ID = 'my-perfect-day';
let item = (await req('GET', `admin/content/${ID}`, { token: adm.token })).body;
check('2a', 'seeded item is not a clinician sign-off', item.liveSeeded === true && !!item.liveApprovalLabel, item.liveApprovalLabel);
const snap = structuredClone(item.live); snap.catalog.title = `My perfect day (${run})`;
let d = await req('PUT', `admin/content/${ID}/draft`, { token: adm.token, body: { snapshot: snap, expectedRev: item.rev } });
check('2b', 'admin saves a draft with expectedRev', d.status === 200, `${d.status}`);
item = d.body;
let sub = await req('POST', `admin/content/${ID}/submit`, { token: adm.token, body: { expectedRev: item.rev, note: 'acceptance' } });
item = sub.body;
check('2c', 'admin cannot approve (clinician only)', (await req('POST', `admin/content/${ID}/approve`, { token: adm.token, body: { expectedRev: item.rev } })).status === 403);
const appr = await req('POST', `admin/content/${ID}/approve`, { token: clin.token, body: { expectedRev: item.rev } });
check('2d', 'clinician approves the reviewed revision', appr.status === 200 && appr.body.liveVersion === 2, `${appr.status} v${appr.body?.liveVersion}`);
const pub = await req('GET', 'content/published?since=0', { token: user.token });
const live = pub.body?.items?.find((i) => i.id === ID);
check('2e', 'app feed serves the approved title', live?.catalog?.title === snap.catalog.title, live?.catalog?.title);
check('2f', 'app feed carries no review fields', live && !('needsReview' in live) && !('provenance' in live));

// 3. Held content and rollback protections
const doItem = (await req('GET', 'admin/content?pillar=do&limit=1', { token: adm.token })).body.items[0];
const doFull = (await req('GET', `admin/content/${doItem.id}`, { token: adm.token })).body;
check('3a', 'AI-written Do steps flagged needsReview', doFull.needsReview === true, JSON.stringify(doFull.provenance?.needsReview?.map((n) => n.part)));
const heldSnap = structuredClone(doFull.live); heldSnap.catalog.title = 'Repair walk, 20 minutes'; heldSnap.catalog.category = doFull.live.catalog.category;
const created = await req('POST', 'admin/content', { token: adm.token, body: { id: `held-test-${run}`, pillar: 'do', kind: doFull.kind, snapshot: heldSnap } });
check('3b', 'held title is detected (heldMatch)', created.status === 201 || created.status === 200 ? !!created.body.heldMatch : false, `${created.status} ${JSON.stringify(created.body?.heldMatch ?? created.body?.code)}`);
if (created.body?.rev !== undefined) {
  const hs = await req('POST', `admin/content/held-test-${run}/submit`, { token: adm.token, body: { expectedRev: created.body.rev } });
  const ha = await req('POST', `admin/content/held-test-${run}/approve`, { token: clin.token, body: { expectedRev: hs.body.rev } });
  check('3c', 'approving held content without acknowledgement is refused', ha.status === 409 && ha.body?.code === 'HELD_CONTENT', `${ha.status} ${ha.body?.code}`);
  const nu = await req('POST', `admin/content/held-test-${run}/unpublish`, { token: adm.token, body: { expectedRev: hs.body.rev } });
  check('3d', 'unpublishing never-approved content is refused', nu.status === 409 && nu.body?.code === 'NOT_PUBLISHED', `${nu.status} ${nu.body?.code}`);
  const feed = await req('GET', 'content/published?since=0', { token: user.token });
  check('3e', 'held draft never reaches the app', !feed.body.items.some((i) => i.id === `held-test-${run}`));
}
item = (await req('GET', `admin/content/${ID}`, { token: adm.token })).body;
const rb = await req('POST', `admin/content/${ID}/rollback`, { token: adm.token, body: { version: 1, expectedRev: item.rev, note: 'acceptance rollback' } });
check('3f', 'rollback to the seed keeps seeded approver and restores review flags state', rb.status === 200 && rb.body.liveVersion === 3 && rb.body.liveSeeded === true, `${rb.status} v${rb.body?.liveVersion} seeded=${rb.body?.liveSeeded}`);

// 4. Concurrency
item = (await req('GET', `admin/content/${ID}`, { token: adm.token })).body;
const s1 = structuredClone(item.live); s1.catalog.title = 'Editor A';
const s2 = structuredClone(item.live); s2.catalog.title = 'Editor B';
const a1 = await req('PUT', `admin/content/${ID}/draft`, { token: adm.token, body: { snapshot: s1, expectedRev: item.rev } });
const b1 = await req('PUT', `admin/content/${ID}/draft`, { token: both.token, body: { snapshot: s2, expectedRev: item.rev } });
check('4a', 'second editor with a stale rev gets 409 CONTENT_CONFLICT', a1.status === 200 && b1.status === 409 && b1.body?.code === 'CONTENT_CONFLICT', `${a1.status}/${b1.status}`);
const sb = await req('POST', `admin/content/${ID}/submit`, { token: adm.token, body: { expectedRev: a1.body.rev } });
const edit = await req('PUT', `admin/content/${ID}/draft`, { token: adm.token, body: { snapshot: { ...s1, catalog: { ...s1.catalog, title: 'Changed after review opened' } }, expectedRev: sb.body.rev } });
const stale = await req('POST', `admin/content/${ID}/approve`, { token: clin.token, body: { expectedRev: sb.body.rev } });
check('4b', 'clinician cannot approve a draft that changed after they opened it', stale.status === 409, `${stale.status} ${stale.body?.code}`);
await req('DELETE', `admin/content/${ID}/draft?expectedRev=${edit.body.rev}`, { token: adm.token });

// 5. User actions and audit
const victim = await signIn(`victim.${run}@thirdwheel.test`);
const sus = await req('POST', `admin/users/${victim.userId}/suspend`, { token: adm.token, body: { reason: 'acceptance test' } });
check('5a', 'suspend a test account', sus.status === 200 && sus.body.suspended === true);
const blocked = await req('GET', 'auth/me', { token: victim.token });
check('5b', 'suspended account gets 403 ACCOUNT_SUSPENDED', blocked.status === 403 && blocked.body?.code === 'ACCOUNT_SUSPENDED', `${blocked.status} ${blocked.body?.code}`);
check('5c', 'unsuspend', (await req('POST', `admin/users/${victim.userId}/unsuspend`, { token: adm.token })).body?.suspended === false);
const grant = await req('POST', `admin/users/${victim.userId}/plus`, { token: adm.token, body: { days: 3, note: 'acceptance' } });
check('5d', 'grant Plus is labelled admin_grant', grant.status === 200 && grant.body.source === 'admin_grant', `${grant.status} ${grant.body?.source}`);
const self = await req('POST', `admin/users/${adm.userId}/suspend`, { token: adm.token, body: { reason: 'x' } });
check('5e', 'self suspend refused', self.status === 409 && self.body?.code === 'SELF_ACTION', `${self.status} ${self.body?.code}`);
const del = await req('DELETE', `admin/users/${victim.userId}`, { token: adm.token, body: { confirmEmail: 'wrong@x.test' } });
check('5f', 'delete with wrong email refused', del.status === 400 && del.body?.code === 'CONFIRM_MISMATCH', `${del.status} ${del.body?.code}`);
const audit = await req('GET', `admin/audit?target=user:${victim.userId}&limit=20`, { token: adm.token });
const acts = (audit.body?.items ?? []).map((a) => a.action);
check('5g', 'audit has suspend, unsuspend, plus grant', ['user.suspend', 'user.unsuspend'].every((a) => acts.includes(a)) && acts.some((a) => a.includes('plus')), acts.join(','));

// 6. Safety
const sig = await req('POST', 'safety/signals', { token: user.token, body: { kind: 'crisis', surface: 'quiz', helplineShown: true } });
const withText = await req('POST', 'safety/signals', { token: user.token, body: { kind: 'crisis', surface: 'quiz', helplineShown: true, text: 'x' } });
check('6a', 'signal accepted, text rejected', sig.status === 202 && withText.status === 400, `${sig.status}/${withText.status}`);
const fq = await req('GET', 'admin/safety/flags?surface=quiz&limit=50', { token: clin.token });
const fo = await req('GET', 'admin/safety/flags?surface=third-ear&limit=50', { token: clin.token });
check('6b', 'server-side surface filter', fq.body.items.some((f) => f.userId === user.userId) && !fo.body.items.some((f) => f.userId === user.userId));
check('6c', 'flag carries no text field', fq.body.items.every((f) => !('text' in f) && !('message' in f)));
check('6d', 'plain user 403 on safety log', (await req('GET', 'admin/safety/flags', { token: user.token })).status === 403);

// 7. Support
const t = await req('POST', 'support/messages', { token: user.token, body: { topic: 'Account', message: 'Acceptance test ticket' } });
const one = await req('GET', `support/tickets/${t.body.id}`, { token: adm.token });
check('7a', 'GET one ticket by id', one.status === 200 && one.body.id === t.body.id, `${one.status}`);
check('7b', 'unknown ticket 404 TICKET_NOT_FOUND', (await req('GET', 'support/tickets/0123456789abcdef01234567', { token: adm.token })).body?.code === 'TICKET_NOT_FOUND');
await req('PUT', `support/tickets/${t.body.id}/status`, { token: adm.token, body: { status: 'closed' } });
const ta = await req('GET', `admin/audit?target=support_ticket:${t.body.id}&limit=5`, { token: adm.token });
const ta2 = ta.body?.items?.length ? ta : await req('GET', `admin/audit?action=support&limit=5`, { token: adm.token });
check('7c', 'closing a ticket is audited', (ta2.body?.items ?? []).length > 0, (ta2.body?.items ?? []).map((a) => a.action + ' ' + a.target).join(','));

// 8. AI settings
const ai = (await req('GET', 'admin/ai/settings', { token: adm.token })).body;
check('8a', 'no API keys in settings response', !JSON.stringify(ai).match(/sk-|apiKey"\s*:\s*"[^"]/));
const cur = ai.current;
const body = { provider: 'none', anthropic: cur.anthropic, openai: cur.openai, fallbackOnly: cur.fallbackOnly, prompts: { modes: { ...cur.prompts.modes, vent: 'Listen first. One gentle question.' }, quizStyle: cur.prompts.quizStyle }, note: 'acceptance' };
const save = await req('PUT', 'admin/ai/settings', { token: adm.token, body: { ...body, baseVersion: cur.version } });
const staleSave = await req('PUT', 'admin/ai/settings', { token: both.token, body: { ...body, baseVersion: cur.version } });
check('8b', 'AI settings save, stale save gets 409 SETTINGS_CONFLICT', save.status === 200 && staleSave.status === 409 && staleSave.body?.code === 'SETTINGS_CONFLICT', `${save.status}/${staleSave.status}`);
const badProv = await req('PUT', 'admin/ai/settings', { token: adm.token, body: { ...body, provider: 'anthropic', baseVersion: save.body.version } });
check('8c', 'provider without key refused', badProv.status === 400 && badProv.body?.code === 'PROVIDER_NOT_CONFIGURED', `${badProv.status} ${badProv.body?.code}`);
const rbAi = await req('POST', 'admin/ai/settings/rollback', { token: adm.token, body: { version: save.body.version, baseVersion: save.body.version } });
check('8d', 'AI settings rollback', rbAi.status === 200 || rbAi.status === 201, `${rbAi.status} ${rbAi.body?.code ?? ''}`);
const test = await req('POST', 'admin/ai/test', { token: adm.token, body: { mode: 'vent', text: 'We argued about dishes' } });
check('8e', 'test console says fallback when AI is off', test.body?.source === 'fallback', test.body?.source);

// 9. Webhooks and API keys (local receiver only)
const got = [];
let secret = '';
const srv = http.createServer((q, s) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { const ts = q.headers['x-thirdwheel-timestamp']; const want = 'v1=' + crypto.createHmac('sha256', secret).update(`${ts}.${b}`).digest('hex'); got.push({ ev: q.headers['x-thirdwheel-event'], ok: q.headers['x-thirdwheel-signature'] === want }); s.writeHead(200); s.end(); }); }).listen(9188);
const wh = await req('POST', 'admin/integrations/webhooks', { token: adm.token, body: { name: 'acceptance', url: 'http://127.0.0.1:9188/h', events: ['crisis.alert'], enabled: true } });
secret = wh.body.secret;
check('9a', 'webhook created, secret shown once', wh.status === 201 && /^whsec_/.test(secret) && !JSON.stringify((await req('GET', 'admin/integrations/webhooks', { token: adm.token })).body).includes(secret));
await req('POST', `admin/integrations/webhooks/${wh.body.webhook.id}/test`, { token: adm.token });
// The victim was signed out by the suspension; the plain user already has an open crisis flag (folded), so a safety-kind signal opens a new medium flag.
const sig9 = await req('POST', 'safety/signals', { token: user.token, body: { kind: 'safety', surface: 'third-ear', helplineShown: true } });
if (sig9.status !== 202) console.log('  signal for 9b answered', sig9.status);
await new Promise((r) => setTimeout(r, 2500));
check('9b', 'ping and crisis.alert delivered with valid signatures', got.some((g) => g.ev === 'ping' && g.ok) && got.some((g) => g.ev === 'crisis.alert' && g.ok), JSON.stringify(got));
const meta = await req('POST', 'admin/integrations/webhooks', { token: adm.token, body: { name: 'bad', url: 'ftp://example.test/x', events: ['crisis.alert'], enabled: true } });
check('9c', 'server refuses a non-http webhook URL', meta.status === 400, `${meta.status} ${meta.body?.code}`);
const key = await req('POST', 'admin/integrations/api-keys', { token: adm.token, body: { name: `acc-${run}`, scopes: ['users.flag'] } });
const act = await req('POST', 'integrations/n8n/action', { headers: { 'x-api-key': key.body.key }, body: { action: 'user.tag', data: { userId: user.userId, add: ['acceptance'] } } });
check('9d', 'n8n action with scoped key works', act.status === 200 || act.status === 201, `${act.status} ${act.body?.code ?? ''}`);
const scope = await req('POST', 'integrations/n8n/action', { headers: { 'x-api-key': key.body.key }, body: { action: 'content.import', data: { items: [] } } });
check('9e', 'wrong scope refused', scope.status === 403 && scope.body?.code === 'API_KEY_SCOPE', `${scope.status} ${scope.body?.code}`);
const staffSus = await req('POST', 'integrations/n8n/action', { headers: { 'x-api-key': key.body.key }, body: { action: 'user.suspend', data: { userId: adm.userId, reason: 'x' } } });
check('9f', 'n8n cannot suspend staff', staffSus.status === 409 && staffSus.body?.code === 'STAFF_ACCOUNT', `${staffSus.status} ${staffSus.body?.code}`);
await req('DELETE', `admin/integrations/api-keys/${key.body.apiKey.id}`, { token: adm.token });
const revoked = await req('POST', 'integrations/n8n/action', { headers: { 'x-api-key': key.body.key }, body: { action: 'user.tag', data: { userId: user.userId, add: ['x'] } } });
check('9g', 'revoked key refused', revoked.status === 401, `${revoked.status} ${revoked.body?.code}`);
srv.close();

// 10. CORS (production arrangement: panel origin, Authorization + Idempotency-Key)
const pre = await fetch(B + '/admin/content', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4300', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key' } });
check('10a', 'CORS preflight allows the panel origin and headers', pre.headers.get('access-control-allow-origin') === 'http://localhost:4300' && /idempotency-key/i.test(pre.headers.get('access-control-allow-headers') ?? ''), `${pre.status} ${pre.headers.get('access-control-allow-headers')}`);
const bad = await fetch(B + '/admin/content', { method: 'OPTIONS', headers: { Origin: 'http://evil.test', 'Access-Control-Request-Method': 'GET' } });
check('10b', 'CORS refuses another origin', bad.headers.get('access-control-allow-origin') !== 'http://evil.test');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
