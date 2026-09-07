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
  /**
   * Items whose folded quantity is below zero. Not a rounding artefact — it means more was
   * recorded leaving than ever arrived, so the log and the shelf disagree. It is the loudest
   * possible signal that the register needs a physical recount, and it must never be hidden
   * or clamped away: a quietly-corrected number is a wrong number nobody investigates.
   */
  negativeStock: number;
  /** 0–1. The share of items that are both placed and monitored. */
  score: number;
}

/**
 * One physical unit that is not where it should be, for the two sections management actually
 * acts on: the repair queue and the write-off list.
 *
 * NO HOLDER. `DerivedInstance` carries who had it, and that is exactly the field this tier may
 * not publish (§39) — the report is handed to takmir and may be printed, so it names the thing
 * and not the person. Accountability lives behind the PIN wall, on the Aset screen; what a
 * report needs is "which knife, since when, and what does it cost to put right".
 */
export interface AssetProblem {
  assetId: string;
  /** What is written on the label — the thing somebody will go and look for. */
  label: string;
  itemName: string;
  categoryName: string;
  /** Where it belongs, so a search has somewhere to start. */
  zone: string;
  /** When it entered this state, so the oldest problem sorts first. */
  since?: number;
}

export interface Report {
  totalItems: number;
  totalUnits: number;
  byCategory: Slice[];
  byZone: Slice[];
  byStatus: Slice[];
  health: DataHealth;
  /**
   * Damaged units: present, ours, out of service, and *fixable*. A repair queue.
   * Kept apart from `lost` deliberately (design doc Part IV) — one costs a repair and the
   * other costs a replacement, and collapsing them into "masalah" hides which is which.
   */
  broken: AssetProblem[];
  /** Written off: gone, and out of the active asset base. A procurement list. */
  lost: AssetProblem[];
  /** Individually-tagged units still owned and present — everything but lost and retired. */
  activeAssets: number;
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
    row.units += derived.items[item.itemId]?.qty ?? 0;
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
  const totalUnits = items.reduce((n, i) => n + (derived.items[i.itemId]?.qty ?? 0), 0);

  const zoneById = new Map(locations.map((l) => [l.locationId, l.zone]));
  /**
   * An item spread across two zones belongs to both, so this reports where MOST of it is.
   * Splitting a row across zones would double-count the item in a composition whose whole
   * point is that its slices add up to the catalog.
   */
  const zoneOf = (item: Item) => {
    const rows = Object.entries(derived.items[item.itemId]?.byLocation ?? {});
    if (rows.length === 0) return '';
    const [where] = rows.reduce((best, row) => (row[1] > best[1] ? row : best));
    return zoneById.get(where) ?? '';
  };

  /** Placed somewhere, anywhere — one shelf is enough to stop it being lost in the mess. */
  const isPlaced = (item: Item) =>
    Object.keys(derived.items[item.itemId]?.byLocation ?? {}).some((k) => k !== '');

  const racks = rollupLocations(locations, items, derived);
  const counted = locations.filter((l) => l.active && countState(l, now).freshness !== 'never').length;
  const activeRacks = locations.filter((l) => l.active).length;

  const placed = items.filter(isPlaced).length;
  const withMinimum = items.filter((i) => i.minStock != null).length;

  const negativeStock = items.filter((i) => (derived.items[i.itemId]?.qty ?? 0) < 0).length;

  const health: DataHealth = {
    placed,
    unplaced: items.length - placed,
    withMinimum,
    withoutMinimum: items.length - withMinimum,
    racksCounted: counted,
    racksNeverCounted: activeRacks - counted,
    negativeStock,
    // Placement and monitoring weighted equally: knowing where a thing is and knowing when it
    // runs low are the two halves of a register being useful at all. Anything counted below
    // zero is subtracted outright — a register that contradicts itself cannot score well on
    // tidiness, however completely it is filled in.
    score: Math.max(0,
      (share(placed, items.length) + share(withMinimum, items.length)) / 2
      - share(negativeStock, items.length)),
  };

  const STATUS_LABEL: Record<string, string> = { available: 'Tersedia', low: 'Menipis', out: 'Habis' };

  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const problem = (d: { instance: { assetId: string; itemId: string; label: string }; since?: number }): AssetProblem => {
    const item = itemById.get(d.instance.itemId);
    return {
      assetId: d.instance.assetId,
      label: d.instance.label,
      itemName: item?.name ?? d.instance.itemId,
      categoryName: item ? categoryName(item.categoryId) : '',
      zone: item ? zoneOf(item) : '',
      since: d.since,
    };
  };
  // Oldest first: a unit broken three months ago is the one that has been waiting longest,
  // and a list sorted by anything else buries it under this week's news.
  const byAge = (a: AssetProblem, b: AssetProblem) => (a.since ?? 0) - (b.since ?? 0);

  const activeAssets = Object.values(derived.instances)
    .filter((d) => d.status !== 'lost' && d.status !== 'retired').length;

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
    broken: derived.rusak.map(problem).sort(byAge),
    lost: derived.hilang.map(problem).sort(byAge),
    activeAssets,
    movementAvailable,
  };
}

/** Percentage for display, rounded once so the same number never renders two ways. */
export const percent = (n: number, total: number): number =>
  total === 0 ? 0 : Math.round((n / total) * 100);
