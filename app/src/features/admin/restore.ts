// Remembering that somebody signs in on this device.
//
// THE BUG THIS FIXES. Clerk is loaded lazily, on the admin route only (§64.2), so on an ordinary
// page load the app has never asked Clerk whether a session exists — and therefore always said
// "Belum masuk", right up until you opened the very screen that would tell it otherwise. The
// status was not wrong so much as uninformed.
//
// WHAT IT DOES NOT DO is load Clerk on every start, which would undo the reason it is lazy: the
// marbot's tablet must not depend on Clerk's CDN being reachable, and must not carry a wallet
// and payments tree it will never use. So the device REMEMBERS that somebody has signed in here
// before, and only then does it look. A kiosk that has never been signed into never fetches
// Clerk at all.
//
// The flag is a hint, not a credential. Setting it by hand buys somebody a CDN request and a
// Clerk session they still do not have; the session itself lives in Clerk's own storage and is
// verified at the gateway, which is where it has always been decided.

import { whoami } from '../../../../data/gateway';
import { gatewayToken, loadClerk } from '../../data/clerkLoader';
import type { ClerkClient } from '../../data/clerkLoader';
import type { AdminSession } from './AdminPanel';

const KEY = 'brt.admin.seen';
const WHO_KEY = 'brt.admin.who';

/**
 * How long a remembered identity is used before it is re-checked.
 *
 * Long, because it is a HINT and not a decision. What it saves is a ~1.4s gateway round trip on
 * every load — the difference between the rail knowing who you are immediately and knowing a
 * second and a half later.
 *
 * ⚠️ WHY CACHING A ROLE IS SAFE, since it looks alarming written down. Nothing is authorised by
 * this value. Every write mints a fresh Clerk token and the gateway reads the role out of the
 * payload whose HS256 signature it verified — the same argument as keeping the role in
 * `public_metadata`. Editing this entry to say `admin_utama` buys somebody buttons that fail.
 * It is re-checked in the background regardless, so a role changed elsewhere does not stay
 * wrong on screen.
 */
const WHO_TTL_MS = 12 * 60 * 60 * 1000;

function cacheWho(who: AdminSession['who']): void {
  try {
    localStorage.setItem(WHO_KEY, JSON.stringify({ who, ts: Date.now() }));
  } catch { /* private window */ }
}

function cachedWho(): AdminSession['who'] | null {
  try {
    const raw = localStorage.getItem(WHO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { who?: AdminSession['who']; ts?: number };
    if (!parsed.who || !parsed.ts || Date.now() - parsed.ts > WHO_TTL_MS) return null;
    return parsed.who.isAdmin ? parsed.who : null;
  } catch {
    return null;
  }
}

function clearWho(): void {
  try { localStorage.removeItem(WHO_KEY); } catch { /* private window */ }
}

export function rememberSignedIn(who: AdminSession['who']): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* private window */ }
  cacheWho(who);
}

export function forgetSignedIn(): void {
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
  clearWho();
}

export function hasSignedInHere(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** One shape for the session object, so the boot path and the sign-in screen cannot diverge. */
export function adminSession(
  clerk: ClerkClient,
  who: AdminSession['who'],
  onSignedOut: () => void,
): AdminSession {
  return {
    who,
    getToken: () => gatewayToken(clerk),
    signOut: async () => {
      await clerk.signOut();
      forgetSignedIn();
      onSignedOut();
    },
  };
}

/**
 * Restore a session on start, or return null.
 *
 * Silent by design: this runs on every load for a device that has signed in before, and a
 * failure here means "not signed in", which is exactly what the screen already says. Shouting
 * about it would turn a dropped wifi connection into an error nobody asked for.
 */
export async function restoreAdmin(
  url: string,
  onSignedOut: () => void,
  /** Called again if the background re-check disagrees with what was remembered. */
  onCorrected?: (session: AdminSession | null) => void,
): Promise<AdminSession | null> {
  if (!hasSignedInHere()) return null;
  try {
    const clerk = await loadClerk();
    if (!clerk.session) { clearWho(); return null; }

    const remembered = cachedWho();
    if (remembered) {
      /* Shown now, checked after. The gateway remains the authority over every write; this only
         stops the rail spending a second and a half saying "Belum masuk" to somebody who is
         plainly signed in. */
      void (async () => {
        try {
          const fresh = await whoami(url, await gatewayToken(clerk));
          if (!fresh.isAdmin) { clearWho(); onCorrected?.(null); return; }
          cacheWho(fresh);
          if (fresh.role !== remembered.role || fresh.userId !== remembered.userId) {
            onCorrected?.(adminSession(clerk, fresh, onSignedOut));
          }
        } catch {
          /* Offline. Keep what we had rather than signing somebody out of their own screen
             because the wifi dropped — nothing is authorised here anyway. */
        }
      })();
      return adminSession(clerk, remembered, onSignedOut);
    }

    const who = await whoami(url, await gatewayToken(clerk));
    if (!who.isAdmin) { clearWho(); return null; }
    cacheWho(who);
    return adminSession(clerk, who, onSignedOut);
  } catch {
    return null;
  }
}
