import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, StockLine, Txn } from '../../../../domain/types';

const at = (hash: string) => { location.hash = hash; };
const A1 = createLocation('A1', 'Gudang Utama', 'Rak sabun', []);
const A3 = createLocation('A3', 'Gudang Utama', 'Rak cadangan', [A1]);

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
  name: 'Sabun cuci tangan', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, locationId: A1.locationId, ...p,
});

function seed(items: Item[], locations = [A1]) {
  localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
    items, categories: SEED_CATEGORIES, locations, stock: lines, txns: [], requests: [],
  }));
}
const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v6')!);
const txns = (): Txn[] => stored().txns;

beforeEach(() => { localStorage.clear(); at('#/'); });
afterEach(() => { cleanup(); at('#/'); });

describe('recording that something was taken', () => {
  it('appends a pemakaian, and the stock falls out of it', () => {
    // Nothing stores the new quantity: the number on screen is folded back out of the log,
    // which is the whole reason a movement can never disagree with its own history.
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));
    fireEvent.input(r.getByLabelText('Berapa galon?'), { target: { value: '2' } });
    fireEvent.click(r.getByText('Simpan'));

    expect(txns()).toHaveLength(1);
    expect(txns()[0]).toMatchObject({
      type: 'pemakaian', itemId: 'ITM-0001', qtyDelta: -2, locationId: A1.locationId,
    });
  });

  it('never asks which keterangan — it is inferred from the direction', () => {
    // §58: three of the spec's five words are near-synonyms in ordinary Indonesian, and a
    // volunteer in a hurry will not pick correctly. A column nobody trusts defeats the point.
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);
    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));

    expect(r.queryByText('Pemakaian')).toBeNull();
    expect(r.queryByText('Pengambilan')).toBeNull();
  });

  it('records a return as a pengembalian that puts the quantity back', () => {
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Kembalikan' }));
    fireEvent.click(r.getByText('Simpan'));

    expect(txns()[0]).toMatchObject({ type: 'pengembalian', qtyDelta: 1 });
  });

  it('logs the exception as pengambilan when it is coming back', () => {
    // The one keterangan the design keeps explicit: taken, but not used up.
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));
    fireEvent.click(r.getByLabelText(/Dipinjam, akan dikembalikan/));
    fireEvent.click(r.getByText('Simpan'));

    expect(txns()[0].type).toBe('pengambilan');
  });

  it('does not ask which rack when the thing is only kept on one', () => {
    // The answer is already known, and a dropdown with one option is a tap that teaches
    // nothing.
    seed(catalog(input()));
    at('#/barang?i=ITM-0001');
    const r = render(App);
    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));
    expect(r.queryByLabelText('Diambil dari')).toBeNull();
  });

  it('asks which rack when the thing is split across two, and records that rack', () => {
    // Stock is per shelf (Part XXI); taking from A3 must not come off A1.
    const items = catalog(input({ initialStock: 4 }));
    lines = [...lines, { itemId: items[0].itemId, locationId: A3.locationId, initialStock: 9 }];
    seed(items, [A1, A3]);
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));
    fireEvent.change(r.getByLabelText('Diambil dari'), { target: { value: A3.locationId } });
    fireEvent.click(r.getByText('Simpan'));

    expect(txns()[0].locationId).toBe(A3.locationId);
  });

  it('warns but still saves when the record would go minus', () => {
    // The shelf is the authority, not the record. Refusing the entry only guarantees the
    // movement goes unrecorded and the gap gets wider.
    seed(catalog(input({ initialStock: 1 })));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ambil' }));
    fireEvent.input(r.getByLabelText('Berapa galon?'), { target: { value: '3' } });
    expect(r.getByRole('alert')).toBeTruthy();

    fireEvent.click(r.getByText('Simpan'));
    expect(txns()).toHaveLength(1);
  });

  it('offers nothing for a durable, and says why rather than half-building it', () => {
    // A loan needs a borrower, and §60 has not settled how big that flow should be.
    seed(catalog(input({ name: 'Pisau potong', kind: 'equipment', initialStock: 3 })));
    at('#/barang?i=ITM-0001');
    const r = render(App);
    expect(r.queryByRole('button', { name: 'Ambil' })).toBeNull();
  });
});

describe('recording from the shelf you are standing at', () => {
  it('takes straight off the scanned rack', () => {
    seed(catalog(input()));
    at(`#/scan?l=${A1.locationId}`);
    const r = render(App);

    fireEvent.click(r.getByLabelText('Ambil Sabun cuci tangan'));
    fireEvent.click(r.getByText('Simpan'));

    expect(txns()[0]).toMatchObject({ qtyDelta: -1, locationId: A1.locationId });
  });
});
