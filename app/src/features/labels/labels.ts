// What gets printed, and what each label points at. Pure — no DOM, no framework.
//
// Deep links, not bare ids (design doc §15.4): a QR encoding a URL opens the right screen from
// the phone's own camera app, with no app installed and nothing to explain. A bare id would
// only work inside a scanner we wrote, which is the one situation where the label is least needed.

import type { Category, Item, Location } from '../../../../domain/types';
import { instancesFor } from '../stocktake/draft';

export interface LabelSpec {
  /** Stable key and the human-readable code printed under the QR. */
  code: string;
  title: string;
  subtitle: string;
  /** What the QR encodes. */
  url: string;
}

export type ScanTarget = 'item' | 'asset' | 'location';

/**
 * `?i=` is a stock location (a rack or bin, scanned then given a quantity);
 * `?a=` is one physical unit with its own identity and status.
 *
 * Hash routes, like SmartInv's HashRouter. A hash needs no server rewrite, so a printed
 * sticker works on any static host — with path routing, a host missing its SPA fallback
 * turns every label in the gudang into dead paper, and only after they are printed.
 */
export function scanUrl(baseUrl: string, target: ScanTarget, id: string): string {
  const base = baseUrl.replace(/[/#]+$/, '');
  const key = target === 'asset' ? 'a' : target === 'location' ? 'l' : 'i';
  return `${base}/#/scan?${key}=${encodeURIComponent(id)}`;
}

/**
 * A printed label outlives the session that made it. A base URL pointing at a dev server
 * produces stickers that are dead the moment the laptop closes — so this is surfaced as a
 * warning before printing, not discovered later on a shelf.
 */
export function isUnprintableBaseUrl(baseUrl: string): boolean {
  const url = baseUrl.trim().toLowerCase();
  if (url === '') return true;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/.test(url)
    || url.startsWith('file:');
}

export function labelsFor(
  items: readonly Item[],
  categories: readonly Category[],
  locations: readonly Location[],
  baseUrl: string,
  acquiredTs: number,
): LabelSpec[] {
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  // Racks first — they go on the shelves, and they are the labels §14.2 actually asked for.
  const rackLabels: LabelSpec[] = locations.filter((l) => l.active).map((l) => ({
    code: l.locationId,
    title: `Rak ${l.code}`,
    subtitle: l.name || l.zone,
    url: scanUrl(baseUrl, 'location', l.locationId),
  }));

  return rackLabels.concat(items.flatMap((item) => {
    if (item.trackBy === 'instance') {
      // One label per physical unit — this is what makes "who has knife #7" answerable.
      return instancesFor(item, acquiredTs).map((a) => ({
        code: a.assetId,
        title: a.label,
        subtitle: categoryName(item.categoryId),
        url: scanUrl(baseUrl, 'asset', a.assetId),
      }));
    }
    // One durable label per rack or bin, not per bar of soap (design doc §14.2).
    return [{
      code: item.barcode,
      title: item.name,
      subtitle: `${categoryName(item.categoryId)} · ${item.unit}`,
      url: scanUrl(baseUrl, 'item', item.itemId),
    }];
  }));
}

/** Sticker sheet geometry. Sizes are the common A4 label formats sold locally. */
export interface SheetFormat {
  id: string;
  name: string;
  columns: number;
  rows: number;
  /** Label size in millimetres. */
  width: number;
  height: number;
}

export const SHEET_FORMATS: SheetFormat[] = [
  { id: 'besar', name: 'Besar — 24 per lembar', columns: 3, rows: 8, width: 70, height: 37 },
  { id: 'kecil', name: 'Kecil — 40 per lembar', columns: 4, rows: 10, width: 48.5, height: 25.4 },
];

export const perSheet = (f: SheetFormat): number => f.columns * f.rows;
export const sheetCount = (labels: number, f: SheetFormat): number =>
  Math.ceil(labels / perSheet(f)) || 0;
