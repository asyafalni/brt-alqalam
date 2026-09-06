import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
});
const A1: Location = createLocation('A1', 'Gudang Utama', '', []);
const catalog = (...i: DraftInput[]): Item[] => i.reduce<Item[]>((a, x) => [...a, createItem(x, a)], []);

function seed(items: Item[], locations: Location[] = [A1]) {
  localStorage.setItem('brt.stocktake.draft.v4',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, txns: [] }));
}
const at = (hash: string) => { location.hash = hash; };

beforeEach(() => { localStorage.clear(); at('#/laporan'); });
afterEach(() => { cleanup(); at('#/'); });

describe('Laporan', () => {
  it('reports totals from derived stock', () => {
    seed(catalog(input({ initialStock: 12 }), input({ initialStock: 8 })));
    const r = render(App);
    expect(r.getByRole('heading', { name: 'Laporan' })).toBeTruthy();
    expect(r.getByText('Jenis barang')).toBeTruthy();
    expect(r.getByText('20')).toBeTruthy();   // total units
  });

  it('grades how far the register can be trusted, not just what it contains', () => {
    seed(catalog(
      input({ locationId: 'LOC-A1', minStock: 5 }),
      input({ minStock: null }),               // no rack, no minimum
    ));
    const r = render(App);

    expect(r.getByText('Kualitas data')).toBeTruthy();
    expect(r.getByText(/1 belum ditempatkan/)).toBeTruthy();
    expect(r.getByText(/1 tanpa minimum/)).toBeTruthy();
    expect(r.getByText('50%')).toBeTruthy();   // half placed, half monitored
  });

  it('calls an unchecked rack unknown rather than fine', () => {
    seed(catalog(input({ locationId: 'LOC-A1' })), [A1]);
    expect(render(App).getByText(/1 belum pernah dicek/)).toBeTruthy();
  });

  it('says which sections are missing instead of inventing numbers for them', () => {
    seed(catalog(input()));
    const r = render(App);
    expect(r.getByText('Belum tersedia')).toBeTruthy();
    expect(r.getByText(/membutuhkan riwayat transaksi/)).toBeTruthy();
  });

  it('is aggregate-only: categories and counts, no item roll-call', () => {
    seed(catalog(input({ name: 'Sabun cuci', locationId: 'LOC-A1', minStock: 5, initialStock: 12 })));
    const text = render(App).container.textContent ?? '';

    expect(text).toContain('Kebersihan');          // the category, yes
    expect(text).not.toContain('Sabun cuci');      // the individual item, no
  });

  it('names an item only where naming it is the point — what to go and buy', () => {
    seed(catalog(input({ name: 'Sabun cuci', locationId: 'LOC-A1', minStock: 5, initialStock: 2 })));
    const r = render(App);
    expect(r.getByText('Perlu dibeli lagi')).toBeTruthy();
    expect(r.getByText('Sabun cuci')).toBeTruthy();
  });

  it('carries the promise it makes, in writing, on the printed copy', () => {
    // The data-level guarantee is asserted in domain/report.test.ts, which checks the built
    // report contains no actor or recipient at all. Here the claim is only that the document
    // says so — a scan for person-words would trip on the disclaimer itself, which is a
    // sentence *about* not naming people.
    seed(catalog(input({ locationId: 'LOC-A1' })));
    const r = render(App);
    expect(r.getByText(/Tidak memuat nama siapa pun/)).toBeTruthy();
    expect(r.getByText(/tidak memuat nama pengambil maupun peminjam/i)).toBeTruthy();
  });

  it('says so plainly when there is nothing to report', () => {
    seed([], []);
    expect(render(App).getByText(/Belum ada data untuk dilaporkan/)).toBeTruthy();
  });
});
