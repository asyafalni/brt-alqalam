// Photos of one item: a thumbnail strip, a viewer, and a way to add more.
//
// WHY IT IS WORTH THE SCREEN SPACE. The drawing (`ItemArt`) says what *kind* of thing this is
// and is always there. A photo says what *this* thing looks like — which is what settles "is
// this blue jerrycan the pembersih lantai or the pembersih kaca" without a walk to the shelf,
// and what makes a rusak report legible to somebody who was not holding the item.
//
// WHY IT IS LOCAL FOR NOW. Photos cannot live in the spreadsheet, and the Drive-behind-the-
// gateway path is not deployed (`data/drivePhotos.ts` records why and what it needs). So this
// talks to a `PhotoStore` port, backed today by IndexedDB on the device. That is honest rather
// than ideal, and the screen says so out loud instead of implying the photos are shared — a
// register that quietly loses half its evidence when somebody picks up a different tablet is
// worse than one that never claimed to have it.

import { useEffect, useRef, useState } from 'octane';
import { Camera, ImageOff, Trash2, X } from '@octanejs/lucide';
import { canAddPhoto, MAX_PHOTOS_PER_ITEM, photoBudget } from '../../../../domain/photos';
import type { ItemPhoto } from '../../../../domain/photos';
import { PhotoStoreError } from '../../../../data/photoStore';
import type { PhotoStore } from '../../../../data/photoStore';
import { Button, CARD } from '../../components/ui';

const kb = (bytes: number) =>
  (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`);

/** One thumbnail. Owns its object URL, and revokes it — an unrevoked URL pins the blob. */
function Thumb(
  { photo, store, active, onOpen }:
  { photo: ItemPhoto; store: PhotoStore; active: boolean; onOpen: () => void },
) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let url = '';
    let alive = true;
    store.url(photo.photoId).then((u) => {
      // The component can unmount mid-await; revoking immediately is the only way this does
      // not leak a blob per abandoned render.
      if (!alive) { store.revoke(u); return; }
      url = u;
      setSrc(u);
    }).catch(() => { /* a missing blob renders as the fallback below, not as a crash */ });
    return () => { alive = false; if (url) store.revoke(url); };
  }, [photo.photoId, store]);

  return (
    <button
      type="button"
      class={`relative aspect-square shrink-0 overflow-hidden rounded-lg border-2 bg-slate-100 transition-colors ${
        active ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'
      }`}
      style="width:5rem"
      aria-label={photo.caption || 'Lihat foto'}
      onClick={onOpen}
    >
      {src
        ? <img src={src} alt={photo.caption ?? ''} class="h-full w-full object-cover" />
        : <span class="flex h-full w-full items-center justify-center text-slate-300"><ImageOff class="h-5 w-5" /></span>}
    </button>
  );
}

export function ItemPhotos(
  { itemId, itemName, store }: { itemId: string; itemName: string; store: PhotoStore },
) {
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [open, setOpen] = useState<ItemPhoto | null>(null);
  const [openSrc, setOpenSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);

  const reload = () => store.list(itemId)
    .then(setPhotos)
    .catch((e: unknown) => setError(e instanceof PhotoStoreError ? e.message : 'Foto tidak bisa dibuka.'));

  useEffect(() => { void reload(); }, [itemId, store]);

  // The viewer's own URL, separate from the thumbnails' so closing it frees the full image.
  useEffect(() => {
    if (!open) { setOpenSrc(''); return; }
    let url = '';
    let alive = true;
    store.url(open.photoId).then((u) => {
      if (!alive) { store.revoke(u); return; }
      url = u; setOpenSrc(u);
    }).catch(() => undefined);
    return () => { alive = false; if (url) store.revoke(url); };
  }, [open, store]);

  // Escape closes the viewer. Without it the only way out on a tablet is the X, and on a
  // desktop the reflex is the key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      // Sequentially, not in parallel: each one decodes and re-encodes a multi-megapixel
      // image, and three at once on a cheap tablet is how the tab stops responding.
      for (const file of Array.from(files)) {
        await store.put(itemId, file);
      }
      await reload();
    } catch (e: unknown) {
      setError(e instanceof PhotoStoreError ? e.message : 'Foto gagal disimpan.');
      await reload();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';   // so the same file can be picked twice
    }
  };

  const remove = async (photo: ItemPhoto) => {
    setOpen(null);
    try { await store.remove(photo.photoId); } catch { /* reload tells the truth either way */ }
    await reload();
  };

  const room = canAddPhoto(photos, MAX_PHOTOS_PER_ITEM);

  return (
    <section class={CARD}>
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500">Foto barang</h2>
        <span class="text-xs tabular-nums text-slate-400">
          {photos.length}/{MAX_PHOTOS_PER_ITEM}
          {photos.length > 0 && ` · ${kb(photoBudget(photos))}`}
        </span>
      </div>

      {/* `capture` is deliberately absent. On a phone it forces the camera and removes the
          gallery, which breaks the common case of a photo taken earlier during the opname. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        class="sr-only"
        aria-label={`Tambah foto ${itemName}`}
        onChange={(e: Event) => void add((e.target as HTMLInputElement).files)}
      />

      {photos.length === 0 && !busy ? (
        <div class="rounded-lg border border-dashed border-slate-400 px-4 py-8 text-center">
          <Camera class="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p class="text-sm text-slate-500">Belum ada foto.</p>
          <p class="mx-auto mt-1 max-w-xs text-xs text-slate-400">
            Satu foto menjawab “yang mana?” lebih cepat daripada nama dan kode rak.
          </p>
          <Button class="mt-4" variant="secondary" onClick={() => input.current?.click()}>
            <Camera class="h-4 w-4" /> Tambah foto
          </Button>
        </div>
      ) : (
        <>
          <div class="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <Thumb
                key={p.photoId}
                photo={p}
                store={store}
                active={open?.photoId === p.photoId}
                onOpen={() => setOpen(p)}
              />
            ))}
            {room && (
              <button
                type="button"
                class="flex aspect-square shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-400 text-slate-500 hover:border-slate-900 hover:text-slate-900 disabled:opacity-50"
                style="width:5rem"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Camera class="h-5 w-5" />
                <span class="text-[10px] font-bold uppercase tracking-wider">
                  {busy ? '…' : 'Tambah'}
                </span>
              </button>
            )}
          </div>
          {busy && (
            <p role="status" class="mt-2 text-xs text-slate-500">
              Menyimpan foto — ukurannya dikecilkan dulu supaya tidak memenuhi penyimpanan.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" class="mt-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <p class="mt-3 text-xs leading-relaxed text-slate-400">
        Foto disimpan di perangkat ini saja, belum ikut tersinkron — jadi tidak terlihat dari HP
        lain sampai gateway terpasang.
      </p>

      {open && (
        <div
          class="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${itemName}`}
          onClick={() => setOpen(null)}
        >
          <div class="flex shrink-0 items-center justify-between gap-3 text-white">
            <p class="min-w-0 truncate text-sm font-semibold">{itemName}</p>
            <div class="flex shrink-0 gap-2">
              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-red-500"
                aria-label="Hapus foto"
                onClick={(e: Event) => { e.stopPropagation(); void remove(open); }}
              >
                <Trash2 class="h-5 w-5" />
              </button>
              <button
                type="button"
                class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25"
                aria-label="Tutup"
                onClick={() => setOpen(null)}
              >
                <X class="h-5 w-5" />
              </button>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 items-center justify-center pt-4">
            {openSrc && (
              <img
                src={openSrc}
                alt={open.caption ?? itemName}
                class="max-h-full max-w-full rounded-lg object-contain"
                onClick={(e: Event) => e.stopPropagation()}
              />
            )}
          </div>
          <p class="shrink-0 pt-3 text-center text-xs text-white/60 tabular-nums">
            {open.width}×{open.height} · {kb(open.bytes)}
          </p>
        </div>
      )}
    </section>
  );
}
