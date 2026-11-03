import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { authApi } from './auth-api';

describe('authApi.start', () => {
  it('logs in when the account exists', async () => {
    const calls: string[] = [];
    server.use(
      http.post(p('auth/login/start'), () => {
        calls.push('login');
        return HttpResponse.json({ ok: true, session: 'otp_login', resendAt: 0 });
      }),
    );
    expect(await authApi.start('lead@thirdwheel.app')).toMatchObject({ ok: true, session: 'otp_login' });
    expect(calls).toEqual(['login']);
  });

  it('creates the account on a first sign-in (no account yet)', async () => {
    const calls: string[] = [];
    server.use(
      http.post(p('auth/login/start'), () => {
        calls.push('login');
        return HttpResponse.json({ ok: false, reason: 'not_found' });
      }),
      http.post(p('auth/signup/start'), () => {
        calls.push('signup');
        return HttpResponse.json({ ok: true, session: 'otp_signup', resendAt: 0 });
      }),
    );
    expect(await authApi.start('new.clinician@thirdwheel.app')).toMatchObject({ ok: true, session: 'otp_signup' });
    expect(calls).toEqual(['login', 'signup']);
  });
});
