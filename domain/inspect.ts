// When a labelled unit was last actually looked at.
//
// THE CLAIM NOBODY WAS CHECKING. `available` on a durable is a statement about its CONDITION,
// and until now nothing ever verified it. A rack has `lastCountedTs` and a rotation, and the
// report even says out loud that "rak yang belum pernah dicek bukan berarti aman". A unit had
// no equivalent at all — so a katrol bought for one Qurban reads as `available` for the eleven
// months nobody touches it, and the morning it is needed is when its condition is discovered.
//
// The owner's own framing (Q5/Q6): the event is short, the maintenance runs all year, and a
// thing still usable gets used again next year. That only works if somebody can say, on a
// date, that it was still usable.
//
// DERIVED FROM THE LOG, not stored. Instances are generated from the count (`instancesFor`),
// so there is no row to stamp — which is the right answer anyway: everything else here is
// folded from events, and a stored "last checked" would be one more number to keep in step.

import type { Txn } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a durable may sit before its condition is a guess again.
 *
 * SIX MONTHS, not the racks' thirty days, and the difference is the point: a rack is walked
 * past every week, while a Qurban knife is deliberately untouched for most of the year. A
 * monthly alarm on forty knives would be permanently red, and an alarm that is always on is an
 * alarm nobody reads. Twice a year means there is still time to repair or replace before the
 * one week it matters.
 */
export const INSPECT_INTERVAL_DAYS = 180;

export type InspectLevel = 'baru' | 'lama' | 'belum-pernah';

export interface Inspection {
  /** When it was last confirmed good; `null` if never. */
  ts: number | null;
  days: number | null;
  level: InspectLevel;
}

/** The most recent `pemeriksaan` for each unit. One pass over the log, not one per unit. */
export function lastInspected(txns: readonly Txn[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== 'pemeriksaan' || !t.assetId) continue;
    const prev = seen.get(t.assetId);
    if (prev == null || t.ts > prev) seen.set(t.assetId, t.ts);
  }
  return seen;
}

export function inspection(
  ts: number | undefined,
  now: number,
  intervalDays: number = INSPECT_INTERVAL_DAYS,
): Inspection {
  /* Never looked at is NOT the same as looked at long ago, and it is the worse of the two: a
     unit that has never been checked has never had its condition confirmed by anybody, so the
     register is repeating an assumption made the day it was counted. */
  if (ts == null) return { ts: null, days: null, level: 'belum-pernah' };
  const days = Math.max(0, Math.floor((now - ts) / DAY_MS));
  return { ts, days, level: days >= intervalDays ? 'lama' : 'baru' };
}
