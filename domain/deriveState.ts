// BRT Inventaris — the derivation reducer. The heart of the system.
// Pure function: no I/O, no framework. Identical on client and gateway.
// Invariant: current stock/status is DERIVED from the append-only log, never stored.

import type {
  Item, AssetInstance, StockLine, Txn, DerivedInstance, DerivedItem, DerivedState,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dedupe by clientTxnId (first wins), drop reversed originals + reversal markers, sort by ts. */
export function activeTxns(txns: Txn[]): Txn[] {
  const reversed = new Set<string>();
  for (const t of txns) if (t.type === 'reversal' && t.reversesTxnId) reversed.add(t.reversesTxnId);

  const seen = new Set<string>();
  const out: Txn[] = [];
  for (const t of txns) {
    if (t.clientTxnId) {
      if (seen.has(t.clientTxnId)) continue;
      seen.add(t.clientTxnId);
    }
    if (t.type === 'reversal') continue;      // a reversal's only effect is removing its target
    if (reversed.has(t.txnId)) continue;      // original was reversed → gone
    out.push(t);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Fold events into current state. Pure function of `now`, so time-rules need no cron. */
export function deriveState(
  items: Item[], instances: AssetInstance[], txns: Txn[], now: number,
  stock: readonly StockLine[] = [],
): DerivedState {
  const T = activeTxns(txns);

  // Quantity is folded PER RACK, not per item. The total is a sum taken at the end, which is
  // the only ordering that lets a rack count reconcile one shelf without touching the others.
  const byLocation: Record<string, Record<string, number>> = {};
  const outstanding: Record<string, { ts: number; qty: number }[]> = {};
  // The spec's per-item PENGAMBILAN counter: everything ever taken out, positive.
  const taken: Record<string, number> = {};
  items.forEach((i) => { byLocation[i.itemId] = {}; outstanding[i.itemId] = []; taken[i.itemId] = 0; });
  for (const line of stock) {
    if (!byLocation[line.itemId]) continue;   // a line for an item that no longer exists
    byLocation[line.itemId][line.locationId] =
      (byLocation[line.itemId][line.locationId] ?? 0) + line.initialStock;
  }

  /** A movement with no rack lands on the unplaced pile — visibly wrong, not quietly wrong. */
  const shelf = (itemId: string, t: Txn) => {
    const where = t.locationId ?? '';
    const rows = byLocation[itemId];
    rows[where] ??= 0;
    return where;
  };

  const inst: Record<string, DerivedInstance> = {};
  instances.forEach((a) => { inst[a.assetId] = { instance: a, status: 'available' }; });

  for (const t of T) {
    // --- equipment instance lifecycle ---
    if (t.assetId && inst[t.assetId]) {
      const di = inst[t.assetId];
      // `digunakan` and `peminjaman` are one path on purpose (Part XVII). They are different
      // words for the same physical fact — the thing is not on the shelf and someone has it —
      // and giving "in use" its own borrower-less state is exactly what let things go missing.
      if (t.type === 'peminjaman' || t.type === 'digunakan') {
        di.status = 'out'; di.holder = t.recipient; di.since = t.ts;
      } else if (t.type === 'pengembalian') {
        // `since` means "in this status since", not "borrowed since". A repair queue whose
        // rows cannot say how long they have been waiting is a list, not a queue — and the
        // oldest broken unit is the one the report has to be able to put at the top.
        if (t.condition === 'rusak') { di.status = 'broken'; di.holder = undefined; di.since = t.ts; }
        else if (t.condition === 'hilang') { di.status = 'lost'; di.since = t.ts; } // keep holder for "hilang oleh"
        else { di.status = 'available'; di.holder = undefined; di.since = undefined; }
      } else if (t.type === 'status_change') {
        if (t.toStatus) {
          di.status = t.toStatus;
          if (t.toStatus === 'available') { di.holder = undefined; di.since = undefined; }
          else di.since = t.ts;
        } else if (t.condition === 'normal') { di.status = 'available'; di.since = undefined; }
        else if (t.condition === 'rusak') { di.status = 'broken'; di.since = t.ts; }
        else if (t.condition === 'hilang') { di.status = 'lost'; di.since = t.ts; }
        else di.status = 'retired';
      }
    }
    // --- quantity items (consumables + quantity-tracked) ---
    if (t.itemId && byLocation[t.itemId] !== undefined) {
      const rows = byLocation[t.itemId];
      const at = shelf(t.itemId, t);
      switch (t.type) {
        case 'pemakaian':   rows[at] += t.qtyDelta;                            // delta < 0, permanent
                            taken[t.itemId] += -t.qtyDelta; break;
        /*
         * `peminjaman` BELONGS HERE, and its absence was a real bug with a real report behind
         * it: somebody borrowed an alat pel, the movement was written to the log with
         * `qtyDelta: -1`, and the register went on saying four.
         *
         * The word was built for INSTANCE-tracked equipment, where "out" is a status carried by
         * a numbered unit. A quantity-tracked durable — a mop, a tarpaulin, a cable roll — has
         * no unit to carry it, so its "out" has to be the number. Falling through the switch
         * meant the shelf said four while two were in somebody's hands, which is the confident
         * wrong answer §0 says is worse than no system at all.
         *
         * Like `pengambilan`, not like `pemakaian`: it left and it is expected back.
         */
        case 'peminjaman':
        case 'pengambilan':
        case 'digunakan':   rows[at] += t.qtyDelta;                            // delta < 0, may return
                            taken[t.itemId] += -t.qtyDelta;
                            outstanding[t.itemId].push({ ts: t.ts, qty: -t.qtyDelta }); break;
        case 'pengembalian': rows[at] += t.qtyDelta; break;                    // delta > 0, restock
        case 'adjust':       rows[at] += t.qtyDelta; break;                    // admin correction
      }
    }
  }

  // 24-jam rule: an outstanding *pengambilan* of a consumable is only "awaiting return"
  // for 24h. Stock was already decremented at take-time (conservative); if not returned
  // within the window it stays consumed — nothing to undo, no cron. The window only affects
  // the `outstanding` figure we surface for reconciliation.
  /* Units grouped by their item, so an instance-tracked item's figures come from the unit
     statuses rather than from a quantity nothing ever decrements. */
  const unitsOf: Record<string, DerivedInstance[]> = {};
  Object.values(inst).forEach((d) => { (unitsOf[d.instance.itemId] ??= []).push(d); });

  const derivedItems: Record<string, DerivedItem> = {};
  items.forEach((i) => {
    const rows = byLocation[i.itemId];
    // The minimum is compared against the TOTAL: nobody wants to be told sabun is low on A1
    // while there are twelve of them on A3.
    const shelved = Object.values(rows).reduce((sum, n) => sum + n, 0);

    /* An instance move carries `qtyDelta: 0` — it changes an identity's status, not an amount
       — so the quantity fold above never touches a labelled item. Its two figures come from
       the units instead. Guarded on there BEING units: a caller that folds without instances
       would otherwise see every labelled item drop to zero. */
    const units = i.trackBy === 'instance' ? unitsOf[i.itemId] : undefined;
    const q = units && units.length > 0
      ? units.filter((u) => u.status === 'available').length
      : shelved;
    const owned = units && units.length > 0
      ? units.filter((u) => u.status !== 'lost' && u.status !== 'retired').length
      : shelved;

    const pend = outstanding[i.itemId]
      .filter((o) => now - o.ts <= DAY_MS)
      .reduce((s, o) => s + o.qty, 0);
    const status = q <= 0 ? 'out' : (i.minStock != null && q <= i.minStock ? 'low' : 'available');
    derivedItems[i.itemId] = {
      item: i, qty: q, ownedQty: owned, byLocation: rows, status,
      outstanding: pend, takenTotal: taken[i.itemId],
    };
  });

  const lowStock = Object.values(derivedItems).filter((d) => d.status !== 'available');
  const rusak = Object.values(inst).filter((d) => d.status === 'broken');
  const hilang = Object.values(inst).filter((d) => d.status === 'lost');
  const outByHolder: Record<string, DerivedInstance[]> = {};
  Object.values(inst)
    .filter((d) => d.status === 'out')
    .forEach((d) => { (outByHolder[d.holder ?? '?'] ??= []).push(d); });

  return { items: derivedItems, instances: inst, lowStock, rusak, hilang, outByHolder };
}
