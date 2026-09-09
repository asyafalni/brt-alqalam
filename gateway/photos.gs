/**
 * Photos, in Drive, behind this gateway.
 *
 * `data/drivePhotos.ts` carries the reasoning; this is the half of it that runs on Google. The
 * four constraints it names are all load-bearing here:
 *
 *   a. NO BINARY BODY. A CORS simple request means `text/plain`, so the upload arrives as
 *      base64 inside the JSON. The client downscales first for exactly this reason.
 *   b. SESSION IN THE BODY. Same reason every other op takes it there.
 *   c. THE FOLDER IS NEVER LINK-PUBLIC, even though READING is now open.
 *
 *      Owner's call: a photo of a jerrycan is not a secret, so looking needs no PIN — writing
 *      still does. Those are two different things and only one of them was ever the risk.
 *
 *      What that does NOT mean is flipping the Drive folder to "anyone with the link". Serving
 *      bytes through this script puts photos in the same tier as item names and rack codes: an
 *      exposure bounded by the `/exec` URL, and revocable by rotating the deployment. A public
 *      Drive URL is permanent, lives independently of this gateway, and would survive any later
 *      decision to lock things down again. The cheaper path is the one that cannot be undone.
 *   d. ONE PHOTO PER CALL. The 6-minute execution ceiling is generous for one and fatal for a
 *      backfill; there is deliberately no bulk endpoint.
 *
 * The JOIN lives in the sheet, like everything else: a `Photos` tab maps photoId to the Drive
 * file, so the register remains readable without touching Drive at all.
 */

/** Script Property holding the folder id. Looked up by id, never by name. */
var PHOTO_FOLDER_PROP = 'PHOTO_FOLDER_ID';

/** Matches the client's own ceiling (`domain/photos.js`), enforced here because only here can. */
var MAX_PHOTOS_PER_ITEM = 6;

/**
 * Base64 inflates by ~4/3, and Apps Script's POST ceiling is the real limit. 8 MB of base64 is
 * roughly a 6 MB image — far above what the client sends after downscaling, and low enough
 * that a mis-sized upload fails as a clear error instead of a timeout.
 */
var MAX_PHOTO_BASE64 = 8 * 1024 * 1024;

/**
 * The folder, created on first use, through the DRIVE API rather than `DriveApp`.
 *
 * `DriveApp.createFolder` demands `https://www.googleapis.com/auth/drive` — read and write
 * every file in the owner's account — because it is a convenience wrapper that can enumerate.
 * This script answers `ANYONE_ANONYMOUS`, so that is a blast radius it has no business holding.
 * Drive API v3 honours `drive.file`: create files, and touch only files this app created.
 *
 * By ID from a Script Property, never by searching for a name: a name search would need to read
 * the whole Drive, which `drive.file` does not allow — and a second folder made by hand would
 * silently split the photos in two.
 */
function photoFolderId() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PHOTO_FOLDER_PROP);
  if (id) {
    try {
      var found = Drive.Files.get(id, { fields: 'id,trashed' });
      if (found && !found.trashed) return found.id;
    } catch (e) {
      // Deleted by hand. Fall through and make a new one rather than failing every upload for
      // ever with an error nobody can act on.
    }
  }
  var folder = Drive.Files.create({
    name: 'BRT Inventaris — Foto',
    mimeType: 'application/vnd.google-apps.folder',
  }, null, { fields: 'id' });
  props.setProperty(PHOTO_FOLDER_PROP, folder.id);
  return folder.id;
}

/**
 * Read a file's bytes.
 *
 * `Drive.Files.get(id, {alt:'media'})` is not available through the advanced service, so this
 * goes to the REST endpoint with the script's own OAuth token — which carries exactly the
 * scopes granted, `drive.file` among them, and therefore reaches only files this app created.
 */
function photoBlob(fileId) {
  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
    {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    },
  );
  if (res.getResponseCode() !== 200) throw new Error('drive_read_' + res.getResponseCode());
  return res.getBlob();
}

/**
 * Forces the Drive consent prompt, and proves the scope is actually sufficient.
 *
 * Run this ONCE from the editor after deploying. It exists because of a lesson this project
 * already paid for: `checkSpreadsheet()` was offered as the way to grant the UrlFetch scope and
 * it never called out, so it prompted for nothing and reported a clean log twice. A function
 * that is supposed to trigger a consent screen has to TOUCH the service.
 */
function authorizeDrive() {
  var id = photoFolderId();
  Logger.log('OK. Folder foto dibuat/ditemukan: ' + id);
  Logger.log('Drive siap. Tidak perlu dijalankan lagi.');
}

var PHOTO_COLUMNS = ['photoId', 'itemId', 'driveFileId', 'takenTs', 'width', 'height',
  'bytes', 'caption'];

/**
 * The join tab, created on first use — like `AdminLog`, and for the same reason.
 *
 * `REQUIRED_TABS` exists to fail loudly on a spreadsheet imported without one of the tabs a
 * PERSON fills in: a missing `Stock` means somebody's counts are gone. Nobody types into this
 * one. It is the gateway's own bookkeeping, so demanding it be created by hand first would
 * turn "upload a photo" into "read an error, open Sheets, type eight headers" — and the first
 * person to meet that is a marbot holding a phone in a gudang.
 */
function photoSheet() {
  var sheet = book().getSheetByName('Photos');
  if (!sheet) {
    sheet = book().insertSheet('Photos');
    sheet.getRange(1, 1, 1, PHOTO_COLUMNS.length).setValues([PHOTO_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function photoRows() {
  photoSheet();
  return readTab('Photos');
}

/** OPEN, like `?op=state`: a photo of a jerrycan sits in the same tier as its name. */
function handleListPhotos(body) {
  var itemId = String(body.itemId || '');
  if (!itemId) return fail('no_item');

  var out = [];
  var rows = photoRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].itemId) !== itemId) continue;
    out.push({
      photoId: rows[i].photoId,
      itemId: rows[i].itemId,
      takenTs: Number(rows[i].takenTs) || 0,
      width: Number(rows[i].width) || 0,
      height: Number(rows[i].height) || 0,
      bytes: Number(rows[i].bytes) || 0,
      caption: rows[i].caption || '',
    });
  }
  return respond({ ok: true, photos: out });
}

function handlePutPhoto(body) {
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error);

  var itemId = String(body.itemId || '');
  if (!itemId) return fail('no_item');

  var data = String(body.dataBase64 || '');
  if (!data) return fail('no_data');
  if (data.length > MAX_PHOTO_BASE64) return fail('too_large');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail('busy');

  try {
    /* Counted under the lock, because the ceiling is a RULE and a check-then-write outside one
       is two devices photographing the same shelf into seven rows. */
    var rows = photoRows();
    var mine = 0;
    for (var i = 0; i < rows.length; i++) if (String(rows[i].itemId) === itemId) mine += 1;
    if (mine >= MAX_PHOTOS_PER_ITEM) return fail('too_many');

    var mime = String(body.mimeType || 'image/jpeg');
    var photoId = 'PH-' + Utilities.getUuid().slice(0, 12).toUpperCase();
    var blob = Utilities.newBlob(Utilities.base64Decode(data), mime, photoId + '.jpg');
    var file = Drive.Files.create(
      { name: photoId + '.jpg', parents: [photoFolderId()] },
      blob,
      { fields: 'id' },
    );

    var takenTs = Number(body.takenTs) || Date.now();
    /* Written straight to the sheet rather than through `appendRow`, which validates against
       `REQUIRED_TABS` — the same reason `adminLog` does not use it either. This tab is the
       gateway's own bookkeeping and is not on that list. */
    var sheet = photoSheet();
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, PHOTO_COLUMNS.length).setValues([[
      photoId,
      itemId,
      file.id,
      takenTs,
      Number(body.width) || 0,
      Number(body.height) || 0,
      Number(body.bytes) || blob.getBytes().length,
      String(body.caption || ''),
    ]]);

    adminLog({ name: session.name, uid: session.userId }, 'photo_add', itemId + ' ' + photoId);

    return respond({
      ok: true,
      photo: {
        photoId: photoId,
        itemId: itemId,
        takenTs: takenTs,
        width: Number(body.width) || 0,
        height: Number(body.height) || 0,
        bytes: Number(body.bytes) || blob.getBytes().length,
        caption: String(body.caption || ''),
      },
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * The bytes, base64. No session — see constraint (c).
 *
 * Still not a Drive link and still not a public file: the exposure stays bounded by the `/exec`
 * URL and revocable with it. The client caches what comes back so a photo crosses the wire once
 * per device, which is what makes serving bytes through a 1.5-second gateway acceptable at all.
 */
function handleGetPhoto(body) {
  var photoId = String(body.photoId || '');
  if (!photoId) return fail('no_photo');

  var rows = photoRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].photoId) !== photoId) continue;
    try {
      var blob = photoBlob(String(rows[i].driveFileId));
      return respond({
        ok: true,
        mimeType: blob.getContentType(),
        dataBase64: Utilities.base64Encode(blob.getBytes()),
      });
    } catch (e) {
      // The row survives a file deleted by hand in Drive. Say which of the two is missing.
      return fail('file_missing', { photoId: photoId });
    }
  }
  return fail('not_found');
}

function handleDeletePhoto(body) {
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error);

  var photoId = String(body.photoId || '');
  if (!photoId) return fail('no_photo');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail('busy');

  try {
    var sheet = photoSheet();
    var rows = photoRows();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].photoId) !== photoId) continue;
      try {
        Drive.Files.update({ trashed: true }, String(rows[i].driveFileId));
      } catch (e) {
        /* Already gone from Drive. The row still has to go, or the list keeps offering a photo
           that cannot be fetched — which is worse than the orphan file this leaves behind. */
      }
      // +2: one for the header, one because sheet rows are 1-based.
      sheet.deleteRow(i + 2);
      dropStateCache();
      return respond({ ok: true });
    }
    return fail('not_found');
  } finally {
    lock.releaseLock();
  }
}
