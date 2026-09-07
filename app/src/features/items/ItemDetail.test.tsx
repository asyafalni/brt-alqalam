import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createItem, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location, StockLine, Txn } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
});

const B3: Location = createLocation('B3', 'Gudang Utama', 'Rak sabun', []);

function seed(items: Item[], locations: Location[] = [B3]) {
  localStorage.setItem('brt.stocktake.draft.v5',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, stock: lines, txns: [] }));
}

/**
 * Builds the items AND their stock lines, because quantity and placement live on lines now.
 * `lines` is what `seed()` stores, so a fixture that still says `initialStock: 3` produces a
 * shelf with three of the thing on it.
 */
let lines: StockLine[] = [];
const buildCatalog = (inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, x) => {
    const built = createEntry(x, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};
const catalog = (...inputs: DraftInput[]): Item[] => buildCatalog(inputs);

const at = (hash: string) => { location.hash = hash; };

beforeEach(() => { localStorage.clear(); at('#/'); });
afterEach(() => { cleanup(); at('#/'); });

describe('ItemDetail', () => {
  it('shows what the item is, where it is, and how much is left', () => {
    seed(catalog(input({ name: 'Sabun cuci', locationId: 'LOC-B3' })));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    expect(r.getByRole('heading', { name: 'Sabun cuci' })).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
    expect(r.getByText('Rak B3')).toBeTruthy();
    expect(r.getByText('ALQ-ITM-0001')).toBeTruthy();
  });

  it('says plainly when an item has no rack — that is the state worth surfacing', () => {
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    expect(render(App).getByText('Belum ditempatkan')).toBeTruthy();
  });

  it('resolves by printed barcode as well as by id, since a label carries the barcode', () => {
    seed(catalog(input({ name: 'Sabun cuci' })));
    at('#/barang?i=ALQ-ITM-0001');
    expect(render(App).getByRole('heading', { name: 'Sabun cuci' })).toBeTruthy();
  });

  it('says the code is unknown rather than rendering an empty page', () => {
    seed(catalog(input()));
    at('#/barang?i=ITM-9999');
    const r = render(App);
    expect(r.getByRole('alert')).toBeTruthy();
    expect(r.getByText('ITM-9999')).toBeTruthy();
  });

  it('lists every labelled unit of an instance-tracked durable', () => {
    seed(catalog(input({ name: 'Pisau', kind: 'equipment', initialStock: 3, minStock: null })));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    expect(r.getByText('Unit berlabel')).toBeTruthy();
    expect(r.getByText('Pisau #1')).toBeTruthy();
    expect(r.getByText('Pisau #3')).toBeTruthy();
    expect(r.getByText('ALQ-ITM-0001-002')).toBeTruthy();
  });

  it('shows no unit list for something merely counted — there is nothing to label', () => {
    seed(catalog(input({ name: 'Terpal', kind: 'equipment', trackBy: 'quantity', initialStock: 10, minStock: null })));
    at('#/barang?i=ITM-0001');
    expect(render(App).queryByText('Unit berlabel')).toBeNull();
  });

  it('is honest that history lives in a gateway that is not connected yet', () => {
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    expect(render(App).getByText(/Riwayat transaksi tersimpan di gateway/)).toBeTruthy();
  });

  it('reports the running PENGAMBILAN total the spec keeps per item', () => {
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);
    // No transactions yet, so nothing has been taken — but the field is present and honest.
    expect(r.getByText('Total diambil')).toBeTruthy();
  });
});

describe('getting there', () => {
  it('tapping a row on the stock board opens that item', () => {
    seed(catalog(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' })));
    at('#/board');
    const r = render(App);

    // The board renders both shapes at once (see DataTable) and CSS picks one, so the row
    // exists twice in the DOM. Scope to the desk table rather than relaxing the assertion.
    const table = r.container.querySelector('table')!;
    fireEvent.click(within(table).getByLabelText('Buka Pisau dapur'));
    expect(location.hash).toBe('#/barang?i=ITM-0002');
    expect(r.getByRole('heading', { name: 'Pisau dapur' })).toBeTruthy();
  });
});
