// Photos on a request — "this is the thing I mean".
//
// A picture settles a request faster than any description: a screenshot of the listing, or a
// photo of the broken one being replaced, answers "which one?" and "why?" at the same time. It
// is the field the boss asked for, and the one most likely to be a screenshot from a phone.
//
// TWO PIECES, on purpose. The LIST shows a strip of thumbnails and NOTHING ELSE — a row is read,
// not worked on, and every control on it is one more thing between somebody and the reason they
// opened the screen. Adding, replacing and deleting all happen in the request form, which can
// be reopened on an existing request; there is no second way to reach the same job.
//
// The form case needs an id before the request is saved. That is not a problem, only a cost:
// the id is minted when the form opens, and photos attached to an abandoned draft are deleted
// on cancel (`discardPhotos`).
//
// Same `PhotoStore` the items use. The port's first argument is an owner id, not specifically
// an item id — keying by `requestId` is what it is for, and it means downscaling, the six-photo
// ceiling and the quota handling are already solved here.

import { useEffect, useRef, useState } from 'octane';
import { Camera, ImageOff } from '@octanejs/lucide';
import { MAX_PHOTOS_PER_ITEM, canAddPhoto } from '../../../../domain/photos';
import type { ItemPhoto } from '../../../../domain/photos';
import { PhotoStoreError } from '../../../../data/photoStore';
import { createIndexedDbPhotoStore } from '../../../../data/indexedDbPhotos';
import { PhotoViewer } from '../../components/PhotoViewer';

/* One store for the whole app, created once — a fresh IndexedDB connection per rendered row
   would open one per request on a screen that lists all of them. */
const store = createIndexedDbPhotoStore();

/** One thumbnail. Owns its object URL and revokes it; an unrevoked URL pins the blob. */
function Thumb({ photo, onOpen }: { photo: ItemPhoto; onOpen: () => void }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let url = '';
    let alive = true;
    store.url(photo.photoId).then((u) => {
      // The row can unmount mid-await; revoking immediately is the only way this does not
      // leak a blob per abandoned render.
      if (!alive) { store.revoke(u); return; }
      url = u;
      setSrc(u);
    }).catch(() => undefined);
    return () => { alive = false; if (url) store.revoke(url); };
  }, [photo.photoId]);

  return (
    <button
      type="button"
      class="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      aria-label={photo.caption || 'Lihat foto'}
      onClick={onOpen}
    >
      {src
        ? <img src={src} alt={photo.caption ?? ''} class="h-full w-full object-cover" />
        : <span class="flex h-full w-full items-center justify-center text-slate-300"><ImageOff class="h-4 w-4" /></span>}
    </button>
  );
}

/**
 * ONE tile at the head of a request row: the first photo if there is one, or the drawing the
 * item would have had.
 *
 * A row of every thumbnail was a second list inside a list. One tile does the job a picture is
 * actually for here — telling rows apart at a glance — and a `+n` badge says there is more
 * without spending the width. Tapping opens it full size; changing photos is Ubah's job.
 *
 * The drawing fallback matters more than it looks: without it a request with no photo had a
 * ragged empty gutter beside one that did, and half the list lost its left edge.
 *
 * `refreshKey` is bumped by the board when the form closes, since this and the form keep
 * separate copies of the list.
 */
export function RequestThumb(
  { requestId, name, fallback, refreshKey = 0 }:
  { requestId: string; name: string; fallback: unknown; refreshKey?: number },
) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [src, setSrc] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    store.list(requestId).then((p) => { if (alive) setPhotos(p); }).catch(() => undefined);
    return () => { alive = false; };
  }, [requestId, refreshKey]);

  const first = photos[0];
  useEffect(() => {
    if (!first) { setSrc(''); return; }
    let url = '';
    let alive = true;
    store.url(first.photoId).then((u) => {
      // The row can unmount mid-await; revoking immediately is the only way this does not
      // leak a blob per abandoned render.
      if (!alive) { store.revoke(u); return; }
      url = u;
      setSrc(u);
    }).catch(() => undefined);
    return () => { alive = false; if (url) store.revoke(url); };
  }, [first?.photoId]);

  if (!first) {
    return (
      <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        {fallback}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        class="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
        aria-label={`Lihat foto ${name}`}
        onClick={() => setOpen(true)}
      >
        {src
          ? <img src={src} alt="" class="h-full w-full object-cover" />
          : <span class="flex h-full w-full items-center justify-center text-slate-300"><ImageOff class="h-4 w-4" /></span>}
        {photos.length > 1 && (
          <span class="absolute bottom-0 right-0 rounded-tl-md bg-slate-900/80 px-1.5 text-[10px] font-bold text-white">
            +{photos.length - 1}
          </span>
        )}
      </button>
      {/* Opens on the tile's own photo and walks the rest — the `+n` badge promises there are
          more, and until this existed the promise went nowhere. */}
      {open && (
        <PhotoViewer
          photos={photos}
          startAt={0}
          name={name}
          store={store}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Throw away photos attached to a request that was never submitted.
 *
 * The one mutation in an otherwise append-only system, and legitimate here: nothing has been
 * recorded yet, so there is no history to protect — only blobs taking up a phone's storage
 * against an id that will be handed to the next request that is actually saved.
 */
export async function discardPhotos(ownerId: string): Promise<void> {
  try {
    const photos = await store.list(ownerId);
    await Promise.all(photos.map((p) => store.remove(p.photoId)));
  } catch {
    // A failed cleanup is not worth blocking a cancel over — the worst case is a few orphaned
    // blobs, and the next save under this id simply adopts them.
  }
}

export function RequestPhotos({ requestId, name }: { requestId: string; name: string }) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [open, setOpen] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const reload = () => store.list(requestId)
    .then(setPhotos)
    .catch((e: unknown) => setError(e instanceof PhotoStoreError ? e.message : 'Foto tidak bisa dibuka.'));

  useEffect(() => { void reload(); }, [requestId]);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      // Sequentially: each one decodes and re-encodes a multi-megapixel image, and three at
      // once on a cheap tablet is how the tab stops responding.
      for (const file of Array.from(files)) await store.put(requestId, file);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof PhotoStoreError ? e.message : 'Foto gagal disimpan.');
      await reload();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';   // so the same file can be picked twice
    }
  };

  return (
    <div>
      {/* `capture` is deliberately absent: on a phone it forces the camera and removes the
          gallery, and the common case here is a screenshot of a marketplace listing. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        class="sr-only"
        aria-label={`Tambah foto untuk ${name}`}
        onChange={(e: Event) => void add((e.target as HTMLInputElement).files)}
      />

      <div class="flex flex-wrap items-center gap-2">
        {photos.map((p, i) => <Thumb key={p.photoId} photo={p} onOpen={() => setOpen(i)} />)}
        {canAddPhoto(photos, MAX_PHOTOS_PER_ITEM) && (
          <button
            type="button"
            class="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-400 text-slate-500 hover:border-slate-900 hover:text-slate-900 disabled:opacity-50"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Camera class="h-4 w-4" />
            <span class="text-[10px] font-bold uppercase tracking-wider">
              {busy ? '…' : 'Foto'}
            </span>
          </button>
        )}
      </div>

      {error && (
        <p role="alert" class="mt-2 text-xs text-red-700">{error}</p>
      )}

      <p class="mt-3 text-xs leading-relaxed text-slate-500">
        Maksimal {MAX_PHOTOS_PER_ITEM} foto. Tersimpan di perangkat ini saja, belum ikut
        tersinkron.
      </p>

      {open >= 0 && (
        <PhotoViewer
          photos={photos}
          startAt={open}
          name={name}
          store={store}
          onClose={() => setOpen(-1)}
        />
      )}
    </div>
  );
}

