import { describe, it, expect } from 'vitest';
import { deriveState } from '../../../domain/deriveState';
import { demoDraft } from './demo';
import { instancesFor } from '../features/stocktake/draft';
import { racksFor, totalFor } from '../../../domain/stock';

describe('demo data is internally consistent', () => {
  const draft = demoDraft();
  const instances = draft.items.flatMap((i) => instancesFor(i, 0, totalFor(draft.stock, i.itemId)));
  const derived = deriveState(draft.items, instances, draft.txns, Date.now(), draft.stock);

  it('never consumes an item past zero — negative stock reads as a broken app', () => {
    const negative = Object.values(derived.items).filter((d) => d.qty < 0);
    expect(negative.map((d) => `${d.item.name}: ${d.qty}`)).toEqual([]);
  });

  it('every transaction points at something that exists', () => {
    const itemIds = new Set(draft.items.map((i) => i.itemId));
    const assetIds = new Set(instances.map((a) => a.assetId));
    for (const t of draft.txns) {
      if (t.itemId) expect(itemIds.has(t.itemId), `unknown itemId ${t.itemId}`).toBe(true);
      if (t.assetId) expect(assetIds.has(t.assetId), `unknown assetId ${t.assetId}`).toBe(true);
    }
  });

  it('every stock line sits on a rack that exists, or deliberately on none', () => {
    const known = new Set(draft.locations.map((l) => l.locationId));
    for (const l of draft.stock) {
      if (l.locationId) expect(known.has(l.locationId), `unknown rack ${l.locationId}`).toBe(true);
    }
    // The pile in the corner is intentional — it is what the rack map exists to surface.
    expect(draft.stock.some((l) => !l.locationId)).toBe(true);
  });

  it('shows one item kept on two racks, because that is now a normal shape', () => {
    // A demo that never splits an item would leave the case this whole model exists for
    // untested by eye.
    const split = draft.items.find((i) => racksFor(draft.stock, i.itemId).length > 1);
    expect(split, 'no item is kept on two racks').toBeTruthy();
    expect(derived.items[split!.itemId].qty)
      .toBe(totalFor(draft.stock, split!.itemId)
        + draft.txns.filter((t) => t.itemId === split!.itemId).reduce((n, t) => n + t.qtyDelta, 0));
  });

  it('every movement names the rack it came off', () => {
    // A movement with no rack folds onto the unplaced pile, which would show the demo running
    // a shelf negative that nobody keeps anything on.
    for (const t of draft.txns) {
      if (t.itemId && t.qtyDelta !== 0) {
        expect(t.locationId, `${t.txnId} has no rack`).toBeTruthy();
      }
    }
  });

  it('shows off every status, so nothing in the design is invisible', () => {
    const itemStatuses = new Set(Object.values(derived.items).map((d) => d.status));
    expect(itemStatuses).toContain('available');
    expect(itemStatuses).toContain('low');
    expect(itemStatuses).toContain('out');

    const assetStatuses = new Set(Object.values(derived.instances).map((d) => d.status));
    for (const s of ['available', 'out', 'broken', 'lost']) expect(assetStatuses).toContain(s);
  });

  it('the log runs forwards in time', () => {
    const ts = draft.txns.map((t) => t.ts);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });
});
