/**
 * The spreadsheet, read and appended.
 *
 * The gateway does NOT compute stock. Current quantities and statuses are folded from the
 * event log by the same pure reducer on every client (domain/deriveState.ts) — derive, don't
 * mutate. A server that also computed them would be a second source of truth, and the two
 * would drift the first time either changed.
 *
 * STOK AWAL / STOK AKHIR are likewise not stored: they are display snapshots the reducer
 * produces at render time (design doc §30).
 */

/*
 * `locationId` is not optional decoration — it says WHICH SHELF a movement came off, and the
 * whole of Part XXI rests on it. Without the column the gateway appends every row without one,
 * so every withdrawal folds onto the unplaced pile and the register quietly reports that
 * nothing was ever taken from any rack.
 *
 * It was missing here, in `sheets/Transactions.csv`, and from `checkSpreadsheet` — and the
 * checker therefore reported "header matches", because both sides were wrong in the same way.
 * A checker that agrees with the mistake is the deepest version of this bug.
 */
var TXN_COLUMNS = [
  'txnId', 'clientTxnId', 'ts', 'type', 'itemId', 'assetId', 'locationId', 'qtyDelta',
  'recipient', 'actorUserId', 'condition', 'note', 'toStatus', 'reversesTxnId',
];

/** Columns that name a person. Stripped from the public tier — see §12.4 and §39. */
var PII_COLUMNS = ['recipient', 'actorUserId'];

/*
 * The open spreadsheet, opened ONCE per execution.
 *
 * `sheetNamed()` called this for every tab, so one `state` read did six `getProperty` lookups
 * and six `openById` calls — and both are round trips to Google, not local work. Measured
 * against the live deployment: `op=ping`, which touches no spreadsheet at all, costs 1.43s of
 * fixed Apps Script overhead, while `op=state` cost 4.40s. Most of that gap was re-opening a
 * file that was already open.
 *
 * Execution-scoped, which is the only scope there is: Apps Script tears the environment down
 * between requests, so this can never go stale across a write.
 */
var BOOK_ = null;

function book() {
  // A bound script reaches its own spreadsheet without any extra authorisation. If this
  // script is ever detached, set SPREADSHEET_ID in Script Properties instead.
  if (BOOK_) return BOOK_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  BOOK_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return BOOK_;
}

/** Tabs too — `getSheetByName` is another round trip, not a map lookup. */
var SHEETS_ = {};

function sheetNamed(name) {
  if (SHEETS_[name]) return SHEETS_[name];
  var sheet = book().getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" not found. Import it from sheets/.');
  SHEETS_[name] = sheet;
  return sheet;
}

function txnSheet() { return sheetNamed('Transactions'); }

/** Rows as objects keyed by the header row. Blank rows are skipped, not returned as empties. */
function readTab(name) {
  var values = sheetNamed(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      var v = row[c];
      // Dates come back as Date objects; the client's parser expects strict ISO, and a
      // locale-formatted string would be quarantined there (correctly — "9/6/2026" is
      // ambiguous). Normalising here keeps that guarantee end to end.
      obj[header[c]] = (v instanceof Date) ? v.toISOString() : String(v);
    }
    out.push(obj);
  }
  return out;
}

/**
 * The idempotency index. `clientTxnId` is the second column, so only that column is read —
 * pulling the whole log back on every append would be the first thing to get slow.
 */
function existingClientTxnIds(sheet) {
  var last = sheet.getLastRow();
  var seen = {};
  if (last < 2) return seen;
  var column = TXN_COLUMNS.indexOf('clientTxnId') + 1;
  var values = sheet.getRange(2, column, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0]);
    if (id) seen[id] = true;
  }
  return seen;
}

// ---------------------------------------------------------------------------
// The two read tiers (design doc §16, §39)
// ---------------------------------------------------------------------------

/**
 * PII-FREE. Safe for the public dashboard and for any unauthenticated screen.
 * Person-naming columns are removed, not blanked in place, so a client cannot accidentally
 * render an empty "PENGAMBIL" column and imply nobody took it.
 */
function readPublicState() {
  return {
    categories: readTab('Categories'),
    locations: readTab('Locations'),
    items: readTab('Items'),
    /* Quantity does NOT live on an item any more (design doc Part XXI): a thing kept on two
       racks has two figures, and `Items` carries none of them. Without this tab the public
       dashboard would show a catalog with every count at zero — which reads as an empty
       masjid rather than as a missing tab. */
    stock: readTab('Stock'),
    instances: readTab('AssetInstances'),
    txns: readTab('Transactions').map(function (t) {
      var copy = {};
      Object.keys(t).forEach(function (k) {
        if (PII_COLUMNS.indexOf(k) === -1) copy[k] = t[k];
      });
      return copy;
    }),
    rev: catalogRev(),
    serverTs: new Date().toISOString(),
    tier: 'public',
  };
}

/** Everything, including who has what. Requires a valid session. */
function readDetailedState() {
  return {
    categories: readTab('Categories'),
    locations: readTab('Locations'),
    items: readTab('Items'),
    stock: readTab('Stock'),
    instances: readTab('AssetInstances'),
    /* Requests are in THIS tier only, never the public one: `requestedBy`, `decidedBy` and the
       decision note all name real people, and §39 puts the public dashboard on stock levels,
       low-stock and status counts alone. */
    requests: readTab('Requests'),
    txns: readTab('Transactions'),
    rev: catalogRev(),
    serverTs: new Date().toISOString(),
    tier: 'detailed',
  };
}

/**
 * Every tab this gateway reads, with the header each one must have.
 *
 * The lists are the ones in `sheets/*.csv`, and they are checked column FOR column rather than
 * "does a tab exist": a header that is merely close quarantines every row underneath it, and
 * that is discovered months later, from the shelf.
 */
var REQUIRED_TABS = {
  Categories: ['categoryId', 'name', 'order', 'active'],
  Locations: ['locationId', 'code', 'name', 'zone', 'order', 'active', 'artId'],
  Items: ['itemId', 'barcode', 'name', 'categoryId', 'kind', 'unit', 'trackBy', 'minStock',
    'active', 'keterangan', 'artId'],
  Stock: ['itemId', 'locationId', 'initialStock'],
  AssetInstances: ['assetId', 'itemId', 'label', 'acquiredTs', 'active'],
  Requests: ['requestId', 'type', 'name', 'itemId', 'assetId', 'qty', 'unit', 'price', 'reason',
    'url', 'status', 'requestedBy', 'requestedTs', 'decidedBy', 'decidedTs', 'note'],
  Transactions: TXN_COLUMNS,
};

/**
 * Run from the editor after importing the tabs — fails loudly if anything is missing.
 *
 * It used to check five tabs and one header, and reported OK while `Stock` and `Requests` went
 * unexamined — the two newest, and the ones most likely to be absent from a sheet imported
 * before they existed. A checker that passes on a sheet the app cannot use is worse than no
 * checker: it converts a loud failure into a quiet one.
 */
function checkSpreadsheet() {
  var problems = 0;

  Object.keys(REQUIRED_TABS).forEach(function (name) {
    var wanted = REQUIRED_TABS[name];
    var sheet;
    try {
      sheet = sheetNamed(name);
    } catch (e) {
      Logger.log('FAIL ' + name + ' — ' + e.message);
      problems += 1;
      return;
    }

    var rows = readTab(name);
    var headers = sheet.getRange(1, 1, 1, wanted.length).getValues()[0];
    var mismatch = wanted.filter(function (c, i) { return String(headers[i]).trim() !== c; });

    if (mismatch.length) {
      Logger.log('FAIL ' + name + ' — header does not match at: ' + mismatch.join(', '));
      Logger.log('       expected: ' + wanted.join(','));
      Logger.log('       found:    ' + headers.join(','));
      problems += 1;
    } else {
      Logger.log('OK   ' + name + ' — ' + rows.length + ' rows, header matches');
    }
  });

  Logger.log(problems
    ? problems + ' PROBLEM(S). Fix these before deploying — the app cannot read past them.'
    : 'All ' + Object.keys(REQUIRED_TABS).length + ' tabs present and correct.');
}

// ---------------------------------------------------------------------------
// Catalog writes — admin only (design doc Part XXV).
// ---------------------------------------------------------------------------

/*
 * The tabs an admin may rewrite, and the ONE that is deliberately absent.
 *
 * `Transactions` is not here and must never be: it is the append-only core the whole register
 * derives from (§58.4), and a "put" that could replace it would turn one mistyped request body
 * into a silently rewritten history. Movements have exactly one way in — `append`.
 *
 * `AssetInstances` is also absent, but for a duller reason: nothing in the app edits it, so
 * exposing it would be a write path with no caller and no test.
 */
var WRITABLE_TABS = ['Categories', 'Locations', 'Items', 'Stock', 'Requests'];

/** Guards against a runaway body rewriting the sheet with nonsense. */
var MAX_TAB_ROWS = 5000;

/**
 * One list, one guard.
 *
 * `TXN_COLUMNS` and the object a caller builds are two lists that must agree, and the last time
 * they drifted the result was a silently empty `locationId` on every movement. Every writer goes
 * through here so there is one place that can catch it.
 */
function txnRow(txn) {
  for (var c = 0; c < TXN_COLUMNS.length; c++) {
    if (!(TXN_COLUMNS[c] in txn)) return { ok: false, column: TXN_COLUMNS[c] };
  }
  return { ok: true, row: TXN_COLUMNS.map(function (c) { return txn[c]; }) };
}

/**
 * A counter that changes whenever the catalog does.
 *
 * Two admins editing the same tab from two phones is not hypothetical — it is the normal case
 * for a stock-take, where one walks the gudang while another tidies names at a desk. Without
 * this, the second save silently discards the first, and nobody finds out because both screens
 * look right. The client sends the `rev` it read; a mismatch is refused, not merged.
 */
function catalogRev() {
  return Number(PropertiesService.getScriptProperties().getProperty('CATALOG_REV') || '0');
}

function bumpCatalogRev() {
  var next = catalogRev() + 1;
  PropertiesService.getScriptProperties().setProperty('CATALOG_REV', String(next));
  return next;
}

/**
 * Replaces a tab's data rows, keeping its header.
 *
 * Column ORDER comes from `REQUIRED_TABS`, never from the incoming object's key order: a client
 * that serialises its keys differently would otherwise write every value into the wrong column,
 * which reads as corrupted data rather than as a bad request. Unknown keys are dropped and
 * missing ones written blank, so a client one version behind degrades instead of failing.
 */
function writeTab(name, rows) {
  var header = REQUIRED_TABS[name];
  if (!header) throw new Error('Tab "' + name + '" is not writable.');
  var sheet = sheetNamed(name);
  var values = rows.map(function (r) {
    return header.map(function (col) {
      var v = r[col];
      return (v === null || v === undefined) ? '' : String(v);
    });
  });

  // Clear only the data, never the header: rewriting row 1 would let a client rename the
  // columns, and `checkSpreadsheet` would then be the only thing standing between that and a
  // register whose every row is quarantined.
  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, header.length).clearContent();
  if (values.length) sheet.getRange(2, 1, values.length, header.length).setValues(values);
}

/**
 * Append one row to a catalog tab, without touching anything already in it.
 *
 * Distinct from `writeTab`, which REPLACES a tab and is admin-only. This is what lets somebody
 * with only a PIN file a purchase request: inserting your own row reveals nothing about anybody
 * else's, while reading the tab would reveal who asked for what and who turned it down (§39).
 * Narrower permission, narrower operation — it cannot edit or delete a thing.
 */
function appendRow(name, row) {
  var header = REQUIRED_TABS[name];
  if (!header) throw new Error('Tab "' + name + '" is not writable.');
  var sheet = sheetNamed(name);
  var values = header.map(function (col) {
    var v = row[col];
    return (v === null || v === undefined) ? '' : String(v);
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, header.length).setValues([values]);
}


// ---------------------------------------------------------------------------
// Caching the public read.
// ---------------------------------------------------------------------------

/*
 * WHY. Measured on the live deployment: `op=ping`, which touches no spreadsheet, costs 1.43s of
 * fixed Apps Script overhead; `op=state` cost 4.40s, and 3.44s after the spreadsheet handle was
 * memoised. The remaining ~2s is six `getDataRange().getValues()` round trips for a register of
 * fifty items — it is per-CALL cost, not per-row, so it will not improve as the data shrinks and
 * will barely worsen as it grows.
 *
 * A kiosk polls every 60s and several devices poll independently, so the same six reads are
 * repeated constantly for a register that changes a few times a day. Caching the assembled
 * payload turns most of those into the 1.43s floor.
 *
 * SHORT, AND INVALIDATED ON EVERY WRITE. 25 seconds is well inside the 60s poll, so a device
 * still sees a change on its next poll rather than a cache expiry later — and any append,
 * catalog write or request drops the entry outright, so a movement recorded on one tablet is
 * visible to the next reader immediately rather than up to 25s later.
 */
var STATE_CACHE_KEY = 'state:public';
var STATE_CACHE_SECONDS = 25;

/** CacheService refuses items over 100kB. Bigger registers simply go uncached, never truncated. */
var STATE_CACHE_MAX = 90 * 1024;

function cachedPublicState() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(STATE_CACHE_KEY);
  if (hit) return hit;

  var body = JSON.stringify(readPublicState());
  if (body.length <= STATE_CACHE_MAX) cache.put(STATE_CACHE_KEY, body, STATE_CACHE_SECONDS);
  return body;
}

/** Called by every write. Cheap, and the alternative is showing somebody a stale shelf. */
function dropStateCache() {
  CacheService.getScriptCache().remove(STATE_CACHE_KEY);
}


// ---------------------------------------------------------------------------
// The admin log — everything that is not a movement.
// ---------------------------------------------------------------------------

/*
 * WHY IT IS NOT IN `Transactions`. HISTORI DATA has eight stock-shaped columns and nowhere to
 * put "renamed a category" or "invited an admin" (§71.3). Worse, the client parses `type` with
 * a closed union, so a `catalog_edit` row written into that tab is QUARANTINED on arrival — the
 * audit trail would have been discarded by the thing meant to read it. No such row exists in
 * the live sheet yet only because no admin had saved a catalog change through the app.
 *
 * The tab is created on demand rather than added to the setup checklist. A missing audit log is
 * the kind of thing nobody notices until they need it, and one more manual step is one more way
 * for a deployment to be subtly incomplete.
 */
var ADMIN_LOG_COLUMNS = ['ts', 'actorUserId', 'actorName', 'action', 'detail'];

function adminLogSheet() {
  var sheet = book().getSheetByName('AdminLog');
  if (!sheet) {
    sheet = book().insertSheet('AdminLog');
    sheet.getRange(1, 1, 1, ADMIN_LOG_COLUMNS.length).setValues([ADMIN_LOG_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Append-only, like the movement log, and for the same reason: it is a record, not a state. */
function adminLog(who, action, detail) {
  var sheet = adminLogSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, ADMIN_LOG_COLUMNS.length).setValues([[
    new Date().toISOString(),
    who.uid || who.userId || '',
    who.name || '',
    String(action),
    String(detail || ''),
  ]]);
}


/**
 * Change some fields of one row, found by its id column.
 *
 * Narrower than `writeTab` on purpose. Closing a repair changes one request and appends one
 * movement; doing it by rewriting the whole Requests tab would make a two-field edit race every
 * other admin editing anything, and would need the client to hold the entire tab to change a
 * status. Returns false when the id is not there, so a caller can refuse rather than no-op.
 */
function updateRowById(name, idColumn, id, patch) {
  var header = REQUIRED_TABS[name];
  if (!header) throw new Error('Tab "' + name + '" is not writable.');
  var idIndex = header.indexOf(idColumn);
  if (idIndex === -1) throw new Error('No column "' + idColumn + '" in ' + name + '.');

  var sheet = sheetNamed(name);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idIndex]) !== String(id)) continue;
    var row = values[r].slice();
    for (var c = 0; c < header.length; c++) {
      if (Object.prototype.hasOwnProperty.call(patch, header[c])) {
        row[c] = patch[header[c]] === null || patch[header[c]] === undefined
          ? '' : String(patch[header[c]]);
      }
    }
    sheet.getRange(r + 1, 1, 1, header.length).setValues([row]);
    return true;
  }
  return false;
}
