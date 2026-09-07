import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { LabelSheet } from './LabelSheet';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});

const sheet = (items: Item[], locations: Location[] = []) => {
  const Harness = () => (
    <LabelSheet items={items} categories={SEED_CATEGORIES} locations={locations} />
  );
  return render(Harness);
};

const setBaseUrl = (r: ReturnType<typeof render>, value: string) =>
  fireEvent.input(r.getByLabelText('Alamat aplikasi'), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const A1 = createLocation('A1', 'Gudang Utama', '', []);
const B2 = createLocation('B2', 'Gudang PHBI', '', [A1]);

describe('LabelSheet', () => {
  it('sends you back to the stock-take when there is nothing to label', () => {
    const r = sheet([]);
    expect(r.getByText(/Catat dulu di Opname Gudang/)).toBeTruthy();
  });

  it('prints one label per rack, and one per unit for labelled durables', () => {
    const sabun = createItem(input(), []);
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }), [sabun]);
    const r = sheet([sabun, pisau]);

    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByRole('status').textContent).toContain('4 label');   // 1 rack + 3 units
    expect(r.getByRole('status').textContent).toContain('1 lembar A4');
    expect(r.getByLabelText('ALQ-ITM-0002-003')).toBeTruthy();
  });

  it('counts sheets, not just labels', () => {
    const items = Array.from({ length: 25 }, (_, n) =>
      createItem(input({ name: `Barang ${n + 1}` }), []));
    const r = sheet(items);
    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByRole('status').textContent).toContain('2 lembar A4'); // 24 fit on the first
  });

  it('refuses to print against a dev-server address', () => {
    // happy-dom's location.origin is http://localhost:3000 — exactly the trap.
    const r = sheet([createItem(input(), [])]);
    expect(r.getByRole('alert')).toBeTruthy();
    expect((r.getByText('Cetak') as HTMLButtonElement).disabled).toBe(true);

    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.queryByRole('alert')).toBeNull();
    expect((r.getByText('Cetak') as HTMLButtonElement).disabled).toBe(false);
  });

  it('draws an opaque quiet zone — a transparent QR on a coloured sticker will not scan', () => {
    const r = sheet([createItem(input(), [])]);
    const svg = r.getByLabelText('ALQ-ITM-0001');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(svg.querySelector('path')?.getAttribute('d')?.startsWith('M')).toBe(true);
  });

  it('re-encodes every label when the address changes', () => {
    const r = sheet([createItem(input(), [])]);
    const before = r.getByLabelText('ALQ-ITM-0001').querySelector('path')?.getAttribute('d');
    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByLabelText('ALQ-ITM-0001').querySelector('path')?.getAttribute('d')).not.toBe(before);
  });
});

// --- The picker ---------------------------------------------------------------------------
//
// The jobs these cover are the ones that made the old print-everything sheet wrong: finishing
// one shelf in a single trip, reprinting one label that fell off, and tagging a batch of tools.

describe('LabelSheet — memilih apa yang dicetak', () => {
  const stocked = () => {
    const sabun = createItem(input({ locationId: A1.locationId }), []);
    const kain = createItem(input({ name: 'Kain pel', locationId: A1.locationId }), [sabun]);
    const lampu = createItem(input({ name: 'Lampu', locationId: B2.locationId }), [sabun, kain]);
    return [sabun, kain, lampu];
  };

  it('prints a rack and everything on it in one action', () => {
    const r = sheet(stocked(), [A1, B2]);
    setBaseUrl(r, 'https://inventaris.example.com');

    // Start from nothing so the assertion is about this one click, not the default.
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByRole('status').textContent).toContain('0 label');

    fireEvent.change(r.getByLabelText('Pilih semua di Rak A1'));
    // The shelf tag plus the two things stored on it — one trip, one sheet, one shelf done.
    expect(r.getByRole('status').textContent).toContain('3 label');
  });

  it('prints just the shelf tags when only the racks are wanted', () => {
    const r = sheet(stocked(), [A1, B2]);
    setBaseUrl(r, 'https://inventaris.example.com');
    fireEvent.click(r.getByText('Semua rak'));
    expect(r.getByRole('status').textContent).toContain('2 label');
  });

  it('changes how many sheets a selection needs when the size changes', () => {
    const items = Array.from({ length: 30 }, (_, n) =>
      createItem(input({ name: `Barang ${n + 1}` }), []));
    const r = sheet(items);
    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByRole('status').textContent).toContain('2 lembar A4');   // 24 per sheet

    fireEvent.click(r.getByText('Tag barang'));                            // 40 per sheet
    expect(r.getByRole('status').textContent).toContain('1 lembar A4');
  });

  it('narrows a growing list by search instead of asking you to scroll it', () => {
    const r = sheet(stocked(), [A1, B2]);
    fireEvent.input(r.getByLabelText('Cari label'), { target: { value: 'lampu' } });
    // Scoped to the picker: the preview still shows what is *selected*, which search does
    // not change — narrowing the list must not silently drop labels from the sheet.
    const list = within(r.getByLabelText('Daftar label'));
    expect(list.queryByText('Kain pel')).toBeNull();
    expect(list.getAllByText('Lampu').length).toBeGreaterThan(0);
  });

  it('says what to do rather than showing an empty sheet', () => {
    const r = sheet(stocked(), [A1, B2]);
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByText(/Belum ada label yang dipilih/)).toBeTruthy();
    expect((r.getByText('Cetak') as HTMLButtonElement).disabled).toBe(true);
  });
});
