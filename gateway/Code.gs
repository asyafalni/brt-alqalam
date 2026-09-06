/**
 * BRT Inventaris — gateway.
 *
 * The one component that holds secrets and the only thing that writes to Transactions.
 *
 * WHY THE API LOOKS LIKE THIS. Apps Script web apps can only answer CORS "simple requests":
 * GET/POST, Content-Type: text/plain, and NO custom headers. There is no doOptions, and
 * TextOutput cannot set headers, so the widely-blogged CORS fix is impossible rather than
 * merely discouraged. The documented event object also carries no headers, no cookies and no
 * client IP — so auth tokens travel in the BODY, and rate limiting is per enrolled device
 * rather than per IP. See docs/GATEWAY-FINDINGS.md.
 *
 * Deployment settings are load-bearing (Deploy → New deployment → Web app):
 *   Execute as:      Me
 *   Who has access:  Anyone       ← manifest ANYONE_ANONYMOUS
 * The manifest value ANYONE means *logged-in Google users* and serves a login page with
 * HTTP 200 — the client then parses HTML as JSON and the failure looks like our bug.
 */

/** Every response is text/plain JSON: the only shape a simple request can read back. */
function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.TEXT);
}

function fail(error, extra) {
  var body = { ok: false, error: error };
  if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
  return respond(body);
}

function doGet(e) {
  try {
    var op = (e && e.parameter && e.parameter.op) || 'state';
    if (op === 'state') return respond({ ok: true, state: readPublicState() });
    if (op === 'stateDetailed') {
      var session = requireSession(e.parameter.session);
      if (!session.ok) return fail(session.error, { retryAfterMs: session.retryAfterMs });
      return respond({ ok: true, state: readDetailedState() });
    }
    if (op === 'ping') return respond({ ok: true, now: Date.now(), version: GATEWAY_VERSION });
    return fail('unknown_op');
  } catch (err) {
    return fail('server_error', { message: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.op) {
      case 'openSession': return handleOpenSession(body);
      case 'closeSession': return handleCloseSession(body);
      case 'append': return handleAppend(body);
      default: return fail('unknown_op');
    }
  } catch (err) {
    return fail('server_error', { message: String(err && err.message || err) });
  }
}

var GATEWAY_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Sessions — one visit, not a time window (design doc Part XVI §58.5).
// ---------------------------------------------------------------------------

/**
 * A session is short-lived on purpose. It exists to cover ONE visit to the gudang: PIN,
 * log what you are taking, Simpan. It is not a login, and nothing should try to keep it.
 */
var SESSION_TTL_MS = 15 * 60 * 1000;

function handleOpenSession(body) {
  var device = verifyDevice(body.deviceSecret);
  if (!device.ok) return fail(device.error);

  var throttle = checkThrottle(device.deviceId);
  if (!throttle.ok) return fail('locked', { retryAfterMs: throttle.retryAfterMs });

  var actor = resolvePin(body.pin);
  if (!actor) {
    recordFailure(device.deviceId);
    // Deliberately identical to an unknown PIN: saying "no such PIN" would let someone
    // enumerate which 4-digit codes exist.
    return fail('invalid_pin', { attemptsLeft: attemptsLeft(device.deviceId) });
  }

  clearFailures(device.deviceId);
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'session:' + token,
    JSON.stringify({ userId: actor.userId, name: actor.name, role: actor.role, deviceId: device.deviceId }),
    Math.floor(SESSION_TTL_MS / 1000)
  );

  return respond({
    ok: true,
    session: { token: token, actorUserId: actor.userId, actorName: actor.name, role: actor.role },
  });
}

function handleCloseSession(body) {
  if (body.session) CacheService.getScriptCache().remove('session:' + body.session);
  return respond({ ok: true });
}

function requireSession(token) {
  if (!token) return { ok: false, error: 'no_session' };
  var raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) return { ok: false, error: 'session_expired' };
  var s = JSON.parse(raw);
  s.ok = true;
  return s;
}

// ---------------------------------------------------------------------------
// Append — the transactional core. One immutable row per action.
// ---------------------------------------------------------------------------

/**
 * Appends one or more events under a single session.
 *
 * The server timestamp is authoritative — never the device clock. The 24-jam rule and the
 * whole event ordering depend on it, and a tablet with a wrong clock would silently corrupt
 * both. STOK AWAL/AKHIR are deliberately NOT stored: they are display snapshots the reducer
 * computes, and the reducer is the source of truth (design doc §30).
 */
function handleAppend(body) {
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error);

  var entries = body.entries || [];
  if (!entries.length) return fail('no_entries');
  if (entries.length > 200) return fail('too_many_entries');

  // check-then-append is not atomic on its own, and neither appendRow nor values.append
  // documents atomicity — so the whole idempotency check runs under a lock.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail('busy');

  try {
    var sheet = txnSheet();
    var seen = existingClientTxnIds(sheet);
    var now = Date.now();
    var rows = [];
    var appended = [];
    var duplicates = [];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry.clientTxnId) return fail('missing_client_txn_id');

      // A retry, a double-tap or a replayed offline queue must not append twice.
      if (seen[entry.clientTxnId]) { duplicates.push(entry.clientTxnId); continue; }
      seen[entry.clientTxnId] = true;

      var txn = {
        txnId: Utilities.getUuid(),
        clientTxnId: String(entry.clientTxnId),
        ts: new Date(now + i).toISOString(),
        type: String(entry.type || ''),
        itemId: entry.itemId || '',
        assetId: entry.assetId || '',
        qtyDelta: Number(entry.qtyDelta || 0),
        recipient: entry.recipient || '',
        actorUserId: session.userId,
        condition: entry.condition || '',
        note: entry.note || '',
        toStatus: entry.toStatus || '',
        reversesTxnId: entry.reversesTxnId || '',
      };
      rows.push(TXN_COLUMNS.map(function (c) { return txn[c]; }));
      appended.push(txn);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TXN_COLUMNS.length).setValues(rows);
      SpreadsheetApp.flush();
    }

    return respond({ ok: true, appended: appended, duplicates: duplicates });
  } finally {
    lock.releaseLock();
  }
}
