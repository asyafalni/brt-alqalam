// The last register this device read, kept so the next visit is not a blank screen.
//
// THE PROBLEM. Apps Script's floor is its own start-up: measured on the live deployment,
// `?op=ping` — which touches no sheet at all — costs 1.3–2.5s, and `?op=state` costs the same
// plus almost nothing. So a read cannot be made faster; there is nothing in it to optimise.
// Meanwhile the app itself arrives in 0.3s and then replaces the entire screen with "Memuat
// register" for two seconds, every single time anybody opens it.
//
// WHY THIS IS NOT THE THING §16 FORBIDS. That rule is about falling back to the LOCAL DRAFT
// when the gateway cannot be reached: a different dataset, shown under the same headings, with
// no way to tell which you are looking at. This is the same register, from the same
// spreadsheet, being shown while the current copy of it is already in flight — with the
// progress bar running the whole time, and replaced within about a second and a half. Nothing
// is substituted and nothing is silent.
//
// The one real hazard is AGE. A register from last night shown as today's is a genuinely
// different claim, so beyond `MAX_AGE_MS` the cache is ignored and the loading screen returns.

import type { GatewayState } from '../../../data/gateway';

const KEY = 'brt.register.cache';

/**
 * A day. Long enough to cover a tablet closed overnight and opened at subuh; short enough that
 * nothing older than the shift before it is ever painted as current.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Cached {
  /** Which gateway it came from — a reconnect to another sheet must not read this one. */
  url: string;
  fetchedTs: number;
  state: GatewayState;
}

export function cacheRegister(url: string, state: GatewayState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ url, fetchedTs: Date.now(), state } satisfies Cached));
  } catch { /* private window, or the state outgrew the quota — neither is worth failing for */ }
}

/** The last state read from THIS gateway, if it is recent enough to still be worth showing. */
export function cachedRegister(
  url: string, now: number = Date.now(),
): { state: GatewayState; fetchedTs: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Cached>;
    if (!c.state || c.url !== url || !c.fetchedTs) return null;
    if (now - c.fetchedTs > MAX_AGE_MS) return null;
    return { state: c.state, fetchedTs: c.fetchedTs };
  } catch {
    return null;
  }
}

export function forgetRegister(): void {
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
}
