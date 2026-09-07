import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { AssetBoard } from './AssetBoard';
import { useDraft } from '../../state/useDraft';
import { useInventory } from '../../state/useInventory';
import { createEntry, createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import type { Item, StockLine, Txn } from '../../../../domain/types';

// The board's `now` is pinned once per mount (App.tsx), so the harness pins it the same way.
const NOW = Date.now();

const opened = vi.fn();

// The draft is owned above the screen (App), so the test supplies it the same way.
function Harness() {
  const draft = useDraft();
  return (
    <AssetBoard
      draft={draft}
      inventory={useInventory(draft, NOW)}
      search=""
      onOpenItem={opened}
    />
  );
}

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Pisau potong', categoryId: 'CAT-PHBI', unit: 'buah',
  kind: 'equipment', initialStock: 3, minStock: null, ...p,
});


/**
 * Builds the items AND their stock lines, because quantity and placement live on lines now.
 * `lines` is what `seed()` stores, so a fixture that still says `initialStock: 3` produces a
 * shelf with three of the thing on it.
 */
let lines: StockLine[] = [];
const buildCatalog = (inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, x) => {
    const built = createEntry(x, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};
const catalog = (...inputs: DraftInput[]): Item[] => buildCatalog(inputs);

// Events are what put an asset in a state — nothing stores "rusak", it is folded from the log.
let seq = 0;
const txn = (assetId: string, p: Partial<Txn> & Pick<Txn, 'type'>): Txn => {
  seq += 1;
  return {
    txnId: `TXN-${seq}`, clientTxnId: `C-${seq}`, ts: NOW - 10_000 + seq,
    assetId, qtyDelta: 0, actorUserId: 'USR-ADMIN', ...p,
  };
};

function seed(items: Item[], txns: Txn[] = []) {
  localStorage.setItem('brt.stocktake.draft.v5',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations: [], stock: lines, txns }));
}

// Three knives and two scales, each unit labelled: ALQ-ITM-0001-001 … ALQ-ITM-0002-002.
const ITEMS = () => catalog(
  input({ name: 'Pisau potong', initialStock: 3 }),
  input({ name: 'Timbangan gantung', initialStock: 2 }),
);

// One of each outcome, so the three groups can be told apart.
const HISTORY: Txn[] = [
  txn('ALQ-ITM-0001-001', { type: 'peminjaman', recipient: 'Pak Budi' }),

  txn('ALQ-ITM-0001-002', { type: 'peminjaman', recipient: 'Pak Rahmat' }),
  txn('ALQ-ITM-0001-002', { type: 'pengembalian', condition: 'rusak', note: 'Gagang patah saat qurban' }),

  txn('ALQ-ITM-0002-001', { type: 'peminjaman', recipient: 'Panitia Qurban' }),
  txn('ALQ-ITM-0002-001', { type: 'pengembalian', condition: 'hilang', note: 'Tidak kembali setelah acara' }),
];

const section = (r: { getByRole: (role: string, o: { name: string }) => HTMLElement }, title: string) =>
  r.getByRole('heading', { name: title }).closest('section')!;

// Both shapes are in the DOM at once (DataTable renders a table and a card list, and CSS
// picks), so a query has to say which one it means.
const desk = (r: Parameters<typeof section>[0], title: string) =>
  within(section(r, title).querySelector('table')!);

const phone = (r: Parameters<typeof section>[0], title: string) =>
  within(section(r, title).querySelector('ul')!);

beforeEach(() => { localStorage.clear(); opened.mockClear(); });
afterEach(() => cleanup());

describe('Aset — three questions, three answers', () => {
  it('keeps the groups apart: each section lists only its own assets', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    expect(desk(r, 'Sedang dipinjam').getByText('Pisau potong #1')).toBeTruthy();
    expect(desk(r, 'Sedang dipinjam').queryByText('Pisau potong #2')).toBeNull();

    expect(desk(r, 'Perlu diperbaiki').getByText('Pisau potong #2')).toBeTruthy();
    expect(desk(r, 'Perlu diperbaiki').queryByText('Pisau potong #1')).toBeNull();

    expect(desk(r, 'Hilang').getByText('Timbangan gantung #1')).toBeTruthy();
    expect(desk(r, 'Hilang').queryByText('Pisau potong #2')).toBeNull();

    // An untouched unit is in none of them — it is on the shelf.
    expect(r.queryByText('Pisau potong #3')).toBeNull();
  });

  it('raises the replacement banner for a lost asset, and stops counting it as ours', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    const banner = r.getByRole('alert');
    expect(within(banner).getByText(/1 aset hilang/)).toBeTruthy();
    expect(within(banner).getByText(/dibeli ulang/)).toBeTruthy();

    // Five units exist; the lost one has left the active base for good.
    const owned = r.getByText('Masih dimiliki').closest('div')!;
    expect(within(owned).getByText('4')).toBeTruthy();
    expect(within(owned).queryByText('5')).toBeNull();
  });

  it('answers "siapa yang pegang" — a borrowed asset names its holder', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    expect(desk(r, 'Sedang dipinjam').getByText('Pak Budi')).toBeTruthy();
    expect(desk(r, 'Sedang dipinjam').getByText('Dipegang')).toBeTruthy();
    // The phone card carries the same answer, labelled — there is no header row to explain it.
    expect(phone(r, 'Sedang dipinjam').getByText('Pak Budi')).toBeTruthy();
  });

  it('a broken asset carries the note that says why, so the repair queue is actionable', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    expect(desk(r, 'Perlu diperbaiki').getByText('Gagang patah saat qurban')).toBeTruthy();
    expect(desk(r, 'Perlu diperbaiki').getByText('Rusak')).toBeTruthy();
  });

  it('a lost asset keeps both the note and who had it last — that is the accountability record', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    expect(desk(r, 'Hilang').getByText('Panitia Qurban')).toBeTruthy();
    expect(desk(r, 'Hilang').getByText('Tidak kembali setelah acara')).toBeTruthy();
    expect(desk(r, 'Hilang').getByText('Terakhir dipegang')).toBeTruthy();
  });

  it('says plainly that a group is empty instead of leaving a blank card', () => {
    seed(ITEMS());                       // labelled units, nothing has happened to them
    const r = render(Harness);

    expect(within(section(r, 'Sedang dipinjam')).getByText('Tidak ada yang sedang dipinjam.')).toBeTruthy();
    expect(within(section(r, 'Perlu diperbaiki')).getByText('Tidak ada yang rusak.')).toBeTruthy();
    expect(within(section(r, 'Hilang')).getByText('Tidak ada yang hilang.')).toBeTruthy();

    // Nothing lost means no banner to follow up.
    expect(r.queryByRole('alert')).toBeNull();
    expect(section(r, 'Hilang').querySelector('table')).toBeNull();
  });

  it('opens the item behind a row, from either shape', () => {
    seed(ITEMS(), HISTORY);
    const r = render(Harness);

    fireEvent.click(desk(r, 'Sedang dipinjam').getByLabelText('Buka Pisau potong #1'));
    expect(opened).toHaveBeenCalledWith('ITM-0001');

    fireEvent.click(phone(r, 'Hilang').getByLabelText('Buka Timbangan gantung #1'));
    expect(opened).toHaveBeenLastCalledWith('ITM-0002');
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('with nothing labelled at all, it explains how a unit gets a label', () => {
    seed(catalog(input({ name: 'Sabun', kind: 'consumable', unit: 'galon', initialStock: 10 })));
    const r = render(Harness);

    expect(r.getByText('Belum ada barang berlabel.')).toBeTruthy();
    expect(r.getByText(/Label satu-satu/)).toBeTruthy();
    expect(r.queryByRole('heading', { name: 'Sedang dipinjam' })).toBeNull();
  });
});
