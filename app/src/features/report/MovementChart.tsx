// Stock movement over time.
//
// Hand-drawn SVG, like the donut beside it, and for the same three reasons: no library in a
// bundle a marbot downloads, no layout cost, and it prints exactly as drawn. A chart in a report
// that a browser strips on the way to the printer is not a chart.
//
// TWO SERIES, not one. "How much left the store" alone reads as loss; paired with what came
// back it reads as circulation, which is what actually happened — a Qurban week where forty
// knives go out and thirty-eight return is a very different fact from one where they do not.

import type { MovementDay, MovementSummary } from '../../../../domain/movement';

/** Viewport units. The SVG scales to its container; these only set the drawing's proportions. */
const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

const OUT = '#b45309';
const IN = '#0f766e';

const dayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

/**
 * A rounded gridline ceiling, so the axis reads 0·4·8 rather than 0·3.7·7.4.
 *
 * A chart's y-axis is read at a glance and its whole job is to let somebody estimate a value
 * without measuring it — which arbitrary decimals defeat.
 */
function ceiling(peak: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
  for (const s of steps) if (peak <= s * 4) return s * 4;
  return Math.ceil(peak / 1000) * 1000;
}

/**
 * A smooth path through the points, with the curve CLAMPED so it cannot dip below zero.
 *
 * An ordinary cubic spline overshoots on either side of a spike, and on a chart whose baseline
 * means "nothing moved" that draws a day where negative units left the store. The control
 * points here are horizontal only, which keeps every value the curve reaches between the two it
 * connects.
 */
function smooth(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const cx = (a.x + b.x) / 2;
    d += `C${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

export function MovementChart({ summary }: { summary: MovementSummary }) {
  const { days, peak } = summary;
  const top = ceiling(peak);

  const x = (i: number) => PAD.left + (days.length <= 1 ? PLOT.w / 2 : (i * PLOT.w) / (days.length - 1));
  const y = (v: number) => PAD.top + PLOT.h - (v / top) * PLOT.h;

  const series = (pick: (d: MovementDay) => number) => days.map((d, i) => ({ x: x(i), y: y(pick(d)) }));
  const outPts = series((d) => d.out);
  const inPts = series((d) => d.in);

  const area = (pts: { x: number; y: number }[]) =>
    `${smooth(pts)}L${pts[pts.length - 1].x},${y(0)}L${pts[0].x},${y(0)}Z`;

  /* Four lines including the baseline, which is the value that matters most: on this chart zero
     means "nothing moved", and it has to be findable without counting. */
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f, y: y(top * f) }));

  /* At most six dates. A label under every one of thirty days is a grey smear, and the reader
     only needs enough to place the shape in time. */
  const every = Math.max(1, Math.ceil(days.length / 6));

  return (
    <figure class="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="h-44 w-full sm:h-52"
        role="img"
        preserveAspectRatio="none"
        aria-label={
          `Pergerakan stok ${summary.span} hari terakhir: ${summary.totalOut} unit keluar, `
          + `${summary.totalIn} unit kembali. Puncak ${peak} unit dalam sehari.`
        }
      >
        {grid.map((g) => (
          <g key={g.v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={g.y}
              y2={g.y}
              stroke={g.v === 0 ? '#94a3b8' : '#e2e8f0'}
              stroke-width={g.v === 0 ? 1 : 1}
            />
            <text
              x={PAD.left - 6}
              y={g.y + 3}
              text-anchor="end"
              class="fill-slate-500"
              style="font-size:9px;font-variant-numeric:tabular-nums"
            >
              {Math.round(g.v)}
            </text>
          </g>
        ))}

        {/* Masuk UNDER keluar: it is the smaller, quieter series almost every week, and drawn on
            top its fill would wash the one people came to read. */}
        <path d={area(inPts)} fill={IN} opacity="0.10" />
        <path d={area(outPts)} fill={OUT} opacity="0.12" />
        <path d={smooth(inPts)} fill="none" stroke={IN} stroke-width="2" stroke-linecap="round" opacity="0.75" />
        <path d={smooth(outPts)} fill="none" stroke={OUT} stroke-width="2.5" stroke-linecap="round" />

        {/* A dot only where something actually happened. A marker on every quiet day turns the
            baseline into a dotted rule and hides the days that are the story. */}
        {days.map((d, i) => (d.out > 0 ? (
          <circle key={`o${d.ts}`} cx={x(i)} cy={y(d.out)} r="3" fill={OUT}>
            <title>{`${dayLabel(d.ts)} — ${d.out} unit keluar`}</title>
          </circle>
        ) : null))}
        {days.map((d, i) => (d.in > 0 ? (
          <circle key={`i${d.ts}`} cx={x(i)} cy={y(d.in)} r="2.5" fill={IN}>
            <title>{`${dayLabel(d.ts)} — ${d.in} unit kembali`}</title>
          </circle>
        ) : null))}

        {days.map((d, i) => (i % every === 0 || i === days.length - 1 ? (
          <text
            key={`x${d.ts}`}
            x={x(i)}
            y={H - 6}
            text-anchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}
            class="fill-slate-500"
            style="font-size:9px"
          >
            {dayLabel(d.ts)}
          </text>
        ) : null))}
      </svg>

      <figcaption class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span class="flex items-center gap-1.5">
          <span class="h-0.5 w-4 rounded-full" style={`background:${OUT};print-color-adjust:exact`} />
          Keluar <strong class="font-semibold tabular-nums text-slate-900">{summary.totalOut}</strong>
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-0.5 w-4 rounded-full" style={`background:${IN};print-color-adjust:exact`} />
          Kembali <strong class="font-semibold tabular-nums text-slate-900">{summary.totalIn}</strong>
        </span>
      </figcaption>
    </figure>
  );
}
