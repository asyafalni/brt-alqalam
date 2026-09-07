import type { Item, StockLine } from '../../domain/types';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from './App';
import { SEED_CATEGORIES } from './data/seedCategories';
import { createEntry, createItem } from './features/stocktake/draft';
import type { DraftInput } from './features/stocktake/draft';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});


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
function seed(...inputs: DraftInput[]) {
  const items = buildCatalog(inputs);
  localStorage.setItem('brt.stocktake.draft.v6',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations: [], stock: lines, txns: [] }));
  return items;
}

const at = (hash: string) => { location.hash = hash; };

// Every list screen renders both shapes at once — a real table on a desk, stacked cards below
// `sm` (see components/DataTable) — and CSS picks one, so a row exists twice in the DOM.
// Scope to the desk table rather than relaxing the assertion.
const desk = (r: ReturnType<typeof render>) => within(r.container.querySelector('table')!);

beforeEach(() => { localStorage.clear(); at('#/opname'); });
afterEach(() => { cleanup(); at('#/opname'); });

describe('deep links — the whole point of a printed label', () => {
  it('a rack QR opens the item with its derived stock', () => {
    seed(input({ name: 'Sabun cuci', initialStock: 12 }));
    at('#/scan?i=ITM-0001');
    const r = render(App);

    expect(r.getByText('Sabun cuci')).toBeTruthy();
    expect(r.getByText('Kebersihan')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
  });

  it('a unit QR opens that one physical unit, not the item', () => {
    seed(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }));
    at('#/scan?a=ALQ-ITM-0001-002');
    const r = render(App);

    expect(r.getByText('Pisau #2')).toBeTruthy();
    expect(r.getByText('ALQ-ITM-0001-002')).toBeTruthy();
  });

  it('says so when a label is not in this catalog, instead of failing silently', () => {
    seed(input());
    at('#/scan?i=ITM-9999');
    const r = render(App);

    expect(r.getByRole('alert')).toBeTruthy();
    expect(r.getByText('Label tidak dikenal')).toBeTruthy();
    expect(r.getByText('ITM-9999')).toBeTruthy();
  });

  it('distinguishes an empty catalog from an unknown label', () => {
    at('#/scan?i=ITM-0001');
    expect(render(App).getByText('Katalog masih kosong')).toBeTruthy();
  });

  it('a damaged QR that names nothing still reaches a screen that explains', () => {
    seed(input());
    at('#/scan');
    expect(render(App).getByText('Label tidak terbaca')).toBeTruthy();
  });

  it('returns home from a scan', () => {
    seed(input());
    at('#/scan?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByText('Kembali'));
    expect(location.hash).toBe('#/');   // the dashboard is the root
    expect(r.getByRole('heading', { name: 'Beranda' })).toBeTruthy();
  });
});

describe('navigation', () => {
  it('switches screens and reflects it in the URL, so back works', async () => {
    seed(input());
    const r = render(App);

    // Every destination exists twice — sidebar on desktop, bottom bar on mobile. The bottom
    // bar carries an aria-label, so querying by it targets exactly one of them.
    fireEvent.click(r.getByLabelText('Stok Sekarang'));
    expect(location.hash).toBe('#/board');
    expect(r.getByRole('heading', { name: 'Stok Sekarang' })).toBeTruthy();

    // Cetak Label is a desk job: it lives in the sidebar, not the mobile bottom bar, so it
    // has no aria-label to target — the sidebar's own text is unambiguous here.
    fireEvent.click(r.getByText('Cetak Label'));
    expect(location.hash).toBe('#/label');
    // The label screen is code-split — it carries the QR encoder, which nobody should
    // download to write down how much sabun is on a shelf. So it announces itself first.
    expect(r.getByRole('status').textContent).toContain('Menyiapkan label');
    expect(await r.findByText('Cetak Label QR')).toBeTruthy();
  });

  it('reaches the rack map, which is a screen only the new location model makes possible', () => {
    seed(input());
    const r = render(App);
    fireEvent.click(r.getByLabelText('Peta Rak'));
    expect(location.hash).toBe('#/racks');
    expect(r.getByRole('heading', { name: 'Peta Rak' })).toBeTruthy();
    expect(r.getByText(/Belum ada rak/)).toBeTruthy();
  });

  it('an unknown path lands on the dashboard rather than a dead end', () => {
    at('#/sesuatu');
    expect(render(App).getByRole('heading', { name: 'Beranda' })).toBeTruthy();
  });
});

describe('the board renders derived state, not stored numbers', () => {
  it('shows current stock with a status badge', () => {
    seed(input({ name: 'Sabun', initialStock: 12, minStock: 5 }));
    at('#/board');
    const r = render(App);
    expect(desk(r).getByText('Sabun')).toBeTruthy();
    expect(desk(r).getByText('Tersedia')).toBeTruthy();
  });

  it('marks a low item as Menipis in the stock list', () => {
    seed(
      input({ name: 'Sabun', initialStock: 12, minStock: 5 }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5 }),
    );
    at('#/board');
    const r = render(App);

    // The list renders twice — desk table and phone cards — so two is the honest count. The
    // low-stock ALERT is not here at all any more: Beranda owns it, and one list of a thing
    // beats two (features/board/Board.tsx).
    expect(r.getAllByText('Kanebo')).toHaveLength(2);
    expect(desk(r).getByText('Menipis')).toBeTruthy();
  });

  it('raises Notifikasi Stok on Beranda for anything at or below its minimum', () => {
    seed(
      input({ name: 'Sabun', initialStock: 12, minStock: 5 }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5 }),
    );
    at('#/');
    const r = render(App);

    expect(r.getByText('Perlu dibeli lagi')).toBeTruthy();
    expect(r.getByText('Notifikasi Stok')).toBeTruthy();   // his word for it, kept
    expect(r.getByText('Kanebo')).toBeTruthy();
    expect(r.queryByText('Sabun')).toBeNull();             // not low, so not on the list
  });

  it('an item with no minimum "(-)" never raises one, even at zero', () => {
    seed(input({ name: 'Kanebo', initialStock: 0, minStock: null }));
    at('#/');
    const r = render(App);

    // No minimum means no low-stock ALARM, which is not the same as no problem: an item at
    // zero is still reported as habis. The "(-)" only silences the reorder list.
    expect(r.queryByText('Perlu dibeli lagi')).toBeNull();
    expect(r.getByRole('button', { name: '1 habis' })).toBeTruthy();
  });

  it('is honest that there is no gateway yet', () => {
    seed(input());
    at('#/board');
    expect(render(App).getByText('Belum terhubung ke gateway.')).toBeTruthy();
  });
});

describe('the navbar search filters the screen you are on', () => {
  const type = (el: HTMLElement, value: string) =>
    fireEvent.input(el, { target: { value } });

  it('filters the opname list, and says so when nothing matches', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/opname');
    const r = render(App);

    type(r.getByLabelText('Cari barang'), 'sabun');
    expect(desk(r).getByText('Sabun cuci')).toBeTruthy();
    expect(r.queryByText('Pisau dapur')).toBeNull();

    type(r.getByLabelText('Cari barang'), 'zzz');
    expect(r.getByText(/Tidak ada yang cocok/)).toBeTruthy();
  });

  it('filters the stock board too', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/board');
    const r = render(App);

    type(r.getByLabelText('Cari barang'), 'pisau');
    expect(desk(r).getByText('Pisau dapur')).toBeTruthy();
    expect(r.queryByText('Sabun cuci')).toBeNull();
  });
});
