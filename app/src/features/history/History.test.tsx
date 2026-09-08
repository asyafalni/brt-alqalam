import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
// The screen is lazily loaded so the kiosk bundle does not carry it. Resolving the module
// before rendering is what keeps these tests synchronous.
await import('./History');
import { historyRows } from './History';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, StockLine, Txn } from '../../../../domain/types';

const at = (hash: string) => { location.hash = hash; };
const A1 = createLocation('A1', 'Gudang Utama', 'Rak sabun', []);

let lines: StockLine[] = [];
const catalog = (...inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, i) => {
    const built = createEntry(i, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};
const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, locationId: A1.locationId, ...p,
});

let seq = 0;
const txn = (p: Partial<Txn> & Pick<Txn, 'type' | 'qtyDelta'>): Txn => {
  seq += 1;
  return {
    txnId: `TXN-${seq}`, clientTxnId: `C-${seq}`, ts: Date.now() - 100_000 + seq * 1000,
    itemId: 'ITM-0001', locationId: A1.locationId, actorUserId: 'USR-LOCAL', ...p,
  };
};

function seed(items: Item[], txns: Txn[]) {
  localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
    items, categories: SEED_CATEGORIES, locations: [A1], stock: lines, txns, requests: [],
  }));
}

beforeEach(() => { localStorage.clear(); seq = 0; at('#/histori'); });
afterEach(() => { cleanup(); at('#/'); });

describe('the two balances', () => {
  const items = () => catalog(input());

  it('starts from what the shelf actually held, not from zero', () => {
    // Passing 0 would make STOK AWAL wrong on the first movement of every item and right
    // afterwards — the worst kind of wrong, because it looks correct wherever anybody checks.
    const built = items();
    const rows = historyRows([txn({ type: 'pemakaian', qtyDelta: -2 })], built, () => 12);
    expect(rows[0]).toMatchObject({ before: 12, after: 10 });
  });

  it('carries the balance forward across several movements', () => {
    const built = items();
    const rows = historyRows([
      txn({ type: 'pemakaian', qtyDelta: -2 }),
      txn({ type: 'pemakaian', qtyDelta: -3 }),
      txn({ type: 'pengembalian', qtyDelta: 1 }),
    ], built, () => 12);
    expect(rows.map((r) => r.after)).toEqual([10, 7, 8]);
  });

  it('keeps a separate balance per rack, because stock is per rack', () => {
    const built = items();
    const rows = historyRows([
      txn({ type: 'pemakaian', qtyDelta: -2, locationId: 'LOC-A1' }),
      txn({ type: 'pemakaian', qtyDelta: -1, locationId: 'LOC-A3' }),
    ], built, (_id, loc) => (loc === 'LOC-A1' ? 12 : 5));
    expect(rows.map((r) => r.after)).toEqual([10, 4]);
  });

  it('folds forwards whatever order it was handed', () => {
    // STOK AWAL only means anything in the order the events happened.
    const built = items();
    const late = txn({ type: 'pemakaian', qtyDelta: -3 });
    const early = txn({ type: 'pemakaian', qtyDelta: -2, ts: late.ts - 5000 });
    const rows = historyRows([late, early], built, () => 12);
    expect(rows.map((r) => r.after)).toEqual([10, 7]);
  });
});

describe('the Histori Data screen', () => {
  it('says what to do rather than showing an empty table', async () => {
    seed(catalog(input()), []);
    // The FIRST render in a file still waits one tick for the lazy chunk; later ones find it
    // already resolved. Awaiting here rather than un-splitting the screen.
    const r = render(App);
    await vi.waitFor(() => expect(r.getByText('Belum ada catatan.')).toBeTruthy());
  });

  it('shows the derived keterangan, never a stored one', () => {
    seed(catalog(input()), [txn({ type: 'pemakaian', qtyDelta: -2 })]);
    const r = render(App);
    expect(r.getAllByText('Pemakaian').length).toBeGreaterThan(0);
  });

  it('puts the newest first — the list is read to see what just happened', () => {
    seed(catalog(input()), [
      txn({ type: 'pemakaian', qtyDelta: -2, note: 'lebih dulu' }),
      txn({ type: 'pengembalian', qtyDelta: 1, note: 'paling baru' }),
    ]);
    const r = render(App);
    const notes = r.getAllByText(/lebih dulu|paling baru/).map((el) => el.textContent);
    expect(notes[0]).toBe('paling baru');
  });

  it('narrows to one keterangan, and only offers words that occur', () => {
    seed(catalog(input()), [
      txn({ type: 'pemakaian', qtyDelta: -2, note: 'dipakai' }),
      txn({ type: 'pengembalian', qtyDelta: 1, note: 'dibalikin' }),
    ]);
    const r = render(App);
    // An option for a keterangan with no rows would be a filter that can only disappoint.
    expect(r.queryByText('Peminjaman')).toBeNull();

    fireEvent.change(r.getByLabelText('Keterangan'), { target: { value: 'pemakaian' } });
    expect(r.getAllByText('dipakai').length).toBeGreaterThan(0);
    expect(r.queryAllByText('dibalikin')).toHaveLength(0);
  });
});

describe('rows that are not about a quantity', () => {
  it('leaves the balances blank for an instance move rather than printing 0 to 0', () => {
    // A knife borrowed carries qtyDelta 0 by design — it changes an identity's status, not an
    // amount. "0 → 0" reads as "the stock did not change when it should have", which is a
    // different and alarming claim.
    const rows = historyRows(
      [txn({ type: 'peminjaman', qtyDelta: 0, itemId: undefined, assetId: 'ALQ-ITM-0002-001' })],
      [],
      () => 12,
    );
    expect(rows[0].quantity).toBe(false);
  });

  it('still marks a real quantity movement as one', () => {
    const rows = historyRows([txn({ type: 'pemakaian', qtyDelta: -2 })], catalog(input()), () => 12);
    expect(rows[0].quantity).toBe(true);
  });
});
