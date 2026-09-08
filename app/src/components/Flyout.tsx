// A submenu that comes out of the sidebar's right edge.
//
// The footer of the rail carries two facts — the gateway connection and the admin session — and
// both were opening the full-height `Sheet` at the right edge of the screen. That works, but it
// lies about where the thing came from: a panel at the far side of the display has no visible
// relationship to the small row you tapped in the bottom-left corner. A flyout anchored to the
// rail says "this belongs to that row", which is the same thing a submenu says.
//
// It is a REAL DIALOG for the same reasons `Sheet` is — focus moves in and returns, Tab cycles,
// Escape and the backdrop dismiss, the page behind cannot scroll — and it inherits every one of
// those from the same `useDialog`, so there is one implementation to keep correct.
//
// SIZED AGAINST THE ROW THAT OPENS IT. The rail's footer rows are 12px titles over 11px hints;
// a panel hanging off one of them at 16px headings and full card padding read as a different
// piece of software. Type and chrome shrink to match — but the CONTROLS do not: the URL field
// and the primary buttons keep their 56px targets, because that was decided for a tablet
// handled with wet hands (§66) and a flyout is not a reason to unpick it.
//
// ANCHORED ON DESKTOP, CENTRED ON A PHONE. The rail is 90–260px wide on a desktop, so there is
// room to its right; on a phone the drawer is 280px of a 390px screen and a flyout beside it
// would be a 110px column. Same component, two placements, because the placement is about the
// space available and nothing else.

import { useEffect, useRef, useState } from 'octane';
import { X } from '@octanejs/lucide';
import { useDialog } from './useDialog';

export function Flyout(
  { open, title, anchor, onClose, children }:
  {
    open: boolean;
    /**
     * Not rendered — it is the dialog's accessible name only.
     *
     * A heading here restated the row that was just tapped, one hand-span away and still on
     * screen. Screen readers still need the name, so the prop stays and the pixels do not.
     */
    title: string;
    /**
     * Distance from the left of the viewport to just past the rail's right edge, or `null` to
     * centre it. Passed as a NUMBER rather than left to a CSS breakpoint because the rail's own
     * mobile switch is a JS one at 768px — a `sm:` or `md:` guess here would disagree with it
     * at some widths, and the flyout would anchor to an edge that is not there.
     */
    anchor: number | null;
    onClose: () => void;
    children?: unknown;
  },
) {
  const panel = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useDialog(open, onClose, panel);

  useEffect(() => {
    if (!open) { setShown(false); return; }
    // The panel mounts in its "out" state and is moved in on the next frame; a CSS transition
    // has nothing to animate from if the element arrives already in place.
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return (
    <div class="fixed inset-0 z-[60] no-print">
      <div
        class={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom-aligned, because the row it belongs to is at the bottom of the rail. Anything
          else would make it drift away from its own trigger as the window grows. */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={anchor == null ? '' : `left:${anchor}px`}
        class={`absolute bottom-4 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl
                bg-white shadow-2xl outline-none transition-all duration-200 ease-out
                ${anchor == null ? 'inset-x-4 mx-auto max-w-[19rem]' : 'w-[19rem]'}
                ${shown
                  ? 'translate-x-0 translate-y-0 opacity-100'
                  : `opacity-0 ${anchor == null ? 'translate-y-3' : '-translate-x-3'}`}`}
      >
        <button
          type="button"
          class="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg
                 border border-slate-400 bg-white/90 text-slate-600 hover:bg-slate-100"
          aria-label="Tutup"
          onClick={onClose}
        >
          <X class="h-3.5 w-3.5" />
        </button>
        <div class="card-pad custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 pt-10">{children}</div>
      </div>
    </div>
  );
}
