/**
 * Identity — device enrolment, PIN verification, and lockout.
 *
 * Two independent gates, and they are independent on purpose:
 *   1. an ENROLLED DEVICE may talk to the endpoint at all;
 *   2. a valid PIN says who is acting.
 *
 * Device enrolment is not optional decoration. doPost sees no client IP and no headers
 * (GATEWAY-FINDINGS §2), so per-IP throttling is impossible and a device id the browser
 * invents is worthless — an attacker would rotate it and walk all 10,000 PINs in minutes.
 * A secret the gateway issued is what makes lockout mean anything, and it is what lets a
 * lost tablet be revoked by deleting one row.
 */

var PROP = PropertiesService.getScriptProperties();

/** How many wrong PINs an enrolled device may try before it has to wait. */
var MAX_ATTEMPTS = 5;
var LOCKOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// PIN hashing
// ---------------------------------------------------------------------------

/**
 * Apps Script has no bcrypt, scrypt, argon2 or PBKDF2 — `Utilities` offers digests and HMAC
 * and nothing else. So the construction is HMAC-SHA256 with a per-user salt, KEYED by a secret
 * pepper that lives only in Script Properties.
 *
 * The keying is the whole defence. A plain hash of a 4-digit PIN is enumerated in
 * microseconds — all 10,000 of them — so a leaked hash table would be worthless protection.
 * An attacker who gets the sheet but not the pepper still has nothing.
 */
function hashPin(pin, salt) {
  var pepper = PROP.getProperty('PIN_PEPPER');
  if (!pepper) throw new Error('PIN_PEPPER is not set — run setupGateway() first.');
  var mac = Utilities.computeHmacSha256Signature(salt + ':' + String(pin), pepper);
  return mac.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

/** Constant-time compare. Overkill at this scale, and free. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * PIN → person. Model C: the PIN alone identifies AND verifies, so PINs must be globally
 * unique — enforced at creation in setUserPin().
 */
/**
 * Everybody whose PIN this is — usually exactly one, occasionally two.
 *
 * PINs are no longer forced to be unique. Refusing a PIN because somebody else already has it
 * is work for the admin issuing it, and at 10–15 people the chance any two collide at all is
 * about one percent (birthday, 10^4 space). So the fast path stays one step — type the PIN, you
 * are in — and the rare ambiguity is resolved by asking WHICH of the two, only when it happens.
 *
 * ⚠️ The trade, recorded because it was chosen rather than overlooked: two people sharing a PIN
 * can each pick the other's name, so attribution between exactly those two is no longer proof.
 * Unique PINs made that impossible. The owner took this deliberately for the speed.
 */
function resolvePins(pin) {
  var out = [];
  if (!pin || !/^\d{4,8}$/.test(String(pin))) return out;
  var users = JSON.parse(PROP.getProperty('USERS') || '[]');
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.disabled) continue;
    if (safeEqual(u.pinHash, hashPin(pin, u.salt))) {
      out.push({ userId: u.userId, name: u.name, role: u.role });
    }
  }
  return out;
}

/** The single match, or null when there is none or more than one. */
function resolvePin(pin) {
  var found = resolvePins(pin);
  return found.length === 1 ? found[0] : null;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

function verifyDevice(deviceSecret) {
  if (!deviceSecret) return { ok: false, error: 'device_not_enrolled' };
  var devices = JSON.parse(PROP.getProperty('DEVICES') || '[]');
  for (var i = 0; i < devices.length; i++) {
    if (!devices[i].revoked && safeEqual(devices[i].secret, String(deviceSecret))) {
      return { ok: true, deviceId: devices[i].deviceId, label: devices[i].label };
    }
  }
  return { ok: false, error: 'device_not_enrolled' };
}

// ---------------------------------------------------------------------------
// Lockout — per enrolled device, since there is no IP to throttle.
// ---------------------------------------------------------------------------

var cache = CacheService.getScriptCache();

function failureKey(deviceId) { return 'fail:' + deviceId; }

function checkThrottle(deviceId) {
  var raw = cache.get(failureKey(deviceId));
  if (!raw) return { ok: true };
  var state = JSON.parse(raw);
  if (state.count < MAX_ATTEMPTS) return { ok: true };
  var remaining = state.until - Date.now();
  return remaining > 0 ? { ok: false, retryAfterMs: remaining } : { ok: true };
}

function recordFailure(deviceId) {
  var raw = cache.get(failureKey(deviceId));
  var state = raw ? JSON.parse(raw) : { count: 0, until: 0 };
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) state.until = Date.now() + LOCKOUT_MS;
  cache.put(failureKey(deviceId), JSON.stringify(state), Math.ceil(LOCKOUT_MS / 1000) + 60);
}

function clearFailures(deviceId) { cache.remove(failureKey(deviceId)); }

function attemptsLeft(deviceId) {
  var raw = cache.get(failureKey(deviceId));
  var used = raw ? JSON.parse(raw).count : 0;
  return Math.max(0, MAX_ATTEMPTS - used);
}

// ---------------------------------------------------------------------------
// Clerk — verifying an admin's session token
// ---------------------------------------------------------------------------

/**
 * HS256, verified here, with no network call and no RSA.
 *
 * Both of the obvious alternatives are dead ends, and it is worth writing down which:
 *
 *   * Apps Script has NO RSA signature *verification* primitive. `Utilities` offers RSA and
 *     HMAC *signing* plus digests, and the V8 runtime exposes neither `crypto` nor
 *     `SubtleCrypto`. So Clerk's default RS256 token arrives here unverifiable.
 *   * Clerk no longer has an endpoint that verifies a session token for you.
 *     `POST /v1/sessions/{id}/verify` is deprecated and absent from every API spec from
 *     2025-04-10 onward; `/v1/tokens/verify` never existed.
 *
 * What remains is a Clerk JWT template with a CUSTOM HS256 signing key, which
 * `Utilities.computeHmacSha256Signature` can check natively. The trade is real and worth
 * stating plainly: a symmetric key means this gateway could also MINT admin tokens, not just
 * read them. That is why `CLERK_JWT_KEY` lives in Script Properties and nowhere else.
 */
function verifyClerk(token) {
  var key = PROP.getProperty('CLERK_JWT_KEY');
  if (!key) return { ok: false, error: 'gateway-misconfigured' };
  if (!token || typeof token !== 'string') return { ok: false, error: 'no-token' };

  var parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'malformed' };

  var header;
  var claims;
  try {
    header = JSON.parse(decodeSegment(parts[0]));
    claims = JSON.parse(decodeSegment(parts[1]));
  } catch (err) {
    return { ok: false, error: 'malformed' };
  }

  /* PINNED, not read from the token. Trusting the token's own `alg` is the classic JWT
     forgery: `none` disables verification outright, and a token that declares RS256 would be
     checked with Clerk's PUBLIC key as if it were an HMAC secret — which anyone can fetch. */
  if (header.alg !== 'HS256') return { ok: false, error: 'bad-alg' };

  var expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(parts[0] + '.' + parts[1], key)
  ).replace(/=+$/, '');

  // Constant-time: a byte-by-byte early exit leaks the signature one character at a time to
  // anyone who can measure the reply.
  if (!safeEqual(expected, parts[2])) return { ok: false, error: 'bad-signature' };

  /* A signature only says the token was made with our key. Which issuer, and when, are
     separate questions — and a token that is merely OLD is exactly what an attacker replays. */
  var now = Math.floor(Date.now() / 1000);
  var skew = 5;
  if (typeof claims.exp === 'number' && now > claims.exp + skew) return { ok: false, error: 'expired' };
  if (typeof claims.nbf === 'number' && now + skew < claims.nbf) return { ok: false, error: 'not-yet-valid' };

  var issuer = PROP.getProperty('CLERK_ISSUER');
  if (issuer && claims.iss !== issuer) return { ok: false, error: 'bad-issuer' };

  return {
    ok: true,
    uid: claims.uid || claims.sub || '',
    role: claims.role || '',
    name: claims.name || '',
  };
}

/** Base64url → text. Apps Script decodes web-safe base64 but wants the padding restored. */
function decodeSegment(segment) {
  var padded = segment + '==='.slice((segment.length + 3) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

/**
 * An admin, or an explanation. Role is checked HERE rather than trusted from the claim alone —
 * the claim says what Clerk believes, and this says what the gateway will act on.
 */
function requireAdmin(token) {
  var who = verifyClerk(token);
  if (!who.ok) return who;
  if (who.role !== 'admin' && who.role !== 'admin_utama') {
    return { ok: false, error: 'not-admin' };
  }
  return who;
}
