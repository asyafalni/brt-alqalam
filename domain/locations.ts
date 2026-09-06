// Rack rollup — a pure projection over locations and derived stock.
//
// Answers the question a messy gudang actually poses: not "how much do we own" but
// "where is it, and which shelf needs me first". Nothing is stored; a rack's state is the
// worst state of what sits on it, folded the same way everything else is.

import type { DerivedState, Item, Location } from './types';

/** Ordered by urgency. A rack shows the worst thing on it, because that is what earns a walk. */
export type LocationStatus = 'out' | 'low' | 'available' | 'empty';

const SEVERITY: Record<LocationStatus, number> = { out: 3, low: 2, available: 1, empty: 0 };

export interface LocationSummary {
  location: Location;
  status: LocationStatus;
  itemCount: number;
  /** Total counted units sitting here. */
  unitCount: number;
  /** How many distinct items on this rack are at or below their minimum. */
  lowCount: number;
  outCount: number;
}

/** The synthetic rack for anything not placed yet — the pile in the corner, made visible. */
export const UNASSIGNED: Location = {
  locationId: '', code: '—', name: 'Belum ditempatkan', zone: 'Belum ditempatkan',
  order: Number.MAX_SAFE_INTEGER, active: true,
};

export function rollupLocations(
  locations: readonly Location[],
  items: readonly Item[],
  derived: DerivedState,
): LocationSummary[] {
  const byLocation = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.locationId ?? '';
    const bucket = byLocation.get(key);
    if (bucket) bucket.push(item);
    else byLocation.set(key, [item]);
  }

  const summarise = (location: Location): LocationSummary => {
    const here = byLocation.get(location.locationId) ?? [];
    let status: LocationStatus = here.length === 0 ? 'empty' : 'available';
    let unitCount = 0;
    let lowCount = 0;
    let outCount = 0;

    for (const item of here) {
      const d = derived.items[item.itemId];
      if (!d) continue;
      unitCount += d.qty;
      if (d.status === 'low') lowCount += 1;
      if (d.status === 'out') outCount += 1;
      if (SEVERITY[d.status] > SEVERITY[status]) status = d.status;
    }

    return { location, status, itemCount: here.length, unitCount, lowCount, outCount };
  };

  const placed = [...locations]
    .filter((l) => l.active)
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.order - b.order || a.code.localeCompare(b.code))
    .map(summarise);

  // Only surface the unassigned bucket when something is actually in it.
  const orphans = byLocation.get('');
  return orphans && orphans.length > 0 ? [...placed, summarise(UNASSIGNED)] : placed;
}

/** Zones, in display order, each with its racks — the grouped blocks of the rack board. */
export function groupByZone(summaries: readonly LocationSummary[]): { zone: string; racks: LocationSummary[] }[] {
  const zones: { zone: string; racks: LocationSummary[] }[] = [];
  for (const s of summaries) {
    const existing = zones.find((z) => z.zone === s.location.zone);
    if (existing) existing.racks.push(s);
    else zones.push({ zone: s.location.zone, racks: [s] });
  }
  return zones;
}

/** Headline for the board: how many racks need someone to walk to them. */
export const racksNeedingAttention = (summaries: readonly LocationSummary[]): number =>
  summaries.filter((s) => s.status === 'low' || s.status === 'out').length;
