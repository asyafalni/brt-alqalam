// The photo port — one more edge on the hexagon.
//
// Photos are the one part of this system that CANNOT live in the source of truth. A Google
// Sheet cell holds text; a cell cannot hold a JPEG, and the CSV read path that carries the
// whole catalog would carry megabytes per row if it tried. So the register stays in the sheet
// and the pixels go somewhere else, joined by `photoId` — which is why this is its own port
// rather than a field on `CatalogRepository`.
//
// Today the only implementation is IndexedDB on the kiosk (`indexedDbPhotos.ts`). Tomorrow it
// is Google Drive behind the gateway (`drivePhotos.ts`, a design note for now). The UI must be
// written against this interface and nothing else, because those two differ in every way that
// is not in here: one is device-local and instant, the other is shared and needs the network.

import type { ItemPhoto } from '../domain/photos';

/**
 * A failure the UI is expected to RENDER, not swallow.
 *
 * It lives on the port rather than in the IndexedDB adapter so a screen catches one type
 * whatever the backing store is, and so the day Drive arrives no `catch` block has to change.
 *
 * Every one of these codes is a real thing that happens on a shared tablet: private browsing
 * turns IndexedDB off, a full device rejects the write, and a phone hands us a HEIC the
 * browser cannot decode. Silence on any of them means the marbot photographs the shelf, taps
 * simpan, sees nothing, and concludes the app is broken — which it would be.
 */
export type PhotoStoreErrorCode =
  | 'unavailable'   // no store here at all (private browsing, storage disabled, blocked upgrade)
  | 'quota'         // the device is full, or the origin's quota is
  | 'too_many'      // MAX_PHOTOS_PER_ITEM reached — a rule, not a fault
  | 'decode_failed' // not an image, or an image this browser cannot decode
  | 'not_found';    // the photoId is gone; usually a stale list after a delete elsewhere

export class PhotoStoreError extends Error {
  constructor(readonly code: PhotoStoreErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PhotoStoreError';
  }
}

export interface PhotoStore {
  /** Every photo for one item, already in display order (`domain/photos.orderPhotos`). */
  list(itemId: string): Promise<ItemPhoto[]>;

  /**
   * Store one photo and return its metadata AS STORED — the dimensions and byte count are the
   * post-downscale ones, so a caller can show "1,4 MB dipakai" without a second round trip.
   *
   * Enforcing `MAX_PHOTOS_PER_ITEM` is the store's job, not the caller's: a check in the UI is
   * advice, a check here is a rule, and only the store can read the count without a race.
   */
  put(itemId: string, file: Blob, caption?: string): Promise<ItemPhoto>;

  /**
   * A string for `<img src>`. For a local store this is an object URL, which pins the blob in
   * memory until it is revoked; for a remote store it is an https URL and `revoke` is a no-op.
   * The caller cannot tell which, so it must always pair `url` with `revoke` on unmount.
   */
  url(photoId: string): Promise<string>;

  /** Release whatever `url` handed out. Synchronous and forgiving: a double-revoke is fine. */
  revoke(url: string): void;

  /**
   * Delete a photo permanently. Note that this is the ONE mutation in a system that is
   * otherwise append-only — deliberately, because a photo is not evidence of a movement and
   * the append-only rule exists to protect the transaction log, not the pixels. A tombstoned
   * blob would occupy the space the deletion was meant to reclaim, which defeats the point.
   */
  remove(photoId: string): Promise<void>;
}
