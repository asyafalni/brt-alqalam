import { describe, it, expect } from 'vitest';
import {
  contentsOf, lineAt, linesFor, linesFromLegacy, moveLine, racksFor, removeItem, removeLine,
  setLine, totalFor, UNPLACED,
} from './stock';
import type { Item, StockLine } from './types';

const item = (itemId: string, name = itemId): Item => ({
  itemId, barcode: `ALQ-${itemId}`, name, categoryId: 'CAT-K',
  kind: 'consumable', unit: 'galon', trackBy: 'quantity', minStock: 5, active: true,
});

const line = (itemId: string, locationId: string, initialStock: number): StockLine =>
  ({ itemId, locationId, initialStock });

describe('one item, several racks', () => {
  const stock = [line('ITM-1', 'LOC-A1', 4), line('ITM-1', 'LOC-A3', 6), line('ITM-2', 'LOC-A1', 2)];

  it('totals an item across every rack it is kept on', () => {
    // The whole point of the split: 4 + 6, not whichever rack happened to be recorded.
    expect(totalFor(stock, 'ITM-1')).toBe(10);
  });

  it('lists where a thing is kept', () => {
    expect(racksFor(stock, 'ITM-1')).toEqual(['LOC-A1', 'LOC-A3']);
  });

  it('reads one shelf without touching the others', () => {
    expect(lineAt(stock, 'ITM-1', 'LOC-A1')?.initialStock).toBe(4);
    expect(lineAt(stock, 'ITM-1', 'LOC-B9')).toBeUndefined();
  });
});

describe('setLine', () => {
  it('adds a rack the item was not kept on before', () => {
    const after = setLine([line('ITM-1', 'LOC-A1', 4)], 'ITM-1', 'LOC-A3', 6);
    expect(totalFor(after, 'ITM-1')).toBe(10);
    expect(linesFor(after, 'ITM-1')).toHaveLength(2);
  });

  it('updates one shelf and leaves the rest alone', () => {
    const before = [line('ITM-1', 'LOC-A1', 4), line('ITM-1', 'LOC-A3', 6)];
    const after = setLine(before, 'ITM-1', 'LOC-A1', 1);
    expect(lineAt(after, 'ITM-1', 'LOC-A1')?.initialStock).toBe(1);
    expect(lineAt(after, 'ITM-1', 'LOC-A3')?.initialStock).toBe(6);
  });

  it('keeps a line at zero rather than dropping it', () => {
    // "We keep sabun here and it has run out" is not "sabun was never kept here", and only
    // the first belongs on a shopping list or earns a walk to the shelf.
    const after = setLine([line('ITM-1', 'LOC-A1', 4)], 'ITM-1', 'LOC-A1', 0);
    expect(linesFor(after, 'ITM-1')).toHaveLength(1);
    expect(lineAt(after, 'ITM-1', 'LOC-A1')?.initialStock).toBe(0);
  });

  it('never mutates what it was given', () => {
    const before = [line('ITM-1', 'LOC-A1', 4)];
    setLine(before, 'ITM-1', 'LOC-A1', 99);
    expect(before[0].initialStock).toBe(4);
  });
});

describe('moveLine', () => {
  it('merges into a rack that already keeps the item', () => {
    const before = [line('ITM-1', 'LOC-A1', 4), line('ITM-1', 'LOC-A3', 6)];
    const after = moveLine(before, 'ITM-1', 'LOC-A1', 'LOC-A3');
    expect(linesFor(after, 'ITM-1')).toHaveLength(1);
    expect(lineAt(after, 'ITM-1', 'LOC-A3')?.initialStock).toBe(10);
  });

  it('carries the quantity to an empty rack', () => {
    const after = moveLine([line('ITM-1', 'LOC-A1', 4)], 'ITM-1', 'LOC-A1', UNPLACED);
    expect(lineAt(after, 'ITM-1', UNPLACED)?.initialStock).toBe(4);
    expect(lineAt(after, 'ITM-1', 'LOC-A1')).toBeUndefined();
  });

  it('does nothing when there is nothing on the source shelf', () => {
    const before = [line('ITM-1', 'LOC-A1', 4)];
    expect(moveLine(before, 'ITM-1', 'LOC-B9', 'LOC-A1')).toEqual(before);
  });
});

describe('removal', () => {
  it('forgets one shelf', () => {
    const after = removeLine([line('ITM-1', 'LOC-A1', 4), line('ITM-1', 'LOC-A3', 6)], 'ITM-1', 'LOC-A1');
    expect(racksFor(after, 'ITM-1')).toEqual(['LOC-A3']);
  });

  it('takes every line with a deleted item', () => {
    const after = removeItem([line('ITM-1', 'LOC-A1', 4), line('ITM-2', 'LOC-A1', 2)], 'ITM-1');
    expect(after).toHaveLength(1);
    expect(after[0].itemId).toBe('ITM-2');
  });
});

describe('contentsOf', () => {
  it('is what a cycle count walks through', () => {
    const items = [item('ITM-1', 'Sabun'), item('ITM-2', 'Kanebo')];
    const stock = [line('ITM-1', 'LOC-A1', 4), line('ITM-2', 'LOC-A1', 2), line('ITM-1', 'LOC-A3', 6)];
    const here = contentsOf(stock, items, 'LOC-A1');
    expect(here.map((r) => [r.item.name, r.initialStock])).toEqual([['Sabun', 4], ['Kanebo', 2]]);
  });

  it('drops a line whose item no longer exists — the catalog is the authority', () => {
    expect(contentsOf([line('GONE', 'LOC-A1', 4)], [item('ITM-1')], 'LOC-A1')).toEqual([]);
  });
});

describe('linesFromLegacy', () => {
  it('reads an old catalog without losing a single count', () => {
    // Every draft already on a tablet carries these two fields; losing them would mean
    // walking the gudang again.
    const lines = linesFromLegacy([
      { itemId: 'ITM-1', initialStock: 12, locationId: 'LOC-A1' },
      { itemId: 'ITM-2', initialStock: 3 },
    ]);
    expect(lines).toEqual([
      { itemId: 'ITM-1', locationId: 'LOC-A1', initialStock: 12 },
      { itemId: 'ITM-2', locationId: UNPLACED, initialStock: 3 },
    ]);
  });
});
