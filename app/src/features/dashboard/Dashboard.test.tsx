import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from '../../App';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location, StockLine, Txn } from '../../../../domain/types';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
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

let n = 0;
// Ascending ts, deliberately: the reducer folds in time order, so a descending clock would
// apply the return before the loan and leave the asset merely "out".
const tx = (p: Partial<Txn>): Txn => {
  n += 1;
  return { txnId: `T${n}`, clientTxnId: `c${n}`, ts: n,
    type: 'peminjaman', qtyDelta: 0, actorUserId: 'u', ...p };
};

const RAK: Location = { locationId: 'LOC-A1', code: 'A1', name: '', zone: 'Gudang', order: 1,
  active: true, lastCountedTs: Date.now() };
/** Never counted, so it is due — an uncounted rack is unknown, not "probably fine". */
const UNCOUNTED: Location = {
  ...RAK, locationId: 'LOC-B2', code: 'B2', lastCountedTs: undefined,
};

function seed(items: Item[], txns: Txn[] = [], locations = [RAK]) {
  localStorage.setItem('brt.stocktake.draft.v6',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, stock: lines, txns }));
}
const at = (hash: string) => { location.hash = hash; };

/** A gudang of racks and nothing else — the shape the first walk starts from. */
function seedRacks(racks: { code: string; walked?: boolean }[]) {
  /* With an item, because Beranda replaces itself with "Belum ada barang" on an empty catalog
     — and a gudang with racks but nothing on them is not the state this is about. */
  const items = catalog(input({ name: 'Sabun' }));
  seed(items, [], racks.map((r, i) => ({
    locationId: `LOC-${r.code}`, code: r.code, name: '', zone: 'Gudang',
    order: i + 1, active: true, ...(r.walked ? { lastCountedTs: Date.now() } : {}),
  })));
}

beforeEach(() => { localStorage.clear(); at('#/'); });
afterEach(() => { cleanup(); at('#/'); });

/** A durable whose unit #1 comes back in the given condition. */
const damaged = (condition: 'rusak' | 'hilang') => {
  const items = catalog(input({ name: 'Pisau', kind: 'equipment', initialStock: 2, minStock: null }));
  const asset = `${items[0].barcode}-001`;
  return { items, txns: [
    tx({ type: 'peminjaman', assetId: asset, recipient: 'Pos 1' }),
    tx({ type: 'pengembalian', assetId: asset, condition }),
  ] };
};

describe('Beranda surfaces what needs a person', () => {
  it('says everything is fine only when it actually is', () => {
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    expect(render(App).getByText('Semua aman.')).toBeTruthy();
  });

  it('counts a broken asset as something to deal with — it was invisible from here before', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    const r = render(App);

    expect(r.queryByText('Semua aman.')).toBeNull();
    expect(r.getByRole('button', { name: '1 rusak' })).toBeTruthy();
  });

  it('counts a lost asset too, and keeps it distinct from a broken one', () => {
    const { items, txns } = damaged('hilang');
    seed(items, txns);
    const r = render(App);

    expect(r.getByRole('button', { name: '1 hilang' })).toBeTruthy();
    expect(r.queryByRole('button', { name: '1 rusak' })).toBeNull();
  });

  it('a chip goes straight to the screen that fixes it', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    const r = render(App);

    const chips = r.getByRole('group', { name: 'Perlu diurus' });
    fireEvent.click(within(chips).getByRole('button', { name: '1 rusak' }));
    expect(location.hash).toBe('#/aset');
    expect(r.getByRole('heading', { name: 'Aset' })).toBeTruthy();
  });

  it('summarises borrowed, broken and lost together on the Aset card', () => {
    const { items, txns } = damaged('rusak');
    seed(items, txns);
    expect(render(App).getByText(/0 dipinjam · 1 rusak · 0 hilang/)).toBeTruthy();
  });

  it('calls out stock folded below zero — the loudest thing a register can say', () => {
    // More recorded leaving than ever arrived. Not "we ran out": the books contradict
    // themselves, and only a physical recount settles it.
    const items = catalog(input({ name: 'Sabun', initialStock: 2, minStock: 1, locationId: 'LOC-A1' }));
    seed(items, [tx({ type: 'pemakaian', itemId: items[0].itemId, qtyDelta: -5 })]);
    const r = render(App);

    const chips = r.getByRole('group', { name: 'Perlu diurus' });
    expect(within(chips).getByRole('button', { name: '1 stok minus' })).toBeTruthy();
    expect(r.getByText('1 barang tercatat minus.')).toBeTruthy();
    expect(r.getByText(/Hitung ulang raknya/)).toBeTruthy();
  });

  it('says nothing about minus stock when the books add up', () => {
    const items = catalog(input({ name: 'Sabun', initialStock: 10, minStock: 1, locationId: 'LOC-A1' }));
    seed(items, [tx({ type: 'pemakaian', itemId: items[0].itemId, qtyDelta: -3 })]);
    const r = render(App);
    expect(r.queryByText(/tercatat minus/)).toBeNull();
  });

  it('does not paint a zero as a warning — that teaches people to ignore the colour', () => {
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    const r = render(App);

    const habis = r.getByText('Habis').closest('div')!.parentElement!;
    expect(habis.querySelector('[class*="bg-red"]')).toBeNull();
    expect(habis.querySelector('[class*="bg-slate-100"]')).toBeTruthy();
  });

  it('shows no chip row at all when there is nothing to act on', () => {
    // Everything placed, stocked and monitored, and the rack checked today — so there is
    // genuinely nothing to tap. A row of zeroes would train people to ignore the whole area.
    seed(catalog(input({ initialStock: 20, minStock: 5, locationId: 'LOC-A1' })));
    const r = render(App);

    expect(r.getByText('Semua aman.')).toBeTruthy();
    // The Aksi cards below are buttons too and legitimately still describe the same figures
    // ("1 rak · 0 perlu didatangi"), so the assertion names the chip GROUP, not the words.
    expect(r.queryByRole('group', { name: 'Perlu diurus' })).toBeNull();
    expect(r.getByText('Semua barang sudah punya rak.')).toBeTruthy();
  });
});

describe('the two errands, side by side', () => {
  // Beranda hands somebody two different jobs: go and buy, and go and count. They are
  // different verbs in different places, so they sit beside each other rather than stacked —
  // where the second would be below the fold on a phone and read by nobody.
  it('lists the racks due for a count, and says which have never been counted', () => {
    seed(
      catalog(input({ name: 'Sabun', initialStock: 20, minStock: 5, locationId: UNCOUNTED.locationId })),
      [],
      [UNCOUNTED],
    );
    const r = render(App);

    expect(r.getByRole('heading', { name: 'Rak perlu dicek' })).toBeTruthy();
    expect(r.getByText('belum pernah')).toBeTruthy();
  });

  it('a rack counted recently is not on the list', () => {
    seed(catalog(input({ name: 'Sabun', initialStock: 20, minStock: 5, locationId: RAK.locationId })));
    expect(render(App).queryByRole('heading', { name: 'Rak perlu dicek' })).toBeNull();
  });

  it('a due rack opens straight onto its own panel', () => {
    seed(
      catalog(input({ name: 'Sabun', initialStock: 20, minStock: 5, locationId: UNCOUNTED.locationId })),
      [],
      [UNCOUNTED],
    );
    const r = render(App);
    fireEvent.click(r.getByLabelText(`Buka Rak ${UNCOUNTED.code}`));
    expect(r.getByRole('dialog', { name: `Rak ${UNCOUNTED.code}` })).toBeTruthy();
  });
});

describe('the stock-take has a finish line', () => {
  /*
   * Opname counted itself in "Barang dicatat", "Kategori", "Unit dihitung" — numbers that only
   * ever go up, past no target — so the one job in this app that genuinely ends looked endless.
   * The missing fact is how much of the gudang has EVER been walked, which is a different
   * question from what is due for a recount.
   *
   * It lives on the heading of the list it describes, not in a card of its own. It first
   * shipped as a panel on Opname and was, correctly, two cards saying one thing (§82).
   */
  it('says how far along the first walk is, out of how many', () => {
    seedRacks([{ code: 'A1', walked: true }, { code: 'A2' }, { code: 'A3' }]);
    const r = render(App);
    expect(r.getByLabelText('33 persen rak sudah pernah didata')).toBeTruthy();
    expect(r.getByText(/dari 3 rak/)).toBeTruthy();
  });

  it('stops showing it once every rack has been walked', () => {
    // A permanent "1 dari 1" is a number nobody needs twice; from then on the only question
    // this list answers is the rotation.
    seedRacks([{ code: 'A1', walked: true }]);
    const r = render(App);
    expect(r.queryByText(/Sudah pernah didata/)).toBeNull();
  });
});
