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

var TXN_COLUMNS = [
  'txnId', 'clientTxnId', 'ts', 'type', 'itemId', 'assetId', 'qtyDelta',
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
    instances: readTab('AssetInstances'),
    txns: readTab('Transactions'),
    serverTs: new Date().toISOString(),
    tier: 'detailed',
  };
}

/** Run from the editor after importing the tabs — fails loudly if anything is missing. */
function checkSpreadsheet() {
  ['Categories', 'Locations', 'Items', 'AssetInstances', 'Transactions'].forEach(function (name) {
    try {
      var rows = readTab(name);
      Logger.log('OK   ' + name + ' — ' + rows.length + ' rows');
    } catch (e) {
      Logger.log('FAIL ' + name + ' — ' + e.message);
    }
  });
  var headers = txnSheet().getRange(1, 1, 1, TXN_COLUMNS.length).getValues()[0];
  var mismatch = TXN_COLUMNS.filter(function (c, i) { return String(headers[i]).trim() !== c; });
  Logger.log(mismatch.length
    ? 'FAIL Transactions header mismatch at: ' + mismatch.join(', ')
    : 'OK   Transactions header matches');
}
