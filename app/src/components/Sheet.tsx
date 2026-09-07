// A panel that slides in from the right.
//
// For work that belongs to a screen but does not belong ON it: exporting, settings, a form you
// open, finish and dismiss. The alternative — a card sitting permanently at the bottom of the
// page — costs a scroll on every visit to reach the thing you actually came for, and reads as
// part of the workflow when it is really an occasional errand.
//
// IT IS A REAL DIALOG, deliberately. An accessibility audit of this app found the existing
// mobile drawer failing exactly here: eight controls left in the tab order while it was closed,
// no focus trap, no Escape, no scroll lock. Everything that was missing there is done here —
// focus moves in on open and returns to whatever opened it on close, Tab cycles inside, Escape
// and the backdrop both dismiss, and the page behind cannot scroll. Written once, so the next
// panel inherits it rather than repeating the same omissions.

import { useEffect, useRef, useState } from 'octane';
import { X } from '@octanejs/lucide';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet(
  { open, title, description, onClose, children }:
  { open: boolean; title: string; description?: string; onClose: () => void; children?: unknown },
) {
  const panel = useRef<HTMLDivElement | null>(null);
  /** Drives the transition. The panel mounts off-screen and is moved in on the next frame —
      a CSS transition has nothing to animate from if the element arrives at its final position. */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) { setShown(false); return; }

    const returnTo = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => setShown(true));

    // Focus the panel itself rather than its first control: reading the title before landing
    // on a button is the right order, and it avoids arming a destructive action by accident.
    const focusFrame = requestAnimationFrame(() => panel.current?.focus());

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrapping by hand, because a dialog rendered in the page (not the top layer) does not
      // get the browser's own containment.
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };

    addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, [open, onClose]);

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
