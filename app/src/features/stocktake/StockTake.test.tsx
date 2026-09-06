import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { StockTake } from './StockTake';
import { toItemsCsv, toInstancesCsv } from './draft';
import { parseItems, parseInstances } from '../../../../data/parse';

// Octane uses NATIVE events — `change` fires on blur, so typing is `input`.
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });

type R = ReturnType<typeof render>;

function addItem(r: R, name: string, qty: string) {
  type(r.getByLabelText('Nama barang'), name);
  type(r.getByLabelText('Jumlah dihitung'), qty);
  fireEvent.click(r.getByText('Tambah barang'));
}

const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v2')!);

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

  it('survives closing the app — the draft is restored from storage', () => {
    const first = render(StockTake);
    addItem(first, 'Terpal', '3');
    cleanup();
    expect(render(StockTake).getByText('Terpal')).toBeTruthy();
  });
});

describe('durables must be asked how they are tracked', () => {
  it('the question only appears for Barang tetap', () => {
    const r = render(StockTake);
    expect(r.queryByText('Label satu-satu')).toBeNull();
    fireEvent.click(r.getByText('Barang tetap'));
    expect(r.getByText('Label satu-satu')).toBeTruthy();
    fireEvent.click(r.getByText('Bisa habis'));
    expect(r.queryByText('Label satu-satu')).toBeNull();
  });

  it('choosing "Hitung jumlahnya" produces no per-unit labels', () => {
    const r = render(StockTake);
    fireEvent.click(r.getByText('Barang tetap'));
    fireEvent.click(r.getByText('Hitung jumlahnya'));
    addItem(r, 'Terpal', '10');
    expect(toInstancesCsv(stored().items, 0).trim()).toBe('assetId,itemId,label,acquiredTs,active');
  });

  it('labelling one-by-one yields one QR-able unit per count', () => {
    const r = render(StockTake);
    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '3');
    const parsed = parseInstances(toInstancesCsv(stored().items, Date.parse('2026-09-06T00:00:00Z')));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok.map((a) => a.label)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
  });
});

describe('editing a row mid-walk', () => {
  it('loads the row back into the form and saves in place', () => {
    const r = render(StockTake);
    addItem(r, 'Sabun', '5');
    fireEvent.click(r.getByLabelText('Ubah Sabun'));

    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('Sabun');
    type(r.getByLabelText('Nama barang'), 'Sabun cair');
    fireEvent.click(r.getByText('Simpan perubahan'));

    expect(r.getByText('Sabun cair')).toBeTruthy();
    expect(stored().items).toHaveLength(1);
    expect(stored().items[0].itemId).toBe('ITM-0001'); // id survives — it may be on a label
  });

  it('does not warn that the row being edited duplicates itself', () => {
    const r = render(StockTake);
    addItem(r, 'Sapu', '2');
    fireEvent.click(r.getByLabelText('Ubah Sapu'));
    fireEvent.click(r.getByText('Simpan perubahan'));
    expect(r.queryByText(/tetap tambah/)).toBeNull();
  });

  it('can be cancelled without changing anything', () => {
    const r = render(StockTake);
    addItem(r, 'Sapu', '2');
    fireEvent.click(r.getByLabelText('Ubah Sapu'));
    type(r.getByLabelText('Nama barang'), 'Bukan sapu');
    fireEvent.click(r.getByText('Batal'));
    expect(r.getByText('Sapu')).toBeTruthy();
    expect(r.queryByText('Bukan sapu')).toBeNull();
  });

  it('deleting takes two taps — a mis-tap must not lose a counted row', () => {
    const r = render(StockTake);
    addItem(r, 'Kanebo', '5');

    fireEvent.click(r.getByLabelText('Hapus Kanebo'));
    expect(r.getByText('Kanebo')).toBeTruthy();          // still there after one tap
    fireEvent.click(r.getByText('Batal'));
    expect(r.getByText('Kanebo')).toBeTruthy();          // and after backing out

    fireEvent.click(r.getByLabelText('Hapus Kanebo'));
    fireEvent.click(r.getByLabelText('Ya, hapus Kanebo'));
    expect(r.queryByText('Kanebo')).toBeNull();
  });

  it('emptying the whole list also takes two taps', () => {
    const r = render(StockTake);
    addItem(r, 'Sapu', '1');
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByText(/Hapus semua 1 barang\?/)).toBeTruthy();
    fireEvent.click(r.getByText('Ya, hapus'));
    expect(r.getByText(/Belum ada barang/)).toBeTruthy();
  });
});

describe('categories are free-form', () => {
  it('a new category can be added mid-walk and is selected immediately', () => {
    const r = render(StockTake);
    fireEvent.click(r.getByLabelText('Tambah kategori baru'));
    type(r.getByLabelText('Nama kategori baru'), 'Alat Masak');
    fireEvent.click(r.getByText('Simpan'));
    addItem(r, 'Panci besar', '2');

    expect(r.getByText(/Alat Masak · Bisa habis/)).toBeTruthy();
    expect(stored().categories.at(-1)).toMatchObject({ categoryId: 'CAT-ALAT-MASAK', name: 'Alat Masak' });
  });

  it('backing out of the new-category field adds nothing', () => {
    const r = render(StockTake);
    fireEvent.click(r.getByLabelText('Tambah kategori baru'));
    type(r.getByLabelText('Nama kategori baru'), 'Tidak jadi');
    fireEvent.click(r.getByText('Batal'));
    addItem(r, 'Sabun', '1');

    expect(stored().categories).toHaveLength(8);
    expect(r.queryByLabelText('Nama kategori baru')).toBeNull();
  });

  it('uses a native dialog for nothing — the kiosk never calls prompt or confirm', () => {
    // happy-dom provides neither, so any surviving call would throw rather than pass silently.
    const r = render(StockTake);
    addItem(r, 'Sabun', '1');
    fireEvent.click(r.getByLabelText('Tambah kategori baru'));
    fireEvent.click(r.getByLabelText('Hapus Sabun'));
    fireEvent.click(r.getByText('Kosongkan'));
    expect(r.getByText(/Hapus semua/)).toBeTruthy();
  });
});

describe('export', () => {
  it('offers one file per sheet tab, and only lists instances when there are any', () => {
    const r = render(StockTake);
    addItem(r, 'Sabun', '5');
    expect(r.getByText('Items')).toBeTruthy();
    expect(r.getByText('Categories')).toBeTruthy();
    expect(r.queryByText('AssetInstances')).toBeNull();

    fireEvent.click(r.getByText('Barang tetap'));
    addItem(r, 'Pisau', '2');
    expect(r.getByText('AssetInstances')).toBeTruthy();
    expect(r.getByText(/2 baris · unit yang dilabeli/)).toBeTruthy();
  });

  it('what it exports is what the Items sheet accepts', () => {
    const r = render(StockTake);
    addItem(r, 'Sabun', '12');
    const parsed = parseItems(toItemsCsv(stored().items));
    expect(parsed.quarantined).toEqual([]);
    expect(parsed.ok[0]).toMatchObject({ name: 'Sabun', initialStock: 12, kind: 'consumable' });
  });
});

describe('finding a row in a long list', () => {
  it('the search box appears only once the list is long enough to need it', () => {
    const r = render(StockTake);
    for (let n = 1; n <= 5; n += 1) addItem(r, `Barang ${n}`, '1');
    expect(r.queryByLabelText('Cari barang')).toBeNull();
    addItem(r, 'Sabun cuci', '1');
    expect(r.getByLabelText('Cari barang')).toBeTruthy();
  });

  it('filters the list, and says so when nothing matches', () => {
    const r = render(StockTake);
    for (let n = 1; n <= 5; n += 1) addItem(r, `Barang ${n}`, '1');
    addItem(r, 'Sabun cuci', '1');

    type(r.getByLabelText('Cari barang'), 'sabun');
    expect(r.getByText('Sabun cuci')).toBeTruthy();
    expect(r.queryByText('Barang 1')).toBeNull();

    type(r.getByLabelText('Cari barang'), 'zzz');
    expect(r.getByText(/Tidak ada yang cocok/)).toBeTruthy();
  });
});
