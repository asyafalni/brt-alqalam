import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { App } from './App';
import { SEED_CATEGORIES } from './data/seedCategories';
import { createItem } from './features/stocktake/draft';
import type { DraftInput } from './features/stocktake/draft';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});

function seed(...inputs: DraftInput[]) {
  const items = inputs.reduce<ReturnType<typeof createItem>[]>(
    (acc, i) => [...acc, createItem(i, acc)], [],
  );
  localStorage.setItem('brt.stocktake.draft.v2',
    JSON.stringify({ items, categories: SEED_CATEGORIES }));
  return items;
}

const at = (path: string) => history.pushState(null, '', path);

beforeEach(() => { localStorage.clear(); at('/'); });
afterEach(() => { cleanup(); at('/'); });

describe('deep links — the whole point of a printed label', () => {
  it('a rack QR opens the item with its derived stock', () => {
    seed(input({ name: 'Sabun cuci', initialStock: 12 }));
    at('/scan?i=ITM-0001');
    const r = render(App);

    expect(r.getByText('Sabun cuci')).toBeTruthy();
    expect(r.getByText('Kebersihan')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
  });

  it('a unit QR opens that one physical unit, not the item', () => {
    seed(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }));
    at('/scan?a=ALQ-ITM-0001-002');
    const r = render(App);

    expect(r.getByText('Pisau #2')).toBeTruthy();
    expect(r.getByText('ALQ-ITM-0001-002')).toBeTruthy();
  });

  it('says so when a label is not in this catalog, instead of failing silently', () => {
    seed(input());
    at('/scan?i=ITM-9999');
    const r = render(App);

    expect(r.getByRole('alert')).toBeTruthy();
    expect(r.getByText('Label tidak dikenal')).toBeTruthy();
    expect(r.getByText('ITM-9999')).toBeTruthy();
  });

  it('distinguishes an empty catalog from an unknown label', () => {
    at('/scan?i=ITM-0001');
    expect(render(App).getByText('Katalog masih kosong')).toBeTruthy();
  });

  it('a damaged QR that names nothing still reaches a screen that explains', () => {
    seed(input());
    at('/scan');
    expect(render(App).getByText('Label tidak terbaca')).toBeTruthy();
  });

  it('hides the nav while scanning — the marbot arrived here from a camera, mid-task', () => {
    seed(input());
    at('/scan?i=ITM-0001');
    const r = render(App);
    expect(r.queryByText('Cetak Label')).toBeNull();

    fireEvent.click(r.getByText('Kembali'));
    expect(r.getByText('Cetak Label')).toBeTruthy();
    expect(location.pathname).toBe('/');
  });
});

describe('navigation', () => {
  it('switches screens and reflects it in the URL, so back works', () => {
    seed(input());
    const r = render(App);

    fireEvent.click(r.getByText('Stok'));
    expect(location.pathname).toBe('/board');
    expect(r.getByText('Stok Sekarang')).toBeTruthy();

    fireEvent.click(r.getByText('Cetak Label'));
    expect(location.pathname).toBe('/label');
    expect(r.getByText('Cetak Label QR')).toBeTruthy();
  });

  it('an unknown path lands on the stock-take rather than a dead end', () => {
    at('/sesuatu');
    expect(render(App).getByText('Opname Gudang')).toBeTruthy();
  });
});

describe('the board renders derived state, not stored numbers', () => {
  it('shows current stock with a status badge', () => {
    seed(input({ name: 'Sabun', initialStock: 12, minStock: 5 }));
    at('/board');
    const r = render(App);
    expect(r.getByText('Sabun')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();
  });

  it('raises Notifikasi Stok for anything at or below its minimum', () => {
    seed(
      input({ name: 'Sabun', initialStock: 12, minStock: 5 }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5 }),
    );
    at('/board');
    const r = render(App);

    expect(r.getByText('Notifikasi Stok')).toBeTruthy();
    expect(r.getByText(/sisa/)).toBeTruthy();
    expect(r.getByText('Menipis')).toBeTruthy();
  });

  it('an item with no minimum "(-)" never raises one, even at zero', () => {
    seed(input({ name: 'Kanebo', initialStock: 0, minStock: null }));
    at('/board');
    const r = render(App);

    expect(r.queryByText('Notifikasi Stok')).toBeNull();
    expect(r.getByText('Habis')).toBeTruthy();   // still reported as out of stock
  });

  it('is honest that there is no gateway yet', () => {
    seed(input());
    at('/board');
    expect(render(App).getByText(/Belum terhubung ke gateway/)).toBeTruthy();
  });
});
