// Verifying a Clerk token, tested against tokens built by Node's own crypto.
//
// `auth.gs` is Apps Script, not TypeScript, and it never runs in this project's build. It is
// loaded here as source and evaluated with a stubbed `Utilities` and `PropertiesService`, which
// is the only way to exercise it at all short of deploying — and this is the one file where
// "looks right" is not good enough. Every case below is a way tokens are forged in the wild.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const KEY = 'test-signing-key-not-a-real-one';
const ISS = 'https://gentle-wallaby-8648.clerk.accounts.dev';

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function token(
  claims: Record<string, unknown>,
  { alg = 'HS256', key = KEY, tamper = false } = {},
) {
  const head = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac('sha256', key).update(`${head}.${body}`).digest();
  return `${head}.${body}.${b64url(sig)}${tamper ? 'x' : ''}`;
}

/** A minimal Apps Script, just enough for the functions under test. */
function loadGateway(props: Record<string, string>) {
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Utilities: {
      computeHmacSha256Signature: (value: string, key: string) =>
        [...createHmac('sha256', key).update(value).digest()],
      base64EncodeWebSafe: (bytes: number[]) => b64url(Buffer.from(bytes)),
      base64DecodeWebSafe: (s: string) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
      newBlob: (bytes: number[]) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    },
  };
  const src = readFileSync(new URL('../auth.gs', import.meta.url), 'utf8');
  const make = new Function(
    ...Object.keys(sandbox),
    `${src}; return { verifyClerk, requireAdmin };`,
  );
  return make(...Object.values(sandbox)) as {
    verifyClerk: (t: string) => { ok: boolean; error?: string; uid?: string; role?: string };
    requireAdmin: (t: string) => { ok: boolean; error?: string; role?: string };
  };
}

const now = () => Math.floor(Date.now() / 1000);
const valid = (extra: Record<string, unknown> = {}) => ({
  uid: 'user_123', role: 'admin', name: 'Alfin',
  iss: ISS, iat: now(), exp: now() + 60, ...extra,
});

let gw: ReturnType<typeof loadGateway>;
beforeEach(() => { gw = loadGateway({ CLERK_JWT_KEY: KEY, CLERK_ISSUER: ISS }); });

describe('verifyClerk', () => {
  it('accepts a token this gateway could have been given', () => {
    expect(gw.verifyClerk(token(valid()))).toMatchObject({ ok: true, uid: 'user_123', role: 'admin' });
  });

  it('rejects one signed with a different key', () => {
    expect(gw.verifyClerk(token(valid(), { key: 'someone-elses-key' })))
      .toMatchObject({ ok: false, error: 'bad-signature' });
  });

  it('rejects `alg: none`, which is the whole point of pinning it', () => {
    // Reading `alg` from the token and honouring it is the classic JWT forgery: `none` asks the
    // verifier to skip the step it exists to perform.
    const head = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const body = b64url(JSON.stringify(valid()));
    expect(gw.verifyClerk(`${head}.${body}.`)).toMatchObject({ ok: false, error: 'bad-alg' });
  });

  it('rejects an RS256 token even when it is otherwise well formed', () => {
    // The dangerous shape: a token declaring RS256 would otherwise be checked with Clerk's
    // PUBLIC key treated as an HMAC secret — and that key is published at a URL.
    expect(gw.verifyClerk(token(valid(), { alg: 'RS256' })))
      .toMatchObject({ ok: false, error: 'bad-alg' });
  });

  it('rejects a tampered signature', () => {
    expect(gw.verifyClerk(token(valid(), { tamper: true })))
      .toMatchObject({ ok: false, error: 'bad-signature' });
  });

  it('rejects an edited payload, signature and all', () => {
    // Escalating `role` is the reason a claim is never trusted unsigned.
    const t = token(valid());
    const [h, , s] = t.split('.');
    const forged = b64url(JSON.stringify(valid({ role: 'admin_utama' })));
    expect(gw.verifyClerk(`${h}.${forged}.${s}`)).toMatchObject({ ok: false, error: 'bad-signature' });
  });

  it('rejects an expired token — a valid signature is not a fresh one', () => {
    expect(gw.verifyClerk(token(valid({ exp: now() - 3600 }))))
      .toMatchObject({ ok: false, error: 'expired' });
  });

  it('allows a few seconds of clock skew rather than failing on the boundary', () => {
    expect(gw.verifyClerk(token(valid({ exp: now() - 2 }))).ok).toBe(true);
  });

  it('rejects one issued by a different Clerk instance', () => {
    expect(gw.verifyClerk(token(valid({ iss: 'https://evil.clerk.accounts.dev' }))))
      .toMatchObject({ ok: false, error: 'bad-issuer' });
  });

  it('refuses everything when the key is not configured', () => {
    // Failing OPEN here would mean an unconfigured gateway trusts every caller.
    const bare = loadGateway({});
    expect(bare.verifyClerk(token(valid()))).toMatchObject({ ok: false, error: 'gateway-misconfigured' });
  });

  it('says malformed rather than throwing at junk', () => {
    for (const junk of ['', 'not.a.token', 'a.b', 'a.b.c.d']) {
      expect(gw.verifyClerk(junk).ok).toBe(false);
    }
  });
});

describe('requireAdmin', () => {
  it('lets both admin tiers through', () => {
    expect(gw.requireAdmin(token(valid({ role: 'admin' }))).ok).toBe(true);
    expect(gw.requireAdmin(token(valid({ role: 'admin_utama' }))).ok).toBe(true);
  });

  it('turns an anggota away — a valid token is not a permission', () => {
    expect(gw.requireAdmin(token(valid({ role: 'anggota' }))))
      .toMatchObject({ ok: false, error: 'not-admin' });
  });

  it('turns away a token with no role at all', () => {
    const t = token({ uid: 'u', iss: ISS, exp: now() + 60 });
    expect(gw.requireAdmin(t)).toMatchObject({ ok: false, error: 'not-admin' });
  });
});
