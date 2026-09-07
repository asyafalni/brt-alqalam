// What gets printed, and what each label points at. Pure — no DOM, no framework.
//
// Deep links, not bare ids (design doc §15.4): a QR encoding a URL opens the right screen from
// the phone's own camera app, with no app installed and nothing to explain. A bare id would
// only work inside a scanner we wrote, which is the one situation where the label is least needed.

import type { Category, Item, Location, StockLine } from '../../../../domain/types';
import { racksFor, totalFor } from '../../../../domain/stock';
import { instancesFor } from '../stocktake/draft';

export type LabelKind = 'rack' | 'item' | 'asset';

export interface LabelSpec {
  /** Stable key and the human-readable code printed under the QR. */
  code: string;
  title: string;
  subtitle: string;
  /** What the QR encodes. */
  url: string;
  kind: LabelKind;
  /** Which rack this label belongs to — `''` when the item has no rack yet. */
  locationId: string;
  /** Free text the search box matches against, lowercased once at build time. */
  haystack: string;
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
  stock: readonly StockLine[] = [],
): LabelSpec[] {
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  // Racks first — they go on the shelves, and they are the labels §14.2 actually asked for.
  const rackLabels: LabelSpec[] = locations.filter((l) => l.active).map((l) => ({
    code: l.locationId,
    title: `Rak ${l.code}`,
    subtitle: l.name || l.zone,
    url: scanUrl(baseUrl, 'location', l.locationId),
    kind: 'rack' as const,
    locationId: l.locationId,
    haystack: `${l.code} ${l.name} ${l.zone} ${l.locationId}`.toLowerCase(),
  }));

  return rackLabels.concat(items.flatMap((item): LabelSpec[] => {
    // An item kept on two racks belongs to the first one for grouping. The label itself points
    // at the ITEM, not at a shelf, so it stays correct wherever the thing is moved to.
    const where = racksFor(stock, item.itemId).find((id) => id !== '') ?? '';
    if (item.trackBy === 'instance') {
      // One label per physical unit — this is what makes "who has knife #7" answerable.
      return instancesFor(item, acquiredTs, totalFor(stock, item.itemId)).map((a) => ({
        code: a.assetId,
        title: a.label,
        subtitle: categoryName(item.categoryId),
        url: scanUrl(baseUrl, 'asset', a.assetId),
        kind: 'asset' as const,
        locationId: where,
        haystack: `${a.label} ${a.assetId} ${item.name} ${categoryName(item.categoryId)}`.toLowerCase(),
      }));
    }
    // One durable label per rack or bin, not per bar of soap (design doc §14.2).
    return [{
      code: item.barcode,
      title: item.name,
      subtitle: `${categoryName(item.categoryId)} · ${item.unit}`,
      url: scanUrl(baseUrl, 'item', item.itemId),
      kind: 'item' as const,
      locationId: where,
      haystack: `${item.name} ${item.barcode} ${categoryName(item.categoryId)}`.toLowerCase(),
    }];
  }));
}

// --- Grouping -----------------------------------------------------------------------------

export interface LabelGroup {
  /** Rack id, or `''` for the items nobody has placed yet. */
  key: string;
  title: string;
  subtitle: string;
  labels: LabelSpec[];
}

/**
 * Grouped by rack, because that is how the labels are actually applied: somebody walks to one
 * shelf holding one sheet. A rack's own label leads its own group, so "print rack A1" means the
 * shelf tag *and* everything that lives on it — one trip, one sheet, one shelf finished.
 *
 * Groups are ordered by the racks themselves, with the unplaced bucket last: it is a to-do
 * list, not a location, and it should not sit between two real shelves.
 */
export function groupLabels(
  labels: readonly LabelSpec[],
  locations: readonly Location[],
): LabelGroup[] {
  const byId = new Map<string, LabelGroup>();
  for (const l of locations.filter((x) => x.active)) {
    byId.set(l.locationId, {
      key: l.locationId,
      title: `Rak ${l.code}`,
      subtitle: l.name || l.zone,
      labels: [],
    });
  }
  const loose: LabelGroup = { key: '', title: 'Belum ditempatkan', subtitle: 'Barang tanpa rak', labels: [] };

  for (const label of labels) {
    (byId.get(label.locationId) ?? loose).labels.push(label);
  }

  const groups = [...byId.values()].filter((g) => g.labels.length > 0);
  if (loose.labels.length > 0) groups.push(loose);
  return groups;
}

// --- Sheet formats ------------------------------------------------------------------------

export type LabelLayout = 'row' | 'stack' | 'board' | 'poster';

/** Sticker sheet geometry. Sizes are the common A4 label formats sold locally. */
export interface SheetFormat {
  id: string;
  name: string;
  /** What this size is *for*. A millimetre figure means nothing until it has a job. */
  purpose: string;
  columns: number;
  rows: number;
  /** Label size in millimetres. */
  width: number;
  height: number;
  /** `row` puts the text beside the QR; `stack` puts it under, for near-square labels. */
  layout: LabelLayout;
}

/**
 * Six sizes, named by the JOB rather than by the millimetre. Somebody choosing a label is
 * deciding "is this going on a keyring or on a shelf?", not "is this 30mm or 70mm?" — so the
 * job is the label and the measurement is the fine print.
 *
 * The two poster sizes broke that rule when they arrived ("Papan rak ¼ A4", "Papan zona A5"):
 * a quarter of A4 is an arithmetic problem, not a job, and the paper size was already printed
 * beside the name. They are named by what they are for and how far away they are read from —
 * a poster ON a rack, a board for a ZONE — which is also the difference that decides which one
 * somebody wants.
 */
export const SHEET_FORMATS: SheetFormat[] = [
  {
    id: 'gantungan',
    name: 'Gantungan kunci',
    purpose: 'Tag kecil untuk digantung di alat — QR besar, nama pendek.',
    columns: 6, rows: 9, width: 30, height: 30, layout: 'stack',
  },
  {
    id: 'tag',
    name: 'Tag barang',
    purpose: 'Stiker kecil untuk ditempel langsung di barang.',
    columns: 4, rows: 10, width: 48, height: 25.4, layout: 'row',
  },
  {
    id: 'rak',
    name: 'Label rak',
    purpose: 'Ukuran umum untuk ditempel di rak — terbaca dari dekat.',
    // 63.5 × 38.1 is Avery L7160 / 5160, 21 to a page: one of the commonest sticker sheets
    // sold anywhere, so this size can be bought rather than cut by hand. It replaced an
    // invented 70×37 at 3 across, which needed 210mm of a 194mm page — the third column and
    // the eighth row fell off the paper, and "24 per lembar A4" was a promise the printer
    // could not keep.
    columns: 3, rows: 7, width: 63.5, height: 38.1, layout: 'row',
  },
  {
    /* `board`, its own layout. As a `row` the QR claimed the full height — 66 of the 99mm —
       and left the name about 27mm, so on the one size printed BECAUSE it has to be read from
       across the gudang, the name was the thing that got cut off. The QR now takes a modest
       band at the top and the name gets the whole width underneath, wrapping. */
    id: 'jumbo',
    name: 'Rak jumbo',
    purpose: 'Papan rak besar — terbaca dari ujung gudang.',
    // 95 × 68, not 99 × 70: two of the wider one came to 198mm on a 194mm page, so the right
    // -hand column ran off the sheet. Four millimetres is nothing on a board this size and the
    // difference between eight labels and a reprint.
    columns: 2, rows: 4, width: 95, height: 68, layout: 'board',
  },
  /* The two below are PORTRAIT, and that is the whole reason they exist. On a 99×70 landscape
     board the QR is bounded by the HEIGHT — giving it the full width would take it from 57mm
     to about 62mm, which is not a size worth a second entry. Turn the label upright and the
     width becomes the limit instead, and the code can be as large as the paper allows. */
  {
    id: 'papan4',
    name: 'Poster rak',
    purpose: 'Ditempel di tiap rak — QR besar, dipindai dari beberapa langkah.',
    columns: 2, rows: 2, width: 95, height: 135, layout: 'poster',
  },
  {
    /* The biggest worth printing. A whole A4 per rack was tried and is too much paper for one
       shelf — the code was already unmistakable at half that.

       `board`, not `poster`: this label is LANDSCAPE, 190 across and 135 tall, and stacking it
       threw away the width. Both poster sizes are 135mm tall, so a height-derived QR came out
       identical on the two — the bigger sheet bought nothing at all. Turned on its side the
       code is bounded by the height it does not share, and the name takes the width. */
    id: 'papan',
    name: 'Papan zona',
    purpose: 'Penanda lorong atau zona — terbaca dari seberang gudang.',
    columns: 1, rows: 2, width: 190, height: 135, layout: 'board',
  },
];

export const perSheet = (f: SheetFormat): number => f.columns * f.rows;
export const sheetCount = (labels: number, f: SheetFormat): number =>
  Math.ceil(labels / perSheet(f)) || 0;

/**
 * The size that suits a selection, used to move the default rather than to lock it. All racks
 * → a shelf-sized label; all individually-tagged tools → a keyring tag; anything mixed keeps
 * the general-purpose size. Wrong once is a dropdown away; wrong every time is a wasted sheet.
 */
export function suggestFormat(labels: readonly LabelSpec[]): SheetFormat {
  const general = SHEET_FORMATS.find((f) => f.id === 'rak')!;
  if (labels.length === 0) return general;
  if (labels.every((l) => l.kind === 'rack')) return SHEET_FORMATS.find((f) => f.id === 'jumbo')!;
  if (labels.every((l) => l.kind === 'asset')) return SHEET_FORMATS.find((f) => f.id === 'gantungan')!;
  return general;
}
