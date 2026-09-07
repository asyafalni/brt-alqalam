import { describe, it, expect, afterEach, vi } from 'vitest';
import { useState } from 'octane';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { Board } from './Board';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createEntry, createLocation, instancesFor } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item, Location, StockLine } from '../../../../domain/types';
import type { BoardFilter, BoardKind, BoardSort } from '../../state/route';
import { deriveState } from '../../../../domain/deriveState';
import { deriveNotifications } from '../../../../domain/notifications';

const NOW = Date.parse('2026-09-07T00:00:00Z');

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
});

const A1 = createLocation('A1', 'Gudang Utama', '', []);

/**
 * Builds the items AND their stock lines, because quantity lives on lines now. `lines` is read
 * by the harness right after, so a fixture that says `initialStock: 3` still produces a row
 * with three of the thing on it.
 */
let lines: StockLine[] = [];
const catalog = (...inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, x) => {
    const built = createEntry(x, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};

function board(
  items: Item[],
  search = '',
  onOpenItem: (id: string) => void = () => {},
  locations: Location[] = [A1],
  stock: StockLine[] = lines,
  onOpenRack: (id: string) => void = () => {},
  start: { filter?: BoardFilter; category?: string; kind?: BoardKind; sort?: BoardSort } = {},
) {
  const H = () => {
    /* The real screen keeps this in the URL. Holding it in state here means a chip click
       actually filters the list, so the tests exercise the behaviour rather than the callback. */
    const [view, setView] = useState(start);
    const instances = items.flatMap(
      (i) => instancesFor(i, NOW, stock.filter((l) => l.itemId === i.itemId)
        .reduce((n, l) => n + l.initialStock, 0)),
    );
    return (
      <Board
        items={items}
        categories={SEED_CATEGORIES}
        locations={locations}
        search={search}
        onOpenItem={onOpenItem}
        onOpenRack={onOpenRack}
        filter={view.filter}
        category={view.category}
        kind={view.kind}
        sort={view.sort}
        onView={(next) => setView((prev) => ({ ...prev, ...next }))}
        inventory={{
          instances,
          txns: [],
          derived: deriveState(items, instances, [], NOW, stock),
          notifications: deriveNotifications(items, [], NOW, stock),
          offline: true,
        }}
      />
    );
  };
  return render(H);
}

// One list, two shapes (components/DataTable): a real table on a desk, stacked cards below
// `sm`. Both live in the DOM and CSS picks one, so every row query names the shape it means.
type R = ReturnType<typeof render>;
const desk = (r: R) => within(r.container.querySelector('table')!);
const phone = (r: R) => within(r.container.querySelector('ul[class~="sm:hidden"]')!);

afterEach(() => cleanup());

describe('Stok Sekarang — the list a phone can actually read', () => {
  it('carries the stock number onto the phone card, which is what used to be clipped off', () => {
    const r = board(catalog(input({ name: 'Sabun cuci', initialStock: 12, unit: 'galon' })));

    // The whole point of the screen: how much is left, without scrolling sideways.
    expect(phone(r).getByText('12')).toBeTruthy();
    expect(phone(r).getByText('galon')).toBeTruthy();
    expect(phone(r).getByText('Tersedia')).toBeTruthy();
    expect(phone(r).getByText('Sabun cuci')).toBeTruthy();
  });

  it('keeps the full set of columns on a desk', () => {
    const table = board(catalog(input())).container.querySelector('table')!;
    for (const header of ['Barang', 'Kategori', 'Cara catat', 'Status', 'Stok']) {
      expect(within(table).getByText(header)).toBeTruthy();
    }
  });

  it('drops the label-plan column on a phone, where it answers nobody standing at a rack', () => {
    const r = board(catalog(input({ kind: 'equipment', initialStock: 2, minStock: null })));
    expect(desk(r).getByText('label satu-satu')).toBeTruthy();
    expect(phone(r).queryByText('label satu-satu')).toBeNull();
    expect(phone(r).queryByText('Cara catat')).toBeNull();
  });

  it('opens the item from either shape', () => {
    const onOpenItem = vi.fn();
    const r = board(catalog(input({ name: 'Pisau' })), '', onOpenItem);

    fireEvent.click(desk(r).getByLabelText('Buka Pisau'));
    fireEvent.click(phone(r).getByLabelText('Buka Pisau'));
    expect(onOpenItem.mock.calls).toEqual([['ITM-0001'], ['ITM-0001']]);
  });
});

describe('what the board says when there is nothing to show', () => {
  it('an empty catalog points at the screen that fills it, rather than just going blank', () => {
    const r = board([]);
    expect(r.getByText('Belum ada barang')).toBeTruthy();
    expect(r.getByText(/Opname Gudang/)).toBeTruthy();
    expect(r.container.querySelector('table')).toBeNull();
  });

  it('a search that matches nothing says so, and names what was searched for', () => {
    const r = board(catalog(input({ name: 'Sabun cuci' })), 'zzz');
    expect(r.getByText(/Tidak ada yang cocok dengan "zzz"/)).toBeTruthy();
    expect(r.getByText(/0 baris/)).toBeTruthy();
    expect(r.container.querySelector('table')).toBeNull();
  });
});

describe('the low-stock list is not duplicated here', () => {
  // It used to be: the same derived list, on this screen and on Beranda. Two lists of one
  // thing mostly raise the question of which is current. Beranda keeps it; this screen keeps
  // the stock itself, and says in its tile how many rows need attention.
  it('marks a low row without repeating Beranda\'s alert list', () => {
    const low = board(catalog(input({ name: 'Kanebo', initialStock: 3, minStock: 5 })));
    expect(low.queryByText('Notifikasi Stok')).toBeNull();
    expect(low.queryByText('Semua stok aman.')).toBeNull();
    expect(desk(low).getByText('Menipis')).toBeTruthy();
    expect(low.getByText('Perlu perhatian')).toBeTruthy();
  });
});

describe('where a thing is', () => {
  // "We own 12 galon sabun" does not help anybody who cannot find them; "Rak A1" does. It was
  // one tap away on the item screen, which is one tap too many while standing in the gudang.
  it('names the rack on the row itself', () => {
    const items = catalog(input({ name: 'Sabun', locationId: A1.locationId }));
    const r = board(items, '', () => {}, [A1]);
    expect(desk(r).getByText('A1')).toBeTruthy();
  });

  it('names EVERY rack a thing is kept on, not just the first', () => {
    // Naming one would send somebody to whichever shelf happens to be the empty one.
    const items = catalog(input({ name: 'Sabun', locationId: A1.locationId }));
    const B2 = createLocation('B2', 'Gudang PHBI', '', [A1]);
    const r = board(items, '', () => {}, [A1, B2], [
      ...lines,
      { itemId: items[0].itemId, locationId: B2.locationId, initialStock: 6 },
    ]);
    expect(desk(r).getByText('A1')).toBeTruthy();
    expect(desk(r).getByText('B2')).toBeTruthy();
  });

  it('opens the rack when its code is tapped', () => {
    const items = catalog(input({ name: 'Sabun', locationId: A1.locationId }));
    const opened: string[] = [];
    const r = board(items, '', () => {}, [A1], lines, (id) => opened.push(id));
    fireEvent.click(desk(r).getByLabelText('Buka Rak A1'));
    expect(opened).toEqual([A1.locationId]);
  });

  it('says so out loud when an item has no rack, rather than leaving a gap', () => {
    // An unplaced item is the one most likely to go missing, so a blank cell is the wrong
    // answer — it reads as a rendering bug rather than as a real, actionable state.
    const items = catalog(input({ name: 'Sabun' }));
    const r = board(items, '', () => {}, [A1]);
    expect(desk(r).getByText('belum ditempatkan')).toBeTruthy();
  });
});

describe('narrowing the list to the question being asked', () => {
  const GUDANG = () => catalog(
    input({ name: 'Sabun', initialStock: 12, minStock: 5, locationId: A1.locationId }),
    input({ name: 'Ember', initialStock: 1, minStock: 5, locationId: A1.locationId }),
    input({ name: 'Kanebo', initialStock: 0, minStock: 5, locationId: A1.locationId }),
    input({ name: 'Tali', initialStock: 7, minStock: 5 }),
  );

  it('says how many each filter will find before it is pressed', () => {
    // A filter that turns out to select nothing is a wasted tap and a moment of "is this
    // broken?". The number answers that in advance.
    const r = board(GUDANG());
    expect(within(r.getByRole('button', { name: /Menipis/ })).getByText('1')).toBeTruthy();
    expect(within(r.getByRole('button', { name: /Belum ditempatkan/ })).getByText('1')).toBeTruthy();
  });

  it('shows only the unplaced rows when that is what was asked', () => {
    const r = board(GUDANG());
    fireEvent.click(r.getByRole('button', { name: /Belum ditempatkan/ }));
    expect(r.queryAllByText('Sabun')).toHaveLength(0);
    expect(r.getAllByText('Tali').length).toBeGreaterThan(0);
  });

  it('opens already filtered when it was linked to that way', () => {
    // Beranda's "belum ditempatkan" count is only useful if tapping it lands on exactly those.
    const r = board(GUDANG(), '', () => {}, [A1], lines, () => {}, { filter: 'belum-ditempatkan' });
    expect(r.queryAllByText('Sabun')).toHaveLength(0);
    expect(r.getAllByText('Tali').length).toBeGreaterThan(0);
  });

  it('blames the filter, not the search, when the filter is what emptied the list', () => {
    // Otherwise somebody retypes a word that was never the problem.
    const r = board(catalog(input({ name: 'Sabun', initialStock: 12, locationId: A1.locationId })));
    fireEvent.click(r.getByRole('button', { name: /Habis/ }));
    expect(r.getByText('Tidak ada barang yang habis.')).toBeTruthy();
  });

  it('hides the minus filter until something is actually minus', () => {
    // A permanently-zero control is furniture; it earns its place only when it has an answer.
    expect(board(GUDANG()).queryByRole('button', { name: /Minus/ })).toBeNull();
  });

  it('offers a way back to the whole list', () => {
    const r = board(GUDANG());
    fireEvent.click(r.getByRole('button', { name: /Habis/ }));
    fireEvent.click(r.getByText('Reset'));
    expect(r.getAllByText('Sabun').length).toBeGreaterThan(0);
  });
});

describe('telling what gets used up from what stays', () => {
  const MIXED = () => catalog(
    input({ name: 'Sabun', initialStock: 12, locationId: A1.locationId }),
    input({ name: 'Pisau potong', kind: 'equipment', initialStock: 3, minStock: null,
      locationId: A1.locationId }),
  );

  it('shows only consumables when asked for what can run out', () => {
    const r = board(MIXED());
    fireEvent.change(r.getByLabelText('Jenis barang'), { target: { value: 'bisa-habis' } });
    expect(r.getAllByText('Sabun').length).toBeGreaterThan(0);
    expect(r.queryAllByText('Pisau potong')).toHaveLength(0);
  });

  it('shows only durables when asked for what stays', () => {
    const r = board(MIXED());
    fireEvent.change(r.getByLabelText('Jenis barang'), { target: { value: 'barang-tetap' } });
    expect(r.queryAllByText('Sabun')).toHaveLength(0);
    expect(r.getAllByText('Pisau potong').length).toBeGreaterThan(0);
  });

  it('combines with a status chip rather than replacing it', () => {
    // The whole reason this is a separate control: "menipis AND bisa habis" is one question,
    // and a single chip row could only ever answer half of it.
    const r = board(catalog(
      input({ name: 'Sabun', initialStock: 1, minStock: 5, locationId: A1.locationId }),
      input({ name: 'Ember', kind: 'equipment', initialStock: 1, minStock: 5,
        locationId: A1.locationId }),
    ));
    fireEvent.change(r.getByLabelText('Jenis barang'), { target: { value: 'bisa-habis' } });
    fireEvent.click(r.getByRole('button', { name: /Menipis/ }));
    expect(r.getAllByText('Sabun').length).toBeGreaterThan(0);
    expect(r.queryAllByText('Ember')).toHaveLength(0);
  });

  it('counts the chips within the kind on screen, not the whole gudang', () => {
    // Otherwise a chip promises rows the filter cannot show.
    const r = board(MIXED());
    fireEvent.change(r.getByLabelText('Jenis barang'), { target: { value: 'barang-tetap' } });
    expect(within(r.getByRole('button', { name: /Semua/ })).getByText('1')).toBeTruthy();
  });
});
