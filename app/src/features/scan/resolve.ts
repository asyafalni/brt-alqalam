// Resolving a scanned label to something we can act on. Pure.
//
// The scan guard (design doc §15.3): every scan immediately shows what the thing IS and what
// state it is in, before any action. That is what stops a duplicate scan becoming a duplicate
// withdrawal, and what makes an unknown label say so instead of failing silently.

import type { AssetInstance, Category, DerivedState, Item } from '../../../../domain/types';
import { instancesFor } from '../stocktake/draft';

export type Resolution =
  | { found: false; reason: 'unknown'; id: string }
  | { found: false; reason: 'no-catalog'; id: string }
  | { found: true; item: Item; categoryName: string; instance?: AssetInstance; qty: number; status: string };

export function resolveScan(
  target: 'item' | 'asset',
  id: string,
  items: readonly Item[],
  categories: readonly Category[],
  derived: DerivedState,
  acquiredTs: number,
): Resolution {
  if (items.length === 0) return { found: false, reason: 'no-catalog', id };

  const categoryName = (categoryId: string) =>
    categories.find((c) => c.categoryId === categoryId)?.name ?? categoryId;

  if (target === 'asset') {
    // Instances are derived from the item, so the item that owns this assetId is found by
    // regenerating them — no second collection to fall out of sync with the labels.
    for (const item of items) {
      const instance = instancesFor(item, acquiredTs).find((a) => a.assetId === id);
      if (instance) {
        return {
          found: true,
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
    item,
    categoryName: categoryName(item.categoryId),
    qty: d?.qty ?? item.initialStock,
    status: d?.status ?? 'available',
  };
}

// `out` means two different things and must never share a label: for a quantity item it is
// "stock is zero", for a physical unit it is "someone has it". Showing "Habis" on a borrowed
// knife would be actively misleading — the knife exists, it is just not here.

/**
 * Class strings are written out in full, never interpolated. Tailwind scans source for
 * LITERAL class names — `bg-${color}` generates no CSS at all, and the failure is silent:
 * the badge simply renders colourless.
 */
export interface StatusBadge {
  label: string;
  /** Solid fill, for the rail down the side of a row. */
  dot: string;
  /** Tinted pill with matching text. */
  chip: string;
}

const ITEM_STATUS: Record<string, StatusBadge> = {
  available: { label: 'Tersedia', dot: 'bg-tersedia', chip: 'bg-tersedia/15 text-tersedia' },
  low: { label: 'Menipis', dot: 'bg-menipis', chip: 'bg-menipis/15 text-menipis' },
  out: { label: 'Habis', dot: 'bg-habis', chip: 'bg-habis/15 text-habis' },
};

const INSTANCE_STATUS: Record<string, StatusBadge> = {
  available: { label: 'Tersedia', dot: 'bg-tersedia', chip: 'bg-tersedia/15 text-tersedia' },
  out: { label: 'Dipinjam', dot: 'bg-dipinjam', chip: 'bg-dipinjam/15 text-dipinjam' },
  broken: { label: 'Rusak', dot: 'bg-rusak', chip: 'bg-rusak/15 text-rusak' },
  lost: { label: 'Hilang', dot: 'bg-hilang', chip: 'bg-hilang/15 text-hilang' },
  retired: { label: 'Pensiun', dot: 'bg-pensiun', chip: 'bg-pensiun/15 text-pensiun' },
};

const UNKNOWN: StatusBadge = {
  label: 'Tidak diketahui', dot: 'bg-pensiun', chip: 'bg-pensiun/15 text-pensiun',
};

export const itemStatusBadge = (status: string): StatusBadge => ITEM_STATUS[status] ?? UNKNOWN;
export const instanceStatusBadge = (status: string): StatusBadge => INSTANCE_STATUS[status] ?? UNKNOWN;

/** Picks the right vocabulary for whatever was scanned. */
export const statusBadge = (resolution: Resolution): StatusBadge => {
  if (!resolution.found) return UNKNOWN;
  return resolution.instance ? instanceStatusBadge(resolution.status) : itemStatusBadge(resolution.status);
};
