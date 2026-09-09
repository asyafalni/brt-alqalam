// Photos in Google Drive, behind the gateway — the shared tier.
//
// The reasoning that used to live here as a design note is now split in two: the constraints
// are still worth reading below, and the half that runs on Google is `gateway/photos.gs`.
//
//   * NO BINARY BODY. A CORS simple request means `text/plain`, so a photo travels as base64
//     inside the JSON — about a third bigger. That is why `downscale` is shared with the local
//     store rather than copied: an original would be rejected by Apps Script's POST ceiling.
//   * THE SESSION TRAVELS IN THE BODY, so every call here is a POST. A photo fetched with a
//     token in an `<img src>` would write that credential into browser history.
//   * THE FOLDER IS NEVER LINK-PUBLIC (§12.4). Bytes come back through the gateway under a
//     session, which is the whole reason there is no Drive URL anywhere in this file.
//
// `indexedDbPhotos.ts` is NOT obsolete. It is the store on a device with no gateway — the
// stock-take walk, where the wifi is worst and a photo that needs the network is a photo that
// is lost. This one is what makes a photo visible on somebody else's phone.

import { orderPhotos } from '../domain/photos';
import type { ItemPhoto } from '../domain/photos';
import { downscale } from './indexedDbPhotos';
import { PhotoStoreError } from './photoStore';
import type { PhotoStore } from './photoStore';

/** What the gateway calls a failure, and what the port calls it. */
function asStoreError(code: string, detail?: string): PhotoStoreError {
  if (code === 'too_many') {
    return new PhotoStoreError('too_many', 'Sudah ada 6 foto untuk barang ini.');
  }
  if (code === 'too_large') {
    return new PhotoStoreError('quota', 'Fotonya terlalu besar untuk dikirim.');
  }
  if (code === 'not_found' || code === 'file_missing') {
    return new PhotoStoreError('not_found', 'Foto ini sudah tidak ada.');
  }
  /* A missing or expired PIN session lands here, and the wording has to say what to DO — "no
     store here at all" is true but useless to somebody looking at an empty gallery. */
  if (code === 'no_session' || code === 'session_expired' || code === 'session_revoked') {
    return new PhotoStoreError('unavailable', 'Masukkan PIN dulu untuk membuka foto.');
  }
  return new PhotoStoreError('unavailable', detail || 'Foto tidak bisa diambil dari gateway.');
}

async function call(
  url: string, body: Record<string, unknown>, fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new PhotoStoreError('unavailable', 'Tidak bisa menghubungi gateway.', e);
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PhotoStoreError('unavailable', 'Balasan gateway tidak terbaca.');
  }
  if (json.ok !== true) throw asStoreError(String(json.error ?? 'unknown'));
  return json;
}

/** `Blob` ⇄ base64, in chunks — a 400 KB photo is 400,000 arguments to `fromCharCode`. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(out);
}

function fromBase64(data: string, mime: string): Blob {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function createDrivePhotoStore(
  url: string,
  /** The live PIN session, read at call time — an hour-old token is no good to anybody. */
  session: () => string | null,
  fetchImpl: typeof fetch = fetch,
): PhotoStore {
  /*
   * Bytes already fetched, for this page's lifetime.
   *
   * Deliberately IN MEMORY and not a second IndexedDB store. A gallery of six photos would
   * otherwise cost six round trips of ~1.5s every time somebody scrolls back to an item, and
   * this covers that completely; what it does not survive is a reload, which is the right
   * trade against a persistent cache that has to be invalidated when a photo is replaced.
   */
  const blobs = new Map<string, Blob>();
  const urls = new Map<string, string>();

  const token = () => {
    const s = session();
    if (!s) throw asStoreError('no_session');
    return s;
  };

  return {
    async list(itemId) {
      const json = await call(url, { op: 'photos', session: token(), itemId }, fetchImpl);
      const rows = Array.isArray(json.photos) ? (json.photos as ItemPhoto[]) : [];
      return orderPhotos(rows);
    },

    async put(itemId, file, caption) {
      // Downscaled BEFORE encoding, or the base64 alone would breach the POST ceiling.
      const small = await downscale(file);
      const json = await call(url, {
        op: 'putPhoto',
        session: token(),
        itemId,
        caption: caption ?? '',
        mimeType: small.blob.type || 'image/jpeg',
        width: small.width,
        height: small.height,
        bytes: small.blob.size,
        takenTs: Date.now(),
        dataBase64: await toBase64(small.blob),
      }, fetchImpl);

      const photo = json.photo as ItemPhoto;
      // Kept, so the picture the person just took appears without a round trip back for it.
      blobs.set(photo.photoId, small.blob);
      return photo;
    },

    async url(photoId) {
      const cached = urls.get(photoId);
      if (cached) return cached;

      let blob = blobs.get(photoId);
      if (!blob) {
        const json = await call(url, { op: 'photo', session: token(), photoId }, fetchImpl);
        blob = fromBase64(String(json.dataBase64 ?? ''), String(json.mimeType ?? 'image/jpeg'));
        blobs.set(photoId, blob);
      }
      const made = URL.createObjectURL(blob);
      urls.set(photoId, made);
      return made;
    },

    revoke(made) {
      /* Forgiving, and it must be: the caller cannot tell a remote store from a local one, so
         it revokes on every unmount whether or not this handed the URL out. */
      try { URL.revokeObjectURL(made); } catch { /* already gone */ }
      for (const [id, u] of urls) if (u === made) urls.delete(id);
    },

    async remove(photoId) {
      await call(url, { op: 'deletePhoto', session: token(), photoId }, fetchImpl);
      blobs.delete(photoId);
      const made = urls.get(photoId);
      if (made) { try { URL.revokeObjectURL(made); } catch { /* already gone */ } }
      urls.delete(photoId);
    },
  };
}
