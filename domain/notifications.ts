// BRT Inventaris — Notifikasi Stok (rev spec, MENU ADMIN).
// Derived projection: no new storage. For each quantity item currently at/below its
// Setting Minimum (minStock), report the breach timestamp = the transaction that pushed
// it there, plus current stock, the threshold, and the keterangan that caused it.

import type { Item, Txn } from './types';
import { activeTxns } from './deriveState';

export interface StockNotification {
  itemId: string;
  name: string;
  ts: number;         // HARI/TGL/JAM — when it breached the minimum (or now if it started below)
  stokAkhir: number;  // current stock
  setMin: number;     // Setting Minimum (minStock)
  /**
   * The spec sources this column from the item's own KETERANGAN on MENU STOK — what this thing
   * normally moves under — NOT from the transaction that happened to breach the minimum.
   * (This corrects design doc §37.2, which reasoned the opposite from an incomplete reading.)
   * Falls back to the breaching transaction when the item declares nothing, since an empty
   * column answers nobody's question.
   */
  keterangan: string;
}

const QTY_TYPES = new Set(['pemakaian', 'pengambilan', 'pengembalian', 'digunakan', 'adjust']);

export function deriveNotifications(items: Item[], txns: Txn[], now: number): StockNotification[] {
  const T = activeTxns(txns);
  const out: StockNotification[] = [];

  for (const item of items) {
    if (item.trackBy !== 'quantity') continue; // notifikasi stok is for stock (quantity) items
    const min = item.minStock;
    if (min == null) continue; // Setting Minimum "(-)" → no notification for this item

    let qty = item.initialStock;
    let breachTs: number | null = null;
    let breachKet = '';

    for (const t of T) {
      if (t.itemId !== item.itemId || !QTY_TYPES.has(t.type)) continue;
      const above = qty > min;
      qty += t.qtyDelta;
      if (qty <= min && above) { breachTs = t.ts; breachKet = t.type; } // just crossed down
      else if (qty > min) { breachTs = null; breachKet = ''; }          // recovered above min → reset
    }

    if (qty <= min) {
      out.push({
        itemId: item.itemId, name: item.name,
        ts: breachTs ?? now, stokAkhir: qty, setMin: min,
        keterangan: item.keterangan ?? breachKet,
      });
    }
  }

  return out.sort((a, b) => a.ts - b.ts);
}
