// Cycle counts — recount a slice on a rotation, never the whole room.
//
// A single opname produces a register that is true for one day. What keeps it true is
// re-counting a little, often. A rack is the right slice: small enough that someone actually
// does it, big enough to be worth walking to.
//
// Pure. No I/O, no framework.

import type { Item, Location } from './types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Default rotation. Every rack gets looked at roughly monthly. */
export const DEFAULT_INTERVAL_DAYS = 30;

export type CountFreshness = 'never' | 'due' | 'fresh';

export interface RackCountState {
  location: Location;
  freshness: CountFreshness;
  /** Whole days since the last count; `null` if it has never been counted. */
  daysSince: number | null;
}

export function countState(
  location: Location,
  now: number,
  intervalDays: number = DEFAULT_INTERVAL_DAYS,
): RackCountState {
  if (location.lastCountedTs == null) return { location, freshness: 'never', daysSince: null };
  // Clamped at 0. A count stamped *after* the caller's `now` is not "minus one day ago" — it
  // is today. This is a real case, not a defensive nicety: screens pin `now` at mount so the
  // derivation is stable, so any count saved during that session is stamped ahead of it.
  const daysSince = Math.max(0, Math.floor((now - location.lastCountedTs) / DAY_MS));
  return {
    location,
    daysSince,
    freshness: daysSince >= intervalDays ? 'due' : 'fresh',
  };
}

/**
 * What to check next. Never-counted racks first — an uncounted rack is not "probably fine",
 * it is unknown — then the longest-overdue.
 */
export function racksToCount(
  locations: readonly Location[],
  now: number,
  intervalDays: number = DEFAULT_INTERVAL_DAYS,
): RackCountState[] {
  return locations
    .filter((l) => l.active)
    .map((l) => countState(l, now, intervalDays))
    .filter((s) => s.freshness !== 'fresh')
    .sort((a, b) => {
      if (a.freshness !== b.freshness) return a.freshness === 'never' ? -1 : 1;
      return (b.daysSince ?? 0) - (a.daysSince ?? 0);
    });
}

export interface CountLine {
  item: Item;
  /** What the system believes is there. */
  expected: number;
  /** What the person actually counted; `null` until they enter it. */
  counted: number | null;
}

export interface CountDiff {
  item: Item;
  expected: number;
  counted: number;
  /** counted − expected. Negative means less on the shelf than the books claim. */
  delta: number;
}

/** Only lines that were counted AND disagree. Confirming a correct count is not a correction. */
export function differences(lines: readonly CountLine[]): CountDiff[] {
  return lines
    .filter((l): l is CountLine & { counted: number } => l.counted != null && l.counted !== l.expected)
    .map((l) => ({ item: l.item, expected: l.expected, counted: l.counted, delta: l.counted - l.expected }));
}

export interface CountSummary {
  lines: number;
  counted: number;
  matched: number;
  differing: number;
  /** Net units gained or lost across the rack — the number worth reporting upward. */
  netDelta: number;
}

export function summariseCount(lines: readonly CountLine[]): CountSummary {
  const counted = lines.filter((l) => l.counted != null);
  const diffs = differences(lines);
  return {
    lines: lines.length,
    counted: counted.length,
    matched: counted.length - diffs.length,
    differing: diffs.length,
    netDelta: diffs.reduce((n, d) => n + d.delta, 0),
  };
}
