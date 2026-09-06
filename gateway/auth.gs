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
function resolvePin(pin) {
  if (!pin || !/^\d{4,8}$/.test(String(pin))) return null;
  var users = JSON.parse(PROP.getProperty('USERS') || '[]');
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.disabled) continue;
    if (safeEqual(u.pinHash, hashPin(pin, u.salt))) {
      return { userId: u.userId, name: u.name, role: u.role };
    }
  }
  return null;
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
