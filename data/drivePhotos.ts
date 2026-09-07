// PLACEHOLDER — NOT IMPLEMENTED. This file is a design note kept next to the code it describes,
// so that whoever builds the shared photo tier does not have to re-derive the constraints.
//
// It exports nothing. There is no shim here to accidentally wire up.
//
// ---------------------------------------------------------------------------
// 1. Why photos cannot live in the spreadsheet
// ---------------------------------------------------------------------------
//
// The source of truth is a Google Sheet (design doc §1, constraint 1), and a sheet cell holds
// text. A JPEG is not text, and base64 in a cell is not a workaround: Sheets caps a cell at
// 50,000 characters, which is under 37 KB of binary — smaller than a thumbnail — and the read
// path pulls the whole Items table as CSV on every load, so even if it fit, every screen would
// download every photo of every item before showing anything. The register stays in the sheet;
// the pixels go beside it, joined by `photoId`. That is the whole reason `PhotoStore` is a
// separate port (`photoStore.ts`) instead of a field on `CatalogRepository`.
//
// (The `=IMAGE()` formula is not an answer either — it *displays* a picture the sheet does not
// hold, and needs a public URL to point at, which is the very thing we would be building.)
//
// ---------------------------------------------------------------------------
// 2. Why Google Drive behind the gateway is the intended path
// ---------------------------------------------------------------------------
//
// It stays inside the constraint that we operate no server (§1, constraint 3) and costs
// nothing: Drive is already the account that owns the sheet, `DriveApp` is available to the
// same Apps Script project that is already the gateway, and consumer-account quotas — 20,000
// UrlFetch/day, 90 minutes of trigger runtime/day (docs/GATEWAY-FINDINGS.md §0) — are far
// beyond a gudang photographed once and touched occasionally afterwards. Nothing new is
// signed up for, and nothing new is paid for.
//
// It must go THROUGH the gateway rather than direct from the browser, for two reasons that are
// already settled elsewhere in the design:
//   - A browser cannot hold a Drive credential. Direct upload would mean shipping an OAuth
//     client or an API key to a kiosk, and §64.2 already refuses to put Clerk's secret-holding
//     code on the marbot path for the same reason.
//   - The gateway is the only component that holds secrets and the only writer (gateway/Code.gs).
//     Photos should not become the exception that opens a second write path.
//
// `indexedDbPhotos.ts` does NOT become obsolete when this exists. It stays as the offline
// capture buffer — the stock-take happens where the wifi is worst — and Drive becomes the
// shared tier that makes a photo visible on the admin's laptop and in the management report.
// Expect the eventual composition to be a sync wrapper over both, not a replacement.
//
// ---------------------------------------------------------------------------
// 3. Gateway endpoints this would need
// ---------------------------------------------------------------------------
//
// Following the existing shapes in gateway/Code.gs — `doGet(op=…)` and `doPost({op:…})`, every
// response text/plain JSON, because a CORS simple request is the only thing an Apps Script web
// app can answer (GATEWAY-FINDINGS.md §1: no doOptions, and TextOutput cannot set headers):
//
//   POST { op: 'putPhoto', session, itemId, caption?, mimeType, dataBase64 }
//        -> { ok: true, photo: { photoId, itemId, takenTs, width, height, bytes } }
//        Writes with DriveApp.createFile(Utilities.newBlob(...)) into one folder, and appends a
//        row to a `Photos` sheet (photoId · itemId · driveFileId · takenTs · w · h · bytes ·
//        caption) so the join lives in the source of truth like everything else.
//
//   GET  ?op=photos&itemId=…            -> { ok: true, photos: [ …metadata… ] }
//        Metadata only. Never blobs — this is the call a list screen makes.
//
//   GET  ?op=photo&photoId=…&session=…  -> the bytes, or a short-lived URL to them
//   POST { op: 'deletePhoto', session, photoId }  -> { ok: true }
//
// Four constraints that will bite whoever writes this, all of them already documented:
//
//   a. NO MULTIPART, NO BINARY BODY. A simple request means Content-Type text/plain, so the
//      upload is base64 inside the JSON body — roughly +33% — and Apps Script's POST payload
//      ceiling then sets the real per-photo limit. This is precisely why `indexedDbPhotos.ts`
//      downscales to ~200–400 KB: a 6 MB original could not be posted at all.
//   b. SESSION IN THE BODY, never a header — same finding. The GET variants have to carry it
//      as a query parameter, which is why a photo fetch should return a short-lived URL rather
//      than putting a session token in an <img src> that lands in browser history.
//   c. SHARING IS THE PRIVACY DECISION. Making Drive files link-public would give every photo a
//      world-readable URL, and §12.4 is explicit that the PII-free tier is a deliberate,
//      narrow list (stock levels, low-stock, status counts). A photo of a rack can show a
//      name on a whiteboard. Serve bytes through the gateway, or keep the files private and
//      mint expiring links; do not flip the folder to "anyone with the link".
//   d. 6-MINUTE EXECUTION LIMIT per call. Fine for one photo, fatal for a bulk backfill — that
//      belongs in a time-driven trigger draining a queue, not in one request.
//
// ---------------------------------------------------------------------------
// 4. Before building it, apply §0.0
// ---------------------------------------------------------------------------
//
// "Does this remove work from people, or add it?" A local photo store removes work outright:
// the marbot points a camera and the ambiguity is gone. A synced tier only earns its place if
// somebody is actually blocked by a photo being on the wrong device — most likely the boss
// looking at the management report. Ask him before building this, not after.

export {};
