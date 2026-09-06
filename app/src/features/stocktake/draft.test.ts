import { describe, it, expect } from 'vitest';
import {
  createItem, nextItemId, toItemsCsv, validate, isBlocking, summarise,
  instancesFor, toInstancesCsv, createCategory, toCategoriesCsv, updateItem, toInput, filterItems,
} from './draft';
import type { DraftInput } from './draft';
import { parseItems, parseInstances, parseCategories } from '../../../../data/parse';
import type { Item } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});

describe('id generation', () => {
  it('starts at ITM-0001 and derives the barcode', () => {
    const i = createItem(input(), []);
    expect(i.itemId).toBe('ITM-0001');
    expect(i.barcode).toBe('ALQ-ITM-0001');
  });

  it('continues from the highest id, not the count — a deleted row never resurrects an id', () => {
    const items = [createItem(input(), []), createItem(input(), [createItem(input(), [])])];
    const afterDelete = [items[1]]; // ITM-0002 kept, ITM-0001 deleted
    expect(nextItemId(afterDelete)).toBe('ITM-0003');
  });
});

describe('trackBy defaults from kind, overridable', () => {
  it('consumable → quantity, equipment → instance', () => {
    expect(createItem(input({ kind: 'consumable' }), []).trackBy).toBe('quantity');
    expect(createItem(input({ kind: 'equipment' }), []).trackBy).toBe('instance');
  });
  it('honours an explicit override (a durable you count, e.g. terpal)', () => {
    expect(createItem(input({ kind: 'equipment', trackBy: 'quantity' }), []).trackBy).toBe('quantity');
  });
});

describe('validate', () => {
  it('accepts a complete entry', () => {
    expect(validate(input(), [])).toEqual([]);
  });

  it('blocks on the fields that cannot be fixed later', () => {
    const p = validate(input({ name: '  ', categoryId: '', unit: '', initialStock: -1 }), []);
    expect(p.map((x) => x.field).sort()).toEqual(['categoryId', 'initialStock', 'name', 'unit']);
    expect(p.every(isBlocking)).toBe(true);
  });

  it('allows a null minimum — "(-)" means never notify', () => {
    expect(validate(input({ minStock: null }), [])).toEqual([]);
  });

  it('warns about a duplicate name without blocking it', () => {
    const existing = [createItem(input({ name: 'Sabun' }), [])];
    const p = validate(input({ name: 'sabun' }), existing);
    expect(p).toHaveLength(1);
    expect(isBlocking(p[0])).toBe(false);
  });
});

describe('CSV export', () => {
  const items: Item[] = [
    createItem(input({ name: 'Sabun cuci, besar' }), []),
    createItem(input({ name: 'Pisau "tajam"', kind: 'equipment', minStock: null, initialStock: 0 }),
      [createItem(input(), [])]),
  ];

  it('round-trips through the real sheet parser with zero quarantine', () => {
    const parsed = parseItems(toItemsCsv(items));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok).toHaveLength(2);
  });

  it('preserves values exactly, including commas, quotes and the "(-)" minimum', () => {
    const parsed = parseItems(toItemsCsv(items));
    expect(parsed.ok[0].name).toBe('Sabun cuci, besar');
    expect(parsed.ok[1].name).toBe('Pisau "tajam"');
    expect(parsed.ok[1].minStock).toBeNull();
    expect(parsed.ok[1].trackBy).toBe('instance');
  });

  it('emits the exact header the Items sheet tab expects', () => {
    expect(toItemsCsv([]).trim())
      .toBe('itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,initialStock,active,locationId');
  });

  it('round-trips the rack an item sits on, and leaves it blank when unplaced', () => {
    const placed = createItem(input({ locationId: 'LOC-B3' }), []);
    const loose = createItem(input(), [placed]);
    const parsed = parseItems(toItemsCsv([placed, loose]));

    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[0].locationId).toBe('LOC-B3');
    expect(parsed.ok[1].locationId).toBeUndefined();  // "belum ditempatkan" survives the trip
  });
});

describe('summarise', () => {
  it('counts rows, distinct categories and total units', () => {
    const a = createItem(input({ initialStock: 10 }), []);
    const b = createItem(input({ categoryId: 'CAT-PHBI', initialStock: 4 }), [a]);
    expect(summarise([a, b])).toEqual({ count: 2, categories: 2, units: 14 });
  });
});

describe('asset instances are derived from the item, not stored', () => {
  const TS0 = Date.parse('2026-09-06T00:00:00Z');

  it('an instance-tracked durable yields one labelled unit per count', () => {
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }), []);
    const inst = instancesFor(pisau, TS0);
    expect(inst.map((a) => a.assetId)).toEqual(['ALQ-ITM-0001-001', 'ALQ-ITM-0001-002', 'ALQ-ITM-0001-003']);
    expect(inst.map((a) => a.label)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
  });

  it('quantity-tracked things get no instances — consumables and counted durables alike', () => {
    const sabun = createItem(input({ kind: 'consumable', initialStock: 10 }), []);
    const terpal = createItem(input({ kind: 'equipment', trackBy: 'quantity', initialStock: 10 }), []);
    expect(instancesFor(sabun, TS0)).toEqual([]);
    expect(instancesFor(terpal, TS0)).toEqual([]);
  });

  it('lowering the count simply drops the last units', () => {
    const before = createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 5 }), []);
    const after = updateItem([before], before.itemId, { ...toInput(before), initialStock: 3 })[0];
    expect(instancesFor(after, TS0).map((a) => a.assetId))
      .toEqual(instancesFor(before, TS0).slice(0, 3).map((a) => a.assetId));
  });

  it('exports instances in the shape the AssetInstances tab parses', () => {
    const items = [createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 2 }), [])];
    const parsed = parseInstances(toInstancesCsv(items, TS0));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok).toHaveLength(2);
    expect(parsed.ok[0].acquiredTs).toBe(TS0);
  });
});

describe('categories are free-form and editable', () => {
  it('derives a readable id from the name', () => {
    expect(createCategory('  Alat Masak ', []).categoryId).toBe('CAT-ALAT-MASAK');
  });

  it('never collides with an existing id', () => {
    const first = createCategory('Dapur', []);
    const second = createCategory('Dapur', [first]);
    expect(second.categoryId).toBe('CAT-DAPUR-2');
    expect(createCategory('Dapur', [first, second]).categoryId).toBe('CAT-DAPUR-3');
  });

  it('falls back rather than producing an empty id', () => {
    expect(createCategory('!!!', []).categoryId).toBe('CAT-LAIN');
  });

  it('exports in the shape the Categories tab parses', () => {
    const cats = [createCategory('Kebersihan', []), createCategory('Alat, berat', [])];
    const parsed = parseCategories(toCategoriesCsv(cats));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[1].name).toBe('Alat, berat');
  });
});

describe('editing a row in place', () => {
  it('keeps the id and barcode — they may already be on a printed label', () => {
    const before = createItem(input({ name: 'Sabun' }), []);
    const after = updateItem([before], before.itemId, { ...toInput(before), name: 'Sabun cair', initialStock: 7 })[0];
    expect(after.itemId).toBe(before.itemId);
    expect(after.barcode).toBe(before.barcode);
    expect(after).toMatchObject({ name: 'Sabun cair', initialStock: 7 });
  });

  it('re-derives trackBy when the kind changes', () => {
    const before = createItem(input({ kind: 'consumable' }), []);
    const after = updateItem([before], before.itemId, { ...toInput(before), kind: 'equipment', trackBy: undefined })[0];
    expect(after.trackBy).toBe('instance');
  });

  it('does not flag the row being edited as a duplicate of itself', () => {
    const existing = [createItem(input({ name: 'Sapu' }), [])];
    expect(validate(toInput(existing[0]), existing)).toHaveLength(1);            // as a new row: warned
    expect(validate(toInput(existing[0]), existing, existing[0].itemId)).toEqual([]); // as an edit: fine
  });
});

describe('filterItems', () => {
  const items = [
    createItem(input({ name: 'Sabun cuci', unit: 'galon' }), []),
    createItem(input({ name: 'Pisau', unit: 'buah' }), [createItem(input(), [])]),
  ];

  it('matches on name or unit, case-insensitively', () => {
    expect(filterItems(items, 'sabun').map((i) => i.name)).toEqual(['Sabun cuci']);
    expect(filterItems(items, 'BUAH').map((i) => i.name)).toEqual(['Pisau']);
  });

  it('an empty query returns everything', () => {
    expect(filterItems(items, '  ')).toHaveLength(2);
  });
});
