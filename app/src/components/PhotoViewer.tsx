// Looking at photos full size, one after another.
//
// Both photo surfaces had the same hole: clicking a thumbnail opened THAT photo and offered no
// way to the next one, so a request or an item with three pictures could only be seen three
// separate times, going back to the row in between. Six photos are allowed per owner; the
// viewer has to be able to walk them.
//
// Shared, because the two copies were already drifting — the item one carried a delete button
// and a size caption, the request one did not — and the next fix would have landed on one of
// them. The differences that are real are passed in (`actions`, `caption`); everything else is
// paging, keys and focus, which are the same job in both places.

import { useEffect, useRef, useState } from 'octane';
import { ChevronLeft, ChevronRight, X } from '@octanejs/lucide';
import type { ItemPhoto } from '../../../domain/photos';
import type { PhotoStore } from '../../../data/photoStore';
import { useDialog } from './useDialog';

export function PhotoViewer(
  { photos, startAt, name, store, onClose, actions, caption }:
  {
    photos: ItemPhoto[];
    startAt: number;
    name: string;
    store: PhotoStore;
    onClose: () => void;
    /** Rendered beside Close — the item viewer puts its delete here. */
    actions?: (photo: ItemPhoto) => unknown;
    /** A line under the image, e.g. the stored dimensions. */
    caption?: (photo: ItemPhoto) => unknown;
  },
) {
  const panel = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState(startAt);
  const [src, setSrc] = useState('');

  // Clamped rather than guarded at every use: deleting the last photo while it is open would
  // otherwise leave the index past the end.
  const index = Math.min(Math.max(at, 0), Math.max(photos.length - 1, 0));
  const photo = photos[index];

  useDialog(photos.length > 0, onClose, panel);

  useEffect(() => {
    if (!photo) { setSrc(''); return; }
    let url = '';
    let alive = true;
    store.url(photo.photoId).then((u) => {
      // The viewer can close mid-await; revoking immediately is the only way this does not
      // leak a blob per abandoned open.
      if (!alive) { store.revoke(u); return; }
      url = u;
      setSrc(u);
    }).catch(() => undefined);
    return () => { alive = false; if (url) store.revoke(url); };
  }, [photo?.photoId]);

  const step = (by: number) => setAt((n) => {
    const next = Math.min(Math.max(n + by, 0), photos.length - 1);
    return next;
  });

  useEffect(() => {
    if (photos.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [photos.length]);

  if (!photo) return null;

  const many = photos.length > 1;

  return (
    <div
      ref={panel}
      class="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${name}`}
      tabIndex={-1}
      onClick={onClose}
    >
      <div class="flex shrink-0 items-center justify-between gap-3 text-white">
        <p class="min-w-0 truncate text-sm font-semibold">
          {name}
          {many && <span class="ml-2 text-white/60 tabular-nums">{index + 1} / {photos.length}</span>}
        </p>
        <div class="flex shrink-0 gap-2">
          {actions?.(photo)}
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25"
            aria-label="Tutup"
            onClick={onClose}
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 items-center gap-2 pt-4">
        {/* Present but disabled at the ends rather than removed: a control that vanishes shifts
            the image sideways every time you reach an edge. */}
        {many && (
          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 disabled:opacity-30"
            aria-label="Foto sebelumnya"
            disabled={index === 0}
            onClick={(e: Event) => { e.stopPropagation(); step(-1); }}
          >
            <ChevronLeft class="h-6 w-6" />
          </button>
        )}
        <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {src && (
            <img
              src={src}
              alt={photo.caption ?? name}
              class="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e: Event) => e.stopPropagation()}
            />
          )}
        </div>
        {many && (
          <button
            type="button"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 disabled:opacity-30"
            aria-label="Foto berikutnya"
            disabled={index === photos.length - 1}
            onClick={(e: Event) => { e.stopPropagation(); step(1); }}
          >
            <ChevronRight class="h-6 w-6" />
          </button>
        )}
      </div>

      {caption && (
        <p class="shrink-0 pt-3 text-center text-xs text-white/60 tabular-nums">
          {caption(photo)}
        </p>
      )}
    </div>
  );
}
