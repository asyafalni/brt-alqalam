// IndexedDB photo store — the kiosk's own disk.
//
// WHY LOCAL FIRST. The stock-take (design doc §59) is one person walking a messy gudang with a
// tablet, photographing things as they find them. That is precisely where the wifi is worst,
// and a photo that needs the network to be saved is a photo that is lost. IndexedDB is the
// only browser store that takes a Blob at all — localStorage is strings and a few megabytes —
// so it is not so much a choice as the only door. Drive behind the gateway is the shared tier
// that comes later (see `drivePhotos.ts`); this one has to work with the router unplugged.
//
// Everything here is browser-only. Nothing in `domain/` may import it.

import { MAX_PHOTOS_PER_ITEM, orderPhotos } from '../domain/photos';
import type { ItemPhoto } from '../domain/photos';
import { PhotoStoreError } from './photoStore';
import type { PhotoStore } from './photoStore';

const DB_NAME = 'brt-inventaris-photos';
const DB_VERSION = 1;
const STORE = 'photos';
const BY_ITEM = 'itemId';

/**
 * DOWNSCALE BUDGET — the number that decides whether this feature survives on the tablet.
 *
 * A phone camera hands us 3–8 MB per shot. Six of those on one item is 40 MB, and a hundred
 * items is a filled device: the browser starts evicting the origin, and the first thing lost
 * is the offline transaction queue, which is real data. Meanwhile the job the photo does is
 * "is this the right jerrycan", answered at a glance on a 10-inch screen. 1600px on the long
 * edge is still sharper than any display in the gudang and still reads a printed label, and
 * JPEG q0.82 is the point where artefacts stop being visible on photographs. Together they
 * land around 200–400 KB — roughly twenty times smaller, for no loss anybody can see.
 *
 * This is the difference between the feature working on a cheap tablet and quietly filling it.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** The stored row: metadata and pixels together — see `store()` for why they share one store. */
interface PhotoRecord extends ItemPhoto {
  blob: Blob;
}

/**
 * Target dimensions, never upscaled. A 900px photo of a small bottle stays 900px: enlarging it
 * would cost bytes and add nothing, and the recorded `width`/`height` must describe the pixels
 * that are actually there or an <img> sized from them will be wrong.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  // Rounded, and floored at 1: a very long thin image would otherwise scale its short edge to
  // zero, and a zero-width canvas throws rather than producing a small picture.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// ---------------------------------------------------------------------------
// IndexedDB plumbing. IDB is callback-and-event shaped; these wrappers are the
// only place that shows, so the store logic below reads like ordinary async code.
// ---------------------------------------------------------------------------

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Quota failures arrive as a DOMException with a name, not a code we can switch on, and they
 * surface from three different places (the request, the transaction abort, and the write
 * itself). Naming them in one helper is what lets the UI say "penyimpanan penuh" instead of
 * "Error", which is the whole point of the typed error.
 */
function asStoreError(e: unknown, fallback: string): PhotoStoreError {
  if (e instanceof PhotoStoreError) return e;
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as Error).name) : '';
  if (name === 'QuotaExceededError') {
    return new PhotoStoreError('quota', 'Penyimpanan perangkat penuh — hapus foto lama dulu.', e);
  }
  return new PhotoStoreError('unavailable', fallback, e);
}

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    // Private browsing and locked-down enterprise profiles do not merely return null here —
    // in some browsers the property access itself throws — so the guard has to be a try.
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        throw new Error('indexedDB tidak tersedia');
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new PhotoStoreError(
        'unavailable',
        'Penyimpanan foto tidak tersedia di browser ini (mode penyamaran?).',
        e,
      ));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // ONE store holding metadata and blob together. Splitting them would mean two writes
        // per photo across two stores, and any failure between them leaves either a row
        // pointing at nothing or an orphan blob nobody can find to delete. Keeping them in one
        // record makes every put and every remove a single atomic operation, which matters
        // most in exactly the situation this store exists for: a tablet that may be closed,
        // backgrounded or run out of space mid-write.
        const store = db.createObjectStore(STORE, { keyPath: 'photoId' });
        store.createIndex(BY_ITEM, 'itemId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(asStoreError(request.error, 'Gagal membuka penyimpanan foto.'));
    // A blocked upgrade means another tab is holding the old version open. It never resolves on
    // its own, so it must be reported rather than left as a spinner nobody can explain.
    request.onblocked = () => reject(new PhotoStoreError(
      'unavailable',
      'Penyimpanan foto sedang dipakai tab lain — tutup tab lain lalu coba lagi.',
    ));
  }).catch((e) => {
    // Never cache a rejection: the usual cause is another tab, which the user can close and
    // retry. A cached failure would make the retry impossible without a reload.
    dbPromise = undefined;
    throw asStoreError(e, 'Gagal membuka penyimpanan foto.');
  });

  return dbPromise;
}

// ---------------------------------------------------------------------------
// Downscaling
// ---------------------------------------------------------------------------

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob> {
  // OffscreenCanvas keeps the resize off the DOM entirely, which is what stops the board
  // stuttering while a 8 MP photo is resampled on a slow tablet. It is absent on older Safari,
  // hence the <canvas> path — same pixels, same quality, just on the main thread.
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoStoreError('decode_failed', 'Browser tidak bisa memproses foto ini.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }

  if (typeof document === 'undefined') {
    throw new PhotoStoreError('decode_failed', 'Browser tidak bisa memproses foto ini.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoStoreError('decode_failed', 'Browser tidak bisa memproses foto ini.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new PhotoStoreError('decode_failed', 'Gagal menyimpan foto — coba foto ulang.')),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export interface Downscaled {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Exported because the DRIVE store needs it too, and for a sharper reason than reuse: an
 * original goes up as base64, which inflates it by a third, and Apps Script's POST ceiling
 * would reject a phone's 6 MB shot outright. Two copies of this budget would be two numbers to
 * keep in step, and the one that drifted would fail only on the biggest photos.
 */
export async function downscale(file: Blob): Promise<Downscaled> {
  if (typeof createImageBitmap !== 'function') {
    // We refuse rather than storing the original. Saving an 8 MB file is not a graceful
    // degradation — it is the exact failure the downscale exists to prevent, arriving silently
    // and only becoming visible once the tablet is full and evicting other data.
    throw new PhotoStoreError('decode_failed', 'Browser ini terlalu lama untuk menyimpan foto.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    // Reached by a PDF picked from the file sheet, and by HEIC on browsers that will not
    // decode it — both are things a person genuinely does on a tablet.
    throw new PhotoStoreError('decode_failed', 'Berkas ini bukan foto yang bisa dibaca.', e);
  }

  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const encoded = await encode(bitmap, target.width, target.height);
    // Keep whichever is smaller. Re-encoding an already-small JPEG, or a flat PNG of a label,
    // can come out LARGER than the original; storing the bigger one to satisfy a "we always
    // convert to JPEG" rule would spend space to lose quality.
    const noResize = target.width === bitmap.width && target.height === bitmap.height;
    return noResize && file.size > 0 && file.size <= encoded.size
      ? { blob: file, width: bitmap.width, height: bitmap.height }
      : { blob: encoded, width: target.width, height: target.height };
  } finally {
    // Decoded bitmaps are held outside the JS heap and are not collected promptly. Six of them
    // left open during a stock-take is enough to be noticed on a cheap tablet.
    bitmap.close();
  }
}

const newPhotoId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export function createIndexedDbPhotoStore(limit: number = MAX_PHOTOS_PER_ITEM): PhotoStore {
  async function readByItem(itemId: string): Promise<PhotoRecord[]> {
    const db = await openDb();
    const index = db.transaction(STORE, 'readonly').objectStore(STORE).index(BY_ITEM);
    return wrap(index.getAll(IDBKeyRange.only(itemId)));
  }

  async function readOne(photoId: string): Promise<PhotoRecord> {
    const db = await openDb();
    const record: PhotoRecord | undefined =
      await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(photoId));
    if (!record) throw new PhotoStoreError('not_found', 'Foto sudah tidak ada.');
    return record;
  }

  return {
    async list(itemId) {
      try {
        // The blob is dropped here on purpose: a list of six Blobs pins six images in memory
        // for every item the screen has ever shown. The UI asks for `url(photoId)` when it is
        // actually about to render one.
        return orderPhotos((await readByItem(itemId)).map(({ blob: _blob, ...meta }) => meta));
      } catch (e) {
        throw asStoreError(e, 'Gagal membaca foto.');
      }
    },

    async put(itemId, file, caption) {
      // Cheap pre-check purely so a full item says "sudah 6 foto" immediately, instead of
      // after a two-second resize. The authoritative check is inside the write below.
      const existing = await readByItem(itemId).catch((e) => {
        throw asStoreError(e, 'Gagal membaca foto.');
      });
      if (existing.length >= limit) {
        throw new PhotoStoreError('too_many', `Maksimal ${limit} foto per barang.`);
      }

      // Resizing BEFORE the transaction is not an optimisation, it is a requirement: an IDB
      // transaction closes as soon as the event loop drains with no pending request, so any
      // await on unrelated async work inside one kills it with an inactive-transaction error.
      const { blob, width, height } = await downscale(file);

      const record: PhotoRecord = {
        photoId: newPhotoId(),
        itemId,
        takenTs: Date.now(),
        width,
        height,
        bytes: blob.size,
        blob,
        ...(caption ? { caption } : {}),
      };

      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        // Counting inside the write transaction is the only check that cannot be raced by a
        // second tab of the same kiosk.
        const count = store.index(BY_ITEM).count(IDBKeyRange.only(itemId));
        count.onsuccess = () => {
          if (count.result >= limit) {
            tx.abort();
            reject(new PhotoStoreError('too_many', `Maksimal ${limit} foto per barang.`));
            return;
          }
          store.add(record);
        };
        tx.oncomplete = () => resolve();
        // A quota failure surfaces on the abort, not on `add`, so both are routed through the
        // same classifier — otherwise a full device reports as a generic failure.
        tx.onabort = () => reject(asStoreError(tx.error, 'Gagal menyimpan foto.'));
        tx.onerror = () => reject(asStoreError(tx.error, 'Gagal menyimpan foto.'));
      }).catch((e) => {
        throw asStoreError(e, 'Gagal menyimpan foto.');
      });

      const { blob: _blob, ...meta } = record;
      return meta;
    },

    async url(photoId) {
      const record = await readOne(photoId);
      // The caller now owns this URL and MUST revoke it: an object URL keeps the blob alive
      // for the lifetime of the document, so a gallery that scrolls without revoking leaks
      // every photo it has shown.
      return URL.createObjectURL(record.blob);
    },

    revoke(url) {
      // Deliberately forgiving. Revoking twice, or revoking an https URL from a future remote
      // store, is a no-op — the caller cannot tell which kind of URL it was handed, so it must
      // be safe to always call this on unmount.
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    },

    async remove(photoId) {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(photoId);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(asStoreError(tx.error, 'Gagal menghapus foto.'));
        tx.onerror = () => reject(asStoreError(tx.error, 'Gagal menghapus foto.'));
      });
      // IDB `delete` succeeds on a key that was never there, and that is the right behaviour
      // to keep: a double-tap on hapus must not surface an error for work already done.
    },
  };
}
