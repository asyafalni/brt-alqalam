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

export function ScanQr(
  { url, caption, size = 76 }: { url: string; caption: string; size?: number },
) {
  const qr = qrSvg(url, 'M');
  const span = qr.modules + qr.quietZone * 2;

  return (
    <figure class="m-0 shrink-0 text-center">
      <svg
        viewBox={`0 0 ${span} ${span}`}
        width={size}
        height={size}
        class="rounded-md bg-white"
        role="img"
        aria-label={`Kode QR ${caption}`}
        shape-rendering="crispEdges"
      >
        <rect width={span} height={span} fill="#fff" />
        <path d={qr.d} fill="#0f172a" transform={`translate(${qr.quietZone} ${qr.quietZone})`} />
      </svg>
      {/* Said out loud, because a bare QR on a screen is a thing people photograph without
          knowing what it does. */}
      <figcaption class="mt-1 text-[10px] leading-tight text-slate-500">Pindai untuk buka</figcaption>
    </figure>
  );
}
