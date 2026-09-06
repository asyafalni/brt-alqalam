import { describe, it, expect } from 'vitest';
import { createItem, nextItemId, toItemsCsv, validate, isBlocking, summarise } from './draft';
import type { DraftInput } from './draft';
import { parseItems } from '../../../../data/parse';
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
      .toBe('itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,initialStock,active');
  });
});

describe('summarise', () => {
  it('counts rows, distinct categories and total units', () => {
    const a = createItem(input({ initialStock: 10 }), []);
    const b = createItem(input({ categoryId: 'CAT-PHBI', initialStock: 4 }), [a]);
    expect(summarise([a, b])).toEqual({ count: 2, categories: 2, units: 14 });
  });
});
