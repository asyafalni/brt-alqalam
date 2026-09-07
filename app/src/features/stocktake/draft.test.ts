import { describe, it, expect } from 'vitest';
import {
  archiveLocation,
  blocksArchive,
  blocksDelete,
  createCategory,
  createEntry,
  createItem,
  createLocation,
  deleteLocation,
  editLocation,
  filterItems,
  instancesFor,
  isBlocking,
  nextItemId,
  racksInZone,
  renameZone,
  restoreLocation,
  summarise,
  toCategoriesCsv,
  toInput,
  toInstancesCsv,
  toItemsCsv,
  toStockCsv,
  updateEntry,
  updateItem,
  validate,
  zonesOf,
} from './draft';
import type { DraftInput } from './draft';
import { parseItems, parseInstances, parseCategories, parseStock } from '../../../../data/parse';
import type { Item } from '../../../../domain/types';
import { totalFor } from '../../../../domain/stock';

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
      // No `initialStock` or `locationId`: those are the Stock tab now, one row per rack.
      .toBe('itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,active,artId');
  });

  it('round-trips a chosen drawing, and leaves it blank when the guess is being trusted', () => {
    const chosen = createItem(input({ artId: 'pisau' }), []);
    const guessed = createItem(input(), [chosen]);
    const parsed = parseItems(toItemsCsv([chosen, guessed]));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[0].artId).toBe('pisau');
    expect(parsed.ok[1].artId).toBeUndefined();   // blank means "keep guessing"
  });

  it('round-trips the rack and quantity through the Stock tab, unplaced included', () => {
    // Quantity and placement are their own rows now: one per (barang × rak). A blank rack is
    // the unplaced pile, and it has to survive the trip because it is the state most likely to
    // end in something going missing.
    const a = createEntry(input({ initialStock: 4, locationId: 'LOC-B3' }), [], []);
    const b = createEntry(input({ initialStock: 6, locationId: 'LOC-B9' }), [a.item], a.stock);
    const c = createEntry(input({ initialStock: 2 }), [a.item, b.item], b.stock);

    const parsed = parseStock(toStockCsv(c.stock));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok.map((l) => [l.locationId, l.initialStock]))
      .toEqual([['LOC-B3', 4], ['LOC-B9', 6], ['', 2]]);
  });

  it('emits the exact header the Stock sheet tab expects', () => {
    expect(toStockCsv([]).trim()).toBe('itemId,locationId,initialStock');
  });
});

describe('summarise', () => {
  it('counts rows, distinct categories and total units', () => {
    const a = createEntry(input({ initialStock: 10 }), [], []);
    const b = createEntry(input({ categoryId: 'CAT-PHBI', initialStock: 4 }), [a.item], a.stock);
    expect(summarise([a.item, b.item], b.stock)).toEqual({ count: 2, categories: 2, units: 14 });
  });
});

describe('asset instances are derived from the item, not stored', () => {
  const TS0 = Date.parse('2026-09-06T00:00:00Z');

  it('an instance-tracked durable yields one labelled unit per count', () => {
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment' }), []);
    const inst = instancesFor(pisau, TS0, 3);
    expect(inst.map((a) => a.assetId)).toEqual(['ALQ-ITM-0001-001', 'ALQ-ITM-0001-002', 'ALQ-ITM-0001-003']);
    expect(inst.map((a) => a.label)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
  });

  it('quantity-tracked things get no instances — consumables and counted durables alike', () => {
    const sabun = createItem(input({ kind: 'consumable' }), []);
    const terpal = createItem(input({ kind: 'equipment', trackBy: 'quantity' }), []);
    expect(instancesFor(sabun, TS0, 10)).toEqual([]);
    expect(instancesFor(terpal, TS0, 10)).toEqual([]);
  });

  it('lowering the count simply drops the last units', () => {
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment' }), []);
    expect(instancesFor(pisau, TS0, 3).map((a) => a.assetId))
      .toEqual(instancesFor(pisau, TS0, 5).slice(0, 3).map((a) => a.assetId));
  });

  it('numbers a unit by the item TOTAL, so re-shelving one does not renumber it', () => {
    // A knife is one numbered knife wherever it is currently kept. Numbering per rack would
    // give two different shelves a "#1", and the labels are already printed.
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment' }), []);
    const split = [
      { itemId: pisau.itemId, locationId: 'LOC-P1', initialStock: 2 },
      { itemId: pisau.itemId, locationId: 'LOC-P2', initialStock: 1 },
    ];
    expect(instancesFor(pisau, TS0, totalFor(split, pisau.itemId)).map((a) => a.label))
      .toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
  });

  it('exports instances in the shape the AssetInstances tab parses', () => {
    const built = createEntry(input({ name: 'Pisau', kind: 'equipment', initialStock: 2 }), [], []);
    const items = [built.item];
    const parsed = parseInstances(toInstancesCsv(items, TS0, built.stock));
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
    const { item, stock } = createEntry(input({ name: 'Sabun', initialStock: 4 }), [], []);
    const next = updateEntry([item], stock, item.itemId,
      { ...toInput(item, stock), name: 'Sabun cair', initialStock: 7 }, '');
    expect(next.items[0].itemId).toBe(item.itemId);
    expect(next.items[0].barcode).toBe(item.barcode);
    expect(next.items[0].name).toBe('Sabun cair');
    expect(totalFor(next.stock, item.itemId)).toBe(7);
  });

  it('moves a thing between racks instead of leaving a ghost on the old one', () => {
    // Editing a row edits ONE shelf. Without clearing where it came from, a move would read
    // as "four here AND four there" — the register inventing stock nobody has.
    const { item, stock } = createEntry(
      input({ name: 'Sabun', initialStock: 4, locationId: 'LOC-A1' }), [], [],
    );
    const next = updateEntry([item], stock, item.itemId,
      { ...toInput(item, stock, 'LOC-A1'), locationId: 'LOC-A3' }, 'LOC-A1');
    expect(next.stock.map((l) => [l.locationId, l.initialStock])).toEqual([['LOC-A3', 4]]);
  });

  it('re-derives trackBy when the kind changes', () => {
    const { item, stock } = createEntry(input({ kind: 'consumable' }), [], []);
    const after = updateItem([item], item.itemId,
      { ...toInput(item, stock), kind: 'equipment', trackBy: undefined })[0];
    expect(after.trackBy).toBe('instance');
  });

  it('does not flag the row being edited as a duplicate of itself', () => {
    const { item, stock } = createEntry(input({ name: 'Sapu' }), [], []);
    const existing = [item];
    expect(validate(toInput(item, stock), existing)).toHaveLength(1);            // as a new row: warned
    expect(validate(toInput(item, stock), existing, item.itemId)).toEqual([]);   // as an edit: fine
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

// --- Racks: editing and retiring ------------------------------------------------------------
//
// The property under test throughout is that `locationId` never moves. It is printed inside
// every rack QR, so it is not a database key that can be regenerated when the code changes —
// it is glued to a shelf.

describe('editLocation', () => {
  const A1 = createLocation('A1', 'Gudang Utama', 'Sabun', []);

  it('keeps the id when the code is corrected, so printed stickers still work', () => {
    const [edited] = editLocation([A1], A1.locationId, { code: 'A-1', name: 'Sabun', zone: 'Gudang Utama' });
    expect(edited.code).toBe('A-1');
    expect(edited.locationId).toBe(A1.locationId);
  });

  it('lets a rack move zone without becoming a new rack', () => {
    const [edited] = editLocation([A1], A1.locationId, { code: 'A1', name: '', zone: 'Gudang PHBI' });
    expect(edited.zone).toBe('Gudang PHBI');
    expect(edited.locationId).toBe(A1.locationId);
  });

  it('refuses to blank the code or the zone', () => {
    // A nameless zone sorts on its own at the bottom of the board, and a codeless rack cannot
    // be said out loud — neither is a state anyone chose on purpose.
    const [edited] = editLocation([A1], A1.locationId, { code: '   ', name: '', zone: '  ' });
    expect(edited.code).toBe('A1');
    expect(edited.zone).toBe('Gudang');
  });

  it('leaves every other rack alone', () => {
    const B2 = createLocation('B2', 'Gudang PHBI', '', [A1]);
    const after = editLocation([A1, B2], A1.locationId, { code: 'X', name: '', zone: 'Z' });
    expect(after[1]).toEqual(B2);
  });
});

describe('archiving and deleting a rack', () => {
  const A1 = createLocation('A1', 'Gudang Utama', '', []);
  const held = createEntry(
    { name: 'Sabun', categoryId: 'CAT-K', unit: 'galon', kind: 'consumable', initialStock: 4, minStock: 1, locationId: A1.locationId },
    [], [],
  );

  it('will not archive a rack that still holds things, and says what they are', () => {
    const block = blocksArchive(A1.locationId, [held.item], held.stock);
    expect(block).toEqual({ kind: 'holds-items', count: 1, names: ['Sabun'] });
  });

  it('archives an empty rack without erasing it', () => {
    expect(blocksArchive(A1.locationId, [], [])).toBeNull();
    const [archived] = archiveLocation([A1], A1.locationId);
    expect(archived.active).toBe(false);
    expect(restoreLocation([archived], A1.locationId)[0].active).toBe(true);
  });

  it('deletes only a rack that never became real', () => {
    expect(blocksDelete(A1, [], [])).toBeNull();
    expect(deleteLocation([A1], A1.locationId)).toEqual([]);
  });

  it('refuses to delete a rack that has ever been counted, even when empty', () => {
    // Archiving keeps the history honest; deleting would rewrite a walk somebody actually did.
    const counted = { ...A1, lastCountedTs: 1_700_000_000_000 };
    expect(blocksArchive(counted.locationId, [], [])).toBeNull();
    expect(blocksDelete(counted, [], [])).toEqual({ kind: 'has-history' });
  });
});
