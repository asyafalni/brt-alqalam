import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { LabelSheet } from './LabelSheet';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});

const sheet = (items: Item[]) => {
  const Harness = () => <LabelSheet items={items} categories={SEED_CATEGORIES} />;
  return render(Harness);
};

const setBaseUrl = (r: ReturnType<typeof render>, value: string) =>
  fireEvent.input(r.getByLabelText('Alamat aplikasi'), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

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
