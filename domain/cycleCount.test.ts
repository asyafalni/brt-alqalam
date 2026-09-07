import { describe, it, expect } from 'vitest';
import {
  countState, differences, DAY_MS, DEFAULT_INTERVAL_DAYS, racksToCount, summariseCount,
} from './cycleCount';
import type { CountLine } from './cycleCount';
import type { Item, Location } from './types';

const NOW = Date.parse('2026-09-06T00:00:00Z');
const daysAgo = (n: number) => NOW - n * DAY_MS;

const loc = (p: Partial<Location> = {}): Location => ({
  locationId: 'LOC-A1', code: 'A1', name: '', zone: 'Gudang Utama', order: 1, active: true, ...p,
});

let seq = 0;
const item = (p: Partial<Item> & { initialStock?: number } = {}): Item => {
  seq += 1;
  // `initialStock` is fixture shorthand: quantity lives on stock lines now, and these cases
  // are about the counting arithmetic rather than about where a thing is shelved.
  const { initialStock, ...rest } = p;
  return {
    itemId: `ITM-${seq}`, barcode: `b${seq}`, name: `Barang ${seq}`, categoryId: 'CAT-K',
    kind: 'consumable', unit: 'buah', trackBy: 'quantity',
    minStock: 5, active: true, ...rest,
  };
};

describe('countState', () => {
  it('a rack nobody has ever counted is unknown, not fine', () => {
    expect(countState(loc(), NOW)).toMatchObject({ freshness: 'never', daysSince: null });
  });

  it('is fresh inside the rotation and due outside it', () => {
    expect(countState(loc({ lastCountedTs: daysAgo(3) }), NOW).freshness).toBe('fresh');
    expect(countState(loc({ lastCountedTs: daysAgo(DEFAULT_INTERVAL_DAYS) }), NOW).freshness).toBe('due');
    expect(countState(loc({ lastCountedTs: daysAgo(90) }), NOW).freshness).toBe('due');
  });

  it('reports whole days since, for a human-readable "dicek N hari lalu"', () => {
    expect(countState(loc({ lastCountedTs: daysAgo(5) }), NOW).daysSince).toBe(5);
  });

  it('a count stamped after `now` reads as today, never as minus one day', () => {
    // Screens pin `now` at mount for a stable derivation, so a count saved mid-session is
    // stamped ahead of it. Without clamping this rendered "dicek -1 hari lalu".
    const justCounted = countState(loc({ lastCountedTs: NOW + 60_000 }), NOW);
    expect(justCounted.daysSince).toBe(0);
    expect(justCounted.freshness).toBe('fresh');
  });

  it('honours a custom rotation', () => {
    expect(countState(loc({ lastCountedTs: daysAgo(10) }), NOW, 7).freshness).toBe('due');
  });
});

describe('racksToCount — what to check next', () => {
  it('never-counted racks come first: unknown beats merely stale', () => {
    const order = racksToCount([
      loc({ locationId: 'B', code: 'B1', lastCountedTs: daysAgo(200) }),
      loc({ locationId: 'A', code: 'A1' }),
    ], NOW).map((s) => s.location.code);
    expect(order).toEqual(['A1', 'B1']);
  });

  it('then the longest overdue', () => {
    const order = racksToCount([
      loc({ locationId: 'B', code: 'B1', lastCountedTs: daysAgo(40) }),
      loc({ locationId: 'C', code: 'C1', lastCountedTs: daysAgo(120) }),
    ], NOW).map((s) => s.location.code);
    expect(order).toEqual(['C1', 'B1']);
  });

  it('leaves freshly counted racks alone — that is the whole point of a rotation', () => {
    expect(racksToCount([loc({ lastCountedTs: daysAgo(2) })], NOW)).toEqual([]);
  });

  it('skips retired racks', () => {
    expect(racksToCount([loc({ active: false })], NOW)).toEqual([]);
  });
});

describe('differences', () => {
  const line = (expected: number, counted: number | null): CountLine =>
    ({ item: item({ initialStock: expected }), expected, counted });

  it('a confirmed count is not a correction', () => {
    expect(differences([line(10, 10)])).toEqual([]);
  });

  it('an uncounted line is not a correction either — skipping is not "zero"', () => {
    expect(differences([line(10, null)])).toEqual([]);
  });

  it('reports the signed gap, so shrinkage reads negative', () => {
    expect(differences([line(10, 7)])[0]).toMatchObject({ expected: 10, counted: 7, delta: -3 });
    expect(differences([line(10, 12)])[0].delta).toBe(2);
  });

  it('counting zero IS a correction — an empty shelf is a finding', () => {
    expect(differences([line(4, 0)])[0].delta).toBe(-4);
  });
});

describe('summariseCount', () => {
  it('separates confirmed from corrected, and nets the drift', () => {
    const lines: CountLine[] = [
      { item: item(), expected: 10, counted: 10 },
      { item: item(), expected: 8, counted: 5 },
      { item: item(), expected: 4, counted: 6 },
      { item: item(), expected: 3, counted: null },
    ];
    expect(summariseCount(lines)).toEqual({
      lines: 4, counted: 3, matched: 1, differing: 2, netDelta: -1,
    });
  });

  it('an untouched sheet reports nothing done', () => {
    expect(summariseCount([{ item: item(), expected: 5, counted: null }]))
      .toMatchObject({ counted: 0, matched: 0, differing: 0, netDelta: 0 });
  });
});
