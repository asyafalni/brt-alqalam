// Stock movement over time — the one thing every other part of the report cannot show.
//
// Composition and status answer "what do we have, and what is wrong with it". Both are a
// photograph. This is the film: how fast the store is being used, and whether that is steady or
// a spike around an event. It is the section a takmir report is actually asked for.
//
// It reads the RAW LOG rather than derived state, and deliberately. `deriveState` answers "how
// much is there now"; this answers "what happened, and when" — and a reversal is itself
// something that happened, on the day it was recorded. Netting them away would quietly redraw
// history to look like the mistake never occurred.

import type { Txn } from './types';

/** One item's share of a day, so the chart can answer "what moved" and not only "how much". */
export interface MovementItem {
  /** `itemId` where there is one; an `assetId` otherwise, which the UI resolves back. */
  key: string;
  out: number;
  in: number;
}

export interface MovementDay {
  /** Midnight, local time, of the day this bucket covers. */
  ts: number;
  /** Units that LEFT the store that day, as a positive number. */
  out: number;
  /** Units that came back or were added, as a positive number. */
  in: number;
  /**
   * What moved, biggest first.
   *
   * A total answers "was it a busy day"; this answers the question somebody actually has next,
   * which is "busy with WHAT" — and it is the difference between a chart you look at and a
   * chart you can act on. Kept in the domain rather than re-derived in the tooltip so the
   * breakdown and the total can never disagree.
   */
  items: MovementItem[];
}

export interface MovementSummary {
  days: MovementDay[];
  /** The tallest bar in either series, for scaling. Never zero, so a flat chart still draws. */
  peak: number;
  totalOut: number;
  totalIn: number;
  /**
   * Units leaving per week, averaged over the window actually shown.
   *
   * Per WEEK, not per day: a masjid's rhythm is weekly — Jumat, the weekend kajian — so a daily
   * mean lands between two very different kinds of day and describes neither.
   */
  perWeek: number;
  /** How many days the window covers. Zero when there is nothing to draw. */
  span: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight, because a report is read in the reader's own day, not in UTC's. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * One bucket per day, from the first recorded movement up to today.
 *
 * `maxDays` caps the window at the RECENT past rather than compressing a year into the same
 * width: past a month the individual days stop being legible and the chart becomes a texture.
 * `minDays` pads the other way, so three movements in two days do not draw a chart two points
 * wide that reads as a trend.
 */
export function movementSeries(
  txns: readonly Txn[],
  now: number,
  { maxDays = 30, minDays = 7 }: { maxDays?: number; minDays?: number } = {},
): MovementSummary {
  const moving = txns.filter((t) => t.qtyDelta !== 0);
  if (moving.length === 0) {
    return { days: [], peak: 1, totalOut: 0, totalIn: 0, perWeek: 0, span: 0 };
  }

  const today = startOfDay(now);
  const earliest = startOfDay(moving.reduce((min, t) => (t.ts < min ? t.ts : min), moving[0].ts));
  const covered = Math.floor((today - earliest) / DAY) + 1;
  const span = Math.min(maxDays, Math.max(minDays, covered));
  const from = today - (span - 1) * DAY;

  const buckets = new Map<number, MovementDay>();
  for (let i = 0; i < span; i += 1) {
    const ts = from + i * DAY;
    buckets.set(ts, { ts, out: 0, in: 0, items: [] });
  }

  let totalOut = 0;
  let totalIn = 0;
  for (const t of moving) {
    const day = buckets.get(startOfDay(t.ts));
    // Older than the window: counted in neither total, because a total that disagrees with the
    // chart above it is the kind of number somebody takes to a meeting and is wrong there.
    if (!day) continue;
    const key = t.itemId ?? t.assetId ?? '';
    let row = day.items.find((r) => r.key === key);
    if (!row) { row = { key, out: 0, in: 0 }; day.items.push(row); }

    if (t.qtyDelta < 0) {
      day.out += -t.qtyDelta;
      row.out += -t.qtyDelta;
      totalOut += -t.qtyDelta;
    } else {
      day.in += t.qtyDelta;
      row.in += t.qtyDelta;
      totalIn += t.qtyDelta;
    }
  }

  const days = [...buckets.values()];
  // Biggest mover first: on a day with six items the first one is usually the story.
  for (const d of days) d.items.sort((a, b) => (b.out + b.in) - (a.out + a.in));
  const peak = Math.max(1, ...days.map((d) => Math.max(d.out, d.in)));

  return {
    days,
    peak,
    totalOut,
    totalIn,
    perWeek: Math.round((totalOut / span) * 7 * 10) / 10,
    span,
  };
}
