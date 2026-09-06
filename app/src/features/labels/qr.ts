// QR rendering — pure. Matrix in, SVG path out. No DOM, no canvas.
//
// Vector, not canvas: these are printed and stuck on shelves and tools. An SVG path prints at
// the printer's own resolution, where a canvas bitmap would be resampled and lose module edges
// — which is exactly what makes a scan fail at an angle in bad light.

import qrcode from 'qrcode-generator';

/**
 * Error correction H (~30% recoverable). Higher than the usual M because these labels live in
 * a gudang: they get scratched, greasy, water-marked and partly peeled. Redundancy is cheaper
 * than reprinting a sheet.
 */
const ERROR_CORRECTION = 'H' as const;

export interface QrSvg {
  /** Modules per side, excluding the quiet zone. */
  modules: number;
  /** SVG path data in module units — draw it in a viewBox of `modules + 2 * quietZone`. */
  d: string;
  /** Quiet zone in modules. The spec requires 4; below that, scanners start failing. */
  quietZone: number;
}

const QUIET_ZONE = 4;

export function qrSvg(data: string): QrSvg {
  const qr = qrcode(0, ERROR_CORRECTION); // 0 = pick the smallest type that fits
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
