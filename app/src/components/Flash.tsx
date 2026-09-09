// What just happened, said out loud, for a few seconds.
//
// The app's most important action had NO outcome. A marbot tapped Simpan, the sheet closed,
// and for the second or two the gateway takes there was nothing on screen at all — then a
// number quietly changed somewhere they might not be looking. On bad wifi that silence ran to
// ten seconds, and the record was queued rather than sent, which looked exactly the same.
//
// This is the whole family of bug this project keeps re-finding in new costumes: a write that
// went nowhere presented identically to one that landed. The banner in `MovementSheet` warns
// BEFORE an unconnected save; this is the other end, and it distinguishes the three outcomes
// that actually differ — it is in the sheet, it is on this phone waiting, it did not happen.
//
// ONE AT A TIME, deliberately. Movements are recorded one at a time by one person standing at
// a shelf; a stack of toasts would be a stack of one, plus code to manage a queue that never
// fills. It replaces rather than piling up, and it never covers the bottom nav.

import { useEffect, useState } from 'octane';
import { CircleCheck, TriangleAlert, WifiOff } from '@octanejs/lucide';

export type FlashKind = 'ok' | 'queued' | 'problem';

export interface FlashMessage {
  kind: FlashKind;
  text: string;
  hint?: string;
  /** Bumped by the caller so two identical messages still re-show. */
  at: number;
}

/**
 * How long it stays. Long enough to read a short sentence twice while looking up from a shelf,
 * short enough not to sit over the screen somebody is trying to use next.
 */
const OK_MS = 3200;
/** A record that did NOT reach the sheet is worth a longer look. */
const WARN_MS = 6000;

const STYLE: Record<FlashKind, { box: string; icon: unknown }> = {
  ok: {
    box: 'border-green-200 bg-green-50',
    icon: <CircleCheck class="h-5 w-5 shrink-0 text-green-700" />,
  },
  queued: {
    box: 'border-amber-200 bg-amber-50',
    icon: <WifiOff class="h-5 w-5 shrink-0 text-amber-700" />,
  },
  problem: {
    box: 'border-red-200 bg-red-50',
    icon: <TriangleAlert class="h-5 w-5 shrink-0 text-red-700" />,
  },
};

export function Flash({ message, onDone }: { message: FlashMessage | null; onDone: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!message) { setShown(false); return; }
    /* Two frames, not one: the element has to exist at its start position before the class
       that moves it lands, or the browser has nothing to transition from. */
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    const id = setTimeout(onDone, message.kind === 'ok' ? OK_MS : WARN_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(id); };
  }, [message?.at]);

  if (!message) return null;
  const style = STYLE[message.kind];

  return (
    <div
      /* `bottom-24` clears the mobile bottom bar; on a desktop there is none, so it drops to
         the corner. `pointer-events-none` on the wrapper: this is an announcement, and it must
         never swallow a tap meant for what is underneath it. */
      class="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-6 md:left-auto md:right-6 md:justify-end md:px-0"
      role="status"
      aria-live="polite"
    >
      <div
        class={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3.5 shadow-lg transition-all duration-200 ease-out ${style.box} ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        {style.icon}
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-slate-900">{message.text}</p>
          {message.hint && (
            <p class="mt-0.5 text-xs leading-relaxed text-slate-700">{message.hint}</p>
          )}
        </div>
        <button
          type="button"
          class="-m-1 shrink-0 rounded p-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
          onClick={onDone}
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
