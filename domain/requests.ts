// Pengajuan — asking for money to be spent, on one of two things.
//
// **BELI**: something the masjid does not have. **PERBAIKAN**: something it has, broken.
//
// One screen and one tab for both, because they are the same act from the takmir's side —
// somebody is asking for a decision about spending — and splitting them would mean two lists to
// check, two badges to notice, and a standing question about which one a thing belongs on. What
// differs between them is what the request POINTS AT and what happens when it is done, and both
// of those are handled by the `type` field rather than by a second screen.
//
// WHY A BUY IS NOT AN ITEM. A request is a thing somebody WANTS; an item is a thing the masjid
// OWNS. Modelling the first as a zero-quantity second would put things on the stock list that
// are not in the gudang, which is precisely the confusion §0 says the register exists to end —
// "nobody knows what we own" is not improved by a catalog that also contains what we do not.
//
// Pure. No I/O, no framework.

import type { InstanceStatus, Item, StockLine, Txn } from './types';

/**
 * What is being asked for.
 *
 * The two need different words at almost every point on screen — "sudah dibeli" against "sudah
 * diperbaiki", a rack against a bench — but they are the same request underneath, and the words
 * are a rendering concern rather than a modelling one.
 */
export type RequestType = 'beli' | 'perbaikan';

/**
 * Three states, and deliberately not four.
 *
 * An approval step ("disetujui") is the obvious fourth, and it is left out on purpose: every
 * state is a decision somebody has to make and then remember to record, and §0.0's test asks
 * whether a feature removes work or adds it. What the boss asked for is to be told what is
 * needed and to close the loop when it arrives. `selesai` and `ditolak` close it; an approval
 * that is never recorded would leave every request sitting in `diajukan` forever, which is
 * worse than not having the state.
 *
 * `selesai`, not `dibeli`: the same state means "bought" for one type and "repaired" for the
 * other, and a value that names only half of what it represents lies in the sheet where nobody
 * can see the label that would have corrected it.
 */
export type RequestStatus = 'diajukan' | 'selesai' | 'ditolak';

export interface PurchaseRequest {
  requestId: string;
  /** Buy something new, or repair something broken. */
  type: RequestType;
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
  /**
   * The physical unit this request is *about*, when there is one.
   *
   * On a `perbaikan` it is the thing being repaired — "the timbangan" is not repairable,
   * "Timbangan gantung #2" is, and it is that unit whose status has to come back to
   * `available` when the work is done (Part IV: rusak is a repair queue).
   *
   * On a `beli` it is the unit being *replaced*: a lost knife is Part IV's "tandai ganti", and
   * recording which one it was turns the loss log from a list of regrets into a procurement
   * list somebody can close out. It is never the thing that gets the new stock — the new knife
   * is a new unit — only the reason this request exists.
   */
  assetId?: string;
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

/**
 * What a request would cost in total, when a price was given.
 *
 * A repair is quoted as one job, not per unit, so its price IS its total — multiplying a
 * workshop's quote by a quantity would invent money nobody asked for.
 */
export const requestTotal = (r: PurchaseRequest): number | null => {
  if (r.price == null) return null;
  return r.type === 'perbaikan' ? r.price : r.price * r.qty;
};

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
  type?: RequestType;
  name: string; qty: number; unit: string; reason: string; price?: number; url?: string;
  assetId?: string;
}): RequestProblem[] {
  const problems: RequestProblem[] = [];
  const repair = r.type === 'perbaikan';

  if (r.name.trim() === '') problems.push({ field: 'name', message: 'Nama barang belum diisi' });
  if (r.reason.trim() === '') {
    problems.push({
      field: 'reason',
      message: repair ? 'Kerusakannya belum dijelaskan' : 'Alasannya belum diisi',
    });
  }
  // A repair names one unit, so quantity and unit are not its shape — asking for them would be
  // asking a question with no answer ("berapa buah perbaikan?").
  if (!repair) {
    if (r.unit.trim() === '') problems.push({ field: 'unit', message: 'Satuan belum diisi' });
    if (!Number.isFinite(r.qty) || r.qty <= 0) {
      problems.push({ field: 'qty', message: 'Jumlah harus lebih dari 0' });
    }
  }
  if (repair && !r.assetId) {
    problems.push({ field: 'assetId', message: 'Pilih dulu unit mana yang rusak' });
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

/**
 * Finishing a repair puts the unit back on the shelf.
 *
 * This is the whole reason a repair request knows which unit it is about. Marking the request
 * done without returning the asset to `available` would leave it sitting in the repair queue
 * forever — the register would say a thing is broken that is, by then, hanging back on its
 * hook, which is worse than not tracking the repair at all.
 *
 * An appended `status_change`, never an edit: the instance's state is derived from the log
 * (WORKING-AGREEMENT), so a repair is a new fact about the unit rather than a correction of an
 * old one. The break stays in its history, which is what makes "this one keeps breaking"
 * answerable later.
 */
export function repairDone(
  request: PurchaseRequest, actorUserId: string, ts: number, toStatus: InstanceStatus = 'available',
): Txn | null {
  if (request.type !== 'perbaikan' || !request.assetId) return null;
  return {
    txnId: `REP-${request.requestId}`,
    clientTxnId: `repair-${request.requestId}`,
    ts,
    type: 'status_change',
    assetId: request.assetId,
    qtyDelta: 0,
    actorUserId,
    toStatus,
    note: `Selesai diperbaiki (${request.requestId})`,
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
