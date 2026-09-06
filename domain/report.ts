// Aggregations for the management report.
//
// PII-FREE BY CONSTRUCTION (design doc §39). Nothing here reads `recipient` or `actorUserId`,
// and nothing returns a person. That is not a policy applied on top — it is why this file can
// exist separately at all, and why its output is safe to print, email or publish.
//
// Everything is derived. A report that maintained its own totals would drift from the board,
// and the first person to notice would stop trusting both.

import type { DerivedState, Item, Location } from './types';
import { rollupLocations } from './locations';
import { countState } from './cycleCount';

export interface Slice {
  key: string;
  label: string;
  items: number;
  units: number;
}

export interface DataHealth {
  /** Items sitting on a known rack. The rest cannot be found without hunting. */
  placed: number;
  unplaced: number;
  /** Items with a Setting Minimum, so a low-stock alarm can ever fire for them. */
  withMinimum: number;
  withoutMinimum: number;
  /** Racks physically counted at least once. An uncounted rack is unknown, not fine. */
  racksCounted: number;
  racksNeverCounted: number;
  /** 0–1. The share of items that are both placed and monitored. */
  score: number;
}

export interface Report {
  totalItems: number;
  totalUnits: number;
  byCategory: Slice[];
  byZone: Slice[];
  byStatus: Slice[];
  health: DataHealth;
  /** True while there is no event log, so the report can say which sections are missing. */
  movementAvailable: boolean;
}

const share = (n: number, total: number) => (total === 0 ? 0 : n / total);

function group(
  items: readonly Item[],
  derived: DerivedState,
  keyOf: (i: Item) => string,
  labelOf: (key: string) => string,
): Slice[] {
  const acc = new Map<string, Slice>();
  for (const item of items) {
    const key = keyOf(item);
    const row = acc.get(key) ?? { key, label: labelOf(key), items: 0, units: 0 };
    row.items += 1;
    row.units += derived.items[item.itemId]?.qty ?? item.initialStock;
    acc.set(key, row);
  }
  // Largest first: a report is read from the top, and the biggest group is the story.
  return [...acc.values()].sort((a, b) => b.items - a.items || a.label.localeCompare(b.label));
}

export function buildReport(
  items: readonly Item[],
  locations: readonly Location[],
  categoryName: (categoryId: string) => string,
  derived: DerivedState,
  now: number,
  movementAvailable = false,
): Report {
  const totalUnits = items.reduce((n, i) => n + (derived.items[i.itemId]?.qty ?? i.initialStock), 0);

  const zoneOf = (item: Item) =>
    locations.find((l) => l.locationId === item.locationId)?.zone ?? '';

  const racks = rollupLocations(locations, items, derived);
  const counted = locations.filter((l) => l.active && countState(l, now).freshness !== 'never').length;
  const activeRacks = locations.filter((l) => l.active).length;

  const placed = items.filter((i) => i.locationId).length;
  const withMinimum = items.filter((i) => i.minStock != null).length;

  const health: DataHealth = {
    placed,
    unplaced: items.length - placed,
    withMinimum,
    withoutMinimum: items.length - withMinimum,
    racksCounted: counted,
    racksNeverCounted: activeRacks - counted,
    // Placement and monitoring weighted equally: knowing where a thing is and knowing when it
    // runs low are the two halves of a register being useful at all.
    score: (share(placed, items.length) + share(withMinimum, items.length)) / 2,
  };

  const STATUS_LABEL: Record<string, string> = { available: 'Tersedia', low: 'Menipis', out: 'Habis' };

  return {
    totalItems: items.length,
    totalUnits,
    byCategory: group(items, derived, (i) => i.categoryId, categoryName),
    byZone: group(items, derived, zoneOf, (z) => z || 'Belum ditempatkan'),
    byStatus: group(
      items, derived,
      (i) => derived.items[i.itemId]?.status ?? 'available',
      (s) => STATUS_LABEL[s] ?? s,
    ),
    health,
    movementAvailable,
  };
}

/** Percentage for display, rounded once so the same number never renders two ways. */
export const percent = (n: number, total: number): number =>
  total === 0 ? 0 : Math.round((n / total) * 100);
