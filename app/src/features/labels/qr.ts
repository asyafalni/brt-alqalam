// QR rendering — pure. Matrix in, SVG path out. No DOM, no canvas.
//
// Vector, not canvas: these are printed and stuck on shelves and tools. An SVG path prints at
// the printer's own resolution, where a canvas bitmap would be resampled and lose module edges
// — which is exactly what makes a scan fail at an angle in bad light.

import qrcode from 'qrcode-generator';

/**
 * How much damage the code can survive, and it is a per-USE decision rather than a constant.
 *
 * `H` (~30% recoverable) is right for a printed label: it lives in a gudang, gets scratched,
 * greasy, water-marked and partly peeled, and redundancy is cheaper than reprinting a sheet.
 *
 * `M` (~15%) is right for a code shown on a SCREEN — clean, backlit, held at arm's length for
 * ten seconds, and nothing is going to peel. Spending correction there buys nothing and costs
 * density: the 240-character enrolment link needs 81 modules at H and 61 at M, which at a 240px
 * panel is 2.7px per module versus 3.5px. That difference is the difference between a scan that
 * works first time and one somebody has to fiddle with.
 */
export type QrCorrection = 'H' | 'Q' | 'M' | 'L';

export interface QrSvg {
  /** Modules per side, excluding the quiet zone. */
  modules: number;
  /** SVG path data in module units — draw it in a viewBox of `modules + 2 * quietZone`. */
  d: string;
  /** Quiet zone in modules. The spec requires 4; below that, scanners start failing. */
  quietZone: number;
}

const QUIET_ZONE = 4;

export function qrSvg(data: string, correction: QrCorrection = 'H'): QrSvg {
  const qr = qrcode(0, correction); // 0 = pick the smallest type that fits
  qr.addData(data);
  qr.make();

  const modules = qr.getModuleCount();
  const parts: string[] = [];

  // Merge horizontal runs into one rect each: a path with ~40 commands instead of ~1,400
  // keeps the printable sheet responsive when it holds a few hundred labels.
  for (let row = 0; row < modules; row += 1) {
    let runStart = -1;
    for (let col = 0; col <= modules; col += 1) {
      const dark = col < modules && qr.isDark(row, col);
      if (dark && runStart === -1) runStart = col;
      if (!dark && runStart !== -1) {
        parts.push(`M${runStart + QUIET_ZONE} ${row + QUIET_ZONE}h${col - runStart}v1h-${col - runStart}z`);
        runStart = -1;
      }
    }
  }

  return { modules, quietZone: QUIET_ZONE, d: parts.join('') };
}

/** Side length of the drawing area, in module units, including both quiet zones. */
export const qrViewBox = (qr: QrSvg): number => qr.modules + qr.quietZone * 2;
