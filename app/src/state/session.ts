// The open visit, kept between actions.
//
// The PIN used to be asked for on every single record, because a session was one visit and ended
// at Simpan (§58.5). That rule exists to stop a shared gudang tablet handing the last person's
// identity to whoever walks up next — and it is nearly meaningless on a phone one person
// carries. So a PHONE session is kept here and reused for an hour of idle time; a device session
// is not kept at all, because on that tablet the next person really might be somebody else.
//
// ⚠️ This is a credential at rest, and the only one the app stores. It is what "stay signed in"
// costs everywhere: for that hour, a borrowed phone can record without knowing the PIN. It is
// bounded by the hour, by the gateway sliding it only while it is used, and by revocation —
// disabling somebody destroys their live session on its next use rather than at expiry.

import type { Session } from '../../../data/gateway';

const KEY = 'brt.session';

interface Stored {
  token: string;
  /** Wall-clock expiry, refreshed each time the session is used. */
  expiresAt: number;
}

/** Kept only for the phone path. A device session is over as soon as the visit is. */
export function keepSession(session: Session, kind?: string, ttlMs?: number): void {
  if (kind !== 'phone' || !ttlMs) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      token: session.token,
      expiresAt: Date.now() + ttlMs,
    } satisfies Stored));
  } catch { /* private window */ }
}

/** The still-valid token, or null. Expiry is checked here so a stale one is never sent. */
export function liveSession(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Stored>;
    if (!s.token || !s.expiresAt || Date.now() >= s.expiresAt) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s.token;
  } catch {
    return null;
  }
}

/** Push the local expiry out, mirroring the gateway sliding its own on use. */
export function touchSession(ttlMs: number): void {
  const token = liveSession();
  if (!token) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt: Date.now() + ttlMs } satisfies Stored));
  } catch { /* private window */ }
}

export function endSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
}

/** An hour, matching the gateway. Duplicated deliberately and pinned by a test. */
export const SESSION_TTL_MS = 60 * 60 * 1000;
