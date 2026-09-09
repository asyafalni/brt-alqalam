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
    if (op === 'state') {
      /* Assembled once and handed out for 25s. `respond` would re-serialise the object, so the
         cached STRING is spliced in directly — re-parsing it only to stringify it again is the
         kind of work that makes a cache look like it did not help. */
      return ContentService
        .createTextOutput('{"ok":true,"state":' + cachedPublicState() + '}')
        .setMimeType(ContentService.MimeType.TEXT);
    }
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
      case 'putCatalog': return handlePutCatalog(body);
      case 'whoami': return handleWhoami(body);
      case 'stateDetailed': return handleDetailedRead(body);
      case 'listUsers': return handleListUsers(body);
      case 'setUserPin': return handleSetUserPin(body);
      case 'setUserActive': return handleSetUserActive(body);
      case 'suggestPin': return handleSuggestPin(body);
      case 'listDevices': return handleListDevices(body);
      case 'enrollDevice': return handleEnrollDevice(body);
      case 'setDeviceRevoked': return handleSetDeviceRevoked(body);
      case 'renameDevice': return handleRenameDevice(body);
      case 'listInvitations': return handleListInvitations(body);
      case 'inviteAdmin': return handleInviteAdmin(body);
      case 'revokeInvitation': return handleRevokeInvitation(body);
      case 'submitRequest': return handleSubmitRequest(body);
      case 'finishRequest': return handleFinishRequest(body);
      default: return fail('unknown_op');
    }
  } catch (err) {
    return fail('server_error', { message: String(err && err.message || err) });
  }
}

/*
 * Bump this with every change you paste in. `?op=ping` returns it, which is the only way to
 * tell from outside WHICH code a deployment is actually serving — and that mattered: saving a
 * file in the editor does not change what `/exec` serves, and two rounds were spent proving a
 * fix that was never live. A version nobody can read is a version nobody can check.
 */
var GATEWAY_VERSION = '0.16.0-revoke-live';

// ---------------------------------------------------------------------------
// Sessions — one visit, not a time window (design doc Part XVI §58.5).
// ---------------------------------------------------------------------------

/**
 * A session is short-lived on purpose. It exists to cover ONE visit to the gudang: PIN,
 * log what you are taking, Simpan. It is not a login, and nothing should try to keep it.
 */
/*
 * TWO LIFETIMES, because the risk is not the same on the two kinds of device.
 *
 * §58.5 made a session ONE VISIT — PIN, log, Simpan, ended — specifically so a shared kiosk
 * could not misattribute: whoever walks up next must not inherit the last person's session.
 * That reasoning is exactly as strong as it ever was for a tablet in the gudang, and it is
 * nearly absent on somebody's own phone, which one person carries.
 *
 * So an ENROLLED DEVICE keeps the short window, and a PHONE session lives an hour of IDLE time,
 * refreshed on every use. Somebody working through a shelf types a PIN once; somebody who put
 * the phone down after lunch types it again.
 *
 * ⚠️ The trade, and it is the ordinary "stay signed in" one: for that hour, a borrowed or stolen
 * phone can record without knowing the PIN. On a personal device that is the same exposure as
 * every banking app on the same phone, and it is what the hour buys.
 */
var SESSION_TTL_MS = 15 * 60 * 1000;
var SESSION_TTL_PHONE_MS = 60 * 60 * 1000;

/**
 * Open a session with EITHER an enrolled device or a registered phone number.
 *
 * TWO MODELS, both live, because the operating model is genuinely two models. A shared gudang
 * tablet is enrolled once and anybody's PIN opens a visit on it. A marbot on their OWN phone
 * types their number once — it is remembered by the browser, not issued by us — and their PIN
 * from then on.
 *
 * The phone path is what lets device enrolment stop being mandatory, and the reason is narrower
 * than §65.2's original conclusion. That said per-IP limiting is impossible so only an issued
 * secret can be locked; what was actually missing was an ACCOUNT. A PIN alone names nobody, so
 * the only options were a global lock (one attacker silences everyone) or a client-supplied id
 * (rotated at will). A phone number names somebody, and a named account is the thing every
 * login system in the world locks.
 *
 * ⚠️ The trade, taken deliberately: without an enrolled secret, anybody holding the `/exec` URL
 * may ATTEMPT. Five failures per number per five minutes makes walking 10,000 PINs take
 * thousands of hours — against 15/10,000 per blind guess when a PIN alone identified anybody —
 * but the attempts now reach us, and somebody can deliberately fail a colleague's number to lock
 * them out. `globalFloodgate` bounds the first; the second is the price of the model.
 */
function handleOpenSession(body) {
  /* Independent of who is asking, so a flood cannot be hidden behind rotating numbers. */
  if (globalFloodgate()) return fail('locked', { retryAfterMs: 60000 });

  var lockKey = '';
  var actorFilter = null;

  if (body.phone) {
    var member = rosterByPhone(body.phone);
    lockKey = 'ph:' + normalisePhone(body.phone);
    var throttlePhone = checkThrottle(lockKey);
    if (!throttlePhone.ok) return fail('locked', { retryAfterMs: throttlePhone.retryAfterMs });
    /* An unregistered number is answered EXACTLY like a wrong PIN, further down. Saying "no such
       number" here would turn this into a way to test which numbers belong to the masjid. */
    actorFilter = member ? member.userId : '__none__';
  } else {
    var device = verifyDevice(body.deviceSecret);
    if (!device.ok) return fail(device.error);
    lockKey = 'dev:' + device.deviceId;
    var throttle = checkThrottle(lockKey);
    if (!throttle.ok) return fail('locked', { retryAfterMs: throttle.retryAfterMs });
  }

  var found = resolvePins(body.pin);

  /* On the phone path the PIN must be THAT person's. This is what makes PIN collisions
     irrelevant here — the number has already said who, so there is nothing to disambiguate. */
  if (actorFilter !== null) {
    found = found.filter(function (u) { return u.userId === actorFilter; });
  }

  /* A second step ONLY when the PIN is ambiguous, which at 10–15 people happens about one time
     in a hundred rosters. The fast path is unchanged: type the PIN, you are in. Asking everybody
     to pick their name first to cover that one case would put a tap on every visit to save one
     — which is the trade §0.0 exists to refuse.

     The failure counter is NOT touched here: the PIN was right. */
  if (found.length > 1 && !body.userId) {
    clearFailures(lockKey);
    return respond({
      ok: true,
      choose: found.map(function (u) { return { userId: u.userId, name: u.name }; }),
    });
  }

  var actor = found.length === 1 ? found[0] : null;
  if (body.userId) {
    /* Naming somebody does not let you BE them: the PIN still has to be theirs, so this only
       picks between people who already hold the PIN that was typed. */
    actor = null;
    for (var f = 0; f < found.length; f++) {
      if (found[f].userId === body.userId) actor = found[f];
    }
  }

  if (!actor) {
    recordFailure(lockKey);
    /* One reply for three different failures — unknown PIN, wrong PIN, and a phone number that
       belongs to nobody. Distinguishing them would hand out a directory of who is registered. */
    return fail('invalid_pin', { attemptsLeft: attemptsLeft(lockKey) });
  }

  clearFailures(lockKey);
  var token = Utilities.getUuid();
  var byPhone = lockKey.indexOf('ph:') === 0;
  CacheService.getScriptCache().put(
    'session:' + token,
    JSON.stringify({
      userId: actor.userId, name: actor.name, role: actor.role, lockKey: lockKey,
      kind: byPhone ? 'phone' : 'device',
    }),
    Math.floor((byPhone ? SESSION_TTL_PHONE_MS : SESSION_TTL_MS) / 1000)
  );

  return respond({
    ok: true,
    session: {
      token: token,
      actorUserId: actor.userId,
      actorName: actor.name,
      role: actor.role,
      /* Told to the client so it knows whether to keep the token at all. A device session is
         not worth storing — it is over as soon as the visit is. */
      expiresInMs: byPhone ? SESSION_TTL_PHONE_MS : SESSION_TTL_MS,
      kind: byPhone ? 'phone' : 'device',
    },
  });
}

function handleCloseSession(body) {
  if (body.session) CacheService.getScriptCache().remove('session:' + body.session);
  return respond({ ok: true });
}

function requireSession(token) {
  if (!token) return { ok: false, error: 'no_session' };
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session:' + token);
  if (!raw) return { ok: false, error: 'session_expired' };
  var s = JSON.parse(raw);

  /*
   * CHECKED AGAINST THE ROSTER, every time.
   *
   * Otherwise "we can revoke a stolen phone" is only true once the session expires — up to an
   * hour of a disabled person still recording, which is exactly the window somebody reaches for
   * revocation to close. The session is a token in a cache; whether it still means anything is a
   * fact about the roster, and only the roster can answer it.
   *
   * One property read per authenticated request. Cheap next to being wrong about this.
   */
  var still = rosterUsers();
  var live = null;
  for (var i = 0; i < still.length; i++) {
    if (still[i].userId === s.userId) live = still[i];
  }
  if (!live || live.disabled) {
    cache.remove('session:' + token);
    return { ok: false, error: 'session_revoked' };
  }

  /* SLIDING, not fixed: the hour is idle time, so a person working steadily through a rack is
     never interrupted and a phone put down after lunch asks again. Only the phone path slides —
     re-arming a shared tablet's session on every read is precisely what §58.5 forbids. */
  if (s.kind === 'phone') {
    cache.put('session:' + token, raw, Math.floor(SESSION_TTL_PHONE_MS / 1000));
  }

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
        /* WHICH SHELF it came off. Adding the column to `TXN_COLUMNS` was not enough — the row
           is built from this literal, so a field missing here is written as blank however wide
           the sheet is. It was, and every movement landed on the unplaced pile: the register
           would have reported that nothing was ever taken from any rack, while looking correct
           on every screen. Found by appending a real row and reading it back. */
        locationId: entry.locationId || '',
        qtyDelta: Number(entry.qtyDelta || 0),
        recipient: entry.recipient || '',
        actorUserId: session.userId,
        condition: entry.condition || '',
        note: entry.note || '',
        toStatus: entry.toStatus || '',
        reversesTxnId: entry.reversesTxnId || '',
      };
      // Fails loudly rather than writing a blank — see `txnRow`, which every writer shares.
      var built = txnRow(txn);
      if (!built.ok) return fail('column_not_built', { column: built.column });
      rows.push(built.row);
      appended.push(txn);
    }

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, TXN_COLUMNS.length).setValues(rows);
      dropStateCache();
      SpreadsheetApp.flush();
    }

    return respond({ ok: true, appended: appended, duplicates: duplicates });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Admin — Clerk-signed, and the only way to change the catalog.
// ---------------------------------------------------------------------------

/**
 * Who does the gateway think you are?
 *
 * Exists because the failure it diagnoses is otherwise invisible: a Clerk token that verifies
 * perfectly but carries no `role` claim is indistinguishable, from the app, from "you are not
 * an admin" — and the fix (add the claim to the JWT template) is in a console nobody thinks to
 * open. This says which of the two it is.
 */
function handleWhoami(body) {
  var who = verifyClerk(body.token);
  if (!who.ok) return fail(who.error);
  return respond({
    ok: true,
    who: { userId: who.uid, name: who.name, role: who.role },
    isAdmin: who.role === 'admin' || who.role === 'admin_utama',
  });
}

/**
 * Replaces whole catalog tabs, under one lock, for a signed-in admin.
 *
 * WHOLE TABS rather than per-row operations, because that is the shape the app already has:
 * every setter in `Draft` is `(prev) => next` over an entire array, so a granular API would be
 * a translation layer with nothing on either side asking for it. These tabs are small — fifty
 * items, fourteen racks — and the write is one `setValues`.
 *
 * The log is NOT among them. Movements are appended and never rewritten (§58.4); an admin who
 * needs to undo one appends a reversal.
 */
/**
 * The detailed tier, for either kind of credential.
 *
 * A PIN session and a Clerk admin token are different things that earn the same read: the
 * marbot at the kiosk needs to see who has the drill, and so does the admin editing the
 * request list. Without this an admin could WRITE `Requests` and never SEE them — the public
 * tier omits that tab entirely (§39) — which is a screen that saves into the dark.
 *
 * It is a POST rather than a GET so the token travels in the body. A JWT in a query string ends
 * up in logs and history; a 60-second lifetime shortens that exposure but does not excuse it.
 */
function handleDetailedRead(body) {
  if (body.token) {
    var who = requireAdmin(body.token);
    if (!who.ok) return fail(who.error);
    return respond({ ok: true, state: readDetailedState() });
  }
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error, { retryAfterMs: session.retryAfterMs });
  return respond({ ok: true, state: readDetailedState() });
}

function handlePutCatalog(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);

  var tabs = body.tabs || {};
  var names = Object.keys(tabs);
  if (!names.length) return fail('no_tabs');
  for (var i = 0; i < names.length; i++) {
    if (WRITABLE_TABS.indexOf(names[i]) === -1) return fail('tab_not_writable', { tab: names[i] });
    if (!Array.isArray(tabs[names[i]])) return fail('tab_not_array', { tab: names[i] });
    if (tabs[names[i]].length > MAX_TAB_ROWS) return fail('too_many_rows', { tab: names[i] });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail('busy');

  try {
    /* The whole point of `rev`: refuse a save built on a catalog somebody else has already
       changed. Merging is not attempted — with whole-tab writes there is nothing to merge
       against, and a silent three-way guess is exactly the kind of confident wrong answer §0
       says is worse than no system. The client re-reads and the admin sees the current state. */
    if (body.rev !== undefined && Number(body.rev) !== catalogRev()) {
      return fail('stale_rev', { rev: catalogRev() });
    }

    for (var t = 0; t < names.length; t++) writeTab(names[t], tabs[names[t]]);
    dropStateCache();

    /* The audit §29 asks for, in `AdminLog` rather than `Transactions`: the movement log's
       eight columns have nowhere to put "renamed a category", and its `type` is a closed union
       the client quarantines anything outside of. One row per save, not per changed field —
       what somebody reading it wants is that an admin changed these tabs, when, and who. */
    adminLog(who, 'catalog_edit', names.map(function (n) { return n + '=' + tabs[n].length; }).join(' '));

    var rev = bumpCatalogRev();
    SpreadsheetApp.flush();
    return respond({ ok: true, rev: rev, wrote: names, by: who.name || who.uid });
  } finally {
    lock.releaseLock();
  }
}


// ---------------------------------------------------------------------------
// The roster — who holds a PIN. Admin only, and a PIN never travels back out.
// ---------------------------------------------------------------------------

function handleListUsers(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  return respond({ ok: true, users: rosterList() });
}

/**
 * Issue or replace somebody's PIN.
 *
 * The reply never contains the PIN, and neither does any log line: the admin who typed it is
 * the one who tells the marbot, and after that the only copy is in that person's head. A PIN
 * that can be read back out of the system is a PIN that will be, eventually, by somebody who
 * should not have it.
 */
function handleSetUserPin(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);

  /* Only the permanent super-admin may create or alter another ADMIN.
     Enforced here rather than by hiding a dropdown: a UI restriction is decoration, and the one
     thing an ordinary admin must not be able to do is quietly promote themselves a colleague —
     or themselves, by renaming their own row into a higher role. */
  var elevating = body.role === 'admin' || body.role === 'admin_utama';
  if (elevating && who.role !== 'admin_utama') return fail('needs_admin_utama');
  if (body.userId && who.role !== 'admin_utama' && rosterIsAdmin(body.userId)) {
    return fail('needs_admin_utama');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail('busy');
  try {
    /* Under the lock, because uniqueness is a check-then-write: two admins issuing "1234" at the
       same moment would both find it free and both write it, and the PIN alone resolves WHO you
       are (Part VII) — so the loser's withdrawals would be recorded as the winner's. */
    var result = rosterSetPin(body.name, body.role, body.pin, body.userId, body.type, body.phone);
    if (!result.ok) return fail(result.error);
    /* `sharedWith` so the screen can say "Budi has this one too" — informational, not a
       refusal: the admin may well want them to share it, and if not they can pick another. */
    return respond({
      ok: true, userId: result.userId, sharedWith: result.sharedWith || [], users: rosterList(),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleSetUserActive(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  // Same rule the other way round: an admin must not be able to switch off another admin.
  if (who.role !== 'admin_utama' && rosterIsAdmin(body.userId)) return fail('needs_admin_utama');
  var result = rosterDisable(body.userId, body.disabled === true);
  if (!result.ok) return fail(result.error);
  return respond({ ok: true, users: rosterList() });
}


// ---------------------------------------------------------------------------
// Filing a request — a PIN is enough. Reading them back is not.
// ---------------------------------------------------------------------------

/**
 * File one purchase or repair request.
 *
 * SESSION-GATED, NOT ADMIN-GATED, and that asymmetry is the point. Reading the Requests tab
 * names who asked, who decided and why (§39) — so it stays behind an admin token. Filing one
 * reveals nothing about anybody else, and the person who needs a new mop is rarely the person
 * with a Clerk password. Requiring an admin to type it in for them is exactly the added
 * bookkeeping §0.0 says to refuse.
 *
 * The narrowness is what makes it safe: it can only APPEND, only to `Requests`, only with
 * status `diajukan`, and `requestedBy` is taken from the verified session rather than the body.
 * A request that could name somebody else as its author would be worse than no request at all.
 */
function handleSubmitRequest(body) {
  /* Either credential. An admin signs in with a Clerk password and may not hold a PIN at all,
     so demanding one would make the person who approves requests the only person who cannot
     file one. Whichever it is, the AUTHOR comes from the verified identity, never the body. */
  var who = body.token ? requireAdmin(body.token) : requireSession(body.session);
  if (!who.ok) return fail(who.error);
  var author = who.userId || who.uid;

  var name = String(body.name || '').trim();
  if (!name) return fail('name_required');
  var reason = String(body.reason || '').trim();
  /* Required, as it is in the app (§95): a request nobody can judge is one somebody has to
     chase the requester about, which is more work for two people than typing it cost one. */
  if (!reason) return fail('reason_required');

  var type = body.type === 'perbaikan' ? 'perbaikan' : 'beli';
  var qty = Number(body.qty);
  if (!(qty > 0)) return fail('bad_qty');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail('busy');
  try {
    /* The CLIENT's id when it sent a usable one, because photos are keyed to it before the
       form opens (`RequestForm` mints it so attachments have somewhere to go). A server-minted
       id would orphan every photo on the device that took it. Shape-checked and collision-
       checked all the same: a client that could name an existing row could append a second one
       wearing its id, and the register would then hold two requests nobody can tell apart. */
    var taken = {};
    readTab('Requests').forEach(function (r) { taken[r.requestId] = true; });
    var wanted = String(body.requestId || '');
    var usable = /^REQ-[A-Za-z0-9_-]{4,40}$/.test(wanted) && !taken[wanted];

    var request = {
      requestId: usable ? wanted : 'REQ-' + Utilities.getUuid().slice(0, 8),
      type: type,
      name: name,
      itemId: body.itemId || '',
      assetId: body.assetId || '',
      qty: String(qty),
      unit: String(body.unit || 'buah'),
      price: body.price === '' || body.price === null || body.price === undefined
        ? '' : String(Number(body.price)),
      reason: reason,
      url: String(body.url || ''),
      /* Always `diajukan`. A submitter deciding their own request is not a workflow. */
      status: 'diajukan',
      requestedBy: author,
      requestedTs: new Date().toISOString(),
      decidedBy: '',
      decidedTs: '',
      note: '',
    };
    appendRow('Requests', request);
    dropStateCache();
    SpreadsheetApp.flush();
    /* The row is NOT echoed back. The submitter cannot read this tab, and handing them their own
       row would be the one hole in that — it is the reply that teaches a client the shape of
       data it is not allowed to fetch. */
    return respond({ ok: true, requestId: request.requestId });
  } finally {
    lock.releaseLock();
  }
}


// ---------------------------------------------------------------------------
// Devices — admin only. The secret leaves exactly once, at enrolment.
// ---------------------------------------------------------------------------

function handleListDevices(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  return respond({ ok: true, devices: deviceList() });
}

/**
 * The reply carries the secret. It is the only reply that ever will, and the screen that
 * receives it shows it as a QR for one person standing in front of it — never a message, never
 * a list somebody can come back to.
 */
function handleEnrollDevice(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  var result = deviceEnroll(body.label);
  if (!result.ok) return fail(result.error);
  return respond({
    ok: true, deviceId: result.deviceId, secret: result.secret, devices: deviceList(),
  });
}

function handleSetDeviceRevoked(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  var result = deviceSetRevoked(body.deviceId, body.revoked === true);
  if (!result.ok) return fail(result.error);
  return respond({ ok: true, devices: deviceList() });
}

function handleRenameDevice(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  var result = deviceRename(body.deviceId, body.label);
  if (!result.ok) return fail(result.error);
  return respond({ ok: true, devices: deviceList() });
}


// ---------------------------------------------------------------------------
// Inviting an admin — admin_utama only, and only ever as `admin`.
// ---------------------------------------------------------------------------

/** The one role check that is not `requireAdmin`: this creates identities, not inventory rows. */
function requireAdminUtama(token) {
  var who = verifyClerk(token);
  if (!who.ok) return who;
  if (who.role !== 'admin_utama') return { ok: false, error: 'needs_admin_utama' };
  return who;
}

function handleListInvitations(body) {
  var who = requireAdminUtama(body.token);
  if (!who.ok) return fail(who.error);
  var result = clerkInvitations();
  if (!result.ok) return fail(result.error, { message: result.detail });
  return respond({ ok: true, invitations: result.invitations });
}

function handleInviteAdmin(body) {
  var who = requireAdminUtama(body.token);
  if (!who.ok) return fail(who.error);

  var result = clerkInvite(body.email, body.role, body.redirectUrl);
  if (!result.ok) return fail(result.error, { message: result.detail });

  // Logged BEFORE anything can go wrong afterwards: who granted whom access is the one fact
  // this feature exists to keep answerable.
  adminLog(who, 'invite_admin', result.email + ' as ' + body.role);

  var listed = clerkInvitations();
  return respond({
    ok: true,
    invitationId: result.invitationId,
    invitations: listed.ok ? listed.invitations : [],
  });
}

function handleRevokeInvitation(body) {
  var who = requireAdminUtama(body.token);
  if (!who.ok) return fail(who.error);

  var result = clerkRevokeInvitation(body.invitationId);
  if (!result.ok) return fail(result.error, { message: result.detail });
  adminLog(who, 'revoke_invitation', String(body.invitationId));

  var listed = clerkInvitations();
  return respond({ ok: true, invitations: listed.ok ? listed.invitations : [] });
}


// ---------------------------------------------------------------------------
// Closing a request — the one write that touches the log AND the catalog.
// ---------------------------------------------------------------------------

/**
 * Mark a request finished or cancelled, and — for a repair — put the unit back on its hook.
 *
 * WHY IT IS ONE OP. Finishing a repair is two facts: the request is closed, and the tool is no
 * longer broken. Sent separately, a failure between them leaves the register saying a thing is
 * fixed that is still marked broken, or the reverse — and nobody would think to check. They land
 * under one lock, or neither does.
 *
 * This is also what makes the connected screen work at all. `setRepair` in the app was a NOOP
 * when connected, because it writes to `Transactions` and only `append` may — so "tandai
 * selesai" silently did nothing, on a screen that can ONLY be opened while connected. The
 * boundary was right; leaving the button there was not.
 */
function handleFinishRequest(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);

  var requestId = String(body.requestId || '');
  if (!requestId) return fail('no_request');
  var status = body.status === 'dibatalkan' ? 'dibatalkan' : 'selesai';

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail('busy');

  try {
    var now = new Date();
    var appended = null;

    /* The movement FIRST. If the request update then fails, the log holds a status change that
       is true — the tool really is back — and the request is merely still open, which somebody
       can see and fix. The other order leaves a closed request over a tool the register still
       calls broken, which nobody looks for. */
    if (body.assetId && body.toStatus) {
      var txn = {
        txnId: Utilities.getUuid(),
        clientTxnId: 'finish-' + requestId,
        ts: now.toISOString(),
        type: 'status_change',
        itemId: body.itemId || '',
        assetId: String(body.assetId),
        locationId: '',
        qtyDelta: 0,
        recipient: '',
        actorUserId: who.uid,
        condition: '',
        note: body.note || '',
        toStatus: String(body.toStatus),
        reversesTxnId: '',
      };
      var built = txnRow(txn);
      if (!built.ok) return fail('column_not_built', { column: built.column });

      var sheet = txnSheet();
      /* Idempotent on the request: pressing "selesai" twice, or a retry after a timeout, must
         not append a second status change. */
      if (!existingClientTxnIds(sheet)[txn.clientTxnId]) {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, TXN_COLUMNS.length).setValues([built.row]);
        appended = txn;
      }
    }

    var patch = {
      status: status,
      decidedBy: who.uid,
      decidedTs: now.toISOString(),
    };
    if (body.note) patch.note = String(body.note);
    if (!updateRowById('Requests', 'requestId', requestId, patch)) return fail('no_such_request');

    dropStateCache();
    SpreadsheetApp.flush();
    return respond({ ok: true, appended: appended, status: status });
  } finally {
    lock.releaseLock();
  }
}


/**
 * Hand the admin a PIN that is free.
 *
 * Admin-gated like the rest of the roster. Revealing an UNUSED PIN tells an attacker which code
 * does not work, which is the opposite of useful — but it also names how many are left, so it
 * stays behind the same door as everything else here.
 */
function handleSuggestPin(body) {
  var who = requireAdmin(body.token);
  if (!who.ok) return fail(who.error);
  var pin = rosterFreePin();
  if (!pin) return fail('no_free_pin');
  return respond({ ok: true, pin: pin });
}
