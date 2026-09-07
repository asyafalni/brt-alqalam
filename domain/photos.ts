// Photos of a thing — the answer to "is this the one?".
//
// WHY A PHOTO AT ALL. §0's first problem is that nobody knows what we own, and the second is
// that a *very messy* gudang hides things in plain sight. A name and a rack code do not settle
// "is this blue jerrycan the pembersih lantai or the pembersih kaca"; a picture does, in under
// a second, without reading. That is the whole feature: it removes a walk to the shelf and an
// argument, which is §0.0's test.
//
// Pure. No I/O, no framework — the storage adapters live in `data/`.

/**
 * Metadata for one photo. The bytes themselves live in whatever store the adapter uses; this
 * record is what the UI lists, orders and budgets against, and it is deliberately small enough
 * to hold in memory for the whole catalog.
 *
 * `width`/`height`/`bytes` describe the photo AS STORED, after any downscaling — not the
 * original off the camera. A caller warning about space needs to know what is actually on the
 * device, and a caller sizing an <img> needs the dimensions it will really get.
 */
export interface ItemPhoto {
  photoId: string;
  itemId: string;
  caption?: string;
  /** When the photo was taken/added, epoch ms. Also the ordering key — see `orderPhotos`. */
  takenTs: number;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Six is a ceiling, not a target. One identifying shot plus a few angles and a label close-up
 * covers every reason anyone photographs a bottle of soap; past that it is a photo album, and
 * an album on a shared tablet is how the store fills up and the feature gets switched off.
 */
export const MAX_PHOTOS_PER_ITEM = 6;

/** Whether there is room for one more. Callers pass the limit so a test can use a small one. */
export const canAddPhoto = (
  existing: readonly ItemPhoto[],
  limit: number = MAX_PHOTOS_PER_ITEM,
): boolean => existing.length < limit;

/**
 * Display order: OLDEST FIRST, ties broken by `photoId`.
 *
 * Newest-first is the reflex — it is right for a feed, and wrong here. The first photo of an
 * item is the identifying shot, taken during the opname when somebody was holding the thing
 * and deciding what it was. Every later photo is an addendum: a dented lid, a torn label, the
 * damage that got it marked rusak. Sorting newest-first rotates a close-up of a crack into the
 * identifying slot the moment anybody photographs a problem, so the thumbnail on the list
 * screen stops being a picture of the item at exactly the point the record matters most.
 *
 * The `photoId` tie-break is not decoration: phone clocks report whole seconds, so two shots
 * from one visit routinely share a `takenTs`, and without it the identifying shot could be
 * demoted by an unstable sort. Ordering must be the same on every render and every device.
 */
export function orderPhotos(photos: readonly ItemPhoto[]): ItemPhoto[] {
  return [...photos].sort((a, b) =>
    a.takenTs - b.takenTs || (a.photoId < b.photoId ? -1 : a.photoId > b.photoId ? 1 : 0));
}

/** The identifying shot, if there is one — the thumbnail every list screen should show. */
export const primaryPhoto = (photos: readonly ItemPhoto[]): ItemPhoto | undefined =>
  orderPhotos(photos)[0];

/**
 * Total stored bytes. A caller warns on this BEFORE the store refuses, because a browser
 * quota failure arrives mid-write with a photo already taken and no useful message — the
 * marbot has done the work and lost it. A number they can see beforehand is the difference
 * between "hapus foto lama dulu" and a shrug.
 */
export const photoBudget = (photos: readonly ItemPhoto[]): number =>
  photos.reduce((total, p) => total + p.bytes, 0);
