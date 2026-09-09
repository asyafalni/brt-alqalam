// Stock movement over time.
//
// Hand-drawn SVG, like the donut beside it, and for the same three reasons: no library in a
// bundle a marbot downloads, no layout cost, and it prints exactly as drawn. A chart in a report
// that a browser strips on the way to the printer is not a chart.
//
// TWO SERIES, not one. "How much left the store" alone reads as loss; paired with what came
// back it reads as circulation, which is what actually happened — a Qurban week where forty
// knives go out and thirty-eight return is a very different fact from one where they do not.

import { useState } from 'octane';
import type { MovementDay, MovementSummary } from '../../../../domain/movement';
import type { Item } from '../../../../domain/types';
import { assetOwner } from '../stocktake/draft';

/** Viewport units. The SVG scales to its container; these only set the drawing's proportions. */
const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

const OUT = '#b45309';
const IN = '#0f766e';

/**
 * The name behind a breakdown key.
 *
 * A quantity movement is keyed by `itemId`; a per-unit one by `assetId`, which is the item's
 * barcode plus a unit number — the same resolution Histori does, and for the same reason: an id
 * on screen is a question, not an answer.
 */
function nameOf(key: string, items: readonly Item[]): string {
  const direct = items.find((i) => i.itemId === key);
  if (direct) return direct.name;
  const owner = assetOwner(key, items);
  return owner ? `${owner.item.name} #${owner.unit}` : key;
}

const fullDate = (ts: number) =>
  new Date(ts).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

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

export function MovementChart(
  { summary, items }: { summary: MovementSummary; items: readonly Item[] },
) {
  const { days, peak } = summary;
  /* Which day is being pointed at. `null` is the resting state, and the chart reads perfectly
     well without it — the tooltip adds detail, it does not carry the meaning. */
  const [at, setAt] = useState<number | null>(null);
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

  const day = at === null ? null : days[at];

  return (
    <figure class="m-0">
      <div class="relative" onPointerLeave={() => setAt(null)}>
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
          <circle key={`o${d.ts}`} cx={x(i)} cy={y(d.out)} r={at === i ? 4.5 : 3} fill={OUT} />
        ) : null))}
        {days.map((d, i) => (d.in > 0 ? (
          <circle key={`i${d.ts}`} cx={x(i)} cy={y(d.in)} r={at === i ? 4 : 2.5} fill={IN} />
        ) : null))}

        {/* The day being pointed at, marked on the chart itself — otherwise the panel names a
            date and leaves the eye to find it. */}
        {at !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1={PAD.top}
            y2={y(0)}
            stroke="#0f172a"
            stroke-width="1"
            stroke-dasharray="3 3"
            opacity="0.35"
          />
        )}

        {/*
          * FULL-HEIGHT hit areas, one per day.
          *
          * A 3px dot is a target nobody can hit, and on the quiet days there is no dot at all —
          * yet "nothing moved that day" is an answer worth being able to ask for. A column
          * spanning the plot means pointing anywhere near a day works, which is how a person
          * actually points at a chart.
          */}
        {days.map((d, i) => (
          <rect
            key={`h${d.ts}`}
            x={x(i) - PLOT.w / Math.max(1, days.length - 1) / 2}
            y={PAD.top}
            width={PLOT.w / Math.max(1, days.length - 1)}
            height={PLOT.h}
            fill="transparent"
            /* Pointer events cover mouse, pen and TOUCH in one listener — a tablet has no
               hover, and a chart whose detail only mouse users can reach is half a chart. */
            onPointerEnter={() => setAt(i)}
            onPointerDown={() => setAt(i)}
          />
        ))}

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

      {day && <Detail day={day} items={items} at={at!} of={days.length} />}
      </div>

      {/* The whole series in text, for anybody not pointing at anything — a screen reader, a
          printed copy, or somebody who just wants the numbers. `sr-only` keeps it out of the
          page without keeping it out of the document. */}
      <table class="sr-only">
        <caption>Pergerakan stok per hari</caption>
        <thead>
          <tr><th>Tanggal</th><th>Unit keluar</th><th>Unit kembali</th><th>Barang</th></tr>
        </thead>
        <tbody>
          {days.filter((d) => d.out > 0 || d.in > 0).map((d) => (
            <tr key={d.ts}>
              <td>{fullDate(d.ts)}</td>
              <td>{d.out}</td>
              <td>{d.in}</td>
              <td>{d.items.map((r) => `${nameOf(r.key, items)} ${r.out > 0 ? `-${r.out}` : `+${r.in}`}`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

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

/** At most this many named items before the rest collapse into a count. */
const NAMED = 4;

/**
 * What happened on one day.
 *
 * Positioned along the chart in PERCENT, because the SVG is `preserveAspectRatio="none"` over a
 * fixed viewBox — so a viewBox x maps straight onto a percentage of the rendered width whatever
 * the container is doing. It flips its anchor near either end rather than being clipped: a panel
 * that runs off the card is a panel that answers nothing on the two days most likely to be the
 * interesting ones, the first and the last.
 */
function Detail(
  { day, items, at, of }:
  { day: MovementDay; items: readonly Item[]; at: number; of: number },
) {
  const pct = of <= 1 ? 50 : (PAD.left + (at * PLOT.w) / (of - 1)) / W * 100;
  const anchor = pct < 30 ? 'left-0' : pct > 70 ? 'right-0' : '';
  const style = anchor === '' ? `left:${pct}%;transform:translateX(-50%)` : '';

  const shown = day.items.slice(0, NAMED);
  const rest = day.items.length - shown.length;

  return (
    <div
      class={`pointer-events-none absolute top-1 z-10 w-56 rounded-lg border border-slate-300 bg-white p-3 shadow-lg ${anchor}`}
      style={style}
      role="status"
    >
      <p class="text-xs font-bold text-slate-900">{fullDate(day.ts)}</p>

      {day.out === 0 && day.in === 0 ? (
        /* Said out loud. A blank panel on a quiet day reads as the tooltip being broken, and
           "nothing moved" is a real answer somebody came looking for. */
        <p class="mt-1 text-xs text-slate-600">Tidak ada pergerakan.</p>
      ) : (
        <>
          <p class="mt-1 flex flex-wrap gap-x-3 text-xs">
            {day.out > 0 && (
              <span style={`color:${OUT}`} class="font-semibold tabular-nums">
                {day.out} keluar
              </span>
            )}
            {day.in > 0 && (
              <span style={`color:${IN}`} class="font-semibold tabular-nums">
                {day.in} kembali
              </span>
            )}
          </p>
          <ul class="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {shown.map((r) => (
              <li key={r.key} class="flex items-baseline justify-between gap-2 text-xs">
                <span class="min-w-0 truncate text-slate-700">{nameOf(r.key, items)}</span>
                <span class="shrink-0 font-semibold tabular-nums text-slate-900">
                  {r.out > 0 ? `−${r.out}` : `+${r.in}`}
                </span>
              </li>
            ))}
            {rest > 0 && (
              <li class="text-xs italic text-slate-500">dan {rest} barang lain</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
