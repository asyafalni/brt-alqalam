// Clerk, fetched at the moment somebody asks for it and never before.
//
// WHY A CDN SCRIPT TAG RATHER THAN AN IMPORT. `@clerk/clerk-js` has hard dependencies on
// @solana/wallet-adapter, @coinbase/wallet-sdk, @base-org/account and @stripe/stripe-js — they
// ship, they are not optional peers, and there is no headless build (§64.2). Bundling it would
// put a wallet and payments tree into a masjid inventory kiosk for zero benefit, and would put
// it in the MARBOT's bundle, whose whole design rule is that it must work when Clerk's servers
// are unreachable.
//
// So: nothing here is imported by the kiosk path. The script tag is injected the first time an
// admin opens #/admin, which on a gudang tablet is never.

import { CLERK_PUBLISHABLE_KEY, CLERK_JWT_TEMPLATE } from './clerk';

/** Only the parts we use. The real surface is far larger; typing it all would be fiction. */
export interface ClerkSession {
  getToken(opts?: { template?: string }): Promise<string | null>;
}
export interface ClerkUser {
  primaryEmailAddress?: { emailAddress?: string } | null;
  username?: string | null;
  fullName?: string | null;
}
/** Clerk's own error shape. Its messages are English, and better than anything we would invent. */
export interface ClerkApiError {
  errors?: { message?: string; longMessage?: string; code?: string }[];
  message?: string;
}

export interface ClerkSignInResult {
  status: string;
  createdSessionId?: string;
  /** What Clerk will accept as a second step, when it asks for one. */
  supportedSecondFactors?: { strategy: string }[];
}

export interface ClerkSignIn {
  create(params: {
    strategy: 'password'; identifier: string; password: string;
  }): Promise<ClerkSignInResult>;
  prepareSecondFactor(params: { strategy: 'email_code' }): Promise<ClerkSignInResult>;
  attemptSecondFactor(params: { strategy: 'email_code'; code: string }): Promise<ClerkSignInResult>;
}

/**
 * The statuses that mean "the password was right, now prove the device".
 *
 * `needs_client_trust` is Clerk's device-attestation step and is not in the older documented
 * set; it arrives with `firstFactorVerification: "verified"`, so treating it as a failure would
 * tell an admin their password was wrong when it was not. Both are answered the same way — an
 * emailed code — so they are one branch here.
 */
export const NEEDS_SECOND_FACTOR = ['needs_second_factor', 'needs_client_trust'];

export interface ClerkClient {
  load(opts?: Record<string, unknown>): Promise<void>;
  setActive(opts: { session: string }): Promise<void>;
  signOut(): Promise<void>;
  addListener(fn: (payload: unknown) => void): () => void;
  client?: { signIn: ClerkSignIn } | null;
  session?: ClerkSession | null;
  user?: ClerkUser | null;
}

/** The first line Clerk gives us, which is usually the actionable one. */
export function clerkMessage(err: unknown): string {
  const e = err as ClerkApiError;
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? e?.message ?? String(err);
}

/**
 * The instance's own host, decoded from the publishable key.
 *
 * The key is base64 of "<host>$", which is why it is not a secret and why this needs no second
 * constant to drift out of step with it: one value, one source.
 */
function frontendApiHost(): string {
  const body = CLERK_PUBLISHABLE_KEY.replace(/^pk_(test|live)_/, '');
  const decoded = atob(body);
  return decoded.replace(/\$$/, '');
}

/**
 * Pinned to a MAJOR, not to `@latest`.
 *
 * `@latest` means the sign-in screen can change under a masjid on a Tuesday with nobody having
 * deployed anything; an exact pin means it silently rots instead. A major is the compromise the
 * publisher's own semver promises.
 */
const CLERK_JS_VERSION = '6';

/**
 * The browser build — which in v6 is HEADLESS, and that is why we draw our own sign-in form.
 *
 * Established by probing the real CDN rather than by reading docs, after `mountSignIn` threw
 * "Clerk was not loaded with Ui components" and took the admin route blank with it:
 *
 *   - `clerk.browser.js` (309kB) has no UI components, and still has none after waiting four
 *     seconds. It is not a race. In v6 the components live in a separate `@clerk/ui` package
 *     fetched at runtime, exactly as OCTANE-FINDINGS §62 recorded.
 *   - `clerk.js` (1.5MB) is the CommonJS entry. Loaded in a script tag it throws
 *     `exports is not defined` before it does anything at all.
 *   - `clerk.legacy.browser.js` exists but is the build for older browsers, not a UI build.
 *
 * So the honest choice was between chasing a UI bundle that may or may not arrive on gudang
 * wifi, and using the headless API this build is actually made of. We take the second: the
 * sign-in form is ours, in Bahasa, styled like every other screen, and it cannot half-load.
 * What Clerk still does is the part that matters — verifying the password and minting the token.
 */
const CLERK_JS_FILE = 'clerk.browser.js';

let loading: Promise<ClerkClient> | null = null;

/** The error an admin actually sees when the gudang wifi is down. */
export class ClerkUnavailable extends Error {
  constructor() {
    super('Tidak bisa memuat Clerk. Periksa koneksi internet, lalu coba lagi.');
    this.name = 'ClerkUnavailable';
  }
}

export function loadClerk(): Promise<ClerkClient> {
  if (loading) return loading;

  loading = new Promise<ClerkClient>((resolve, reject) => {
    const w = window as unknown as { Clerk?: ClerkClient };
    if (w.Clerk) { resolve(w.Clerk); return; }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
    script.src = `https://${frontendApiHost()}/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/${CLERK_JS_FILE}`;
    script.onload = () => {
      const clerk = (window as unknown as { Clerk?: ClerkClient }).Clerk;
      if (!clerk) { reject(new ClerkUnavailable()); return; }
      clerk.load().then(() => resolve(clerk)).catch(() => reject(new ClerkUnavailable()));
    };
    script.onerror = () => {
      // Let the next attempt try again: a failed load is usually the wifi, not the code, and a
      // memoised rejection would make one bad moment permanent until a reload.
      loading = null;
      reject(new ClerkUnavailable());
    };
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * A gateway token, minted fresh at the moment of use.
 *
 * NEVER STORED. Clerk's tokens live 60 seconds (§65.4), so one kept in the offline queue would
 * be expired by the time the queue flushed — and a queue that retries with a dead credential
 * looks exactly like a permissions bug. Mint at flush time or not at all.
 */
export async function gatewayToken(clerk: ClerkClient): Promise<string> {
  const token = await clerk.session?.getToken({ template: CLERK_JWT_TEMPLATE });
  if (!token) throw new Error('Sesi Clerk tidak aktif. Masuk lagi.');
  return token;
}
