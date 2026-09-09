// Who this device belongs to.
//
// A phone number, remembered so it is typed once rather than at every visit. It is an
// IDENTIFIER, not a credential, and the distinction is what makes storing it acceptable: it is
// not secret, it authorises nothing, and a phone found in the street gives up a number its owner
// hands out anyway. The PIN is the secret, it is never stored, and the gateway locks attempts
// per number.
//
// That is the difference from the device secret it replaces. Losing this leaks nothing; losing
// that meant revoking a row.

const KEY = 'brt.member.phone';

/** Digits only, and `+62`/`0` are the same Indonesian number — matched to the gateway's rule. */
export function normalisePhone(phone: string): string {
  const digits = String(phone ?? '').replace(/[^0-9]/g, '');
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
}

export function loadPhone(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function savePhone(phone: string): string {
  const digits = normalisePhone(phone);
  try { localStorage.setItem(KEY, digits); } catch { /* private window */ }
  return digits;
}

export function forgetPhone(): void {
  try { localStorage.removeItem(KEY); } catch { /* private window */ }
}

/** Long enough to be a number at all. The gateway decides whether it belongs to anybody. */
export const looksLikePhone = (phone: string): boolean => normalisePhone(phone).length >= 8;
