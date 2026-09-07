import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { LabelSheet } from './LabelSheet';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location, StockLine } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});


/** Items and their stock lines together — quantity and placement live on the lines now. */
let lines: StockLine[] = [];
const catalog = (...inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, i) => {
    const built = createEntry(i, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};

const sheet = (items: Item[], locations: Location[] = [], stock: StockLine[] = lines) => {
  const Harness = () => (
    <LabelSheet
      items={items}
      categories={SEED_CATEGORIES}
      locations={locations}
      stock={stock}
    />
  );
  return render(Harness);
};

/* The address lives in a side sheet now — set once when the app gets a real URL, not chosen on
   every visit — so setting it means opening that sheet. */
const setBaseUrl = (r: ReturnType<typeof render>, value: string) => {
  fireEvent.click(r.getByLabelText('Tujuan QR'));
  fireEvent.input(r.getByLabelText('Alamat aplikasi'), { target: { value } });
  fireEvent.click(r.getByText('Selesai'));
};

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
    const r = sheet(catalog(input(), input({ name: 'Pisau', kind: 'equipment', initialStock: 3 })));

    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByRole('status').textContent).toContain('4 label');   // 1 rack + 3 units
    expect(r.getByRole('status').textContent).toContain('1 lembar A4');
    expect(r.getByLabelText('ALQ-ITM-0002-003')).toBeTruthy();
  });

  it('counts sheets, not just labels', () => {
    const items = catalog(...Array.from({ length: 25 }, (_, n) => input({ name: `Barang ${n + 1}` })));
    const r = sheet(items);
    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.getByRole('status').textContent).toContain('2 lembar A4'); // 24 fit on the first
  });

  it('refuses to print against a dev-server address', () => {
    // happy-dom's location.origin is http://localhost:3000 — exactly the trap.
    const r = sheet(catalog(input()));
    // The warning is on the icon that opens the sheet, beside Cetak — an unusable address is
    // the one thing that stops printing, so it cannot be three cards away from the button.
    expect((r.getByText('Cetak') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(r.getByLabelText('Tujuan QR'));
    expect(r.getByRole('alert')).toBeTruthy();
    fireEvent.click(r.getByText('Selesai'));

    setBaseUrl(r, 'https://inventaris.example.com');
    expect(r.queryByRole('alert')).toBeNull();
    expect((r.getByText('Cetak') as HTMLButtonElement).disabled).toBe(false);
  });

  it('draws an opaque quiet zone — a transparent QR on a coloured sticker will not scan', () => {
    const r = sheet(catalog(input()));
    const svg = r.getByLabelText('ALQ-ITM-0001');
    expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#fff');
    expect(svg.querySelector('path')?.getAttribute('d')?.startsWith('M')).toBe(true);
  });

  it('re-encodes every label when the address changes', () => {
    const r = sheet(catalog(input()));
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
    return catalog(
      input({ locationId: A1.locationId }),
      input({ name: 'Kain pel', locationId: A1.locationId }),
      input({ name: 'Lampu', locationId: B2.locationId }),
    );
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
    const items = catalog(...Array.from({ length: 30 }, (_, n) => input({ name: `Barang ${n + 1}` })));
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
