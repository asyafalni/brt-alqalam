// BRT Inventaris — keterangan inference.
//
// DECISION (session v1.6): the operator NEVER chooses a keterangan. Picking one of the
// spec's words cost a tap and a moment of hesitation on every single item, and three of
// them are near-synonyms in ordinary Indonesian — a volunteer in a hurry will not pick
// correctly, and a KETERANGAN column nobody trusts defeats the reporting goal.
//
// Instead the word is DERIVED from two things the system already knows:
//   1. the item's `kind`  — does this thing come back, or is it used up?
//   2. the direction      — which screen the operator is on (Keluar / Masuk)
// The HISTORI DATA column renders exactly as the spec draws it; the operator just
// scans and types a quantity. Same trick as STOK AWAL / STOK AKHIR (design doc §30).
//
// Pure. No I/O, no framework.

import type { Condition, Direction, Item, MovementType } from './types';

export interface MovementIntent {
  direction: Direction;
  /** Always POSITIVE — the quantity as the operator typed it. Sign is applied here. */
  qty: number;
  /** Only meaningful on `masuk`. Routes the asset into its lifecycle. */
  condition?: Condition;
  /**
   * Exception path only (Q18 fallback). A consumable that is being taken but IS coming
   * back — logs `pengambilan` instead of `pemakaian`, which opens an outstanding
   * reservation the 24-jam rule tracks. Never set on the default zero-tap path.
   */
  returnable?: boolean;
}

export interface PlannedMovement {
  type: MovementType;
  /** Signed, ready for the event log: negative = leaving, positive = coming back, 0 = instance move. */
  qtyDelta: number;
}

/**
 * Turn "what the operator did" into "what the log records".
 *
 * The whole point of this module: the caller supplies a direction and a number, and the
 * keterangan falls out. There is no branch here for the operator to get wrong.
 */
/** Negate without producing `-0`, which would serialise into a Sheet cell as "-0". */
const outgoing = (magnitude: number): number => (magnitude === 0 ? 0 : -magnitude);

export function planMovement(
  item: Pick<Item, 'kind' | 'trackBy'>,
  intent: MovementIntent,
): PlannedMovement {
  // Instance-tracked assets move as identities, not amounts — the qty column is not theirs.
  const magnitude = item.trackBy === 'instance' ? 0 : Math.abs(intent.qty);

  if (intent.direction === 'masuk') {
    // Everything coming back is a pengembalian; `condition` decides where it lands.
    return { type: 'pengembalian', qtyDelta: magnitude };
  }

  if (item.kind === 'equipment') {
    // A durable that leaves is on loan and is expected back.
    return { type: 'peminjaman', qtyDelta: outgoing(magnitude) };
  }

  // A consumable that leaves is gone — unless the operator flagged the exception.
  return { type: intent.returnable ? 'pengambilan' : 'pemakaian', qtyDelta: outgoing(magnitude) };
}

/** Indonesian label for the HISTORI DATA "KETERANGAN" column. */
export function keteranganLabel(type: MovementType, condition?: Condition): string {
  const base: Record<MovementType, string> = {
    pemakaian: 'Pemakaian',
    pengambilan: 'Pengambilan',
    peminjaman: 'Peminjaman',
    digunakan: 'Digunakan',
    pengembalian: 'Pengembalian',
    adjust: 'Penyesuaian stok',
    status_change: 'Ubah status',
    reversal: 'Pembatalan',
  };
  if (type === 'pengembalian' && condition && condition !== 'normal') {
    return `${base[type]} (${condition})`;
  }
  return base[type];
}
