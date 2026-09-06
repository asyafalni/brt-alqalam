// BRT Inventaris — domain types. Source of truth for the data model.
// Mirrors docs/BRT-Inventory-Build-Spec.md §3. Keep this file framework-free.

// Category is free-form, admin-editable data (MENU ADMIN -> Edit Menu Utama) — NOT a fixed enum.
// Kind is the per-item behaviour flag, shown to users in plain language:
//   consumable = "Bisa habis (dihitung)"  — quantity, depletes (e.g. sabun)
//   equipment  = "Barang tetap"           — stays, but can aus/rusak/hilang (e.g. pisau)
export type Kind = 'consumable' | 'equipment';
export type TrackBy = 'quantity' | 'instance';
// Keterangan (HISTORI DATA). The operator NEVER picks one of these — it is inferred from the
// item's `kind` plus the direction of travel (see keterangan.ts). `pengambilan` is the one
// exception path an admin may choose explicitly: "taken, but coming back".
export type MovementType =
  | 'pemakaian' | 'pengambilan' | 'peminjaman' | 'pengembalian'
  | 'adjust' | 'status_change' | 'reversal';

/** Direction of travel, decided by the screen the operator is on, not by a choice they make. */
export type Direction = 'keluar' | 'masuk';
export type Condition = 'normal' | 'rusak' | 'hilang';
// Active asset base = everything except `lost` and `retired` (those leave the count entirely).
export type InstanceStatus = 'available' | 'out' | 'broken' | 'lost' | 'retired';

export interface Category {
  categoryId: string; name: string; order: number; active: boolean;
}

export interface Item {
  itemId: string; barcode: string; name: string;
  categoryId: string; kind: Kind; unit: string; trackBy: TrackBy; // trackBy defaults from kind (consumable->quantity, equipment->instance), overridable
  minStock: number | null; initialStock: number; active: boolean; // minStock null = Setting Minimum "(-)" → no low-stock notification
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
