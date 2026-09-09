// Stock-take (opname) — pure logic. No framework, no storage, no DOM.
//
// Phase 1 of the inverted roadmap (design doc §59): both the gudang and the records are a
// mess, so there is no catalog for a checkout flow to stand on. This is the screen that
// builds one — walk the room, add what you find, count it, label it.
//
// The draft IS `domain/Item[]`. Nothing new is invented: what the marbot types is exactly
// what the Items sheet holds, so the export round-trips through the real parser.

import type {
  AssetInstance, Category, Item, Kind, Location, StockLine, TrackBy,
} from '../../../../domain/types';
import { linesAt, setLine, totalFor } from '../../../../domain/stock';
import {
  CATEGORY_COLUMNS, ITEM_COLUMNS, LOCATION_COLUMNS, REQUEST_COLUMNS, STOCK_COLUMNS,
  categoryRow, itemRow, locationRow, requestRow, stockRow,
} from '../../../../data/rows';
import type { PurchaseRequest } from '../../../../domain/requests';

/**
 * What the operator actually fills in. Everything else is derived.
 *
 * `initialStock` and `locationId` stay HERE even though they left `Item`: the form is a form,
 * and what it collects is one item plus the first shelf it was found on. Splitting that into
 * two screens would add a step to the flow whose whole budget is ~10 seconds an item.
 */
export interface DraftInput {
  name: string;
  categoryId: string;
  unit: string;
  kind: Kind;
  initialStock: number;
  /** Setting Minimum. `null` = "(-)", i.e. never notify. */
  minStock: number | null;
  /** Optional override; defaults from `kind` (design doc §50). */
  trackBy?: TrackBy;
  /** Which rack it sits on. Blank is allowed — "belum ditempatkan" is a real, visible state. */
  locationId?: string;
  /** Overrides the automatic drawing. Blank means "keep guessing", which is the good default. */
  artId?: string;
}

const PREFIX = 'ITM-';
const pad = (n: number) => String(n).padStart(4, '0');

/**
 * Next free id, continuing from the highest existing one rather than the count — so
 * deleting a row mid-walk can never resurrect an id that was already printed on a label.
 */
export function nextItemId(existing: readonly Item[]): string {
  const highest = existing.reduce((max, i) => {
    const m = /^ITM-(\d+)$/.exec(i.itemId);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return PREFIX + pad(highest + 1);
}

export function createItem(input: DraftInput, existing: readonly Item[]): Item {
  const itemId = nextItemId(existing);
  return {
    itemId,
    barcode: `ALQ-${itemId}`,
    name: input.name.trim(),
    categoryId: input.categoryId,
    kind: input.kind,
    unit: input.unit.trim(),
    trackBy: input.trackBy ?? (input.kind === 'consumable' ? 'quantity' : 'instance'),
    minStock: input.minStock,
    active: true,
    ...(input.artId ? { artId: input.artId } : {}),
  };
}

/** The item plus the shelf it was found on — what one pass of the form actually produces. */
export function createEntry(
  input: DraftInput,
  existing: readonly Item[],
  stock: readonly StockLine[],
): { item: Item; stock: StockLine[] } {
  const item = createItem(input, existing);
  return {
    item,
    stock: setLine(stock, item.itemId, input.locationId ?? '', input.initialStock),
  };
}

export interface DraftProblem { field: keyof DraftInput; message: string }

/** Validation the operator sees, in their language. Blocking only on what truly cannot be fixed later. */
export function validate(input: DraftInput, existing: readonly Item[], editingId?: string): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const name = input.name.trim();

  if (name === '') problems.push({ field: 'name', message: 'Nama barang belum diisi' });
  if (input.categoryId === '') problems.push({ field: 'categoryId', message: 'Kategori belum dipilih' });
  if (input.unit.trim() === '') problems.push({ field: 'unit', message: 'Satuan belum diisi' });

  if (!Number.isFinite(input.initialStock) || input.initialStock < 0) {
    problems.push({ field: 'initialStock', message: 'Jumlah tidak boleh kurang dari 0' });
  }
  if (input.minStock != null && (!Number.isFinite(input.minStock) || input.minStock < 0)) {
    problems.push({ field: 'minStock', message: 'Minimum tidak boleh kurang dari 0' });
  }

  // A warning, not a block: duplicates are real ("Pisau" on two racks) and the marbot
  // decides. Surfacing it beats silently creating a second row nobody reconciles.
  const others = editingId ? existing.filter((i) => i.itemId !== editingId) : existing;
  if (name !== '' && others.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
    problems.push({ field: 'name', message: `"${name}" sudah ada di daftar — tetap tambah?` });
  }
  return problems;
}

/** True blockers only — the duplicate-name warning does not stop a save. */
export const isBlocking = (p: DraftProblem): boolean => !p.message.endsWith('tetap tambah?');

// ---------------------------------------------------------------------------
// Export — must match sheets/Items.csv exactly, because it is imported into that tab.
// ---------------------------------------------------------------------------

const cell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * A CSV built from the shared column list, not from a second copy of it.
 *
 * The header and the cell order come from the SAME array the gateway write path uses
 * (`data/rows.ts`), so a column can no longer be added to one writer and forgotten in the
 * other — which is the drift that produced a silently blank `locationId` on every movement.
 */
function toCsv<T>(
  columns: readonly string[], rows: readonly T[], build: (row: T) => Record<string, string>,
): string {
  const body = rows.map((r) => {
    const obj = build(r);
    return columns.map((c) => cell(obj[c] ?? '')).join(',');
  });
  return [columns.join(','), ...body].join('\n') + '\n';
}

export function toItemsCsv(items: readonly Item[]): string {
  return toCsv(ITEM_COLUMNS, items, itemRow);
}

/** Purchase requests. Not stock: a request is what we WANT, an item is what we OWN. */
export function toRequestsCsv(requests: readonly PurchaseRequest[]): string {
  return toCsv(REQUEST_COLUMNS, requests, requestRow);
}

/** One row per (barang × rak). A blank locationId is the unplaced pile, not a missing value. */
export function toStockCsv(stock: readonly StockLine[]): string {
  return toCsv(STOCK_COLUMNS, stock, stockRow);
}

// ---------------------------------------------------------------------------
// Asset instances — DERIVED, not stored.
//
// An instance-tracked durable with N units is exactly N physical things, each needing its own
// QR label. Deriving them means there is no second collection to keep in sync: edit the count
// from 20 to 18 and the last two simply stop existing. That is correct during a stock-take,
// where nothing has a history yet.
//
// The count is the item's TOTAL across every rack, not one shelf's worth: a knife is one
// numbered knife wherever it is currently kept, and re-shelving it must not renumber it.
// ---------------------------------------------------------------------------

export function instancesFor(item: Item, acquiredTs: number, count: number): AssetInstance[] {
  if (item.trackBy !== 'instance') return [];
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, n) => ({
    assetId: `${item.barcode}-${String(n + 1).padStart(3, '0')}`,
    itemId: item.itemId,
    label: `${item.name} #${n + 1}`,
    acquiredTs,
    active: true,
  }));
}

/**
 * The inverse of `instancesFor`: which item a printed unit id belongs to, and which unit it is.
 *
 * Kept RIGHT HERE, beside the function that mints these ids, so the two cannot drift apart —
 * an id scheme with its parser in another file is an id scheme that gets changed in one place.
 *
 * Resolved by BARCODE PREFIX rather than by looking the unit up in the live instance list, and
 * that is the whole point: instances are derived from the count, so a knife that was lost no
 * longer HAS an instance — and the history rows about lost knives are exactly the ones somebody
 * needs to read. A lookup would leave precisely those unnamed.
 */
export function assetOwner(
  assetId: string, items: readonly Item[],
): { item: Item; unit: number } | null {
  const cut = assetId.lastIndexOf('-');
  if (cut < 1) return null;
  const barcode = assetId.slice(0, cut);
  const unit = Number(assetId.slice(cut + 1));
  const item = items.find((i) => i.barcode === barcode);
  if (!item || !Number.isFinite(unit)) return null;
  return { item, unit };
}

const INSTANCES_HEADER = 'assetId,itemId,label,acquiredTs,active';

export function toInstancesCsv(
  items: readonly Item[], acquiredTs: number, stock: readonly StockLine[],
): string {
  const rows = items
    .flatMap((i) => instancesFor(i, acquiredTs, totalFor(stock, i.itemId)))
    .map((a) => [a.assetId, a.itemId, a.label, new Date(a.acquiredTs).toISOString(), a.active ? 'TRUE' : 'FALSE']
      .map(cell).join(','));
  return [INSTANCES_HEADER, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Categories — free-form and editable (design doc Part XI). Nothing behavioural
// hangs off them; `kind` on the item carries all the meaning.
// ---------------------------------------------------------------------------

const slug = (name: string): string =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);

export function createCategory(name: string, existing: readonly Category[]): Category {
  const base = `CAT-${slug(name) || 'LAIN'}`;
  let categoryId = base;
  for (let n = 2; existing.some((c) => c.categoryId === categoryId); n += 1) categoryId = `${base}-${n}`;
  return {
    categoryId,
    name: name.trim(),
    order: existing.reduce((m, c) => Math.max(m, c.order), 0) + 1,
    active: true,
  };
}

// Racks — one durable QR per rack or bin (design doc §14.2), never one per bar of soap.
export function createLocation(
  code: string, zone: string, name: string, existing: readonly Location[], artId?: string,
): Location {
  const base = `LOC-${slug(code) || 'RAK'}`;
  let locationId = base;
  for (let n = 2; existing.some((l) => l.locationId === locationId); n += 1) locationId = `${base}-${n}`;
  return {
    locationId,
    code: code.trim(),
    name: name.trim(),
    zone: zone.trim() || 'Gudang',
    order: existing.filter((l) => l.zone === (zone.trim() || 'Gudang')).length + 1,
    active: true,
    ...(artId ? { artId } : {}),
  };
}

/* -------------------------------------------------------------------------------------------
   Editing and retiring a rack.

   THE RULE THAT SHAPES ALL OF THIS: `locationId` is immutable, and every edit below preserves
   it. It is what the printed QR encodes (`features/labels/labels.ts`), so it is not really a
   database key — it is a physical fact stuck to a shelf with adhesive. Regenerating it from a
   corrected `code` would be the natural-looking thing to do and would silently kill every
   sticker already in the gudang.

   The happy consequence, worth surfacing in the UI rather than hiding: because the id never
   moves, a rack CAN be freely renamed, relabelled and moved between zones without invalidating
   anything already printed. Fixing a typo is cheap. That is the whole reason the id is opaque.
------------------------------------------------------------------------------------------- */

/** Fields a person may change about a rack. Deliberately not `locationId`, and not `order`. */
export interface LocationEdit {
  code: string;
  name: string;
  zone: string;
  /** What kind of storage it is. Blank means "read it from the name", which is the default. */
  artId?: string;
}

export function editLocation(
  locations: readonly Location[],
  locationId: string,
  edit: LocationEdit,
): Location[] {
  return locations.map((l) => (l.locationId === locationId
    ? {
      ...l,
      code: edit.code.trim() || l.code,
      name: edit.name.trim(),
      // Same default as `createLocation`, so a rack cannot be edited into a nameless zone that
      // then sorts on its own at the bottom of the board.
      zone: edit.zone.trim() || 'Gudang',
      ...(edit.artId ? { artId: edit.artId } : { artId: undefined }),
    }
    : l));
}

/**
 * Why removal has two verbs.
 *
 * ARCHIVE (`active: false`) is the honest answer almost every time. A shelf that was
 * dismantled still appears in months of history and on labels that may still be stuck to
 * things; erasing it would rewrite the past and orphan the references. Archiving keeps the
 * record and takes the rack off the board.
 *
 * DELETE erases it, and is allowed only for a rack that never became real: nothing stored on
 * it, and never counted. That is the "I typed it twice" case, and refusing to clean it up
 * leaves permanent litter on the board — which is its own kind of dishonesty about the room.
 */
export type RemovalBlock =
  | { kind: 'holds-items'; count: number; names: string[] }
  | { kind: 'has-history' };

/** `null` when the rack can be archived. */
export function blocksArchive(
  locationId: string,
  items: readonly Item[],
  stock: readonly StockLine[],
): RemovalBlock | null {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const held = linesAt(stock, locationId)
    .map((l) => byId.get(l.itemId))
    .filter((i): i is Item => i != null);
  if (held.length === 0) return null;
  // Named, not just counted: "3 barang" tells somebody they are stuck; naming them tells them
  // what to go and move.
  return { kind: 'holds-items', count: held.length, names: held.slice(0, 3).map((i) => i.name) };
}

/** `null` when the rack can be deleted outright. Stricter than archiving, never looser. */
export function blocksDelete(
  location: Location,
  items: readonly Item[],
  stock: readonly StockLine[],
): RemovalBlock | null {
  return blocksArchive(location.locationId, items, stock)
    ?? (location.lastCountedTs == null ? null : { kind: 'has-history' });
}

/* -------------------------------------------------------------------------------------------
   Zones.

   A zone is a LABEL, not an entity: it is a string on each rack, and the list of zones is
   derived by grouping. That is deliberate and it stays — a Zones tab, its own ids and its own
   admin screen would be real recurring work to maintain for what is, at this masjid, about
   four names (§0.0: does this remove work, or add it?).

   The cost of a label is that nothing keeps two spellings apart, so "Gudang Utama" and "gudang
   utama" become two zones and the board quietly splits in half. These two functions are what
   pay that cost off: the picker offers what already exists, and renaming moves every rack at
   once instead of asking somebody to edit fourteen of them by hand.
------------------------------------------------------------------------------------------- */

/** Every zone in use, in board order. What the picker offers instead of a blank text field. */
export function zonesOf(locations: readonly Location[]): string[] {
  const seen: string[] = [];
  for (const l of locations) if (!seen.includes(l.zone)) seen.push(l.zone);
  return seen;
}

/**
 * Rename a zone, carrying every rack in it.
 *
 * Renaming ONTO an existing zone merges the two, and that is the answer to "can a zone be
 * removed?" — it cannot exist without racks, so emptying it *is* removing it. There is no
 * separate delete, because a delete would have to either orphan the racks or refuse, and
 * "move them somewhere" is what the person actually meant either way.
 */
export function renameZone(
  locations: readonly Location[], from: string, to: string,
): Location[] {
  const target = to.trim() || 'Gudang';
  if (target === from) return [...locations];
  return locations.map((l) => (l.zone === from ? { ...l, zone: target } : l));
}

/** How many racks a rename would move — the number that makes it feel consequential. */
export const racksInZone = (locations: readonly Location[], zone: string): number =>
  locations.filter((l) => l.zone === zone).length;

export function archiveLocation(locations: readonly Location[], locationId: string): Location[] {
  return locations.map((l) => (l.locationId === locationId ? { ...l, active: false } : l));
}

export function restoreLocation(locations: readonly Location[], locationId: string): Location[] {
  return locations.map((l) => (l.locationId === locationId ? { ...l, active: true } : l));
}

export function deleteLocation(locations: readonly Location[], locationId: string): Location[] {
  return locations.filter((l) => l.locationId !== locationId);
}

export function toLocationsCsv(locations: readonly Location[]): string {
  return toCsv(LOCATION_COLUMNS, locations, locationRow);
}

export function toCategoriesCsv(categories: readonly Category[]): string {
  return toCsv(CATEGORY_COLUMNS, categories, categoryRow);
}

// ---------------------------------------------------------------------------
// Editing — a mistyped row mid-walk must be fixable in place. Re-adding would
// burn an id that may already be printed on a label.
// ---------------------------------------------------------------------------

export function updateItem(items: readonly Item[], itemId: string, input: DraftInput): Item[] {
  return items.map((i) =>
    i.itemId !== itemId ? i : {
      ...i,
      name: input.name.trim(),
      categoryId: input.categoryId,
      kind: input.kind,
      unit: input.unit.trim(),
      trackBy: input.trackBy ?? (input.kind === 'consumable' ? 'quantity' : 'instance'),
      minStock: input.minStock,
      ...(input.artId ? { artId: input.artId } : {}),
    });
}

/**
 * Editing a row edits ONE shelf of it — the one the form was opened on.
 *
 * `was` is where the line started, so moving a thing from A1 to A3 clears A1 rather than
 * leaving a ghost quantity behind on a shelf the operator just emptied.
 */
export function updateEntry(
  items: readonly Item[],
  stock: readonly StockLine[],
  itemId: string,
  input: DraftInput,
  was: string,
): { items: Item[]; stock: StockLine[] } {
  const at = input.locationId ?? '';
  const moved = at === was
    ? stock
    : stock.filter((l) => !(l.itemId === itemId && l.locationId === was));
  return {
    items: updateItem(items, itemId, input),
    stock: setLine(moved, itemId, at, input.initialStock),
  };
}

/**
 * Reverse of `createItem` — load an existing row back into the form.
 *
 * `locationId` picks WHICH shelf is being edited; without it the form would show one rack's
 * quantity and save it over another's.
 */
export function toInput(
  item: Item, stock: readonly StockLine[], locationId = '',
): DraftInput {
  const line = stock.find((l) => l.itemId === item.itemId && l.locationId === locationId);
  return {
    name: item.name, categoryId: item.categoryId, unit: item.unit, kind: item.kind,
    initialStock: line?.initialStock ?? 0, minStock: item.minStock, trackBy: item.trackBy,
    locationId, artId: item.artId,
  };
}

/** Substring match over name and unit — for finding a row in a long list mid-walk. */
export function filterItems(items: readonly Item[], query: string): Item[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...items];
  return items.filter((i) => `${i.name} ${i.unit}`.toLowerCase().includes(q));
}

/** Progress line for the header — the only number that matters while walking. */
export function summarise(
  items: readonly Item[], stock: readonly StockLine[],
): { count: number; categories: number; units: number } {
  return {
    count: items.length,
    categories: new Set(items.map((i) => i.categoryId)).size,
    // Every shelf of every item — the walk's running total, not one rack's.
    units: stock.reduce((s, l) => s + l.initialStock, 0),
  };
}

// ---------------------------------------------------------------------------
// Cycle counts — applying what someone actually found on the shelf.
// ---------------------------------------------------------------------------

/**
 * ⚠️ This edits opening quantities, and that is correct ONLY during the opname phase, where the
 * catalog is still being established and there is no history to preserve.
 *
 * Once the gateway exists, a recount MUST become an appended `adjust` event instead —
 * derive-don't-mutate (WORKING-AGREEMENT). Rewriting a starting figure after transactions
 * exist would silently invalidate every number folded from it. Do not "simplify" this by
 * keeping the mutation.
 *
 * IT WRITES TO ONE RACK, and that is the entire reason quantity left the item. Counting A1 used
 * to overwrite the item's whole figure, so whatever sat on A3 vanished from the register the
 * moment somebody did the right thing and counted a shelf.
 */
export function applyCount(
  stock: readonly StockLine[], locationId: string, counted: ReadonlyMap<string, number>,
): StockLine[] {
  let next = [...stock];
  for (const [itemId, found] of counted) {
    if (lineAtHas(next, itemId, locationId, found)) continue;
    next = setLine(next, itemId, locationId, found);
  }
  return next;
}

const lineAtHas = (
  stock: readonly StockLine[], itemId: string, locationId: string, qty: number,
): boolean => stock.some(
  (l) => l.itemId === itemId && l.locationId === locationId && l.initialStock === qty,
);

/** Stamp the rack as checked, so the rotation knows what to offer next. */
export function markCounted(
  locations: readonly Location[],
  locationId: string,
  ts: number,
): Location[] {
  return locations.map((l) => (l.locationId === locationId ? { ...l, lastCountedTs: ts } : l));
}
