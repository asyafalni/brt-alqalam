import { describe, it, expect } from 'vitest';
import { deriveNotifications } from './notifications';
import type { Item, StockLine, Txn } from './types';


/**
 * Test shorthand: fixtures still say `initialStock` and `locationId` because that is what the
 * case under test is about, and the builder turns them into the stock line the domain now
 * takes. `lines` accumulates across the file, which is safe — item ids are unique, and both
 * `deriveState` and the report skip a line whose item was not passed in.
 */
const lines: StockLine[] = [];
const shelve = (itemId: string, p: { initialStock?: number; locationId?: string }) => {
  // Replaces rather than appends: every fixture in this file is the same ITM-S, and appending
  // would quietly add each test's opening stock to the last one's.
  const at = p.locationId ?? '';
  const line = { itemId, locationId: at, initialStock: p.initialStock ?? 10 };
  const i = lines.findIndex((l) => l.itemId === itemId && l.locationId === at);
  if (i >= 0) lines[i] = line; else lines.push(line);
};

/** Always with the lines, because the alarm now starts from the sum of every rack. */
const notify = (items: Item[], txns: Txn[], now: number) =>
  deriveNotifications(items, txns, now, lines);

const item = (over: Partial<Item> & { initialStock?: number; locationId?: string } = {}): Item => {
  const { initialStock, locationId, ...rest } = over;
  const i: Item = {
    itemId: 'ITM-S', barcode: 'b', name: 'Sabun', categoryId: 'CAT-KEBERSIHAN',
    kind: 'consumable', unit: 'galon', trackBy: 'quantity',
    minStock: 5, active: true, ...rest,
  };
  shelve(i.itemId, { initialStock, locationId });
  return i;
};

let seq = 0;
const tx = (p: Partial<Txn>): Txn => {
  seq += 1;
  return { txnId: 'TX' + seq, clientTxnId: 'c' + seq, ts: 0, type: 'adjust', qtyDelta: 0, actorUserId: 'u', itemId: 'ITM-S', ...p };
};

describe('deriveNotifications (Notifikasi Stok)', () => {
  it('no notification while above minimum', () => {
    const n = notify([item()], [tx({ type: 'pemakaian', qtyDelta: -3, ts: 100 })], 1000);
    expect(n).toHaveLength(0);
  });

  it('fires with breach ts, current stock, min, and keterangan', () => {
    const n = notify([item()], [tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 })], 1000);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ itemId: 'ITM-S', ts: 100, stokAkhir: 4, setMin: 5, keterangan: 'pemakaian' });
  });

  it('breach ts is the transaction that crossed the line (not an earlier one)', () => {
    const txns = [
      tx({ type: 'pemakaian', qtyDelta: -3, ts: 100 }), // 10→7, still above
      tx({ type: 'pemakaian', qtyDelta: -3, ts: 200 }), // 7→4, breaches here
    ];
    expect(notify([item()], txns, 1000)[0].ts).toBe(200);
  });

  it('clears once restocked above minimum', () => {
    const txns = [
      tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 }),   // →4 (low)
      tx({ type: 'adjust', qtyDelta: +8, ts: 200 }),       // →12 (recovered)
    ];
    expect(notify([item()], txns, 1000)).toHaveLength(0);
  });

  it('uses `now` when the item started at/below min with no breaching tx', () => {
    const n = notify([item({ initialStock: 3 })], [], 555);
    expect(n[0]).toMatchObject({ ts: 555, stokAkhir: 3, setMin: 5, keterangan: '' });
  });

  it('ignores instance-tracked equipment (notifikasi is for stock items)', () => {
    const equip = item({ itemId: 'ITM-P', kind: 'equipment', trackBy: 'instance', initialStock: 0, minStock: 0 });
    expect(notify([equip], [], 1000)).toHaveLength(0);
  });

  it('no notification when Setting Minimum is "(-)" (null), even at zero', () => {
    const nm = item({ itemId: 'ITM-N', minStock: null });
    const n = notify([nm], [tx({ itemId: 'ITM-N', type: 'pemakaian', qtyDelta: -10 })], 1000);
    expect(n).toHaveLength(0);
  });

  it('a loan (peminjaman) of a quantity-tracked item drops available and notifies', () => {
    const n = notify([item()], [tx({ type: 'pengambilan', qtyDelta: -6, ts: 100 })], 1000);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ stokAkhir: 4, keterangan: 'pengambilan' });
  });

  /*
   * This is a SHOPPING LIST, so it is ordered the way somebody would walk a shop — not by what
   * went short longest ago, which is a fact about the past and the wrong one to lead with.
   */
  it('puts what has run OUT above what is merely low', () => {
    // An empty shelf is one people are already reaching into and finding nothing on.
    const a = item({ itemId: 'A', name: 'A', minStock: 5 });
    const b = item({ itemId: 'B', name: 'B', minStock: 5 });
    const txns = [
      tx({ itemId: 'A', type: 'pemakaian', qtyDelta: -6, ts: 100 }),   // 10 → 4, low
      tx({ itemId: 'B', type: 'pemakaian', qtyDelta: -10, ts: 300 }),  // 10 → 0, out
    ];
    expect(notify([a, b], txns, 1000).map((x) => x.itemId)).toEqual(['B', 'A']);
  });

  it('then by the biggest minimum, because that is how much we say we need', () => {
    // Between two empty shelves, the one we normally keep ten of disrupts more than the one we
    // keep three of — the shortfall is bigger and so is what depends on it.
    const a = item({ itemId: 'A', name: 'A', minStock: 3 });
    const b = item({ itemId: 'B', name: 'B', minStock: 10 });
    const txns = [
      tx({ itemId: 'A', type: 'pemakaian', qtyDelta: -10, ts: 100 }),
      tx({ itemId: 'B', type: 'pemakaian', qtyDelta: -10, ts: 300 }),
    ];
    expect(notify([a, b], txns, 1000).map((x) => x.itemId)).toEqual(['B', 'A']);
  });

  it('falls back to breach time, and then to the name, so the order never shuffles', () => {
    // A list that reorders between renders is a list nobody can point at.
    const a = item({ itemId: 'A', name: 'Zebra', minStock: 5 });
    const b = item({ itemId: 'B', name: 'Angsa', minStock: 5 });
    const txns = [
      tx({ itemId: 'A', type: 'pemakaian', qtyDelta: -10, ts: 100 }),
      tx({ itemId: 'B', type: 'pemakaian', qtyDelta: -10, ts: 300 }),
    ];
    expect(notify([a, b], txns, 1000).map((x) => x.itemId)).toEqual(['A', 'B']);
  });
});

describe('KETERANGAN comes from the item, per the spec', () => {
  it('uses the item\'s own keterangan, not the transaction that breached the minimum', () => {
    // MENU STOK carries a KETERANGAN per catalog row, and NOTIFIKASI STOK sources its column
    // from there — what this thing normally moves under, not what happened to trip the alarm.
    const it0 = item({ keterangan: 'peminjaman' });
    const n = notify([it0], [tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 })], 1000);
    expect(n[0].keterangan).toBe('peminjaman');
  });

  it('falls back to the breaching transaction when the item declares nothing', () => {
    const n = notify([item()], [tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 })], 1000);
    expect(n[0].keterangan).toBe('pemakaian');
  });
});

describe('a counted durable borrowed below its minimum', () => {
  it('raises the alarm, which it did not', () => {
    /* The alarm inherited the reducer's bug: `peminjaman` was written for instance-tracked
       units that carry "out" as a status, so a quantity-tracked durable could be borrowed past
       its minimum with nothing noticing. */
    const mop = item({ itemId: 'ITM-0008', name: 'Alat pel', minStock: 3 });
    const out = tx({ itemId: 'ITM-0008', type: 'peminjaman', qtyDelta: -8, ts: 100 });
    expect(notify([mop], [out], 1000).map((n) => n.itemId)).toEqual(['ITM-0008']);
  });
});
