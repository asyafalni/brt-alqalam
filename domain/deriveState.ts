// BRT Inventaris — the derivation reducer. The heart of the system.
// Pure function: no I/O, no framework. Identical on client and gateway.
// Invariant: current stock/status is DERIVED from the append-only log, never stored.

import type {
  Item, AssetInstance, Txn, DerivedInstance, DerivedItem, DerivedState,
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
): DerivedState {
  const T = activeTxns(txns);

  const qty: Record<string, number> = {};
  const outstanding: Record<string, { ts: number; qty: number }[]> = {};
  items.forEach((i) => { qty[i.itemId] = i.initialStock; outstanding[i.itemId] = []; });

  const inst: Record<string, DerivedInstance> = {};
  instances.forEach((a) => { inst[a.assetId] = { instance: a, status: 'available' }; });

  for (const t of T) {
    // --- equipment instance lifecycle ---
    if (t.assetId && inst[t.assetId]) {
      const di = inst[t.assetId];
      if (t.type === 'peminjaman') {
        di.status = 'out'; di.holder = t.recipient; di.since = t.ts;
      } else if (t.type === 'pengembalian') {
        if (t.condition === 'rusak') { di.status = 'broken'; di.holder = undefined; di.since = undefined; }
        else if (t.condition === 'hilang') { di.status = 'lost'; di.since = undefined; } // keep holder for "hilang oleh"
        else { di.status = 'available'; di.holder = undefined; di.since = undefined; }
      } else if (t.type === 'status_change') {
        if (t.toStatus) { di.status = t.toStatus; if (t.toStatus === 'available') { di.holder = undefined; di.since = undefined; } }
        else if (t.condition === 'normal') di.status = 'available';
        else if (t.condition === 'rusak') di.status = 'broken';
        else if (t.condition === 'hilang') di.status = 'lost';
        else di.status = 'retired';
      }
    }
    // --- quantity items (consumables + quantity-tracked) ---
    if (t.itemId && qty[t.itemId] !== undefined) {
      switch (t.type) {
        case 'pemakaian':   qty[t.itemId] += t.qtyDelta; break;                 // delta < 0, permanent
        case 'pengambilan': qty[t.itemId] += t.qtyDelta;                        // delta < 0, may return
                            outstanding[t.itemId].push({ ts: t.ts, qty: -t.qtyDelta }); break;
        case 'pengembalian': qty[t.itemId] += t.qtyDelta; break;               // delta > 0, restock
        case 'adjust':       qty[t.itemId] += t.qtyDelta; break;               // admin correction
      }
    }
  }

  // 24-jam rule: an outstanding *pengambilan* of a consumable is only "awaiting return"
  // for 24h. Stock was already decremented at take-time (conservative); if not returned
  // within the window it stays consumed — nothing to undo, no cron. The window only affects
  // the `outstanding` figure we surface for reconciliation.
  const derivedItems: Record<string, DerivedItem> = {};
  items.forEach((i) => {
    const q = qty[i.itemId];
    const pend = outstanding[i.itemId]
      .filter((o) => now - o.ts <= DAY_MS)
      .reduce((s, o) => s + o.qty, 0);
    const status = q <= 0 ? 'out' : (i.minStock != null && q <= i.minStock ? 'low' : 'available');
    derivedItems[i.itemId] = { item: i, qty: q, status, outstanding: pend };
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
