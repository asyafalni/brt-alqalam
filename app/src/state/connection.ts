// How this device reaches the gateway.
//
// TWO VALUES, and they are different KINDS of thing, which is why they are stored together but
// treated differently:
//
//   * the URL is public by design — it is in every printed QR's sibling, and Apps Script
//     deployments are `ANYONE_ANONYMOUS` on purpose;
//   * the device secret is a credential, and it is what makes a 4-digit PIN mean anything at
//     all. `doPost` sees no headers, no cookies and no client IP (§65.2), so there is nothing
//     to rate-limit against except an id the gateway itself issued. A browser-invented one
//     would simply be rotated until all 10,000 PINs had been walked.
//
// It lives in THIS DEVICE's localStorage and nowhere else — not in the repo, not in the sheet,
// not in a QR. The consequence is stated plainly because it was agreed deliberately: whoever
// holds the tablet holds the secret. That is the model the design already assumed, and it is
// why a lost tablet is revoked by deleting one row rather than by changing anything here.

const KEY = 'brt.gateway.connection';

/**
 * A separate note that this device HAS been connected, once.
 *
 * It exists because losing the connection is silent and looks like something else. Every screen
 * renders from `draft`, and with no connection that is the LOCAL stock-take draft — so a tablet
 * whose storage was cleared shows a full-looking register that is this device's own months-old
 * copy, under the same headings, with no hint that the sheet is no longer being read. That is
 * the same mistake as showing "none" for withheld data or "no data" for data still loading, in a
 * fourth costume, and it is the worst of the four: the numbers are plausible.
 *
 * Deliberately NOT part of the connection object, so it survives the object disappearing — which
 * is the exact event it exists to detect. A deliberate `Putuskan` clears it too, because that is
 * somebody choosing to disconnect rather than a connection going missing.
 */
const SEEN_KEY = 'brt.gateway.seen';

/**
 * Ask the browser not to evict this origin's storage.
 *
 * WHY IT MATTERS HERE. The device secret is not a session token — it is written once and lives
 * in `localStorage` indefinitely. But "indefinitely" is the browser's word, not ours: storage is
 * evictable under pressure, and Safari discards it entirely after seven days without a visit.
 * A kiosk used every day is safe; a marbot's phone that goes a week between busy periods is
 * exactly the case that quietly loses its enrolment and has to be re-enrolled for no visible
 * reason. Asking costs one call and removes that class of loss where the browser grants it.
 *
 * Best-effort by design: Chrome grants it on engagement or installation, Firefox prompts, and
 * some browsers refuse. A refusal is not a failure to handle — it is the status quo, and the
 * enrolment QR is the recovery either way.
 */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface Connection {
  /** The Apps Script `/exec` URL. */
  url: string;
  /**
   * Issued once by `enrollDevice()`, shown once, and stored only here.
   *
   * OPTIONAL, and that is the whole point of the two tiers. READING needs no credential at all —
   * the public tier is open by design (§39), which is what lets the takmir or the boss open the
   * register on their own phone and see that the masjid's assets are managed. Only RECORDING
   * needs a device, so only a kiosk needs enrolling. Requiring a secret from somebody who just
   * wants to look would put one more credential into the world, give write access nobody asked
   * for, and leave one more thing to revoke.
   */
  deviceSecret?: string;
  /** When this device was connected, for the settings screen to show. */
  connectedTs: number;
}

/** Wrapped: a private window can throw on read, and a kiosk must still start. */
export function loadConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Connection>;
    if (!c.url) return null;
    return {
      url: c.url,
      ...(c.deviceSecret ? { deviceSecret: c.deviceSecret } : {}),
      connectedTs: c.connectedTs ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveConnection(url: string, deviceSecret?: string): Connection {
  const secret = (deviceSecret ?? '').trim();
  const c: Connection = {
    url: url.trim(),
    ...(secret ? { deviceSecret: secret } : {}),
    connectedTs: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    localStorage.setItem(SEEN_KEY, '1');
  } catch { /* private window */ }
  /* Asked at the moment there is finally something worth keeping. Not awaited: a device secret
     that is stored but not yet marked durable is strictly better than a blocked save. */
  void keepStorage();
  return c;
}

/** Whether this device may append movements, as opposed to only reading the register. */
/**
 * Whether this device can record at all.
 *
 * It used to mean "holds a device secret", because a secret was the only thing a PIN attempt
 * could be rate-limited against. A registered phone number is now the other way in — the person
 * identifies themselves and the gateway locks attempts per number — so a connected device with
 * no secret is no longer a viewer, it is somebody who has not said who they are yet.
 *
 * What still separates looking from recording is the ROSTER: recording needs a PIN belonging to
 * a registered member, and the gateway is the only thing that decides that.
 */
export const canRecord = (c: Connection | null): boolean => !!c;

/** True when this device was connected at some point and no longer is. */
export function connectionLost(current: Connection | null): boolean {
  if (current) return false;
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function clearConnection(): void {
  // Chosen, not lost — so the device stops claiming a connection went missing.
  try { localStorage.removeItem(SEEN_KEY); } catch { /* private window */ }
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
}

/**
 * Catches the address that cannot possibly work, before somebody discovers it in the gudang.
 *
 * A `/dev` URL is the trap worth naming: it is what the Apps Script editor offers first, it
 * looks almost identical to `/exec`, and it requires a Google login — so it returns a sign-in
 * page with HTTP 200 to a kiosk that has nobody signed in.
 */
export function urlProblem(url: string): string | null {
  const u = url.trim();
  if (u === '') return 'Alamat gateway belum diisi.';
  if (!/^https:\/\//i.test(u)) return 'Alamat harus diawali https://';
  if (!u.includes('script.google.com/macros/')) {
    return 'Ini bukan alamat Apps Script. Salin dari Deploy → Manage deployments.';
  }
  if (u.endsWith('/dev')) {
    return 'Itu alamat /dev, yang minta login Google. Pakai yang berakhiran /exec.';
  }
  if (!u.endsWith('/exec')) return 'Alamat gateway harus berakhiran /exec';
  return null;
}
