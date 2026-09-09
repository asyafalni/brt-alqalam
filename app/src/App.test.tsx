import type { Item, StockLine } from '../../domain/types';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { App } from './App';
import { SEED_CATEGORIES } from './data/seedCategories';
import { createEntry, createItem } from './features/stocktake/draft';
import type { DraftInput } from './features/stocktake/draft';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
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
function seed(...inputs: DraftInput[]) {
  const items = buildCatalog(inputs);
  localStorage.setItem('brt.stocktake.draft.v6',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations: [], stock: lines, txns: [] }));
  return items;
}

const at = (hash: string) => { location.hash = hash; };

// Every list screen renders both shapes at once — a real table on a desk, stacked cards below
// `sm` (see components/DataTable) — and CSS picks one, so a row exists twice in the DOM.
// Scope to the desk table rather than relaxing the assertion.
const desk = (r: ReturnType<typeof render>) => within(r.container.querySelector('table')!);

beforeEach(() => { localStorage.clear(); at('#/opname'); });
afterEach(() => { cleanup(); at('#/opname'); });

describe('deep links — the whole point of a printed label', () => {
  it('a rack QR opens the item with its derived stock', () => {
    seed(input({ name: 'Sabun cuci', initialStock: 12 }));
    at('#/scan?i=ITM-0001');
    const r = render(App);

    expect(r.getByText('Sabun cuci')).toBeTruthy();
    expect(r.getByText('Kebersihan')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();
    expect(r.getByText('12')).toBeTruthy();
  });

  it('a unit QR opens that one physical unit, not the item', () => {
    seed(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }));
    at('#/scan?a=ALQ-ITM-0001-002');
    const r = render(App);

    expect(r.getByText('Pisau #2')).toBeTruthy();
    expect(r.getByText('ALQ-ITM-0001-002')).toBeTruthy();
  });

  it('says so when a label is not in this catalog, instead of failing silently', () => {
    seed(input());
    at('#/scan?i=ITM-9999');
    const r = render(App);

    expect(r.getByRole('alert')).toBeTruthy();
    expect(r.getByText('Label tidak dikenal')).toBeTruthy();
    expect(r.getByText('ITM-9999')).toBeTruthy();
  });

  it('distinguishes an empty catalog from an unknown label', () => {
    at('#/scan?i=ITM-0001');
    expect(render(App).getByText('Katalog masih kosong')).toBeTruthy();
  });

  it('a damaged QR that names nothing still reaches a screen that explains', () => {
    seed(input());
    at('#/scan');
    expect(render(App).getByText('Label tidak terbaca')).toBeTruthy();
  });

  it('returns home from a scan', () => {
    seed(input());
    at('#/scan?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByText('Kembali'));
    expect(location.hash).toBe('#/');   // the dashboard is the root
    expect(r.getByRole('heading', { name: 'Beranda' })).toBeTruthy();
  });
});

describe('navigation', () => {
  it('switches screens and reflects it in the URL, so back works', async () => {
    seed(input());
    const r = render(App);

    // Every destination exists twice — sidebar on desktop, bottom bar on mobile. The bottom
    // bar carries an aria-label, so querying by it targets exactly one of them.
    fireEvent.click(r.getByLabelText('Stok Sekarang'));
    expect(location.hash).toBe('#/board');
    expect(r.getByRole('heading', { name: 'Stok Sekarang' })).toBeTruthy();

    // Cetak Label is a desk job: it lives in the sidebar, not the mobile bottom bar, so it
    // has no aria-label to target — the sidebar's own text is unambiguous here.
    fireEvent.click(r.getByText('Cetak Label'));
    expect(location.hash).toBe('#/label');
    // The label screen is code-split — it carries the QR encoder, which nobody should
    // download to write down how much sabun is on a shelf. So it announces itself first.
    expect(r.getByRole('status').textContent).toContain('Menyiapkan label');
    expect(await r.findByText('Cetak Label QR')).toBeTruthy();
  });

  it('reaches the rack map, which is a screen only the new location model makes possible', () => {
    seed(input());
    const r = render(App);
    fireEvent.click(r.getByLabelText('Peta Rak'));
    expect(location.hash).toBe('#/racks');
    expect(r.getByRole('heading', { name: 'Peta Rak' })).toBeTruthy();
    expect(r.getByText(/Belum ada rak/)).toBeTruthy();
  });

  it('an unknown path lands on the dashboard rather than a dead end', () => {
    at('#/sesuatu');
    expect(render(App).getByRole('heading', { name: 'Beranda' })).toBeTruthy();
  });
});

describe('the board renders derived state, not stored numbers', () => {
  it('shows current stock with a status badge', () => {
    seed(input({ name: 'Sabun', initialStock: 12, minStock: 5 }));
    at('#/board');
    const r = render(App);
    expect(desk(r).getByText('Sabun')).toBeTruthy();
    expect(desk(r).getByText('Tersedia')).toBeTruthy();
  });

  it('marks a low item as Menipis in the stock list', () => {
    seed(
      input({ name: 'Sabun', initialStock: 12, minStock: 5 }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5 }),
    );
    at('#/board');
    const r = render(App);

    // The list renders twice — desk table and phone cards — so two is the honest count. The
    // low-stock ALERT is not here at all any more: Beranda owns it, and one list of a thing
    // beats two (features/board/Board.tsx).
    expect(r.getAllByText('Kanebo')).toHaveLength(2);
    expect(desk(r).getByText('Menipis')).toBeTruthy();
  });

  it('raises Notifikasi Stok on Beranda for anything at or below its minimum', () => {
    seed(
      input({ name: 'Sabun', initialStock: 12, minStock: 5 }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5 }),
    );
    at('#/');
    const r = render(App);

    expect(r.getByText('Perlu dibeli lagi')).toBeTruthy();
    expect(r.getByText('Notifikasi Stok')).toBeTruthy();   // his word for it, kept
    expect(r.getByText('Kanebo')).toBeTruthy();
    expect(r.queryByText('Sabun')).toBeNull();             // not low, so not on the list
  });

  it('an item with no minimum "(-)" never raises one, even at zero', () => {
    seed(input({ name: 'Kanebo', initialStock: 0, minStock: null }));
    at('#/');
    const r = render(App);

    // No minimum means no low-stock ALARM, which is not the same as no problem: an item at
    // zero is still reported as habis. The "(-)" only silences the reorder list.
    expect(r.queryByText('Perlu dibeli lagi')).toBeNull();
    expect(r.getByRole('button', { name: '1 habis' })).toBeTruthy();
  });

  it('is honest that there is no gateway yet', () => {
    seed(input());
    at('#/board');
    expect(render(App).getByText('Belum terhubung ke gateway.')).toBeTruthy();
  });
});

describe('two boxes, two jobs', () => {
  const type = (el: HTMLElement, value: string) =>
    fireEvent.input(el, { target: { value } });

  /*
   * The navbar box used to defer to five screens that filtered themselves, so one control did
   * five different things depending on where you stood — and none of them matched its label.
   * On Stok it matched a name and a unit, so a rack code found nothing. It also LEAKED: a query
   * typed on Opname silently narrowed Stok when you got there, from a field up in the chrome.
   *
   * It is a finder now, everywhere and without exception. The lists keep their filter as their
   * own field, on the screen, where its scope is visible.
   */
  it('finds from the navbar even on a screen that has its own filter', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/board');
    const r = render(App);

    type(r.getByLabelText('Cari barang atau rak'), 'pisau');
    expect(r.getByText(/Hasil untuk/)).toBeTruthy();
  });

  it('narrows the list in place from the screen\'s OWN field', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/board');
    const r = render(App);

    type(r.getByLabelText('Saring daftar stok'), 'pisau');
    expect(desk(r).getByText('Pisau dapur')).toBeTruthy();
    expect(r.queryByText('Sabun cuci')).toBeNull();
    // Still the stock table — filtering never navigates.
    expect(r.queryByText(/Hasil untuk/)).toBeNull();
  });

  it('keeps a screen filter OUT of the navbar box, so it cannot travel', () => {
    // The leak was structural: one piece of state behind two meanings. Filtering Opname wrote
    // into the navbar field, and the query then narrowed Stok and Histori on arrival.
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/opname');
    const r = render(App);

    type(r.getByLabelText('Saring daftar opname'), 'sabun');
    expect(r.queryByText('Pisau dapur')).toBeNull();
    expect((r.getByLabelText('Cari barang atau rak') as HTMLInputElement).value).toBe('');
  });

  /*
   * Beranda has no list to narrow, so the field used to do NOTHING there — and the owner read
   * that, correctly, as a broken search rather than as a screen where search does not apply.
   * A control on every screen has to mean something on every screen.
   */
  it('answers on Beranda, where there is no list to filter', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/beranda');
    const r = render(App);

    type(r.getByLabelText('Cari barang atau rak'), 'pisau');
    expect(r.getByText(/Hasil untuk/)).toBeTruthy();
    expect(r.getByText('Pisau dapur')).toBeTruthy();
  });

  it('drops the query when a result is opened', () => {
    seed(input({ name: 'Pisau dapur' }));
    at('#/beranda');
    const r = render(App);

    type(r.getByLabelText('Cari barang atau rak'), 'pisau');
    fireEvent.click(r.getByText('Pisau dapur'));

    // On the item now, not still looking at a result list with the query following behind.
    expect(r.queryByText(/Hasil untuk/)).toBeNull();
    expect((r.getByLabelText('Cari barang atau rak') as HTMLInputElement).value).toBe('');
  });

  it('gives the screen back when the field is cleared — nothing navigated', () => {
    seed(input({ name: 'Sabun cuci' }));
    at('#/laporan');
    const r = render(App);

    type(r.getByLabelText('Cari barang atau rak'), 'sabun');
    expect(r.getByText(/Hasil untuk/)).toBeTruthy();

    type(r.getByLabelText('Cari barang atau rak'), '');
    expect(r.queryByText(/Hasil untuk/)).toBeNull();
  });
});

describe('the rail on a desktop', () => {
  // SmartInv collapses its sidebar to give a wide table the screen; ours could too — the
  // component has always known how to draw at 90px — but the only control was `md:hidden`,
  // so on a desktop there was no way to ask for it.
  it('narrows and widens from the same control', () => {
    seed(input());
    const r = render(App);

    const rail = () => r.getByLabelText(/Ciutkan menu|Lebarkan menu/);
    expect(rail().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(rail());
    expect(rail().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(rail());
    expect(rail().getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers the choice — a rail you narrowed should still be narrow tomorrow', () => {
    seed(input());
    const r = render(App);
    fireEvent.click(r.getByLabelText('Ciutkan menu'));
    expect(localStorage.getItem('brt.sidebar.collapsed')).toBe('1');

    cleanup();
    expect(render(App).getByLabelText('Lebarkan menu')).toBeTruthy();
  });
});

describe('what happened to the record', () => {
  /*
   * The failure this closes: Simpan closed the sheet and then NOTHING happened on screen — for
   * a second or two on the gateway, longer on gudang wifi, and identically whether the record
   * reached the spreadsheet, was queued on the phone, or was refused. A write that went
   * nowhere must never look like one that landed.
   */
  it('confirms a movement, and says where it actually went', () => {
    seed(input({ name: 'Sabun cuci', initialStock: 12 }));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByText('Ambil'));
    fireEvent.click(r.getByText('Simpan'));

    const flash = within(r.container.querySelector('[role="status"]')!);
    // Names the quantity too, the same way the connected receipt does — one commit path now.
    expect(flash.getByText(/Tercatat: Sabun cuci -1/)).toBeTruthy();
    /* Unconnected, so this is the phone's own draft (§59 stage 1) — a legitimate mode whose one
       job is never to read like the shared register. */
    expect(flash.getByText(/HP ini saja/)).toBeTruthy();
  });
});

describe('editing a barang from where you were looking at it', () => {
  /*
   * "Ubah" on a barang's page used to navigate to a bare `#/opname` — so it dropped you on a
   * list of every item with nothing selected, and the thing you had just been reading to find
   * again. That broken bridge is most of why the two screens read as duplicates of each other:
   * Stok can edit nothing, and the one link out of it lost its subject.
   */
  it('opens the form on THAT item, not on the list', () => {
    seed(input({ name: 'Sabun cuci' }), input({ name: 'Pisau dapur' }));
    at('#/barang?i=ITM-0002');
    const r = render(App);

    fireEvent.click(r.getByText('Ubah'));

    expect(r.getByText('Ubah barang')).toBeTruthy();
    expect((r.getByLabelText('Nama barang') as HTMLInputElement).value).toBe('Pisau dapur');
  });

  it('drops the parameter, so a reload does not reopen it', () => {
    seed(input({ name: 'Sabun cuci' }));
    at('#/barang?i=ITM-0001');
    const r = render(App);

    fireEvent.click(r.getByText('Ubah'));
    expect(location.hash).toBe('#/opname');
  });
});
