// What makes a panel a real dialog, in one place.
//
// The accessibility audit found the mobile drawer failing every part of this: eight controls
// left in the tab order while it was closed, no focus trap, no Escape, no scroll lock. `Sheet`
// was written correctly and this is that behaviour lifted out of it, so the drawer inherits it
// rather than growing a second, subtly different copy — which is how the two would drift and
// only one would get the next fix.
//
// Callers still own their own markup and, critically, their own MOUNTING: keeping the panel's
// controls out of the tab order when it is closed is the caller's job, because only the caller
// knows whether that means unmounting (Sheet) or `hidden` (the drawer, which must keep its
// slide-out transition).

import { useEffect } from 'octane';

/**
 * Every dialog currently open.
 *
 * Dialogs nest for real now — the photo viewer opens inside the request form's sheet — and both
 * listen for Escape on the window, so one press closed the viewer AND the form under it.
 *
 * Which one is on top is decided by DOM CONTAINMENT, not by mount order: effects run
 * child-before-parent, so the inner dialog registers FIRST and any order-based answer is
 * exactly backwards. A dialog is on top when no other open dialog lives inside it — true
 * however the two were mounted, and true again if they are ever mounted the other way round.
 */
const openDialogs: { current: HTMLElement | null }[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(
  open: boolean,
  onClose: () => void,
  /* Structural, not `Ref`: Octane's `Ref` is a union that includes a callback form, and this
     only ever needs the object one. Naming what it uses keeps every caller's `useRef` valid. */
  panel: { current: HTMLElement | null },
  { focusPanel = true }: { focusPanel?: boolean } = {},
) {
  useEffect(() => {
    if (!open) return;

    openDialogs.push(panel);
    const topmost = () => {
      const me = panel.current;
      if (!me) return false;
      return !openDialogs.some((other) => other !== panel
        && other.current
        && me.contains(other.current));
    };

    const returnTo = document.activeElement as HTMLElement | null;

    // Focus the panel itself rather than its first control: reading the title before landing
    // on a button is the right order, and it avoids arming a destructive action by accident.
    const focusFrame = focusPanel
      ? requestAnimationFrame(() => panel.current?.focus())
      : 0;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (!topmost()) return;
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
      const at = openDialogs.indexOf(panel);
      if (at !== -1) openDialogs.splice(at, 1);
      if (focusFrame) cancelAnimationFrame(focusFrame);
      removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, [open, onClose]);
}
