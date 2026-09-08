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
export interface ClerkClient {
  load(opts?: Record<string, unknown>): Promise<void>;
  mountSignIn(el: HTMLElement, opts?: Record<string, unknown>): void;
  unmountSignIn(el: HTMLElement): void;
  signOut(): Promise<void>;
  addListener(fn: (payload: unknown) => void): () => void;
  session?: ClerkSession | null;
  user?: ClerkUser | null;
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
 * `clerk.js`, NOT the `clerk.browser.js` that Clerk's own quickstart names.
 *
 * Found by deploying the quickstart version and watching the admin route go blank:
 * `mountSignIn` threw "Clerk was not loaded with Ui components". `clerk.browser.js` is the
 * 308kB core, which fetches its UI components separately afterwards — so mounting a sign-in the
 * moment `load()` resolves is a race, and on a gudang tablet it is a race against gudang wifi.
 * `clerk.js` is 1.5MB with the components already in it: one request, no readiness to guess at.
 *
 * The size is affordable precisely BECAUSE of §64.2 — this is never bundled and never fetched on
 * the kiosk path. It costs an admin one cached download on a screen they open rarely, and it
 * buys a sign-in that cannot half-arrive.
 */
const CLERK_JS_FILE = 'clerk.js';

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
