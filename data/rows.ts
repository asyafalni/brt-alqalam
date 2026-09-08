// A domain object as one spreadsheet row.
//
// WHY THIS EXISTS. The same five column lists were about to be written twice: once by the CSV
// export in the stock-take, and once by the admin write path that posts objects to the gateway.
// Two lists that must agree is exactly the bug that put `locationId` in `TXN_COLUMNS` and not in
// the row the gateway actually built — every movement landed on the unplaced pile, and every
// screen looked correct. So there is ONE list per tab, here, and both writers consume it.
//
// The keys are the sheet's header, verbatim, because that is what the gateway writes by
// (`writeTab` orders columns from `REQUIRED_TABS`) and what the CSV import expects. `rows.test.ts`
// pins each list to `sheets/*.csv` so a header change fails here rather than in the gudang.

import type { Category, Item, Location, StockLine } from '../domain/types';
import type { PurchaseRequest } from '../domain/requests';

/** `(-)` is the spec's "no minimum, never alarm" (§46), and is NOT the same as zero. */
const minStockCell = (v: number | null | undefined) => (v == null ? '(-)' : String(v));
const bool = (v: boolean) => (v ? 'TRUE' : 'FALSE');
const iso = (ts: number | null | undefined) => (ts == null ? '' : new Date(ts).toISOString());

export const ITEM_COLUMNS = ['itemId', 'barcode', 'name', 'categoryId', 'kind', 'unit',
  'trackBy', 'minStock', 'active', 'keterangan', 'artId'] as const;

export const itemRow = (i: Item): Record<string, string> => ({
  itemId: i.itemId,
  barcode: i.barcode,
  name: i.name,
  categoryId: i.categoryId,
  kind: i.kind,
  unit: i.unit,
  trackBy: i.trackBy,
  minStock: minStockCell(i.minStock),
  active: bool(i.active),
  keterangan: i.keterangan ?? '',
  artId: i.artId ?? '',
});

export const STOCK_COLUMNS = ['itemId', 'locationId', 'initialStock'] as const;

/** A blank `locationId` is the unplaced pile — a real line, not a missing value (§87). */
export const stockRow = (l: StockLine): Record<string, string> => ({
  itemId: l.itemId,
  locationId: l.locationId,
  initialStock: String(l.initialStock),
});

export const CATEGORY_COLUMNS = ['categoryId', 'name', 'order', 'active'] as const;

export const categoryRow = (c: Category): Record<string, string> => ({
  categoryId: c.categoryId,
  name: c.name,
  order: String(c.order),
  active: bool(c.active),
});

export const LOCATION_COLUMNS =
  ['locationId', 'code', 'name', 'zone', 'order', 'active', 'artId'] as const;

export const locationRow = (l: Location): Record<string, string> => ({
  locationId: l.locationId,
  code: l.code,
  name: l.name,
  zone: l.zone,
  order: String(l.order),
  active: bool(l.active),
  artId: l.artId ?? '',
});

export const REQUEST_COLUMNS = ['requestId', 'type', 'name', 'itemId', 'assetId', 'qty', 'unit',
  'price', 'reason', 'url', 'status', 'requestedBy', 'requestedTs', 'decidedBy', 'decidedTs',
  'note'] as const;

export const requestRow = (r: PurchaseRequest): Record<string, string> => ({
  requestId: r.requestId,
  type: r.type,
  name: r.name,
  itemId: r.itemId ?? '',
  assetId: r.assetId ?? '',
  qty: String(r.qty),
  unit: r.unit,
  /* Blank, never "0". An unpriced request is "we do not know yet", and writing zero would make
     it free in the total somebody takes to a takmir meeting (§95). */
  price: r.price == null ? '' : String(r.price),
  reason: r.reason,
  url: r.url ?? '',
  status: r.status,
  requestedBy: r.requestedBy,
  requestedTs: iso(r.requestedTs),
  decidedBy: r.decidedBy ?? '',
  decidedTs: iso(r.decidedTs),
  note: r.note ?? '',
});
