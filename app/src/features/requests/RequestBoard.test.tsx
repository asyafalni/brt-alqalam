import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, StockLine, Txn } from '../../../../domain/types';
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
  requestId: 'REQ-0001', type: 'beli', name: 'Sapu ijuk', qty: 2, unit: 'buah',
  reason: 'Yang lama patah', status: 'diajukan',
  requestedBy: 'USR-DEMO', requestedTs: Date.now() - 1000, ...p,
});

function seed(items: Item[], requests: PurchaseRequest[] = [], txns: Txn[] = []) {
  localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
    items, categories: SEED_CATEGORIES, locations: [A1], stock: lines, txns, requests,
  }));
}
const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v6')!);

beforeEach(() => { localStorage.clear(); at('#/pengajuan'); });
afterEach(() => { cleanup(); at('#/'); });

describe('Pengajuan', () => {
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

    fireEvent.click(r.getAllByText('Ajukan')[0]);
    type(r.getByLabelText('Nama barang'), 'Sapu');
    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(r.getByText('Alasannya belum diisi')).toBeTruthy();
    expect(stored().requests).toEqual([]);
  });

  it('records a new request with everything it was given', () => {
    seed(catalog(input()));
    const r = render(App);

    fireEvent.click(r.getAllByText('Ajukan')[0]);
    type(r.getByLabelText('Nama barang'), 'Sapu ijuk');
    type(r.getByLabelText('Jumlah'), '3');
    type(r.getByLabelText('Kenapa perlu dibeli?'), 'Gagangnya patah');
    type(r.getByLabelText(/Perkiraan harga/), '27500');
    fireEvent.click(r.getByText('Kirim pengajuan'));

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
    expect(after.requests[0].status).toBe('selesai');
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

describe('one page for both, and the repair half of it', () => {
  // Three knives, so ALQ-ITM-0001-002 exists to be broken.
  const KNIVES = () => catalog(input({
    name: 'Pisau potong', categoryId: 'CAT-PHBI', unit: 'buah',
    kind: 'equipment', initialStock: 3, minStock: null,
  }));

  const broke = (assetId: string): Txn[] => [
    { txnId: 'T1', clientTxnId: 'C1', ts: Date.now() - 20_000, type: 'peminjaman',
      assetId, qtyDelta: 0, actorUserId: 'USR-A', recipient: 'Pos Potong 1' },
    { txnId: 'T2', clientTxnId: 'C2', ts: Date.now() - 10_000, type: 'pengembalian',
      assetId, qtyDelta: 0, actorUserId: 'USR-A', condition: 'rusak', note: 'Gagang retak' },
  ];

  it('records a repair against the unit that is broken', () => {
    seed(KNIVES(), [], broke('ALQ-ITM-0001-002'));
    const r = render(App);

    fireEvent.click(r.getAllByText('Ajukan')[0]);
    fireEvent.click(r.getByText('Perbaiki'));
    fireEvent.change(r.getByLabelText('Unit yang rusak'), { target: { value: 'ALQ-ITM-0001-002' } });
    type(r.getByLabelText('Rusaknya bagaimana?'), 'Gagangnya retak sampai pangkal');
    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(stored().requests[0]).toMatchObject({
      type: 'perbaikan', assetId: 'ALQ-ITM-0001-002', status: 'diajukan',
    });
  });

  it('does not ask a repair how many, because that question has no answer', () => {
    seed(KNIVES(), [], broke('ALQ-ITM-0001-002'));
    const r = render(App);
    fireEvent.click(r.getAllByText('Ajukan')[0]);
    fireEvent.click(r.getByText('Perbaiki'));
    expect(r.queryByLabelText('Jumlah')).toBeNull();
    expect(r.queryByLabelText('Satuan')).toBeNull();
  });

  it('will not take a repair that does not say which unit', () => {
    seed(KNIVES(), [], broke('ALQ-ITM-0001-002'));
    const r = render(App);
    fireEvent.click(r.getAllByText('Ajukan')[0]);
    fireEvent.click(r.getByText('Perbaiki'));
    type(r.getByLabelText('Rusaknya bagaimana?'), 'Retak');
    fireEvent.click(r.getByText('Kirim pengajuan'));
    expect(r.getByText('Pilih dulu unit mana yang rusak')).toBeTruthy();
    expect(stored().requests).toEqual([]);
  });

  it('hands the unit back to the shelf when the repair is finished', () => {
    // The whole reason a repair knows which unit it is about. Closing the request without
    // this leaves the register calling a thing broken that is back on its hook.
    seed(KNIVES(), [req({
      type: 'perbaikan', name: 'Pisau potong #2', assetId: 'ALQ-ITM-0001-002',
      qty: 1, unit: '', reason: 'Gagang retak',
    })], broke('ALQ-ITM-0001-002'));
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Sudah diperbaiki' }));
    fireEvent.click(r.getByText('Catat perbaikan selesai'));

    const after = stored();
    expect(after.requests[0].status).toBe('selesai');
    expect(after.txns.at(-1)).toMatchObject({
      type: 'status_change', assetId: 'ALQ-ITM-0001-002', toStatus: 'available',
    });
  });

  it('adds no stock for a repair — the unit was always ours', () => {
    seed(KNIVES(), [req({
      type: 'perbaikan', name: 'Pisau potong #2', assetId: 'ALQ-ITM-0001-002',
      qty: 1, unit: '', reason: 'Gagang retak',
    })], broke('ALQ-ITM-0001-002'));
    const before = stored();
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Sudah diperbaiki' }));
    fireEvent.click(r.getByText('Catat perbaikan selesai'));

    expect(stored().stock).toEqual(before.stock);
    expect(stored().items).toHaveLength(before.items.length);
  });

  it('opens ready-filled when it was reached from a broken unit', () => {
    // The click on Aset already said "ajukan"; asking again is the tap §0.0 exists to remove.
    seed(KNIVES(), [], broke('ALQ-ITM-0001-002'));
    at('#/pengajuan?t=perbaikan&a=ALQ-ITM-0001-002');
    const r = render(App);
    expect((r.getByLabelText('Unit yang rusak') as HTMLSelectElement).value)
      .toBe('ALQ-ITM-0001-002');
  });

  const lost = (assetId: string, note?: string): Txn[] => [
    { txnId: 'T1', clientTxnId: 'C1', ts: Date.now() - 20_000, type: 'peminjaman',
      assetId, qtyDelta: 0, actorUserId: 'USR-A', recipient: 'Pos Potong 2' },
    { txnId: 'T2', clientTxnId: 'C2', ts: Date.now() - 10_000, type: 'pengembalian',
      assetId, qtyDelta: 0, actorUserId: 'USR-A', condition: 'hilang', ...(note ? { note } : {}) },
  ];

  it('replaces a lost unit in one tap, with nothing to retype', () => {
    // Everything here is already in the register: which unit, which catalog row, what it is
    // called, and why it is gone. Making somebody type it again is transcription, not thought.
    seed(KNIVES(), [], lost('ALQ-ITM-0001-003', 'Tidak kembali setelah hari-H'));
    at('#/pengajuan?t=beli&a=ALQ-ITM-0001-003');
    const r = render(App);

    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(stored().requests[0]).toMatchObject({
      type: 'beli',
      assetId: 'ALQ-ITM-0001-003',
      name: 'Pisau potong',
      reason: 'Pengganti Pisau potong #3 yang hilang. Tidak kembali setelah hari-H',
    });
  });

  it('makes the replacement a restock of the same catalog row, not a second one', () => {
    // A second row called "Pisau potong" is exactly the mess the register exists to clear up.
    const items = KNIVES();
    seed(items, [], lost('ALQ-ITM-0001-003'));
    at('#/pengajuan?t=beli&a=ALQ-ITM-0001-003');
    const r = render(App);
    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(stored().requests[0].itemId).toBe(items[0].itemId);
  });

  it('says on the form what it is replacing, and lets that be dropped', () => {
    // A link nobody can see looks like a form that filled itself in for no reason; a link
    // nobody can undo gets worked around by starting over, and the loss stays unclosed.
    seed(KNIVES(), [], lost('ALQ-ITM-0001-003'));
    at('#/pengajuan?t=beli&a=ALQ-ITM-0001-003');
    const r = render(App);

    expect(r.getByText('Pengganti Pisau potong #3')).toBeTruthy();
    fireEvent.click(r.getByText('Bukan pengganti'));
    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(stored().requests[0].assetId).toBeUndefined();
  });
});

describe('the photo is part of describing the request', () => {
  it('is asked for in the form, not after saving', () => {
    // It is one of the four fields the boss named, and the moment somebody is describing a
    // request is the moment they have the screenshot in hand. Making them save, find the row
    // and open a panel was three steps to avoid one cleanup call.
    seed(catalog(input()));
    const r = render(App);
    fireEvent.click(r.getAllByText('Ajukan')[0]);
    expect(r.getByText('Foto (opsional)')).toBeTruthy();
  });

  it('gives the form the id the request will actually get', () => {
    // Photos are keyed to it inside the form, so a mismatch would orphan every one of them.
    seed(catalog(input()), [req({ requestId: 'REQ-0007' })]);
    const r = render(App);
    fireEvent.click(r.getAllByText('Ajukan')[0]);
    type(r.getByLabelText('Nama barang'), 'Sapu');
    type(r.getByLabelText('Kenapa perlu dibeli?'), 'Patah');
    fireEvent.click(r.getByText('Kirim pengajuan'));

    expect(stored().requests.at(-1).requestId).toBe('REQ-0008');
  });
});

describe('changing a request after it was sent', () => {
  it('reopens the same form, filled in with what was asked for', () => {
    // One form for both jobs. A separate edit screen would be these eight fields maintained
    // twice, and the second copy is the one that stops getting the fix.
    seed(catalog(input()), [req({ name: 'Sapu ijuk', qty: 2, price: 27_500, reason: 'Patah' })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ubah' }));
    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('Sapu ijuk');
    expect((r.getByLabelText('Jumlah') as HTMLInputElement).value).toBe('2');
    expect((r.getByLabelText(/Perkiraan harga/) as HTMLInputElement).value).toBe('27500');
  });

  it('saves the change onto the same request rather than making a second one', () => {
    seed(catalog(input()), [req({ name: 'Sapu ijuk', qty: 2 })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ubah' }));
    type(r.getByLabelText('Jumlah'), '5');
    fireEvent.click(r.getByText('Simpan perubahan'));

    const after = stored().requests;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ requestId: 'REQ-0001', qty: 5 });
  });

  it('lets a price be cleared, not merely replaced', () => {
    // "We no longer know" is a real answer, and spreading only the present keys would keep the
    // old guess while the field looked empty.
    seed(catalog(input()), [req({ price: 27_500 })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ubah' }));
    type(r.getByLabelText(/Perkiraan harga/), '');
    fireEvent.click(r.getByText('Simpan perubahan'));

    expect(stored().requests[0].price).toBeUndefined();
  });

  it('leaves who asked and when alone — those are the record, not fields', () => {
    seed(catalog(input()), [req({ requestedBy: 'USR-A', requestedTs: 111 })]);
    const r = render(App);

    fireEvent.click(r.getByRole('button', { name: 'Ubah' }));
    type(r.getByLabelText('Kenapa perlu dibeli?'), 'Alasan baru');
    fireEvent.click(r.getByText('Simpan perubahan'));

    expect(stored().requests[0]).toMatchObject({
      requestedBy: 'USR-A', requestedTs: 111, status: 'diajukan', reason: 'Alasan baru',
    });
  });

  it('offers no Ubah on a request that has been decided', () => {
    // Then it is the record of what was decided, and editing it rewrites what was approved.
    seed(catalog(input()), [req({ status: 'selesai' })]);
    expect(render(App).queryByRole('button', { name: 'Ubah' })).toBeNull();
  });

  it('no longer carries a photo action on the row', () => {
    // One way to reach the job, and it is Ubah. Every control on a row is a thing between
    // somebody and the reason they opened the screen.
    seed(catalog(input()), [req()]);
    expect(render(App).queryByText('Tambah foto')).toBeNull();
  });
});
