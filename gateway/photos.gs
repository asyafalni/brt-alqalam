/**
 * Photos, in Drive, behind this gateway.
 *
 * `data/drivePhotos.ts` carries the reasoning; this is the half of it that runs on Google. The
 * four constraints it names are all load-bearing here:
 *
 *   a. NO BINARY BODY. A CORS simple request means `text/plain`, so the upload arrives as
 *      base64 inside the JSON. The client downscales first for exactly this reason.
 *   b. SESSION IN THE BODY. Same reason every other op takes it there.
 *   c. THE FOLDER IS NEVER LINK-PUBLIC. Bytes are served back through this script, under a
 *      session, so a photo of a rack with a name on a whiteboard cannot become a world-readable
 *      URL (§12.4). This is the whole reason there is no `?op=photo` shortcut that returns a
 *      Drive link.
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
 * The folder, created on first use.
 *
 * By ID from a Script Property, never by searching Drive for a name: a name search needs to
 * read the whole Drive, which the narrow `drive.file` scope deliberately does not allow — and
 * a second folder called "BRT Inventaris" made by hand would silently split the photos in two.
 */
function photoFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PHOTO_FOLDER_PROP);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // Deleted or trashed by hand. Fall through and make a new one rather than failing every
      // upload for ever with an error nobody can act on.
    }
  }
  var folder = DriveApp.createFolder('BRT Inventaris — Foto');
  props.setProperty(PHOTO_FOLDER_PROP, folder.getId());
  return folder;
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
  var folder = photoFolder();
  Logger.log('OK. Folder foto: ' + folder.getName() + ' (' + folder.getId() + ')');
  Logger.log('Drive siap. Tidak perlu dijalankan lagi.');
}

function photoRows() {
  return readTab('Photos');
}

function handleListPhotos(body) {
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error);

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
    var file = photoFolder().createFile(blob);

    var takenTs = Number(body.takenTs) || Date.now();
    appendRow('Photos', {
      photoId: photoId,
      itemId: itemId,
      driveFileId: file.getId(),
      takenTs: takenTs,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
      bytes: Number(body.bytes) || blob.getBytes().length,
      caption: String(body.caption || ''),
    });

    adminLog(session.who || { name: session.actorName, uid: session.actorUserId },
      'photo_add', itemId + ' ' + photoId);

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
 * The bytes, base64, under a session.
 *
 * Not a Drive link, and not a public file — see constraint (c). The client caches what comes
 * back so a photo crosses the wire once per device, which is what makes serving bytes through
 * a 1.5-second gateway acceptable at all.
 */
function handleGetPhoto(body) {
  var session = requireSession(body.session);
  if (!session.ok) return fail(session.error);

  var photoId = String(body.photoId || '');
  if (!photoId) return fail('no_photo');

  var rows = photoRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].photoId) !== photoId) continue;
    try {
      var file = DriveApp.getFileById(String(rows[i].driveFileId));
      var blob = file.getBlob();
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
    var sheet = sheetNamed('Photos');
    var rows = photoRows();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].photoId) !== photoId) continue;
      try {
        DriveApp.getFileById(String(rows[i].driveFileId)).setTrashed(true);
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
