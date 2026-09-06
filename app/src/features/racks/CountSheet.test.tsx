import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { CountSheet } from './CountSheet';
import { createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { deriveState } from '../../../../domain/deriveState';
import type { Item, Location } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';

// Octane uses NATIVE events — `change` fires on blur, so typing is `input`.
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });

const TS0 = Date.parse('2026-09-06T00:00:00Z');

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: null, ...p,
});

/** Built the way the stock-take builds it, so ids and derived stock are the real ones. */
const catalog = (...inputs: DraftInput[]): Item[] =>
  inputs.reduce<Item[]>((acc, i) => [...acc, createItem(i, acc)], []);

/** The sheet only reads `derived.items`; the rest of the log is empty until the gateway exists. */
const inventoryFor = (items: Item[]): Inventory => ({
  instances: [], txns: [], notifications: [], offline: true,
  derived: deriveState(items, [], [], TS0),
});

const rak: Location = {
  locationId: 'LOC-B3', code: 'B3', name: 'Rak sabun', zone: 'Gudang Utama', order: 1, active: true,
};

function sheet(contents: Item[]) {
  const applied: Map<string, number>[] = [];
  const cancels: true[] = [];
  const r = render(CountSheet, {
    props: {
      rack: rak,
      contents,
      inventory: inventoryFor(contents),
      onApply: (counted: Map<string, number>) => { applied.push(counted); },
      onCancel: () => { cancels.push(true); },
    },
  });
  return { ...r, applied, cancels };
}

afterEach(() => cleanup());

describe('CountSheet — the two-minute recount of one rack', () => {
  it('opens with what the system believes, and nothing yet claimed', () => {
    const r = sheet(catalog(input({ name: 'Sabun', initialStock: 10 })));

    expect(r.getByText('sistem: 10 galon')).toBeTruthy();
    // Empty, not pre-filled with the expectation: a number already in the box is a number
    // nobody counted.
    expect((r.getByLabelText('Hitungan fisik Sabun') as HTMLInputElement).value).toBe('');
  });

  it('"Semua sesuai" agrees with every line in one tap — the common case', () => {
    const r = sheet(catalog(
      input({ name: 'Sabun', initialStock: 10 }),
      input({ name: 'Kanebo', initialStock: 4 }),
    ));

    fireEvent.click(r.getByText('Semua sesuai'));

    expect((r.getByLabelText('Hitungan fisik Sabun') as HTMLInputElement).value).toBe('10');
    expect((r.getByLabelText('Hitungan fisik Kanebo') as HTMLInputElement).value).toBe('4');
    expect(r.getByRole('status').textContent).toBe('2/2 dihitung · 0 selisih');
    // A matching line renders a tick, never a signed number — nothing here disagrees.
    expect(r.queryByText(/^[+-]\d+$/)).toBeNull();
    expect(r.queryByText(/berbeda dari catatan/)).toBeNull();
  });

  it('a different number reads as a signed delta, so the drift is the thing you see', () => {
    const r = sheet(catalog(input({ name: 'Sabun', initialStock: 10 })));

    type(r.getByLabelText('Hitungan fisik Sabun'), '7');

    expect(r.getByText('-3')).toBeTruthy();
    expect(r.getByText(/1 barang berbeda dari catatan/)).toBeTruthy();
  });

  it('cannot be saved until at least one line has been counted', () => {
    const r = sheet(catalog(input({ name: 'Sabun', initialStock: 10 })));

    expect((r.getByText('Simpan hasil hitung') as HTMLButtonElement).disabled).toBe(true);
    type(r.getByLabelText('Hitungan fisik Sabun'), '9');
    expect((r.getByText('Simpan hasil hitung') as HTMLButtonElement).disabled).toBe(false);
  });

  it('saves only the lines someone counted — a skipped line is unknown, not zero', () => {
    const items = catalog(
      input({ name: 'Sabun', initialStock: 10 }),
      input({ name: 'Kanebo', initialStock: 4 }),
    );
    const r = sheet(items);

    type(r.getByLabelText('Hitungan fisik Sabun'), '7');
    fireEvent.click(r.getByText('Simpan hasil hitung'));

    expect(r.applied).toHaveLength(1);
    expect([...r.applied[0]]).toEqual([[items[0].itemId, 7]]);
  });

  it('counting zero IS a correction — an empty shelf is a fact worth recording', () => {
    const items = catalog(input({ name: 'Sabun', initialStock: 10 }));
    const r = sheet(items);

    type(r.getByLabelText('Hitungan fisik Sabun'), '0');
    expect(r.getByText('-10')).toBeTruthy();

    fireEvent.click(r.getByText('Simpan hasil hitung'));
    expect(r.applied[0].get(items[0].itemId)).toBe(0);
  });

  it('an empty rack says so and offers nothing to count', () => {
    const r = sheet([]);

    expect(r.getByText(/Rak ini kosong/)).toBeTruthy();
    expect(r.queryByText('Semua sesuai')).toBeNull();
    expect(r.queryByText('Simpan hasil hitung')).toBeNull();
  });

  it('the running summary says how much is left to do and how much disagrees', () => {
    const r = sheet(catalog(
      input({ name: 'Sabun', initialStock: 10 }),
      input({ name: 'Kanebo', initialStock: 4 }),
    ));

    expect(r.getByRole('status').textContent).toBe('0/2 dihitung · 0 selisih');

    type(r.getByLabelText('Hitungan fisik Sabun'), '7');
    // The net is what gets reported upward, so it belongs on the same line as the progress.
    expect(r.getByRole('status').textContent).toBe('1/2 dihitung · 1 selisih · net -3');
  });
});
