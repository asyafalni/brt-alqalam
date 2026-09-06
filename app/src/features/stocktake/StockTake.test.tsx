import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { StockTake } from './StockTake';
import { toItemsCsv } from './draft';
import { parseItems } from '../../../../data/parse';

// Octane uses NATIVE events — `change` fires on blur, so typing is `input`.
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });

function addItem(r: ReturnType<typeof render>, name: string, qty: string) {
  type(r.getByLabelText('Nama barang'), name);
  type(r.getByLabelText('Jumlah dihitung'), qty);
  fireEvent.click(r.getByText('Tambah barang'));
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('StockTake — walking the gudang', () => {
  it('starts empty, and says where to begin', () => {
    const r = render(StockTake);
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });

  it('adds an item and shows it in the list', () => {
    const r = render(StockTake);
    addItem(r, 'Sabun cuci tangan', '12');

    expect(r.getByText('Sabun cuci tangan')).toBeTruthy();
    expect(r.getByText(/Kebersihan · Bisa habis/)).toBeTruthy();
    expect(r.queryByText(/Belum ada barang/)).toBeNull();
  });

  it('keeps category, unit and kind but clears the name — the sticky-context win', () => {
    const r = render(StockTake);
    type(r.getByLabelText('Satuan'), 'galon');
    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '4');

    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('');
    expect((r.getByLabelText('Satuan') as HTMLInputElement).value).toBe('galon');
    expect(r.getByText('Barang tetap').closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('refuses to add a nameless item, and says why', () => {
    const r = render(StockTake);
    fireEvent.click(r.getByText('Tambah barang'));
    expect(r.getByText('Nama barang belum diisi')).toBeTruthy();
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });

  it('warns about a duplicate name but still allows it', () => {
    const r = render(StockTake);
    addItem(r, 'Sapu', '2');
    type(r.getByLabelText('Nama barang'), 'sapu');
    fireEvent.click(r.getByText('Tambah barang'));
    expect(r.getAllByText('Sapu').length + r.getAllByText('sapu').length).toBe(2);
  });

  it('steppers adjust the count and never go below zero', () => {
    const r = render(StockTake);
    const qty = r.getByLabelText('Jumlah dihitung') as HTMLInputElement;
    fireEvent.click(r.getByLabelText('Tambah'));
    fireEvent.click(r.getByLabelText('Tambah'));
    expect(qty.value).toBe('2');
    for (let i = 0; i < 5; i += 1) fireEvent.click(r.getByLabelText('Kurangi'));
    expect(qty.value).toBe('0');
  });

  it('minimum starts as "(-)" — no alarm — until the operator sets one', () => {
    const r = render(StockTake);
    expect(r.getByText(/Tidak ada minimum/)).toBeTruthy();
    fireEvent.click(r.getByText('Atur'));
    expect(r.getByLabelText('Minimum (alarm stok)')).toBeTruthy();
  });

  it('removes an item', () => {
    const r = render(StockTake);
    addItem(r, 'Kanebo', '5');
    fireEvent.click(r.getByLabelText('Hapus Kanebo'));
    expect(r.queryByText('Kanebo')).toBeNull();
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });

  it('survives closing the app — the draft is restored from storage', () => {
    const first = render(StockTake);
    addItem(first, 'Terpal', '3');
    cleanup();

    const second = render(StockTake);
    expect(second.getByText('Terpal')).toBeTruthy();
  });

  it('what it exports is what the Items sheet accepts', () => {
    const r = render(StockTake);
    addItem(r, 'Sabun', '12');
    const stored = JSON.parse(localStorage.getItem('brt.stocktake.draft.v1')!);
    // The draft IS domain Items, so the CSV the button produces parses with zero quarantine.
    const parsed = parseItems(toItemsCsv(stored));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[0]).toMatchObject({ name: 'Sabun', initialStock: 12, kind: 'consumable' });
  });
});
