// Stock-take (opname) — pure logic. No framework, no storage, no DOM.
//
// Phase 1 of the inverted roadmap (design doc §59): both the gudang and the records are a
// mess, so there is no catalog for a checkout flow to stand on. This is the screen that
// builds one — walk the room, add what you find, count it, label it.
//
// The draft IS `domain/Item[]`. Nothing new is invented: what the marbot types is exactly
// what the Items sheet holds, so the export round-trips through the real parser.

import type { AssetInstance, Category, Item, Kind, Location, TrackBy } from '../../../../domain/types';

/** What the operator actually fills in. Everything else is derived. */
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
    initialStock: input.initialStock,
    active: true,
    ...(input.locationId ? { locationId: input.locationId } : {}),
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

const ITEMS_HEADER = 'itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,initialStock,active,locationId';

const cell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toItemsCsv(items: readonly Item[]): string {
  const rows = items.map((i) => [
    i.itemId,
    i.barcode,
    i.name,
    i.categoryId,
    i.kind,
    i.unit,
    i.trackBy,
    i.minStock == null ? '(-)' : String(i.minStock),
    String(i.initialStock),
    i.active ? 'TRUE' : 'FALSE',
    i.locationId ?? '',
  ].map(cell).join(','));
  return [ITEMS_HEADER, ...rows].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Asset instances — DERIVED, not stored.
//
// An instance-tracked durable with initialStock N is exactly N physical units, each
// needing its own QR label. Deriving them from the item means there is no second
// collection to keep in sync: edit the count from 20 to 18 and the last two simply
// stop existing. That is correct during a stock-take, where nothing has a history yet.
// ---------------------------------------------------------------------------

export function instancesFor(item: Item, acquiredTs: number): AssetInstance[] {
  if (item.trackBy !== 'instance') return [];
  return Array.from({ length: Math.max(0, Math.trunc(item.initialStock)) }, (_, n) => ({
    assetId: `${item.barcode}-${String(n + 1).padStart(3, '0')}`,
    itemId: item.itemId,
    label: `${item.name} #${n + 1}`,
    acquiredTs,
    active: true,
  }));
}

const INSTANCES_HEADER = 'assetId,itemId,label,acquiredTs,active';

export function toInstancesCsv(items: readonly Item[], acquiredTs: number): string {
  const rows = items
    .flatMap((i) => instancesFor(i, acquiredTs))
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
export function createLocation(code: string, zone: string, name: string, existing: readonly Location[]): Location {
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
  };
}

const LOCATIONS_HEADER = 'locationId,code,name,zone,order,active';

export function toLocationsCsv(locations: readonly Location[]): string {
  const rows = locations.map((l) =>
    [l.locationId, l.code, l.name, l.zone, String(l.order), l.active ? 'TRUE' : 'FALSE'].map(cell).join(','));
  return [LOCATIONS_HEADER, ...rows].join('\n') + '\n';
}

const CATEGORIES_HEADER = 'categoryId,name,order,active';

export function toCategoriesCsv(categories: readonly Category[]): string {
  const rows = categories.map((c) =>
    [c.categoryId, c.name, String(c.order), c.active ? 'TRUE' : 'FALSE'].map(cell).join(','));
  return [CATEGORIES_HEADER, ...rows].join('\n') + '\n';
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
      initialStock: input.initialStock,
      locationId: input.locationId || undefined,
    });
}

/** Reverse of `createItem` — load an existing row back into the form for editing. */
export function toInput(item: Item): DraftInput {
  return {
    name: item.name, categoryId: item.categoryId, unit: item.unit, kind: item.kind,
    initialStock: item.initialStock, minStock: item.minStock, trackBy: item.trackBy,
    locationId: item.locationId,
  };
}

/** Substring match over name and unit — for finding a row in a long list mid-walk. */
export function filterItems(items: readonly Item[], query: string): Item[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...items];
  return items.filter((i) => `${i.name} ${i.unit}`.toLowerCase().includes(q));
}

/** Progress line for the header — the only number that matters while walking. */
export function summarise(items: readonly Item[]): { count: number; categories: number; units: number } {
  return {
    count: items.length,
    categories: new Set(items.map((i) => i.categoryId)).size,
    units: items.reduce((s, i) => s + i.initialStock, 0),
  };
}

// ---------------------------------------------------------------------------
// Cycle counts — applying what someone actually found on the shelf.
// ---------------------------------------------------------------------------

/**
 * ⚠️ This edits `initialStock`, and that is correct ONLY during the opname phase, where the
 * catalog is still being established and there is no history to preserve.
 *
 * Once the gateway exists, a recount MUST become an appended `adjust` event instead —
 * derive-don't-mutate (WORKING-AGREEMENT). Rewriting a starting figure after transactions
 * exist would silently invalidate every number folded from it. Do not "simplify" this by
 * keeping the mutation.
 */
export function applyCount(items: readonly Item[], counted: ReadonlyMap<string, number>): Item[] {
  return items.map((i) => {
    const found = counted.get(i.itemId);
    return found == null || found === i.initialStock ? i : { ...i, initialStock: found };
  });
}

/** Stamp the rack as checked, so the rotation knows what to offer next. */
export function markCounted(
  locations: readonly Location[],
  locationId: string,
  ts: number,
): Location[] {
  return locations.map((l) => (l.locationId === locationId ? { ...l, lastCountedTs: ts } : l));
}
