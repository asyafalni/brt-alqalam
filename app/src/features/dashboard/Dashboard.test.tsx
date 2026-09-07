import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Txn } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
});
const catalog = (...i: DraftInput[]): Item[] => i.reduce<Item[]>((a, x) => [...a, createItem(x, a)], []);

let n = 0;
// Ascending ts, deliberately: the reducer folds in time order, so a descending clock would
// apply the return before the loan and leave the asset merely "out".
const tx = (p: Partial<Txn>): Txn => {
  n += 1;
  return { txnId: `T${n}`, clientTxnId: `c${n}`, ts: n,
    type: 'peminjaman', qtyDelta: 0, actorUserId: 'u', ...p };
};

const RAK = { locationId: 'LOC-A1', code: 'A1', name: '', zone: 'Gudang', order: 1, active: true,
  lastCountedTs: Date.now() };

function seed(items: Item[], txns: Txn[] = [], locations = [RAK]) {
  localStorage.setItem('brt.stocktake.draft.v4',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, txns }));
}
const at = (hash: string) => { location.hash = hash; };

beforeEach(() => { localStorage.clear(); at('#/'); });
afterEach(() => { cleanup(); at('#/'); });

/** A durable whose unit #1 comes back in the given condition. */
const damaged = (condition: 'rusak' | 'hilang') => {
  const items = catalog(input({ name: 'Pisau', kind: 'equipment', initialStock: 2, minStock: null }));
  const asset = `${items[0].barcode}-001`;
  return { items, txns: [
    tx({ type: 'peminjaman', assetId: asset, recipient: 'Pos 1' }),
    tx({ type: 'pengembalian', assetId: asset, condition }),
  ] };
};

describe('Beranda surfaces what needs a person', () => {
  it('says everything is fine only when it actually is', () => {
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    expect(render(App).getByText('Semua aman.')).toBeTruthy();
  });

  it('counts a broken asset as something to deal with — it was invisible from here before', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    const r = render(App);

    expect(r.queryByText('Semua aman.')).toBeNull();
    expect(r.getByText('1 rusak')).toBeTruthy();
  });

  it('counts a lost asset too, and keeps it distinct from a broken one', () => {
    const { items, txns } = damaged('hilang');
    seed(items, txns);
    const r = render(App);

    expect(r.getByText('1 hilang')).toBeTruthy();
    expect(r.queryByText('1 rusak')).toBeNull();
  });

  it('a chip goes straight to the screen that fixes it', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    const r = render(App);

    const chips = r.getByRole('group', { name: 'Perlu diurus' });
    fireEvent.click(within(chips).getByText('1 rusak'));
    expect(location.hash).toBe('#/aset');
    expect(r.getByRole('heading', { name: 'Aset' })).toBeTruthy();
  });

  it('summarises borrowed, broken and lost together on the Aset card', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    expect(render(App).getByText(/0 dipinjam · 1 rusak · 0 hilang/)).toBeTruthy();
  });

  it('calls out stock folded below zero — the loudest thing a register can say', () => {
    // More recorded leaving than ever arrived. Not "we ran out": the books contradict
    // themselves, and only a physical recount settles it.
    const items = catalog(input({ name: 'Sabun', initialStock: 2, minStock: 1, locationId: 'LOC-A1' }));
    seed(items, [tx({ type: 'pemakaian', itemId: items[0].itemId, qtyDelta: -5 })]);
    const r = render(App);

    const chips = r.getByRole('group', { name: 'Perlu diurus' });
    expect(within(chips).getByText('1 stok minus')).toBeTruthy();
    expect(r.getByText('1 barang tercatat minus.')).toBeTruthy();
    expect(r.getByText(/Hitung ulang raknya/)).toBeTruthy();
  });

  it('says nothing about minus stock when the books add up', () => {
    const items = catalog(input({ name: 'Sabun', initialStock: 10, minStock: 1, locationId: 'LOC-A1' }));
    seed(items, [tx({ type: 'pemakaian', itemId: items[0].itemId, qtyDelta: -3 })]);
    const r = render(App);
    expect(r.queryByText(/tercatat minus/)).toBeNull();
  });

  it('does not paint a zero as a warning — that teaches people to ignore the colour', () => {
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    const r = render(App);

    const habis = r.getByText('Habis').closest('div')!.parentElement!;
    expect(habis.querySelector('[class*="bg-red"]')).toBeNull();
    expect(habis.querySelector('[class*="bg-slate-100"]')).toBeTruthy();
  });

  it('shows no chip row at all when there is nothing to act on', () => {
    // Everything placed, stocked and monitored, and the rack checked today — so there is
    // genuinely nothing to tap. A row of zeroes would train people to ignore the whole area.
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    const r = render(App);

    expect(r.getByText('Semua aman.')).toBeTruthy();
    // The Aksi cards below are buttons too and legitimately still describe the same figures
    // ("1 rak · 0 perlu didatangi"), so the assertion names the chip GROUP, not the words.
    expect(r.queryByRole('group', { name: 'Perlu diurus' })).toBeNull();
    expect(r.getByText('Semua barang sudah punya rak.')).toBeTruthy();
  });
});
