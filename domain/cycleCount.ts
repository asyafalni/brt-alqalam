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

/**
 * How much of the gudang has been walked at all — the stock-take's finish line.
 *
 * §59's stage 1 is a PROJECT: walk the room once and come out with a register. A project needs
 * an end, and Opname had none — it measured itself in items recorded, a number that only ever
 * goes up, so the job read as one that never finishes. What actually finishes is the racks:
 * there is a fixed number of them, and every one either has been visited or has not.
 *
 * Deliberately NOT the same question as `racksToCount`. That one asks "what has drifted" and
 * mixes never-walked racks in with ones due for their monthly re-count. Here they are opposite
 * facts: a rack nobody has ever opened means the register does not know what is in it, and no
 * amount of re-counting the other fourteen changes that.
 */
export interface Coverage {
  /** Active racks — the denominator. */
  total: number;
  /** Racks walked at least once. */
  walked: number;
  /** The ones still unknown, in the order the board shows them. */
  pending: Location[];
  /** True only when there is something to have finished. An empty gudang is not "done". */
  done: boolean;
}

export function coverage(locations: readonly Location[]): Coverage {
  const active = locations.filter((l) => l.active);
  const pending = active
    .filter((l) => l.lastCountedTs == null)
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.order - b.order);
  return {
    total: active.length,
    walked: active.length - pending.length,
    pending,
    done: active.length > 0 && pending.length === 0,
  };
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
