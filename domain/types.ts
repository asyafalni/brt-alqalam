// BRT Inventaris — domain types. Source of truth for the data model.
// Mirrors docs/BRT-Inventory-Build-Spec.md §3. Keep this file framework-free.

// Category is free-form, admin-editable data (MENU ADMIN -> Edit Menu Utama) — NOT a fixed enum.
// Kind is the per-item behaviour flag, shown to users in plain language:
//   consumable = "Bisa habis (dihitung)"  — quantity, depletes (e.g. sabun)
//   equipment  = "Barang tetap"           — stays, but can aus/rusak/hilang (e.g. pisau)
export type Kind = 'consumable' | 'equipment';
export type TrackBy = 'quantity' | 'instance';
// Keterangan (HISTORI DATA). The spec offers five radios; the operator does not normally pick
// one, because it is inferred from the item's `kind` plus the direction of travel (see
// keterangan.ts). `pengambilan` and `digunakan` remain available as explicit choices.
//
// `digunakan` was deleted in Part XVI and is RESTORED here (Part XVII): the word is the boss's
// and belongs in HISTORI DATA, but its old meaning — a state that recorded no borrower — was
// the thing that undermined "things go missing". It now behaves exactly like `peminjaman`:
// the item is out, and something is out *with someone*.
export type MovementType =
  | 'pemakaian' | 'pengambilan' | 'peminjaman' | 'pengembalian' | 'digunakan'
  | 'adjust' | 'status_change' | 'reversal';

/** Direction of travel, decided by the screen the operator is on, not by a choice they make. */
export type Direction = 'keluar' | 'masuk';
export type Condition = 'normal' | 'rusak' | 'hilang';
// Active asset base = everything except `lost` and `retired` (those leave the count entirely).
export type InstanceStatus = 'available' | 'out' | 'broken' | 'lost' | 'retired';

export interface Category {
  categoryId: string; name: string; order: number; active: boolean;
}

/**
 * Where a thing physically is. A rack, shelf or bin — the unit that gets ONE durable QR
 * (design doc §14.2: a QR per rack, never per bar of soap).
 *
 * This is what makes a messy gudang legible: "we own 12 galon sabun" does not help a marbot
 * who cannot find them; "Rak B3" does. `zone` groups racks into rooms or areas.
 */
export interface Location {
  locationId: string;
  /** What is painted on the shelf — short, and the thing a person actually says. */
  code: string;
  name: string;
  zone: string;
  order: number;
  active: boolean;
  /**
   * When this rack was last physically counted. A one-off opname gives a true register for
   * exactly one day; "messy inventory" is what drift looks like a year later. Counting a slice
   * on a rotation is what keeps it true — and a rack is a two-minute job where the whole
   * gudang never happens.
   */
  lastCountedTs?: number;
}

/**
 * The catalog entry: what a thing IS. Not how much of it there is, and not where.
 *
 * Quantity and placement moved out to `StockLine` when it turned out the same thing routinely
 * sits on more than one rack — see that type for why the split is load-bearing rather than
 * tidy. `minStock` stays here because the alarm is about the item as a whole: nobody wants to
 * be told that sabun is low on A1 while there are twelve of them on A3.
 */
export interface Item {
  itemId: string; barcode: string; name: string;
  categoryId: string; kind: Kind; unit: string; trackBy: TrackBy; // trackBy defaults from kind (consumable->quantity, equipment->instance), overridable
  minStock: number | null; active: boolean; // minStock null = Setting Minimum "(-)" → no low-stock notification
  /**
   * The keterangan this item normally moves under — the spec's per-row KETERANGAN column on
   * MENU STOK. NOTIFIKASI STOK sources its own KETERANGAN column from here, not from the
   * transaction that breached the minimum (which corrects the reading in §37.2).
   */
  keterangan?: MovementType;
  /**
   * Which drawing represents this item, when the automatic guess is wrong.
   *
   * OPAQUE HERE ON PURPOSE. The domain stores this string and never interprets it: the set of
   * drawings is a fact about the UI, and a `domain/` that knows the name of a picture is a
   * `domain/` that has to change when somebody adds one. The app validates it against the
   * drawings it actually has and falls back to the guess when it does not recognise the value,
   * so an old sheet naming a retired drawing degrades to the default instead of breaking.
   */
  artId?: string;
}

/**
 * How much of one item sits on one rack.
 *
 * WHY THIS EXISTS AS ITS OWN THING. The item used to carry `initialStock` and one `locationId`,
 * which quietly assumed each thing lives in exactly one place. It does not — the owner reports
 * that a single item is routinely split across racks — and the assumption did not merely limit
 * the model, it made the cycle count WRONG: counting rack A1 wrote what you found there back
 * over the item's whole quantity, so the stock on A3 silently disappeared from the register.
 * Counting is the one mechanism keeping the numbers honest, so it has to be per rack, which
 * means the quantity has to be per rack too.
 *
 * `locationId` is `''` for stock nobody has placed yet. That is a real, visible state and the
 * one most likely to end in something going missing (§0), so it is a line like any other
 * rather than an absence.
 */
export interface StockLine {
  itemId: string;
  /** `''` = belum ditempatkan. */
  locationId: string;
  /** What the opname counted here. Movements are folded on top of it, never into it. */
  initialStock: number;
}

export interface AssetInstance {
  assetId: string; itemId: string; label: string; acquiredTs: number; active: boolean;
}

// Append-only event. qtyDelta is SIGNED: -2 = ambil 2, +2 = kembali/restock, 0 for instance moves.
export interface Txn {
  txnId: string; clientTxnId: string; ts: number; type: MovementType;
  itemId?: string; assetId?: string; qtyDelta: number;
  /**
   * WHICH RACK the quantity moved on or off. Blank means the unplaced pile.
   *
   * Required in practice for a quantity item once the same thing can sit on two racks: without
   * it a withdrawal has no shelf to come off, and the per-rack numbers are guesses. Optional in
   * the type only so a log written before this existed still parses — such rows fold onto the
   * unplaced line, which is visibly wrong rather than quietly wrong.
   */
  locationId?: string;
  recipient?: string; actorUserId: string; condition?: Condition;
  note?: string; reversesTxnId?: string; toStatus?: InstanceStatus; // toStatus: explicit target for an admin status_change
}

export interface DerivedItem {
  item: Item;
  /** Total across every rack. This is what the minimum is compared against. */
  qty: number;
  /**
   * The same total, split by rack — keyed by `locationId`, with `''` for unplaced stock.
   * A rack count reconciles one of these, never the total.
   */
  byLocation: Record<string, number>;
  status: 'available' | 'low' | 'out'; outstanding: number;
  /**
   * Everything ever taken out of this item, as a positive running total — the spec's
   * PENGAMBILAN counter on MENU STOK, which HISTORI DATA's AMBIL column is sourced from.
   * Derived like everything else; nothing counts it up in storage.
   */
  takenTotal: number;
}
export interface DerivedInstance {
  instance: AssetInstance; status: InstanceStatus; holder?: string;
  /** When it entered `status`. Undefined only for `available`, which has nothing pending. */
  since?: number;
}
export interface DerivedState {
  items: Record<string, DerivedItem>;
  instances: Record<string, DerivedInstance>;
  lowStock: DerivedItem[];
  rusak: DerivedInstance[];
  hilang: DerivedInstance[];
  outByHolder: Record<string, DerivedInstance[]>;
}
