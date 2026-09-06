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

export interface Item {
  itemId: string; barcode: string; name: string;
  categoryId: string; kind: Kind; unit: string; trackBy: TrackBy; // trackBy defaults from kind (consumable->quantity, equipment->instance), overridable
  minStock: number | null; initialStock: number; active: boolean; // minStock null = Setting Minimum "(-)" → no low-stock notification
  /**
   * The keterangan this item normally moves under — the spec's per-row KETERANGAN column on
   * MENU STOK. NOTIFIKASI STOK sources its own KETERANGAN column from here, not from the
   * transaction that breached the minimum (which corrects the reading in §37.2).
   */
  keterangan?: MovementType;
  /** Optional: a catalog built before locations existed has none, and that is a real state
   *  worth seeing — "belum ditempatkan" is exactly the mess we are trying to surface. */
  locationId?: string;
}

export interface AssetInstance {
  assetId: string; itemId: string; label: string; acquiredTs: number; active: boolean;
}

// Append-only event. qtyDelta is SIGNED: -2 = ambil 2, +2 = kembali/restock, 0 for instance moves.
export interface Txn {
  txnId: string; clientTxnId: string; ts: number; type: MovementType;
  itemId?: string; assetId?: string; qtyDelta: number;
  recipient?: string; actorUserId: string; condition?: Condition;
  note?: string; reversesTxnId?: string; toStatus?: InstanceStatus; // toStatus: explicit target for an admin status_change
}

export interface DerivedItem {
  item: Item; qty: number; status: 'available' | 'low' | 'out'; outstanding: number;
  /**
   * Everything ever taken out of this item, as a positive running total — the spec's
   * PENGAMBILAN counter on MENU STOK, which HISTORI DATA's AMBIL column is sourced from.
   * Derived like everything else; nothing counts it up in storage.
   */
  takenTotal: number;
}
export interface DerivedInstance {
  instance: AssetInstance; status: InstanceStatus; holder?: string; since?: number;
}
export interface DerivedState {
  items: Record<string, DerivedItem>;
  instances: Record<string, DerivedInstance>;
  lowStock: DerivedItem[];
  rusak: DerivedInstance[];
  hilang: DerivedInstance[];
  outByHolder: Record<string, DerivedInstance[]>;
}
