// Narrowing and ordering the stock list.
//
// Pure functions over derived rows, kept out of the component so each one can be tested by
// what it answers rather than by what it renders. The vocabulary itself lives in `route.ts`,
// because these are URL values first and controls second (a filtered list is a place you can
// be sent to).

import type { BoardFilter, BoardKind, BoardSort } from '../../state/route';
import type { DerivedItem, Location } from '../../../../domain/types';

/** The question each filter answers, in the words the control shows. */
export const FILTER_LABEL: Record<BoardFilter, string> = {
  semua: 'Semua',
  menipis: 'Menipis',
  habis: 'Habis',
  'belum-ditempatkan': 'Belum ditempatkan',
  minus: 'Minus',
};

/**
 * The plain-language names from the item form, not "consumable"/"equipment".
 *
 * Part XI: the perlengkapan/peralatan split was only ever a proxy for "does this get used up",
 * and the words that survived are the ones an operator was asked at item creation. Using
 * different words here would make the filter look like it selects something else.
 */
export const KIND_LABEL: Record<BoardKind, string> = {
  semua: 'Semua jenis',
  'bisa-habis': 'Bisa habis',
  'barang-tetap': 'Barang tetap',
};

/** Whether an item is the kind being asked for. `kind` drives the whole lifecycle (Part XI). */
export const matchesKind = (d: DerivedItem, kind: BoardKind): boolean => {
  if (kind === 'bisa-habis') return d.item.kind === 'consumable';
  if (kind === 'barang-tetap') return d.item.kind === 'equipment';
  return true;
};

export const SORT_LABEL: Record<BoardSort, string> = {
  nama: 'Nama A–Z',
  'stok-naik': 'Stok paling sedikit',
  'stok-turun': 'Stok paling banyak',
  rak: 'Urutan rak',
};

/** Whether anything is kept on a real shelf, as opposed to sitting in the unplaced pile. */
export const isPlaced = (d: DerivedItem): boolean =>
  Object.keys(d.byLocation).some((id) => id !== '');

export function matchesFilter(d: DerivedItem, filter: BoardFilter): boolean {
  switch (filter) {
    case 'menipis': return d.status === 'low';
    case 'habis': return d.status === 'out';
    // The state most likely to end in something going missing, which is why it is a filter and
    // not just a word in a cell.
    case 'belum-ditempatkan': return !isPlaced(d);
    // Not a status but a contradiction: more went out than ever existed, so the record and the
    // shelf disagree and one of them needs a recount.
    case 'minus': return d.qty < 0;
    default: return true;
  }
}

/**
 * `rak` sorts by the code somebody reads off the shelf, so the list walks the gudang in the
 * order their feet do. Unplaced rows go last: they are not on the walk, and putting them first
 * would mean scrolling past everything that has no location to reach the shelves.
 */
export function sortRows(
  rows: DerivedItem[], sort: BoardSort, locations: readonly Location[],
): DerivedItem[] {
  const byName = (a: DerivedItem, b: DerivedItem) =>
    a.item.name.localeCompare(b.item.name, 'id');

  const firstRack = (d: DerivedItem): string => {
    const codes = Object.keys(d.byLocation)
      .filter((id) => id !== '')
      .map((id) => locations.find((l) => l.locationId === id)?.code)
      .filter((c): c is string => c != null)
      .sort((a, b) => a.localeCompare(b, 'id'));
    // A high sentinel rather than an empty string, which would sort first.
    return codes[0] ?? '￿';
  };

  const copy = [...rows];
  switch (sort) {
    // Ties broken by name in every case: without it the order of two equal rows depends on
    // catalog order, and a list that reshuffles between visits looks like it lost something.
    case 'stok-naik': return copy.sort((a, b) => a.qty - b.qty || byName(a, b));
    case 'stok-turun': return copy.sort((a, b) => b.qty - a.qty || byName(a, b));
    case 'rak': return copy.sort((a, b) =>
      firstRack(a).localeCompare(firstRack(b), 'id') || byName(a, b));
    default: return copy.sort(byName);
  }
}
