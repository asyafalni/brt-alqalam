import { describe, it, expect } from 'vitest';
import { deriveNotifications } from './notifications';
import type { Item, Txn } from './types';

const item = (over: Partial<Item> = {}): Item => ({
  itemId: 'ITM-S', barcode: 'b', name: 'Sabun', categoryId: 'CAT-KEBERSIHAN',
  kind: 'consumable', unit: 'galon', trackBy: 'quantity',
  minStock: 5, initialStock: 10, active: true, ...over,
});

let seq = 0;
const tx = (p: Partial<Txn>): Txn => {
  seq += 1;
  return { txnId: 'TX' + seq, clientTxnId: 'c' + seq, ts: 0, type: 'adjust', qtyDelta: 0, actorUserId: 'u', itemId: 'ITM-S', ...p };
};

describe('deriveNotifications (Notifikasi Stok)', () => {
  it('no notification while above minimum', () => {
    const n = deriveNotifications([item()], [tx({ type: 'pemakaian', qtyDelta: -3, ts: 100 })], 1000);
    expect(n).toHaveLength(0);
  });

  it('fires with breach ts, current stock, min, and keterangan', () => {
    const n = deriveNotifications([item()], [tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 })], 1000);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ itemId: 'ITM-S', ts: 100, stokAkhir: 4, setMin: 5, keterangan: 'pemakaian' });
  });

  it('breach ts is the transaction that crossed the line (not an earlier one)', () => {
    const txns = [
      tx({ type: 'pemakaian', qtyDelta: -3, ts: 100 }), // 10→7, still above
      tx({ type: 'pemakaian', qtyDelta: -3, ts: 200 }), // 7→4, breaches here
    ];
    expect(deriveNotifications([item()], txns, 1000)[0].ts).toBe(200);
  });

  it('clears once restocked above minimum', () => {
    const txns = [
      tx({ type: 'pemakaian', qtyDelta: -6, ts: 100 }),   // →4 (low)
      tx({ type: 'adjust', qtyDelta: +8, ts: 200 }),       // →12 (recovered)
    ];
    expect(deriveNotifications([item()], txns, 1000)).toHaveLength(0);
  });

  it('uses `now` when the item started at/below min with no breaching tx', () => {
    const n = deriveNotifications([item({ initialStock: 3 })], [], 555);
    expect(n[0]).toMatchObject({ ts: 555, stokAkhir: 3, setMin: 5, keterangan: '' });
  });

  it('ignores instance-tracked equipment (notifikasi is for stock items)', () => {
    const equip = item({ itemId: 'ITM-P', kind: 'equipment', trackBy: 'instance', initialStock: 0, minStock: 0 });
    expect(deriveNotifications([equip], [], 1000)).toHaveLength(0);
  });

  it('no notification when Setting Minimum is "(-)" (null), even at zero', () => {
    const nm = item({ itemId: 'ITM-N', minStock: null });
    const n = deriveNotifications([nm], [tx({ itemId: 'ITM-N', type: 'pemakaian', qtyDelta: -10 })], 1000);
    expect(n).toHaveLength(0);
  });

  it('a loan (peminjaman) of a quantity-tracked item drops available and notifies', () => {
    const n = deriveNotifications([item()], [tx({ type: 'pengambilan', qtyDelta: -6, ts: 100 })], 1000);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ stokAkhir: 4, keterangan: 'pengambilan' });
  });

  it('sorts multiple notifications by breach time', () => {
    const a = item({ itemId: 'A', name: 'A' });
    const b = item({ itemId: 'B', name: 'B' });
    const txns = [
      tx({ itemId: 'B', type: 'pemakaian', qtyDelta: -6, ts: 300 }),
      tx({ itemId: 'A', type: 'pemakaian', qtyDelta: -6, ts: 100 }),
    ];
    expect(deriveNotifications([a, b], txns, 1000).map((x) => x.itemId)).toEqual(['A', 'B']);
  });
});
