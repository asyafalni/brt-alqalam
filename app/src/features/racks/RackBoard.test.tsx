import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { RackBoard } from './RackBoard';
import { useDraft } from '../../state/useDraft';
import { useInventory } from '../../state/useInventory';
import { createItem, createLocation } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { DAY_MS } from '../../../../domain/cycleCount';
import type { Item, Location } from '../../../../domain/types';

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

const catalog = (...inputs: DraftInput[]): Item[] =>
  inputs.reduce<Item[]>((acc, i) => [...acc, createItem(i, acc)], []);

const B3 = createLocation('B3', 'Gudang Utama', 'Rak sabun', []);
const B4 = createLocation('B4', 'Gudang Utama', '', [B3]);

function seed(items: Item[], locations: Location[]) {
  localStorage.setItem('brt.stocktake.draft.v4',
    JSON.stringify({ items, categories: SEED_CATEGORIES, locations, txns: [] }));
}

const stored = () => JSON.parse(localStorage.getItem('brt.stocktake.draft.v4')!);

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
    expect(r.getByLabelText('Rak B3, 1 barang, Aman')).toBeTruthy();
    expect(r.getByLabelText('Rak B4, 1 barang, Ada yang menipis')).toBeTruthy();
  });

  it('a rack wears the worst status on it — one empty box is what earns the walk', () => {
    seed(catalog(
      input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' }),
      input({ name: 'Kanebo', initialStock: 0, locationId: 'LOC-B3' }),
    ), [B3]);
    const r = render(Harness);

    expect(r.getByLabelText('Rak B3, 2 barang, Ada yang habis')).toBeTruthy();
  });

  it('tapping a rack opens what is on it, and tapping it again closes it', () => {
    seed(catalog(input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' })), [B3]);
    const r = render(Harness);
    const cell = () => r.getByLabelText('Rak B3, 1 barang, Aman');

    fireEvent.click(cell());
    expect(cell().getAttribute('aria-pressed')).toBe('true');
    expect(r.getByText('Sabun')).toBeTruthy();
    expect(r.getByText('Tersedia')).toBeTruthy();

    fireEvent.click(cell());
    expect(cell().getAttribute('aria-pressed')).toBe('false');
    expect(r.queryByText('Sabun')).toBeNull();
  });

  it('"Perlu dicek" lists the racks nobody has ever counted, and opens the count sheet', () => {
    seed(
      catalog(
        input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' }),
        input({ name: 'Kanebo', initialStock: 4, locationId: 'LOC-B4' }),
      ),
      // B4 was counted yesterday — an uncounted rack is unknown, a fresh one is not.
      [B3, { ...B4, lastCountedTs: NOW - DAY_MS }],
    );
    const r = render(Harness);

    const due = r.getByRole('heading', { name: 'Perlu dicek' }).closest('section')!;
    expect(within(due).getByText('B3')).toBeTruthy();
    expect(within(due).getByText('belum pernah')).toBeTruthy();
    expect(within(due).queryByText('B4')).toBeNull();

    fireEvent.click(within(due).getByText('B3'));
    expect(r.getByRole('heading', { name: 'Cek Rak B3' })).toBeTruthy();
    expect(r.getByLabelText('Hitungan fisik Sabun')).toBeTruthy();
  });

  it('a saved count fixes the number and marks the rack as checked', () => {
    seed(catalog(input({ name: 'Sabun', initialStock: 10, locationId: 'LOC-B3' })), [B3]);
    const r = render(Harness);

    fireEvent.click(r.getByLabelText('Rak B3, 1 barang, Aman'));
    expect(r.getByText(/belum pernah dicek/)).toBeTruthy();

    fireEvent.click(r.getByText('Cek rak'));
    type(r.getByLabelText('Hitungan fisik Sabun'), '7');
    fireEvent.click(r.getByText('Simpan hasil hitung'));

    expect(r.getByText('Tutup')).toBeTruthy();          // the panel stayed open on the rack
    expect(r.getByText('7')).toBeTruthy();              // and now reports what was found
    expect(stored().items[0].initialStock).toBe(7);
    // The rack is no longer unknown — that is what takes it off the rotation.
    expect(r.queryByText(/belum pernah dicek/)).toBeNull();
    expect(typeof stored().locations[0].lastCountedTs).toBe('number');
    // A count saved mid-session is stamped with the wall clock while freshness renders from
    // the mount-pinned `now`, so its age is negative. `countState` clamps at 0, because a
    // count cannot have happened in the future — it happened today.
    expect(r.getByText(/dicek hari ini/)).toBeTruthy();
  });
});
