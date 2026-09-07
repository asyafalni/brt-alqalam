// A panel that slides in from the right.
//
// For work that belongs to a screen but does not belong ON it: exporting, settings, a form you
// open, finish and dismiss. The alternative — a card sitting permanently at the bottom of the
// page — costs a scroll on every visit to reach the thing you actually came for, and reads as
// part of the workflow when it is really an occasional errand.
//
// IT IS A REAL DIALOG, deliberately — focus moves in on open and returns to whatever opened it,
// Tab cycles inside, Escape and the backdrop both dismiss, and the page behind cannot scroll.
// That behaviour now lives in `useDialog`, so the mobile drawer inherits it rather than keeping
// its own broken version.

import { useEffect, useRef, useState } from 'octane';
import { X } from '@octanejs/lucide';
import { useDialog } from './useDialog';

export function Sheet(
  { open, title, description, onClose, children }:
  { open: boolean; title: string; description?: string; onClose: () => void; children?: unknown },
) {
  const panel = useRef<HTMLDivElement | null>(null);
  /** Drives the transition. The panel mounts off-screen and is moved in on the next frame —
      a CSS transition has nothing to animate from if the element arrives at its final position. */
  const [shown, setShown] = useState(false);

  useDialog(open, onClose, panel);

  useEffect(() => {
    if (!open) { setShown(false); return; }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Unmounted when closed, which is the simplest way to keep its controls out of the tab
  // order — the failure mode the audit found in the drawer that stays in the DOM.
  if (!open) return null;

  return (
    <div class="fixed inset-0 z-50 no-print">
      <div
        class={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        class={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl
                outline-none transition-transform duration-200 ease-out
                ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div class="flex shrink-0 items-start gap-3 border-b border-slate-200 p-5">
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-bold text-slate-900">{title}</h2>
            {description && <p class="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-600 hover:bg-slate-100"
            aria-label="Tutup"
            onClick={onClose}
          >
            <X class="h-5 w-5" />
          </button>
        </div>
        {/* `card-pad` for the same reason a card carries it: a list inside here has to be able
            to reach the panel's edge, and it needs to know the padding to cancel it. */}
        <div class="card-pad custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
