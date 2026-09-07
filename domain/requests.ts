// Pengajuan Pembelian — asking for something the masjid does not have yet.
//
// WHY THIS IS NOT AN ITEM. A request is a thing somebody WANTS; an item is a thing the masjid
// OWNS. Modelling the first as a zero-quantity second would put things on the stock list that
// are not in the gudang, which is precisely the confusion §0 says the register exists to end —
// "nobody knows what we own" is not improved by a catalog that also contains what we do not.
//
// It becomes stock at exactly one moment: when somebody marks it bought. Until then it lives in
// its own tab and its own screen, and the stock list never sees it.
//
// Pure. No I/O, no framework.

import type { Item, StockLine } from './types';

/**
 * Three states, and deliberately not four.
 *
 * An approval step ("disetujui") is the obvious fourth, and it is left out on purpose: every
 * state is a decision somebody has to make and then remember to record, and §0.0's test asks
 * whether a feature removes work or adds it. What the boss asked for is to be told what is
 * needed and to close the loop when it arrives. `dibeli` and `ditolak` close it; an approval
 * that is never recorded would leave every request sitting in `diajukan` forever, which is
 * worse than not having the state.
 */
export type RequestStatus = 'diajukan' | 'dibeli' | 'ditolak';

export interface PurchaseRequest {
  requestId: string;
  /**
   * What is being asked for, in the requester's words. Free text, because the whole point is
   * that it may not be in the catalog — and forcing a catalog pick first would mean creating
   * the item before deciding whether to buy it.
   */
  name: string;
  /**
   * Set when this is a restock of something already owned. Then buying it adds to that item's
   * stock rather than creating a second catalog row with the same name.
   */
  itemId?: string;
  qty: number;
  unit: string;
  /** Estimated price per unit, in rupiah. Optional — "berapa" is often the thing being asked. */
  price?: number;
  /** WHY. The field the whole screen exists for: a number without a reason cannot be judged. */
  reason: string;
  /** Where to buy it — a marketplace link, if there is one. */
  url?: string;
  status: RequestStatus;
  requestedBy: string;
  requestedTs: number;
  /** When it was bought or turned down, and by whom. */
  decidedTs?: number;
  decidedBy?: string;
  /** The admin's word on it — why it was turned down, or what was actually bought instead. */
  note?: string;
}

/** What a request would cost in total, when a price was given. */
export const requestTotal = (r: PurchaseRequest): number | null =>
  (r.price == null ? null : r.price * r.qty);

/** Everything still waiting on somebody. This is the number the admin badge shows. */
export const openRequests = (requests: readonly PurchaseRequest[]): PurchaseRequest[] =>
  requests.filter((r) => r.status === 'diajukan');

/**
 * What the open requests would cost together.
 *
 * Requests with no price are simply left out rather than counted as zero — a total that
 * silently treats "we do not know yet" as "free" is a number that will be taken to a takmir
 * meeting and be wrong there.
 */
export function openTotal(requests: readonly PurchaseRequest[]): { total: number; priced: number; unpriced: number } {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const r of openRequests(requests)) {
    const sum = requestTotal(r);
    if (sum == null) unpriced += 1;
    else { total += sum; priced += 1; }
  }
  return { total, priced, unpriced };
}

/** Newest first: a request list is read to find out what came in since you last looked. */
export const sortRequests = (requests: readonly PurchaseRequest[]): PurchaseRequest[] =>
  [...requests].sort((a, b) => b.requestedTs - a.requestedTs);

export interface RequestProblem { field: keyof PurchaseRequest; message: string }

/**
 * What has to be there before anybody can act on it.
 *
 * The reason is required, and that is the one judgement call in this file. A request with no
 * reason is a line item somebody has to chase the requester about, which costs two people a
 * conversation — more work than typing the reason cost in the first place.
 */
export function validateRequest(r: {
  name: string; qty: number; unit: string; reason: string; price?: number; url?: string;
}): RequestProblem[] {
  const problems: RequestProblem[] = [];
  if (r.name.trim() === '') problems.push({ field: 'name', message: 'Nama barang belum diisi' });
  if (r.reason.trim() === '') problems.push({ field: 'reason', message: 'Alasannya belum diisi' });
  if (r.unit.trim() === '') problems.push({ field: 'unit', message: 'Satuan belum diisi' });
  if (!Number.isFinite(r.qty) || r.qty <= 0) {
    problems.push({ field: 'qty', message: 'Jumlah harus lebih dari 0' });
  }
  if (r.price != null && (!Number.isFinite(r.price) || r.price < 0)) {
    problems.push({ field: 'price', message: 'Harga tidak boleh kurang dari 0' });
  }
  // Checked, not merely accepted: a link that does not open is worse than no link, because
  // somebody follows it and then has to come back and ask anyway.
  if (r.url != null && r.url.trim() !== '' && !/^https?:\/\/\S+$/i.test(r.url.trim())) {
    problems.push({ field: 'url', message: 'Link harus diawali http:// atau https://' });
  }
  return problems;
}

/**
 * Turning a bought request into stock.
 *
 * Two shapes, and the difference matters. A request that names an existing item ADDS to that
 * item's line on the chosen rack — one more catalog row called "Sabun cuci tangan" is exactly
 * the mess this register exists to clear up. A request for something new creates the item and
 * its first line together.
 *
 * Returns the pieces rather than applying them, so the caller writes once and the catalog can
 * never be left half-updated.
 */
export interface Purchased {
  /** Present only when the request was for something not already in the catalog. */
  newItem?: Omit<Item, 'itemId' | 'barcode'>;
  /** How much to add, and where. `locationId` is `''` for the unplaced pile. */
  add: { itemId?: string; locationId: string; qty: number };
}

export function purchaseIntoStock(
  request: PurchaseRequest,
  locationId: string,
  fallback: { categoryId: string; kind: Item['kind']; minStock: number | null },
): Purchased {
  if (request.itemId) {
    return { add: { itemId: request.itemId, locationId, qty: request.qty } };
  }
  return {
    newItem: {
      name: request.name.trim(),
      categoryId: fallback.categoryId,
      kind: fallback.kind,
      unit: request.unit.trim(),
      trackBy: fallback.kind === 'consumable' ? 'quantity' : 'instance',
      minStock: fallback.minStock,
      active: true,
    },
    add: { locationId, qty: request.qty },
  };
}

/** Adds a bought quantity onto an existing (item × rack) line, creating it if it is new. */
export function addToStock(
  stock: readonly StockLine[], itemId: string, locationId: string, qty: number,
): StockLine[] {
  const existing = stock.some((l) => l.itemId === itemId && l.locationId === locationId);
  return existing
    ? stock.map((l) => (l.itemId === itemId && l.locationId === locationId
      ? { ...l, initialStock: l.initialStock + qty }
      : l))
    : [...stock, { itemId, locationId, initialStock: qty }];
}
