import { describe, it, expect } from 'vitest';
import {
  addToStock, openRequests, openTotal, purchaseIntoStock, repairDone, requestTotal, sortRequests,
  validateRequest,
} from './requests';
import type { PurchaseRequest } from './requests';
import type { StockLine } from './types';

const req = (p: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  requestId: 'REQ-0001', type: 'beli', name: 'Sapu ijuk', qty: 2, unit: 'buah',
  reason: 'Yang lama patah', status: 'diajukan',
  requestedBy: 'USR-1', requestedTs: 1_000, ...p,
});

describe('what a request costs', () => {
  it('multiplies the unit price by how many are asked for', () => {
    expect(requestTotal(req({ price: 25_000, qty: 3 }))).toBe(75_000);
  });

  it('says nothing rather than zero when no price was given', () => {
    // "Berapa harganya" is often the thing being asked, and a null is a question where a 0
    // would be an answer.
    expect(requestTotal(req())).toBeNull();
  });
});

describe('openTotal', () => {
  it('adds up only what is still waiting', () => {
    const total = openTotal([
      req({ requestId: 'A', price: 10_000, qty: 2 }),
      req({ requestId: 'B', price: 5_000, qty: 1, status: 'selesai' }),
    ]);
    expect(total).toEqual({ total: 20_000, priced: 1, unpriced: 0 });
  });

  it('leaves unpriced requests out of the sum and counts them separately', () => {
    // A total that treats "we do not know yet" as "free" is a number somebody takes to a
    // takmir meeting and is wrong there.
    const total = openTotal([
      req({ requestId: 'A', price: 10_000, qty: 1 }),
      req({ requestId: 'B' }),
    ]);
    expect(total).toEqual({ total: 10_000, priced: 1, unpriced: 1 });
  });
});

describe('validateRequest', () => {
  const good = { name: 'Sapu', qty: 2, unit: 'buah', reason: 'Yang lama patah' };
  const repair = { type: 'perbaikan' as const, name: 'Mesin potong rumput', qty: 1, unit: '',
    reason: 'Tali starter putus', assetId: 'AST-0007' };

  it('accepts a complete request', () => {
    expect(validateRequest(good)).toEqual([]);
  });

  it('insists on a reason', () => {
    // A request with no reason is a line item somebody has to chase the requester about —
    // more work for two people than typing it cost one.
    expect(validateRequest({ ...good, reason: '  ' }).map((p) => p.field)).toEqual(['reason']);
  });

  it('refuses a quantity of zero, which is not a request', () => {
    expect(validateRequest({ ...good, qty: 0 }).map((p) => p.field)).toEqual(['qty']);
  });

  it('rejects a link that will not open', () => {
    // A dead link is worse than none: somebody follows it and has to come back and ask anyway.
    expect(validateRequest({ ...good, url: 'tokopedia.com/sapu' }).map((p) => p.field)).toEqual(['url']);
    expect(validateRequest({ ...good, url: 'https://tokopedia.com/sapu' })).toEqual([]);
  });

  it('treats a blank link as no link at all', () => {
    expect(validateRequest({ ...good, url: '   ' })).toEqual([]);
  });

  it('does not ask a repair how many or in what unit', () => {
    // "Berapa buah perbaikan?" is a question with no answer. A repair is one job on one unit.
    expect(validateRequest(repair)).toEqual([]);
  });

  it('refuses a repair that does not say which unit is broken', () => {
    // Without it there is nothing to hand back to the shelf when the work is done.
    expect(validateRequest({ ...repair, assetId: undefined }).map((p) => p.field))
      .toEqual(['assetId']);
  });

  it('asks a repair what is broken, in those words', () => {
    expect(validateRequest({ ...repair, reason: ' ' })[0].message)
      .toBe('Kerusakannya belum dijelaskan');
  });
});

describe('what a repair costs', () => {
  it('is the quote itself, not the quote times a quantity', () => {
    // A workshop quotes one job. Multiplying it by a qty invents money nobody asked for.
    expect(requestTotal(req({ type: 'perbaikan', price: 150_000, qty: 3 }))).toBe(150_000);
  });
});

describe('finishing a repair', () => {
  const repair = req({ requestId: 'REQ-9', type: 'perbaikan', assetId: 'AST-0007' });

  it('hands the unit back to the shelf', () => {
    // Marking the request done without this would leave the register saying a thing is broken
    // that is, by then, hanging back on its hook.
    const txn = repairDone(repair, 'USR-1', 5_000);
    expect(txn).toMatchObject({ type: 'status_change', assetId: 'AST-0007', toStatus: 'available' });
  });

  it('appends rather than edits, so the break stays in the history', () => {
    // Which is what makes "this one keeps breaking" answerable later.
    expect(repairDone(repair, 'USR-1', 5_000)?.qtyDelta).toBe(0);
  });

  it('can retire a unit the workshop could not save', () => {
    expect(repairDone(repair, 'USR-1', 5_000, 'retired')?.toStatus).toBe('retired');
  });

  it('has nothing to do for a purchase', () => {
    expect(repairDone(req({ type: 'beli' }), 'USR-1', 5_000)).toBeNull();
  });
});

describe('sortRequests', () => {
  it('puts the newest first — the list is read to see what came in', () => {
    const old = req({ requestId: 'A', requestedTs: 1 });
    const recent = req({ requestId: 'B', requestedTs: 9 });
    expect(sortRequests([old, recent]).map((r) => r.requestId)).toEqual(['B', 'A']);
  });
});

describe('turning a bought request into stock', () => {
  const fallback = { categoryId: 'CAT-K', kind: 'consumable' as const, minStock: null };

  it('adds to the existing item when the request named one', () => {
    // One more catalog row called "Sabun cuci tangan" is exactly the mess the register exists
    // to clear up.
    const out = purchaseIntoStock(req({ itemId: 'ITM-0001', qty: 5 }), 'LOC-A1', fallback);
    expect(out.newItem).toBeUndefined();
    expect(out.add).toEqual({ itemId: 'ITM-0001', locationId: 'LOC-A1', qty: 5 });
  });

  it('creates the item and its first shelf when it is something new', () => {
    const out = purchaseIntoStock(req({ name: 'Sapu ijuk', unit: 'buah', qty: 2 }), 'LOC-A1', fallback);
    expect(out.newItem).toMatchObject({ name: 'Sapu ijuk', unit: 'buah', kind: 'consumable', trackBy: 'quantity' });
    expect(out.add).toEqual({ locationId: 'LOC-A1', qty: 2 });
  });

  it('gives a durable per-unit tracking, as the stock-take would', () => {
    const out = purchaseIntoStock(req(), 'LOC-A1', { ...fallback, kind: 'equipment' });
    expect(out.newItem?.trackBy).toBe('instance');
  });
});

describe('addToStock', () => {
  const lines: StockLine[] = [
    { itemId: 'ITM-1', locationId: 'LOC-A1', initialStock: 4 },
    { itemId: 'ITM-1', locationId: 'LOC-A3', initialStock: 6 },
  ];

  it('adds onto the shelf it was put on, leaving the others alone', () => {
    const after = addToStock(lines, 'ITM-1', 'LOC-A1', 5);
    expect(after.map((l) => l.initialStock)).toEqual([9, 6]);
  });

  it('opens a new shelf when the thing has never been kept there', () => {
    const after = addToStock(lines, 'ITM-1', 'LOC-B2', 3);
    expect(after).toHaveLength(3);
    expect(after[2]).toEqual({ itemId: 'ITM-1', locationId: 'LOC-B2', initialStock: 3 });
  });

  it('never mutates what it was given', () => {
    addToStock(lines, 'ITM-1', 'LOC-A1', 5);
    expect(lines[0].initialStock).toBe(4);
  });
});

describe('openRequests', () => {
  it('is only what is still waiting on somebody', () => {
    const open = openRequests([
      req({ requestId: 'A' }),
      req({ requestId: 'B', status: 'selesai' }),
      req({ requestId: 'C', status: 'ditolak' }),
    ]);
    expect(open.map((r) => r.requestId)).toEqual(['A']);
  });
});
