import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { Board } from './Board';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { createItem, instancesFor } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import type { Item } from '../../../../domain/types';
import { deriveState } from '../../../../domain/deriveState';
import { deriveNotifications } from '../../../../domain/notifications';

const NOW = Date.parse('2026-09-07T00:00:00Z');

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 12, minStock: 5, ...p,
});

const catalog = (...i: DraftInput[]): Item[] =>
  i.reduce<Item[]>((acc, x) => [...acc, createItem(x, acc)], []);

function board(items: Item[], search = '', onOpenItem: (id: string) => void = () => {}) {
  const H = () => {
    const instances = items.flatMap((i) => instancesFor(i, NOW));
    return (
      <Board
        items={items}
        categories={SEED_CATEGORIES}
        search={search}
        onOpenItem={onOpenItem}
        inventory={{
          instances,
          txns: [],
          derived: deriveState(items, instances, [], NOW),
          notifications: deriveNotifications(items, [], NOW),
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

describe('Notifikasi Stok', () => {
  it('reports anything at or below its minimum, and stays quiet otherwise', () => {
    const fine = board(catalog(input({ initialStock: 20, minStock: 5 })));
    expect(fine.getByText('Semua stok aman.')).toBeTruthy();
    cleanup();

    const low = board(catalog(input({ name: 'Kanebo', initialStock: 3, minStock: 5 })));
    expect(low.queryByText('Semua stok aman.')).toBeNull();
    expect(low.getByText(/sisa/)).toBeTruthy();
    expect(desk(low).getByText('Menipis')).toBeTruthy();
  });
});
