import { describe, it, expect } from 'vitest';
import { isPlaced, matchesFilter, sortRows } from './filters';
import type { DerivedItem, Location } from '../../../../domain/types';

const row = (
  name: string, qty: number, status: DerivedItem['status'],
  byLocation: Record<string, number> = {},
): DerivedItem => ({
  item: {
    itemId: `ITM-${name}`, barcode: `ALQ-${name}`, name, categoryId: 'CAT-K',
    kind: 'consumable', unit: 'buah', trackBy: 'quantity', minStock: 2, active: true,
  },
  qty, byLocation, status, outstanding: 0, takenTotal: 0,
});

const rack = (locationId: string, code: string): Location => ({
  locationId, code, name: '', zone: 'Gudang', active: true,
});

describe('matchesFilter', () => {
  it('finds what needs buying, and what has run out, separately', () => {
    expect(matchesFilter(row('a', 1, 'low'), 'menipis')).toBe(true);
    expect(matchesFilter(row('a', 1, 'low'), 'habis')).toBe(false);
    expect(matchesFilter(row('b', 0, 'out'), 'habis')).toBe(true);
  });

  it('treats the unplaced pile as unplaced, even when there is plenty of it', () => {
    // The quantity is not the point — a thing with no shelf is the thing most likely to go
    // missing, which is why this is a filter and not just a word in a cell.
    expect(matchesFilter(row('a', 40, 'available', { '': 40 }), 'belum-ditempatkan')).toBe(true);
  });

  it('counts a thing as placed if any of it is on a real shelf', () => {
    expect(isPlaced(row('a', 5, 'available', { '': 2, 'LOC-A1': 3 }))).toBe(true);
    expect(matchesFilter(row('a', 5, 'available', { '': 2, 'LOC-A1': 3 }), 'belum-ditempatkan'))
      .toBe(false);
  });

  it('separates minus from habis — one is empty, the other is a contradiction', () => {
    expect(matchesFilter(row('a', -3, 'out'), 'minus')).toBe(true);
    expect(matchesFilter(row('b', 0, 'out'), 'minus')).toBe(false);
  });

  it('lets everything through when nothing is being asked', () => {
    expect(matchesFilter(row('a', 0, 'out'), 'semua')).toBe(true);
  });
});

describe('sortRows', () => {
  const racks = [rack('LOC-1', 'C3'), rack('LOC-2', 'A1')];
  const rows = [
    row('Sabun', 5, 'available', { 'LOC-1': 5 }),
    row('Ember', 1, 'low', { 'LOC-2': 1 }),
    row('Kanebo', 9, 'available', { '': 9 }),
  ];
  const names = (sorted: DerivedItem[]) => sorted.map((d) => d.item.name);

  it('sorts by name by default', () => {
    expect(names(sortRows(rows, 'nama', racks))).toEqual(['Ember', 'Kanebo', 'Sabun']);
  });

  it('puts the emptiest first — the order a shopping list is written in', () => {
    expect(names(sortRows(rows, 'stok-naik', racks))).toEqual(['Ember', 'Sabun', 'Kanebo']);
  });

  it('walks the gudang in shelf order, with the shelfless last', () => {
    // Sorting by rack is for a walk, and a row with no rack is not on it.
    expect(names(sortRows(rows, 'rak', racks))).toEqual(['Ember', 'Sabun', 'Kanebo']);
  });

  it('breaks ties by name, so the list does not reshuffle between visits', () => {
    const tied = [row('Zebra', 3, 'available'), row('Ayam', 3, 'available')];
    expect(names(sortRows(tied, 'stok-naik', racks))).toEqual(['Ayam', 'Zebra']);
  });

  it('never mutates what it was given', () => {
    const before = names(rows);
    sortRows(rows, 'stok-turun', racks);
    expect(names(rows)).toEqual(before);
  });
});
