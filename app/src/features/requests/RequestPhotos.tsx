// Photos on a purchase request — "this is the thing I mean".
//
// A picture settles a request faster than any description: a screenshot of the listing, or a
// photo of the broken one being replaced, answers "which one?" and "why?" at the same time. It
// is the field the boss asked for, and the one most likely to be a screenshot from a phone.
//
// Same `PhotoStore` the items use. The port's first argument is an owner id, not specifically
// an item id — keying by `requestId` is what it is for, and it means downscaling, the six-photo
// ceiling and the quota handling are already solved here.

import { useEffect, useRef, useState } from 'octane';
import { Camera, ImageOff, X } from '@octanejs/lucide';
import { MAX_PHOTOS_PER_ITEM, canAddPhoto } from '../../../../domain/photos';
import type { ItemPhoto } from '../../../../domain/photos';
import { PhotoStoreError } from '../../../../data/photoStore';
import { createIndexedDbPhotoStore } from '../../../../data/indexedDbPhotos';

/* One store for the whole app, created once — a fresh IndexedDB connection per rendered row
   would open one per request on a screen that lists all of them. */
const store = createIndexedDbPhotoStore();

/** One thumbnail. Owns its object URL and revokes it; an unrevoked URL pins the blob. */
function Thumb({ photo, onOpen }: { photo: ItemPhoto; onOpen: (src: string) => void }) {
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
      onClick={() => src && onOpen(src)}
    >
      {src
        ? <img src={src} alt={photo.caption ?? ''} class="h-full w-full object-cover" />
        : <span class="flex h-full w-full items-center justify-center text-slate-300"><ImageOff class="h-4 w-4" /></span>}
    </button>
  );
}

export function RequestPhotos({ requestId, name }: { requestId: string; name: string }) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const reload = () => store.list(requestId)
    .then(setPhotos)
    .catch((e: unknown) => setError(e instanceof PhotoStoreError ? e.message : 'Foto tidak bisa dibuka.'));

  useEffect(() => { void reload(); }, [requestId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(''); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

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
    <div class="mt-3">
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
        {photos.map((p) => <Thumb key={p.photoId} photo={p} onOpen={setOpen} />)}
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

      {open && (
        <div
          class="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${name}`}
          onClick={() => setOpen('')}
        >
          <div class="flex shrink-0 justify-end">
            <button
              type="button"
              class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25"
              aria-label="Tutup"
              onClick={() => setOpen('')}
            >
              <X class="h-5 w-5" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 items-center justify-center pt-2">
            <img src={open} alt={name} class="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
