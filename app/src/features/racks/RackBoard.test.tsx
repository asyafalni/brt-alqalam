import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { RackBoard } from './RackBoard';
import { useDraft } from '../../state/useDraft';
import { useInventory } from '../../state/useInventory';
import { createEntry, createItem, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { DAY_MS } from '../../../../domain/cycleCount';
import type { Item, Location, StockLine } from '../../../../domain/types';

// Octane uses NATIVE events — `change` fires on blur, so typing is `input`.
const type = (el: HTMLElement, value: string) => fireEvent.input(el, { target: { value } });

// The wall clock, because that is what a saved count is stamped with; the board's `now` is
// pinned once per mount (App.tsx), so the harness pins it the same way.
const NOW = Date.now();

// The draft is owned above the screen (App), so the test supplies it the same way.
function Harness() {
  const draft = useDraft();
  return (
    <RackBoard
      draft={draft}
      inventory={useInventory(draft, NOW)}
      search=""
      now={NOW}
      onOpenItem={() => {}}
    />
  );
}

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: null, ...p,
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

const B3 = createLocation('B3', 'Gudang Utama', 'Rak sabun', []);
const B4 = createLocation('B4', 'Gudang Utama', '', [B3]);

function seed(items: Item[], locations: Location[]) {
  localStorage.setItem('brt.stocktake.draft.v5',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, stock: lines, txns: [] }));
}

const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v5')!);

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('RackBoard — a map of the room', () => {
  it('with no racks yet, it says how to make one instead of drawing an empty grid', () => {
    seed(catalog(input()), []);
    const r = render(Harness);

    expect(r.getByText(/Belum ada rak/)).toBeTruthy();
    expect(r.getByText(/Satu QR per rak/)).toBeTruthy();
    expect(r.queryByText('Rak terdaftar')).toBeNull();
  });

  it('groups racks under their zone, and tells you how much of that zone needs a walk', () => {
    seed(catalog(
      input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' }),
      input({ name: 'Kanebo', initialStock: 3, minStock: 5, locationId: 'LOC-B4' }),
    ), [B3, B4]);
    const r = render(Harness);

    expect(r.getByRole('heading', { name: 'Gudang Utama' })).toBeTruthy();
    expect(r.getByText('2 rak · 1 perlu diurus · 13 unit')).toBeTruthy();
    expect(r.getByLabelText(/^Rak B3, 1 barang, Aman/)).toBeTruthy();
    expect(r.getByLabelText(/^Rak B4, 1 barang, Ada yang menipis/)).toBeTruthy();
  });

  it('a rack wears the worst status on it — one empty box is what earns the walk', () => {
    seed(catalog(
      input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' }),
      input({ name: 'Kanebo', initialStock: 0, locationId: 'LOC-B3' }),
    ), [B3]);
    const r = render(Harness);

    expect(r.getByLabelText(/^Rak B3, 2 barang, Ada yang habis/)).toBeTruthy();
  });

  it('tapping a rack opens what is on it, and tapping it again closes it', () => {
    seed(catalog(input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' })), [B3]);
    const r = render(Harness);
    const cell = () => r.getByLabelText(/^Rak B3, 1 barang, Aman/);

    fireEvent.click(cell());
    expect(cell().getAttribute('aria-pressed')).toBe('true');
    expect(r.getByText('Sabun')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();

    fireEvent.click(cell());
    expect(cell().getAttribute('aria-pressed')).toBe('false');
    expect(r.queryByText('Sabun')).toBeNull();
  });

  it('marks the racks nobody has counted on the map, and the badge opens the count', () => {
    seed(
      catalog(
        input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' }),
        input({ name: 'Kanebo', initialStock: 4, locationId: 'LOC-B4' }),
      ),
      // B4 was counted yesterday — an uncounted rack is unknown, a fresh one is not.
      [B3, { ...B4, lastCountedTs: NOW - DAY_MS }],
    );
    const r = render(Harness);

    // No separate list: it was a second copy of the map, printed as text, above the map.
    expect(r.queryByRole('heading', { name: 'Perlu dicek' })).toBeNull();

    expect(r.getByLabelText(/^Rak B3, 1 barang, Aman, belum pernah dicek/)).toBeTruthy();
    // Every rack carries the badge; the colour is what says which ones are still owed a walk.
    expect(r.getByLabelText('Cek Rak B4 — dicek 1 hari lalu')).toBeTruthy();

    fireEvent.click(r.getByLabelText(/^Cek Rak B3/));
    expect(r.getByRole('dialog', { name: 'Rak B3' })).toBeTruthy();
    expect(r.getByLabelText('Hitungan fisik Sabun')).toBeTruthy();
  });

  it('a saved count fixes the number and marks the rack as checked', () => {
    seed(catalog(input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' })), [B3]);
    const r = render(Harness);

    fireEvent.click(r.getByLabelText(/^Rak B3, 1 barang, Aman/));
    expect(r.getByText(/belum pernah dicek/)).toBeTruthy();

    fireEvent.click(r.getByText('Cek rak'));
    type(r.getByLabelText('Hitungan fisik Sabun'), '7');
    fireEvent.click(r.getByText('Simpan hasil hitung'));

    // The panel stayed open on the rack it was counting, rather than dumping you back at the map.
    expect(r.getByRole('dialog', { name: 'Rak B3' })).toBeTruthy();
    expect(r.getByText('7')).toBeTruthy();              // and now reports what was found
    // Written to THIS RACK's line, not to the item — the whole reason quantity moved off it.
    expect(stored().stock.find((l: { locationId: string }) => l.locationId === B3.locationId).initialStock)
      .toBe(7);
    // The rack is no longer unknown — that is what takes it off the rotation.
    expect(r.queryByText(/belum pernah dicek/)).toBeNull();
    expect(typeof stored().locations[0].lastCountedTs).toBe('number');
    // A count saved mid-session is stamped with the wall clock while freshness renders from
    // the mount-pinned `now`, so its age is negative. `countState` clamps at 0, because a
    // count cannot have happened in the future — it happened today.
    expect(r.getByText(/dicek hari ini/)).toBeTruthy();
  });
});

// --- Rack CRUD ------------------------------------------------------------------------------
//
// Before this existed, a rack could only be created — inline, inside the item form — and never
// renamed, moved or retired. That mattered more than an ordinary missing screen, because a rack
// code is printed onto a sticker: a typo was permanent, and the label and the app disagreed
// forever.

describe('RackBoard — mengelola rak', () => {
  const openRack = (r: ReturnType<typeof render>, code: string) =>
    fireEvent.click(r.getByRole('button', { name: new RegExp(`^Rak ${code}`) }));

  it('creates a rack from the map, where somebody looking at racks already is', () => {
    seed([], []);
    const r = render(Harness);

    fireEvent.click(r.getAllByText('Rak baru')[0]);
    type(r.getByLabelText('Kode rak'), 'C7');
    type(r.getByLabelText('Zona'), 'Gudang PHBI');
    fireEvent.click(r.getByText('Simpan'));

    const saved = stored().locations;
    expect(saved).toHaveLength(1);
    expect(saved[0].code).toBe('C7');
    expect(saved[0].zone).toBe('Gudang PHBI');
  });

  it('corrects a typo without changing the id the printed QR encodes', () => {
    seed([], [B3]);
    const r = render(Harness);

    openRack(r, 'B3');
    fireEvent.click(r.getByLabelText('Ubah rak B3'));
    type(r.getByLabelText('Kode rak'), 'B-3');
    fireEvent.click(r.getByText('Simpan'));

    const [saved] = stored().locations;
    expect(saved.code).toBe('B-3');
    // The load-bearing assertion of this whole feature.
    expect(saved.locationId).toBe(B3.locationId);
  });

  it('refuses to retire a rack that still holds things, and names them', () => {
    seed(catalog(input({ name: 'Sabun', locationId: B3.locationId })), [B3]);
    const r = render(Harness);

    openRack(r, 'B3');
    fireEvent.click(r.getByText(/Arsipkan atau hapus rak ini/));

    expect(r.getByText(/Masih ada 1 barang di sini \(Sabun\)/)).toBeTruthy();
    expect(r.queryByText('Arsipkan')).toBeNull();
  });

  it('archives an empty rack, and keeps a way back', () => {
    seed([], [B3]);
    const r = render(Harness);

    openRack(r, 'B3');
    fireEvent.click(r.getByText(/Arsipkan atau hapus rak ini/));
    fireEvent.click(r.getByText('Arsipkan'));

    expect(stored().locations[0].active).toBe(false);
    // Off the map, but not gone — archiving must never be a one-way door.
    expect(r.queryByRole('button', { name: /^Rak B3/ })).toBeNull();

    fireEvent.click(r.getByText('Rak diarsipkan'));
    fireEvent.click(r.getByText(/Aktifkan lagi/));
    expect(stored().locations[0].active).toBe(true);
  });

  it('offers a permanent delete only for a rack that never became real', () => {
    seed([], [B3]);
    const r = render(Harness);

    openRack(r, 'B3');
    fireEvent.click(r.getByText(/Arsipkan atau hapus rak ini/));
    fireEvent.click(r.getByText(/Hapus permanen/));
    expect(stored().locations).toEqual([]);
  });

  it('will not permanently delete a rack that has ever been counted', () => {
    // Deleting it would rewrite a walk somebody actually did; archiving keeps that honest.
    seed([], [{ ...B3, lastCountedTs: NOW - DAY_MS }]);
    const r = render(Harness);

    openRack(r, 'B3');
    fireEvent.click(r.getByText(/Arsipkan atau hapus rak ini/));

    expect(r.getByText('Arsipkan')).toBeTruthy();
    expect(r.queryByText(/Hapus permanen/)).toBeNull();
    expect(r.getByText(/pernah dicek/)).toBeTruthy();
  });
});

describe('a rack knows when it was last counted', () => {
  it('marks a rack counted inside the rotation, and says when', () => {
    // The point of a rotation is knowing which shelves are already done, so nobody re-counts
    // a rack somebody walked last week.
    seed([], [{ ...B3, lastCountedTs: NOW - 3 * DAY_MS }]);
    const r = render(Harness);

    expect(r.getByLabelText(/^Rak B3.*dicek 3 hari lalu/)).toBeTruthy();
    // The badge stays a button. "Done" must not mean "you can no longer count this" — finding
    // a mistake is exactly when somebody wants to count it again.
    expect(r.getByLabelText('Cek Rak B3 — dicek 3 hari lalu')).toBeTruthy();
  });

  it('still offers the shortcut once it falls out of the rotation', () => {
    seed([], [{ ...B3, lastCountedTs: NOW - 45 * DAY_MS }]);
    const r = render(Harness);
    expect(r.getByLabelText(/^Cek Rak B3 — dicek 45 hari lalu/)).toBeTruthy();
  });
});

// --- Zones ----------------------------------------------------------------------------------
//
// A zone is a label its racks carry, not an entity with its own row. That keeps it free to
// maintain, at the cost that nothing keeps two spellings apart — which is what the picker and
// the rename are for.

describe('managing a zone', () => {
  const A1 = createLocation('A1', 'Gudang Utama', '', []);
  const A2 = createLocation('A2', 'Gudang Utama', '', [A1]);
  const P1 = createLocation('P1', 'Gudang PHBI', '', [A1, A2]);

  it('renames a zone and carries every rack in it', () => {
    seed([], [A1, A2, P1]);
    const r = render(Harness);

    fireEvent.click(r.getByLabelText('Ubah zona Gudang Utama'));
    expect(r.getByText('2 rak akan ikut pindah.')).toBeTruthy();

    type(r.getByLabelText('Nama zona'), 'Gudang Barat');
    fireEvent.click(r.getByText('Simpan'));

    expect(stored().locations.map((l: { zone: string }) => l.zone))
      .toEqual(['Gudang Barat', 'Gudang Barat', 'Gudang PHBI']);
  });

  it('warns before merging two zones, because a section vanishes from the board', () => {
    seed([], [A1, A2, P1]);
    const r = render(Harness);

    fireEvent.click(r.getByLabelText('Ubah zona Gudang PHBI'));
    type(r.getByLabelText('Nama zona'), 'Gudang Utama');
    expect(r.getByText(/sudah ada — kedua zona akan digabung/)).toBeTruthy();
  });

  it('offers the zones already in use rather than a blank field', () => {
    // Typed free-hand, "Gudang Utama" and "gudang utama" become two zones and the board
    // quietly splits in half.
    seed([], [A1, P1]);
    const r = render(Harness);
    fireEvent.click(r.getAllByText('Rak baru')[0]);

    const zone = r.getByLabelText('Zona') as HTMLSelectElement;
    expect([...zone.options].map((o) => o.textContent))
      .toEqual(['Gudang Utama', 'Gudang PHBI', '+ Zona baru…']);
  });

  it('has no rename for the unplaced bucket — it is not a zone anybody named', () => {
    seed(catalog(input({ name: 'Sabun' })), [A1]);
    const r = render(Harness);
    expect(r.queryByLabelText(/^Ubah zona Belum ditempatkan/)).toBeNull();
  });
});
