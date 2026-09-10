// The QR for the thing you are looking at, on the page that shows it.
//
// SPLIT OUT AND LAZY, not because it is big on screen but because `qrcode-generator` is ~43kB
// and this page is in the main bundle. A static import here would put an encoder into the file
// a marbot downloads to write down how much sabun is on a shelf — the same objection §64.2
// makes about Clerk, applied to a screen instead of a vendor.
//
// `M` correction, not the `H` a printed label uses. `qr.ts` explains why at length: a code on a
// backlit screen held at arm's length for ten seconds is not going to be scratched or peel, and
// spending correction there buys nothing while costing density.

import { qrSvg } from '../labels/qr';

/**
 * One size for both callers, so the two codes on this page are the same object.
 *
 * Sized in CLASSES rather than a number, because it has to shrink on a phone: at 360px the
 * identity card is already carrying a drawing, a status pill and a quantity, and a fixed 76px
 * square pushes the name into two lines.
 */
const SIZE = 'h-14 w-14 sm:h-[4.75rem] sm:w-[4.75rem]';

export function ScanQr({ url, caption }: { url: string; caption: string }) {
  const qr = qrSvg(url, 'M');
  const span = qr.modules + qr.quietZone * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      /*
       * TRANSPARENT, deliberately — it used to paint its own white square.
       *
       * On a white card that is invisible, but the rack row highlights on hover, and a white
       * block sitting on the highlight reads as a misaligned patch: the quiet zone puts four
       * modules of margin between the code and the edge of that block, so the code looks
       * off-centre inside a rectangle that should not have been there at all.
       *
       * The quiet zone is still in the viewBox, so the spacing a scanner needs survives — it
       * just takes the colour of whatever it is sitting on. Both grounds here are white or a
       * hair off it, which is what a scanner is looking for anyway.
       */
      class={`shrink-0 ${SIZE}`}
      /* No caption. A QR on a screen is one of the few things that explains itself, and two
         "Pindai untuk buka" labels on one page is a sentence read twice for nothing. The
         accessible name still says what it is, for anybody who cannot see the square. */
      role="img"
      aria-label={`Kode QR ${caption}`}
      shape-rendering="crispEdges"
    >
      <path d={qr.d} fill="#0f172a" transform={`translate(${qr.quietZone} ${qr.quietZone})`} />
    </svg>
  );
}

/** The same footprint while the chunk loads, so nothing on the card jumps. */
export const QR_BOX = SIZE;
