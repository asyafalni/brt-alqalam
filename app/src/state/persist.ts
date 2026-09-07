// Draft persistence for the stock-take.
//
// localStorage, not IndexedDB: a stock-take draft is a few hundred small rows, and the real
// safety net is the CSV export, not the storage engine. IndexedDB is reserved for the Phase-3
// offline transaction queue, where durability under replay actually matters.
//
// Every read is defensive. A half-written or hand-edited value must not white-screen a tablet
// in a gudang — we would rather start empty and say so than crash.

import type { Category, Item, Location, StockLine, Txn } from '../../../domain/types';
import type { PurchaseRequest } from '../../../domain/requests';
import { linesFromLegacy } from '../../../domain/stock';

export interface StoredDraft {
  items: Item[];
  categories: Category[];
  locations: Location[];
  /** How much of each item sits on which rack. Quantity lives here, not on the item. */
  stock: StockLine[];
  /**
   * Local event log. Empty in real use until the gateway exists — the demo data fills it so
   * the borrowed / broken / lost states are visible at all, since every one of them is a
   * *derived* consequence of a transaction and cannot exist without one.
   */
  txns: Txn[];
  /** Things somebody wants bought or repaired. A purchase is not stock until it is finished. */
  requests: PurchaseRequest[];
}

const KEY = 'brt.stocktake.draft.v6';
const KEY_V5 = 'brt.stocktake.draft.v5'; // before purchase requests existed
const KEY_V4 = 'brt.stocktake.draft.v5'; // quantity and one rack still on the item
const KEY_V3 = 'brt.stocktake.draft.v3'; // items + categories + locations, before the log
const KEY_V2 = 'brt.stocktake.draft.v2'; // items + categories, before racks existed
const KEY_V1 = 'brt.stocktake.draft.v1'; // a bare Item[], before categories were editable

const isItem = (v: unknown): v is Item =>
  !!v && typeof v === 'object' && typeof (v as Item).itemId === 'string';

const isCategory = (v: unknown): v is Category =>
  !!v && typeof v === 'object' && typeof (v as Category).categoryId === 'string';

const isLocation = (v: unknown): v is Location =>
  !!v && typeof v === 'object' && typeof (v as Location).locationId === 'string';

const isTxn = (v: unknown): v is Txn =>
  !!v && typeof v === 'object' && typeof (v as Txn).txnId === 'string';

const isRequest = (v: unknown): v is PurchaseRequest =>
  !!v && typeof v === 'object' && typeof (v as PurchaseRequest).requestId === 'string';

/**
 * Requests written before repairs existed, brought forward.
 *
 * Deliberately NOT a key bump. The rest of the draft is unchanged, and a new key means a
 * migration branch that has to copy items, racks, stock and the log correctly just to reword
 * one field — far more that can go wrong than reading the old shape honestly here. Every row
 * written then was a purchase, and `dibeli` was what `selesai` was called, so neither is a
 * guess about what somebody meant.
 */
const normaliseRequest = (r: PurchaseRequest): PurchaseRequest => ({
  ...r,
  type: r.type === 'perbaikan' ? 'perbaikan' : 'beli',
  status: (r.status as string) === 'dibeli' ? 'selesai' : r.status,
});

const isStockLine = (v: unknown): v is StockLine =>
  !!v && typeof v === 'object'
  && typeof (v as StockLine).itemId === 'string'
  && typeof (v as StockLine).initialStock === 'number';

/** An item as it was stored before quantity and placement moved to their own rows. */
type LegacyItem = Item & { initialStock?: number; locationId?: string };

/** The same item with the two migrated fields removed, so nothing reads them by accident. */
function stripLegacy(i: LegacyItem): Item {
  const { initialStock, locationId, ...item } = i;
  void initialStock; void locationId;
  return item;
}

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
  const v6 = readJson(KEY);
  if (v6 && typeof v6 === 'object') {
    const { items, categories, locations, stock, txns, requests } = v6 as Partial<StoredDraft>;
    return {
      items: Array.isArray(items) ? items.filter(isItem) : [],
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: Array.isArray(locations) ? locations.filter(isLocation) : [],
      stock: Array.isArray(stock) ? stock.filter(isStockLine) : [],
      txns: Array.isArray(txns) ? txns.filter(isTxn) : [],
      requests: Array.isArray(requests) ? requests.filter(isRequest).map(normaliseRequest) : [],
    };
  }

  // Before purchase requests existed. Nothing to carry — there simply were none.
  const v5 = readJson(KEY_V5);
  if (v5 && typeof v5 === 'object') {
    const { items, categories, locations, stock, txns } = v5 as Partial<StoredDraft>;
    return {
      items: Array.isArray(items) ? items.filter(isItem) : [],
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: Array.isArray(locations) ? locations.filter(isLocation) : [],
      stock: Array.isArray(stock) ? stock.filter(isStockLine) : [],
      txns: Array.isArray(txns) ? txns.filter(isTxn) : [],
      requests: [],
    };
  }

  // Before quantity could be split across racks. Every item carried one `initialStock` and one
  // `locationId`; each becomes a single stock line. This is the migration that matters most —
  // those two fields ARE somebody's afternoon in the gudang, and dropping them would mean
  // walking it again.
  const v4 = readJson(KEY_V4);
  if (v4 && typeof v4 === 'object') {
    const { items, categories, locations, txns } = v4 as Partial<StoredDraft>;
    const legacy = (Array.isArray(items) ? items.filter(isItem) : []) as LegacyItem[];
    return {
      items: legacy.map(stripLegacy),
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: Array.isArray(locations) ? locations.filter(isLocation) : [],
      stock: linesFromLegacy(legacy),
      txns: Array.isArray(txns) ? txns.filter(isTxn) : [],
      requests: [],
    };
  }

  // Before the log existed. The catalog survives; there simply is no history to carry.
  const v3 = readJson(KEY_V3);
  if (v3 && typeof v3 === 'object') {
    const { items, categories, locations } = v3 as Partial<StoredDraft>;
    const legacy = (Array.isArray(items) ? items.filter(isItem) : []) as LegacyItem[];
    return {
      items: legacy.map(stripLegacy),
      stock: linesFromLegacy(legacy),
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: Array.isArray(locations) ? locations.filter(isLocation) : [],
      txns: [],
      requests: [],
    };
  }

  // Before racks existed. Every item simply starts unplaced, which is honest.
  const v2 = readJson(KEY_V2);
  if (v2 && typeof v2 === 'object') {
    const { items, categories } = v2 as Partial<StoredDraft>;
    const legacy = (Array.isArray(items) ? items.filter(isItem) : []) as LegacyItem[];
    return {
      items: legacy.map(stripLegacy),
      stock: linesFromLegacy(legacy),
      categories: Array.isArray(categories) && categories.some(isCategory)
        ? categories.filter(isCategory)
        : fallbackCategories,
      locations: [],
      txns: [],
      requests: [],
    };
  }

  // Before categories became editable. Keep the walk, not the schema.
  const v1 = readJson(KEY_V1);
  if (Array.isArray(v1)) {
    const legacy = v1.filter(isItem) as LegacyItem[];
    return {
      items: legacy.map(stripLegacy),
      categories: fallbackCategories,
      locations: [],
      stock: linesFromLegacy(legacy),
      txns: [],
      requests: [],
    };
  }

  return {
    items: [], categories: fallbackCategories, locations: [], stock: [], txns: [], requests: [],
  };
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
    localStorage.removeItem(KEY_V5);
    localStorage.removeItem(KEY_V4);
    localStorage.removeItem(KEY_V3);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  } catch { /* nothing to do */ }
}
