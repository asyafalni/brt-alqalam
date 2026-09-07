import { describe, it, expect } from 'vitest';
import { deriveState } from './deriveState';
import { buildReport, percent } from './report';
import type { Item, Location, Txn } from './types';

const NOW = Date.parse('2026-09-06T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
const item = (p: Partial<Item> = {}): Item => {
  seq += 1;
  return {
    itemId: `ITM-${seq}`, barcode: `b${seq}`, name: `Barang ${seq}`, categoryId: 'CAT-K',
    kind: 'consumable', unit: 'buah', trackBy: 'quantity',
    minStock: 5, initialStock: 10, active: true, ...p,
  };
};

const loc = (p: Partial<Location> = {}): Location => ({
  locationId: 'LOC-A1', code: 'A1', name: '', zone: 'Gudang Utama', order: 1, active: true, ...p,
});

const NAMES: Record<string, string> = { 'CAT-K': 'Kebersihan', 'CAT-L': 'Listrik' };
const build = (items: Item[], locations: Location[] = [], txns: Txn[] = []) =>
  buildReport(items, locations, (id) => NAMES[id] ?? id, deriveState(items, [], txns, NOW), NOW);

describe('buildReport — totals', () => {
  it('counts items and folds their derived quantities, not their starting ones', () => {
    const sabun = item({ itemId: 'ITM-S', initialStock: 10 });
    const txn: Txn = {
      txnId: 't', clientTxnId: 'c', ts: NOW, type: 'pemakaian',
      itemId: 'ITM-S', qtyDelta: -4, actorUserId: 'u',
    };
    const r = build([sabun, item({ initialStock: 5 })], [], [txn]);
    expect(r.totalItems).toBe(2);
    expect(r.totalUnits).toBe(11);   // 6 + 5, not 15
  });
});

describe('buildReport — composition', () => {
  it('groups by category, largest first, because a report is read from the top', () => {
    const r = build([
      item({ categoryId: 'CAT-L' }),
      item({ categoryId: 'CAT-K' }),
      item({ categoryId: 'CAT-K' }),
    ]);
    expect(r.byCategory.map((s) => s.label)).toEqual(['Kebersihan', 'Listrik']);
    expect(r.byCategory[0]).toMatchObject({ items: 2, units: 20 });
  });

  it('groups by zone, and names the unplaced pile rather than dropping it', () => {
    const r = build(
      [item({ locationId: 'LOC-A1' }), item()],
      [loc({ zone: 'Gudang Utama' })],
    );
    expect(r.byZone.map((s) => s.label).sort()).toEqual(['Belum ditempatkan', 'Gudang Utama']);
  });

  it('groups by derived status', () => {
    const r = build([
      item({ initialStock: 20, minStock: 5 }),
      item({ initialStock: 3, minStock: 5 }),
      item({ initialStock: 0, minStock: 5 }),
    ]);
    expect(Object.fromEntries(r.byStatus.map((s) => [s.label, s.items])))
      .toEqual({ Tersedia: 1, Menipis: 1, Habis: 1 });
  });
});

describe('buildReport — data health, the part management actually needs', () => {
  it('separates what can be found from what cannot', () => {
    const r = build([item({ locationId: 'LOC-A1' }), item(), item()], [loc()]);
    expect(r.health).toMatchObject({ placed: 1, unplaced: 2 });
  });

  it('separates what is monitored from what can never raise an alarm', () => {
    const r = build([item({ minStock: 5 }), item({ minStock: null })]);
    expect(r.health).toMatchObject({ withMinimum: 1, withoutMinimum: 1 });
  });

  it('counts a rack nobody has ever checked as unknown, not as fine', () => {
    const r = build([], [
      loc({ locationId: 'A', lastCountedTs: NOW - 2 * DAY }),
      loc({ locationId: 'B' }),
      loc({ locationId: 'C', active: false }),   // retired racks are not owed a count
    ]);
    expect(r.health).toMatchObject({ racksCounted: 1, racksNeverCounted: 1 });
  });

  it('counts stock folded below zero — the log and the shelf disagree', () => {
    const sabun = item({ itemId: 'ITM-S', initialStock: 2, locationId: 'LOC-A1', minStock: 1 });
    const overdrawn: Txn = {
      txnId: 't', clientTxnId: 'c', ts: NOW, type: 'pemakaian',
      itemId: 'ITM-S', qtyDelta: -5, actorUserId: 'u',
    };
    const r = build([sabun], [loc()], [overdrawn]);
    expect(r.health.negativeStock).toBe(1);
    expect(r.totalUnits).toBe(-3);   // reported, never clamped: a hidden contradiction is worse
  });

  it('a register that contradicts itself cannot score as tidy', () => {
    const good = item({ itemId: 'A', initialStock: 5, locationId: 'LOC-A1', minStock: 1 });
    const bad = item({ itemId: 'B', initialStock: 1, locationId: 'LOC-A1', minStock: 1 });
    const overdrawn: Txn = {
      txnId: 't', clientTxnId: 'c', ts: NOW, type: 'pemakaian',
      itemId: 'B', qtyDelta: -9, actorUserId: 'u',
    };
    const clean = build([good, bad], [loc()]);
    const dirty = build([good, bad], [loc()], [overdrawn]);
    expect(clean.health.score).toBe(1);
    expect(dirty.health.score).toBeLessThan(clean.health.score);
  });

  it('scores placement and monitoring equally — both halves of a useful register', () => {
    const perfect = build([item({ locationId: 'LOC-A1', minStock: 5 })], [loc()]);
    expect(perfect.health.score).toBe(1);

    const half = build([item({ locationId: 'LOC-A1', minStock: null })], [loc()]);
    expect(half.health.score).toBe(0.5);

    expect(build([], []).health.score).toBe(0);   // nothing known about nothing
  });
});

describe('buildReport — honesty about what is missing', () => {
  it('reports movement as unavailable until an event log exists', () => {
    expect(build([item()]).movementAvailable).toBe(false);
  });

  it('never returns a person — the report is PII-free by construction (§39)', () => {
    const txn: Txn = {
      txnId: 't', clientTxnId: 'c', ts: NOW, type: 'peminjaman',
      itemId: 'ITM-1', qtyDelta: -1, actorUserId: 'USR-BUDI', recipient: 'Pak Yusuf',
    };
    const json = JSON.stringify(build([item({ itemId: 'ITM-1' })], [], [txn]));
    expect(json).not.toContain('Yusuf');
    expect(json).not.toContain('USR-BUDI');
  });
});

describe('percent', () => {
  it('rounds once, so the same figure never renders two ways', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
  });
  it('is 0 rather than NaN when there is nothing to divide', () => {
    expect(percent(0, 0)).toBe(0);
  });
});
