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
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private window */ }
  return c;
}

/** Whether this device may append movements, as opposed to only reading the register. */
export const canRecord = (c: Connection | null): boolean => !!c?.deviceSecret;

export function clearConnection(): void {
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
