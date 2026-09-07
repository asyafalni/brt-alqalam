// Resolving a scanned label to something we can act on. Pure.
//
// The scan guard (design doc §15.3): every scan immediately shows what the thing IS and what
// state it is in, before any action. That is what stops a duplicate scan becoming a duplicate
// withdrawal, and what makes an unknown label say so instead of failing silently.

import type { AssetInstance, Category, DerivedState, Item, Location, StockLine } from '../../../../domain/types';
import { rollupLocations } from '../../../../domain/locations';
import { contentsOf, totalFor } from '../../../../domain/stock';
import type { LocationSummary } from '../../../../domain/locations';
import { instancesFor } from '../stocktake/draft';

export type Resolution =
  | { found: false; reason: 'unknown'; id: string }
  | { found: false; reason: 'no-catalog'; id: string }
  | { found: true; kind: 'thing'; item: Item; categoryName: string; instance?: AssetInstance; qty: number; status: string }
  | { found: true; kind: 'rack'; rack: LocationSummary; contents: Item[] };

export function resolveScan(
  target: 'item' | 'asset' | 'location',
  id: string,
  items: readonly Item[],
  categories: readonly Category[],
  locations: readonly Location[],
  derived: DerivedState,
  acquiredTs: number,
  stock: readonly StockLine[] = [],
): Resolution {
  if (target === 'location') {
    const location = locations.find((l) => l.locationId === id);
    if (!location) return { found: false, reason: 'unknown', id };
    const rack = rollupLocations([location], items, derived)[0];
    return {
      found: true,
      kind: 'rack',
      rack,
      contents: contentsOf(stock, items, id).map((r) => r.item),
    };
  }

  if (items.length === 0) return { found: false, reason: 'no-catalog', id };

  const categoryName = (categoryId: string) =>
    categories.find((c) => c.categoryId === categoryId)?.name ?? categoryId;

  if (target === 'asset') {
    // Instances are derived from the item, so the item that owns this assetId is found by
    // regenerating them — no second collection to fall out of sync with the labels.
    for (const item of items) {
      const instance = instancesFor(item, acquiredTs, totalFor(stock, item.itemId))
        .find((a) => a.assetId === id);
      if (instance) {
        return {
          found: true,
          kind: 'thing',
          item,
          categoryName: categoryName(item.categoryId),
          instance,
          qty: 1,
          status: derived.instances[id]?.status ?? 'available',
        };
      }
    }
    return { found: false, reason: 'unknown', id };
  }

  const item = items.find((i) => i.itemId === id || i.barcode === id);
  if (!item) return { found: false, reason: 'unknown', id };

  const d = derived.items[item.itemId];
  return {
    found: true,
    kind: 'thing',
    item,
    categoryName: categoryName(item.categoryId),
    qty: d?.qty ?? 0,
    status: d?.status ?? 'available',
  };
}

// `out` means two different things and must never share a label: for a quantity item it is
// "stock is zero", for a physical unit it is "someone has it". Showing "Habis" on a borrowed
// knife would be actively misleading — the knife exists, it is just not here.

/**
 * Status pills EXTEND SmartInv's `StockBadge` (components/StockBadge.tsx:10-17) rather than
 * inventing a palette. The template's pattern is a `bg-X-50 / text-X-700 / border-X-100`
 * triple from a stock Tailwind family; it ships three statuses and our model needs seven, so
 * four more families are added in the same shape. Pill geometry is theirs, verbatim.
 *
 * Class strings are literal, never interpolated: Tailwind scans source for literal class
 * names, so `bg-${family}-50` generates no CSS and fails silently — colourless badges.
 */
export const PILL =
  'px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border';

export interface StatusBadge {
  label: string;
  /** Tinted pill — SmartInv's StockBadge triple. */
  chip: string;
  /** Solid fill, for the rail down the side of a list row. */
  rail: string;
}

const ITEM_STATUS: Record<string, StatusBadge> = {
  available: { label: 'Tersedia', chip: 'bg-green-50 text-green-700 border-green-100', rail: 'bg-green-500' },
  low: { label: 'Menipis', chip: 'bg-amber-50 text-amber-700 border-amber-100', rail: 'bg-amber-500' },
  out: { label: 'Habis', chip: 'bg-red-50 text-red-700 border-red-100', rail: 'bg-red-500' },
};

const INSTANCE_STATUS: Record<string, StatusBadge> = {
  available: { label: 'Tersedia', chip: 'bg-green-50 text-green-700 border-green-100', rail: 'bg-green-500' },
  // Extensions beyond the template's three, same shape, distinct families.
  out: { label: 'Dipinjam', chip: 'bg-sky-50 text-sky-700 border-sky-100', rail: 'bg-sky-500' },
  broken: { label: 'Rusak', chip: 'bg-orange-50 text-orange-700 border-orange-100', rail: 'bg-orange-500' },
  // Deeper than rusak on purpose: hilang is a terminal write-off, not a repair queue item.
  lost: { label: 'Hilang', chip: 'bg-rose-50 text-rose-800 border-rose-200', rail: 'bg-rose-700' },
  retired: { label: 'Pensiun', chip: 'bg-slate-100 text-slate-600 border-slate-200', rail: 'bg-slate-400' },
};

const UNKNOWN: StatusBadge = {
  label: 'Tidak diketahui', chip: 'bg-slate-100 text-slate-600 border-slate-200', rail: 'bg-slate-400',
};

export const itemStatusBadge = (status: string): StatusBadge => ITEM_STATUS[status] ?? UNKNOWN;
export const instanceStatusBadge = (status: string): StatusBadge => INSTANCE_STATUS[status] ?? UNKNOWN;

/** Picks the right vocabulary for whatever was scanned. */
export const statusBadge = (resolution: Resolution): StatusBadge => {
  if (!resolution.found) return UNKNOWN;
  if (resolution.kind === 'rack') return itemStatusBadge(resolution.rack.status);
  return resolution.instance ? instanceStatusBadge(resolution.status) : itemStatusBadge(resolution.status);
};
