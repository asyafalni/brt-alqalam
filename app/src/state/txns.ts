import type { Txn } from '../../../domain/types';

/**
 * The register's log, plus anything this device appended since the last read.
 *
 * TWO reasons this is a function and not a spread at the call site.
 *
 * 1. IT MUST DEDUPE. A row appended here is shown immediately, and then arrives AGAIN a minute
 *    later in the poll — same `clientTxnId`, and by then the same gateway-assigned `txnId`.
 *    `deriveState` folds by `clientTxnId` and so was never fooled, which is exactly why this
 *    went unnoticed: the stock numbers stayed right while Histori Data listed the movement
 *    twice, counted it twice in "Catatan tersimpan", and computed its STOK AWAL/AKHIR snapshots
 *    through a withdrawal that happened once but folded twice.
 *
 * 2. IT MUST BE STABLE. Spread inline, the array was a new identity on every render, so
 *    `useInventory`'s memo never hit and the whole event log was re-folded on every keystroke.
 *    Memoise the call and the fold happens when the log changes, which is what it is for.
 *
 * The register wins on a clash: it is the sheet, and the local copy is a courtesy.
 */
export function mergeTxns(register: readonly Txn[], fresh: readonly Txn[]): Txn[] {
  if (fresh.length === 0) return register as Txn[];
  const known = new Set(register.map((t) => t.clientTxnId));
  const extra = fresh.filter((t) => !known.has(t.clientTxnId));
  return extra.length === 0 ? register as Txn[] : [...register, ...extra];
}

/**
 * The ones still worth keeping — everything the register has not caught up with yet.
 *
 * Without this the local list grows for as long as the tablet stays open, and every row in it
 * is compared against the register on every merge. A gudang kiosk is open all day.
 */
export function unsettled(register: readonly Txn[], fresh: readonly Txn[]): Txn[] {
  if (fresh.length === 0) return fresh as Txn[];
  const known = new Set(register.map((t) => t.clientTxnId));
  const keep = fresh.filter((t) => !known.has(t.clientTxnId));
  return keep.length === fresh.length ? fresh as Txn[] : keep;
}
