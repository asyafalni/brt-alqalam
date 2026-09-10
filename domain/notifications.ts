// BRT Inventaris — Notifikasi Stok (rev spec, MENU ADMIN).
// Derived projection: no new storage. For each quantity item currently at/below its
// Setting Minimum (minStock), report the breach timestamp = the transaction that pushed
// it there, plus current stock, the threshold, and the keterangan that caused it.

import type { Item, StockLine, Txn } from './types';
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

/*
 * `peminjaman` included — it was missing, and the alarm inherited the same bug the reducer had:
 * a quantity-tracked durable could be borrowed down past its minimum without anything noticing,
 * because the word was written for instance-tracked units that carry "out" as a status.
 */
const QTY_TYPES = new Set([
  'pemakaian', 'pengambilan', 'peminjaman', 'pengembalian', 'digunakan', 'adjust',
]);

export function deriveNotifications(
  items: Item[], txns: Txn[], now: number, stock: readonly StockLine[] = [],
): StockNotification[] {
  const T = activeTxns(txns);
  const out: StockNotification[] = [];

  for (const item of items) {
    if (item.trackBy !== 'quantity') continue; // notifikasi stok is for stock (quantity) items
    const min = item.minStock;
    if (min == null) continue; // Setting Minimum "(-)" → no notification for this item

    // The alarm is about the item as a whole, so the replay starts from the sum of every
    // rack's opening line — a thing that is low is low wherever it happens to be shelved.
    let qty = stock
      .filter((l) => l.itemId === item.itemId)
      .reduce((n, l) => n + l.initialStock, 0);
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

  /*
   * WHAT TO BUY FIRST, in the order somebody would actually walk a shop.
   *
   * It used to sort by breach time, which answers "what went short longest ago" — a fact about
   * the past, and the wrong one to lead a shopping list with. Something at ZERO is a shelf
   * people are already reaching into and finding empty; something merely low is not yet.
   *
   * Then by the highest minimum. That number is this masjid's own statement of how much of a
   * thing it needs on hand, so among two empty shelves the one we normally keep ten of matters
   * more than the one we keep three of — the shortfall is bigger and so is the disruption.
   *
   * Breach time survives as the third key, and the name as a fourth, so the order is stable:
   * a list that reshuffles between renders is a list nobody can point at.
   */
  return out.sort((a, b) => (
    Number(a.stokAkhir > 0) - Number(b.stokAkhir > 0)
    || b.setMin - a.setMin
    || a.ts - b.ts
    || a.name.localeCompare(b.name)
  ));
}
