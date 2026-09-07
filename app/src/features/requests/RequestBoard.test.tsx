import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, StockLine } from '../../../../domain/types';
import type { PurchaseRequest } from '../../../../domain/requests';

const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });
const at = (hash: string) => { location.hash = hash; };

const A1 = createLocation('A1', 'Gudang Utama', '', []);

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
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, locationId: A1.locationId, ...p,
});

const req = (p: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  requestId: 'REQ-0001', name: 'Sapu ijuk', qty: 2, unit: 'buah',
  reason: 'Yang lama patah', status: 'diajukan',
  requestedBy: 'USR-DEMO', requestedTs: Date.now() - 1000, ...p,
});

function seed(items: Item[], requests: PurchaseRequest[] = []) {
  localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
    items, categories: SEED_CATEGORIES, locations: [A1], stock: lines, txns: [], requests,
  }));
}
const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v6')!);

beforeEach(() => { localStorage.clear(); at('#/pengajuan'); });
afterEach(() => { cleanup(); at('#/'); });

describe('Pengajuan Pembelian', () => {
  it('says what to do when nothing has been asked for yet', () => {
    seed(catalog(input()));
    expect(render(App).getByText(/Belum ada pengajuan/)).toBeTruthy();
  });

  it('shows the reason, the price and the link — the four things the boss asked for', () => {
    seed(catalog(input()), [req({ price: 27_500, url: 'https://toko.example/sapu' })]);
    const r = render(App);

    expect(r.getByText('Sapu ijuk')).toBeTruthy();
    expect(r.getByText('Yang lama patah')).toBeTruthy();
    expect(r.getByText(/Rp27\.500\/buah/)).toBeTruthy();
    expect((r.getByText('Lihat tautan').closest('a') as HTMLAnchorElement).href)
      .toBe('https://toko.example/sapu');
  });

  it('adds up what the open requests would cost, and says how many have no price', () => {
    // A total that treats "we do not know yet" as "free" is a number somebody takes to a
    // takmir meeting and is wrong there.
    seed(catalog(input()), [
      req({ requestId: 'A', price: 10_000, qty: 2 }),
      req({ requestId: 'B' }),
    ]);
    const r = render(App);
    expect(r.getByText('Rp20.000')).toBeTruthy();
    expect(r.getByText(/1 pengajuan belum ada harganya/)).toBeTruthy();
  });

  it('refuses a request with no reason, because nobody could act on it', () => {
    seed(catalog(input()));
    const r = render(App);

    fireEvent.click(r.getAllByText('Ajukan barang')[0]);
    type(r.getByLabelText('Nama barang'), 'Sapu');
    fireEvent.click(r.getByText('Ajukan'));

    expect(r.getByText('Alasannya belum diisi')).toBeTruthy();
    expect(stored().requests).toEqual([]);
  });

  it('records a new request with everything it was given', () => {
    seed(catalog(input()));
    const r = render(App);

    fireEvent.click(r.getAllByText('Ajukan barang')[0]);
    type(r.getByLabelText('Nama barang'), 'Sapu ijuk');
    type(r.getByLabelText('Jumlah'), '3');
    type(r.getByLabelText('Kenapa perlu dibeli?'), 'Gagangnya patah');
    type(r.getByLabelText(/Perkiraan harga/), '27500');
    fireEvent.click(r.getByText('Ajukan'));

    expect(stored().requests[0]).toMatchObject({
      name: 'Sapu ijuk', qty: 3, reason: 'Gagangnya patah', price: 27500, status: 'diajukan',
    });
  });
});

describe('a request becomes stock only when it is bought', () => {
  it('creates the item and its first shelf for something new', () => {
    seed(catalog(input()), [req({ name: 'Sapu ijuk', qty: 2, unit: 'buah' })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Sudah dibeli' }));
    fireEvent.change(r.getByLabelText('Ditaruh di rak'), { target: { value: A1.locationId } });
    fireEvent.click(r.getByText('Catat sebagai stok'));

    const after = stored();
    const created = after.items.find((i: Item) => i.name === 'Sapu ijuk');
    expect(created).toBeTruthy();
    expect(after.stock.find((l: StockLine) => l.itemId === created.itemId))
      .toMatchObject({ locationId: A1.locationId, initialStock: 2 });
    expect(after.requests[0].status).toBe('dibeli');
  });

  it('adds to the existing item when the request was a restock', () => {
    // A second catalog row called "Sabun" is exactly the mess this register exists to clear up.
    const items = catalog(input({ name: 'Sabun', initialStock: 10 }));
    seed(items, [req({ itemId: items[0].itemId, name: 'Sabun', qty: 4, unit: 'galon' })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Sudah dibeli' }));
    fireEvent.change(r.getByLabelText('Ditaruh di rak'), { target: { value: A1.locationId } });
    fireEvent.click(r.getByText('Catat sebagai stok'));

    const after = stored();
    expect(after.items).toHaveLength(1);
    expect(after.stock.find((l: StockLine) => l.locationId === A1.locationId).initialStock)
      .toBe(14);
  });

  it('leaves the stock alone until then', () => {
    seed(catalog(input()), [req()]);
    const before = stored();
    render(App);
    expect(stored().items).toHaveLength(before.items.length);
    expect(stored().stock).toEqual(before.stock);
  });

  it('will not turn one down without saying why', () => {
    // "Tidak jadi" with no reason gets re-asked next month.
    seed(catalog(input()), [req()]);
    const r = render(App);

    fireEvent.click(r.getByText('Tidak jadi'));
    expect((r.getByText('Tandai tidak jadi') as HTMLButtonElement).disabled).toBe(true);

    type(r.getByLabelText('Alasannya'), 'Belum masuk anggaran');
    fireEvent.click(r.getByText('Tandai tidak jadi'));
    expect(stored().requests[0]).toMatchObject({ status: 'ditolak', note: 'Belum masuk anggaran' });
  });
});
