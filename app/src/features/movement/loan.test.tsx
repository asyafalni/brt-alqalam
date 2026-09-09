import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, StockLine, Txn } from '../../../../domain/types';

const at = (hash: string) => { location.hash = hash; };

let lines: StockLine[] = [];
const catalog = (...inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, i) => {
    const built = createEntry(i, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};
const knives = () => catalog({
  name: 'Pisau potong', categoryId: 'CAT-PHBI', unit: 'buah',
  kind: 'equipment', initialStock: 2, minStock: null,
});

function seed(items: Item[], txns: Txn[] = []) {
  localStorage.setItem('brt.stocktake.draft.v6', JSON.stringify({
    items, categories: SEED_CATEGORIES, locations: [], stock: lines, txns, requests: [],
  }));
}
const stored = (): Txn[] => JSON.parse(localStorage.getItem('brt.stocktake.draft.v6')!).txns;

const lentOut = (unit: string): Txn => ({
  txnId: 'L1', clientTxnId: 'l1', ts: Date.now() - 20 * 24 * 60 * 60 * 1000,
  type: 'peminjaman', assetId: `ALQ-ITM-0001-${unit}`, qtyDelta: 0,
  actorUserId: 'USR-1', recipient: 'Pak Yusuf',
});

beforeEach(() => { localStorage.clear(); at('#/'); });
afterEach(() => { cleanup(); at('#/'); });

/*
 * THE HOLE THIS CLOSES. The whole equipment lifecycle was modelled, folded, colour-coded and
 * reported on — and nothing in the app could put a unit into any of its states. Every dipinjam,
 * rusak and hilang on screen came from `demo.ts`, which says so itself. So "can we mark
 * something lost?" had the answer: no, and not the borrowing either (§60, §73).
 */
describe('lending a labelled unit out', () => {
  it('records who has it', () => {
    seed(knives());
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getAllByText('Pinjamkan')[0]);
    fireEvent.input(r.getByLabelText('Dipinjam siapa?'), { target: { value: 'Pak Yusuf' } });
    fireEvent.click(r.getByText('Catat peminjaman'));

    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ type: 'peminjaman', recipient: 'Pak Yusuf', qtyDelta: 0 });
  });

  it('refuses a loan with no borrower — that is the only thing it records', () => {
    // A loan with no name answers none of the questions a loan is recorded to answer, and
    // chasing happens over WhatsApp (§60).
    seed(knives());
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getAllByText('Pinjamkan')[0]);
    fireEvent.click(r.getByText('Catat peminjaman'));
    expect(stored()).toHaveLength(0);
  });
});

describe('closing the loan', () => {
  /* Scoped to the panel: "Hilang" is also the heading of a section on the screen behind it,
     and the whole point of this sheet is to be able to reach that state deliberately. */
  const openSheet = () => {
    seed(knives(), [lentOut('001')]);
    at('#/aset');
    const r = render(App);
    fireEvent.click(within(r.container.querySelector('table')!).getByText('Selesaikan'));
    return { r, sheet: within(r.container.querySelector('[role="dialog"]')!) };
  };

  it('can mark it LOST — the thing that was asked for and did not exist', () => {
    const { sheet } = openSheet();
    fireEvent.click(sheet.getByText('Hilang'));
    fireEvent.input(sheet.getByLabelText('Keterangan'), { target: { value: 'Terakhir dipakai saat Qurban' } });
    fireEvent.click(sheet.getByText('Simpan'));

    expect(stored()[1]).toMatchObject({
      type: 'pengembalian', condition: 'hilang', note: 'Terakhir dipakai saat Qurban',
    });
  });

  it('leaves the active asset base once it is lost', () => {
    // Part IV: hilang is a write-off and leaves the count entirely, unlike rusak which is
    // still ours and costs a repair.
    const { r, sheet } = openSheet();
    fireEvent.click(sheet.getByText('Hilang'));
    fireEvent.click(sheet.getByText('Simpan'));
    expect(r.getByText(/1 aset hilang/)).toBeTruthy();
  });

  it('can bring it back broken instead, which is a different outcome entirely', () => {
    const { sheet } = openSheet();
    fireEvent.click(sheet.getByText('Kembali, tapi rusak'));
    fireEvent.click(sheet.getByText('Simpan'));
    expect(stored()[1]).toMatchObject({ type: 'pengembalian', condition: 'rusak' });
  });

  it('defaults to a plain return, which is what usually happens', () => {
    const { sheet } = openSheet();
    fireEvent.click(sheet.getByText('Simpan'));
    expect(stored()[1]).toMatchObject({ type: 'pengembalian', condition: 'normal' });
  });
});
