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

function book() {
  // A bound script reaches its own spreadsheet without any extra authorisation. If this
  // script is ever detached, set SPREADSHEET_ID in Script Properties instead.
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheetNamed(name) {
  var sheet = book().getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" not found. Import it from sheets/.');
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
