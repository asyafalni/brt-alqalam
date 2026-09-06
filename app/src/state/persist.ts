// Draft persistence for the stock-take.
//
// localStorage, not IndexedDB: a stock-take draft is a few hundred small rows, and the real
// safety net is the CSV export, not the storage engine. IndexedDB is reserved for the Phase-3
// offline transaction queue, where durability under replay actually matters.
//
// Every read is defensive. A half-written or hand-edited value must not white-screen a tablet
// in a gudang — we would rather start empty and say so than crash.

import type { Category, Item, Location } from '../../../domain/types';

export interface StoredDraft {
  items: Item[];
  categories: Category[];
  locations: Location[];
}

const KEY = 'brt.stocktake.draft.v3';
const KEY_V2 = 'brt.stocktake.draft.v2'; // items + categories, before racks existed
const KEY_V1 = 'brt.stocktake.draft.v1'; // a bare Item[], before categories were editable

const isItem = (v: unknown): v is Item =>
  !!v && typeof v === 'object' && typeof (v as Item).itemId === 'string';

const isCategory = (v: unknown): v is Category =>
  !!v && typeof v === 'object' && typeof (v as Category).categoryId === 'string';

const isLocation = (v: unknown): v is Location =>
  !!v && typeof v === 'object' && typeof (v as Location).locationId === 'string';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function loadDraft(fallbackCategories: Category[]): StoredDraft {
  // Migrations exist so a half-finished walk survives a schema change. Losing someone's
  // afternoon in the gudang to a version bump would be unforgivable.
  const v3 = readJson(KEY);
  if (v3 && typeof v3 === 'object') {
    const { items, categories, locations } = v3 as Partial<StoredDraft>;
    return {
      items: Array.isArray(items) ? items.filter(isItem) : [],
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: Array.isArray(locations) ? locations.filter(isLocation) : [],
    };
  }

  // Before racks existed. Every item simply starts unplaced, which is honest.
  const v2 = readJson(KEY_V2);
  if (v2 && typeof v2 === 'object') {
    const { items, categories } = v2 as Partial<StoredDraft>;
    return {
      items: Array.isArray(items) ? items.filter(isItem) : [],
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: [],
    };
  }

  // Before categories became editable. Keep the walk, not the schema.
  const v1 = readJson(KEY_V1);
  if (Array.isArray(v1)) return { items: v1.filter(isItem), categories: fallbackCategories, locations: [] };

  return { items: [], categories: fallbackCategories, locations: [] };
}

export function saveDraft(draft: StoredDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Quota or private mode. The draft stays in memory and the export still works.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  } catch { /* nothing to do */ }
}
