# BRT Inventaris — Build Spec

**Companion to** `BRT-Inventory-System-Design.md`. This is the code-ready layer: data schema, gateway API, and the derivation reducer. All decisions (Model C identity, append-only core, event-sourcing, single Clerk-gated gateway) are settled in the design doc Parts I–VII.

Core invariant: **two things are truth — an append-only event log and a slowly-changing catalog. Everything else (current stock, asset status, "who has it") is *derived* and never stored authoritatively.**

---

## 1. Storage (Google Sheets)

Four tabs. `Transactions` and `CatalogLog` are **append-only, never edited**. `Items` / `AssetInstances` are rebuildable projections the gateway maintains for fast reads (their audit history lives in `CatalogLog`).

### 1.1 `Items` (catalog projection)
| col | type | notes |
|---|---|---|
| itemId | string | stable id, e.g. `ITM-PHBI-0007` |
| barcode | string | QR payload / SKU |
| name | string | "Pisau Potong" |
| domain | enum | kebersihan · sanitasi_plumbing · listrik · elektronik · sipil · keamanan · phbi · lain_lain |
| type | enum | perlengkapan · peralatan |
| kind | enum | consumable · equipment |
| unit | string | galon, buah, meter… |
| trackBy | enum | quantity · instance |
| minStock | number | low-stock alarm threshold (set via STOK AKHIR stepper) |
| initialStock | number | base for quantity items |
| active | bool | soft-delete |

### 1.2 `AssetInstances` (per-instance equipment only)
| col | type | notes |
|---|---|---|
| assetId | string | printed QR label, e.g. `ALQ-PHBI-0007` |
| itemId | string | FK → Items |
| label | string | human label |
| acquiredTs | number | epoch ms |
| active | bool | |

> Status/holder are **not** stored here — they're derived from `Transactions`.

### 1.3 `Transactions` (append-only — the operational truth)
| col | type | notes |
|---|---|---|
| txnId | string | gateway-assigned, unique |
| clientTxnId | string | client uuid — idempotency key |
| ts | number | **server** epoch ms (WIB display) |
| type | enum | pemakaian · pengambilan · peminjaman · pengembalian · digunakan · adjust · status_change · reversal |
| itemId | string? | for quantity items |
| assetId | string? | for instance items |
| qtyDelta | number | **signed**: −2 = ambil 2, +2 = kembali/restock, 0 for instance moves |
| recipient | string? | pos/person the goods go to (e.g. "Pos Potong 1") |
| actorUserId | string | resolved from the PIN |
| condition | enum? | normal · rusak · hilang (on pengembalian) |
| note | string? | free-text keterangan |
| reversesTxnId | string? | for reversal rows |
| stokAwal | number? | snapshot at append time (display) |
| stokAkhir | number? | snapshot at append time (display) |

### 1.4 `CatalogLog` (append-only — catalog audit)
`ts · actorUserId · action (item_created·item_renamed·item_retired·min_set·asset_added·asset_retired) · targetId · payloadJson`. The gateway folds this to rebuild `Items`/`AssetInstances`.

### 1.5 Identity (not in Sheets)
Per the design doc: each Clerk user carries a hashed PIN in **`privateMetadata.pinHash`**. The gateway keeps a `pinHash → {userId, role, displayName}` map (cached from Clerk or in `PropertiesService`). A `Members` display tab (`userId · displayName · role · active`) may mirror names for reports — **never the hash**.

---

## 2. Gateway API (Apps Script Web App)

Single Google-hosted endpoint; all writes and privacy-sensitive reads go through it. Two auth modes:
- **PIN mode** (transactions): rate-limited per device; PIN resolves the actor.
- **Clerk mode** (admin/setting + detailed reads): verifies a Clerk session JWT via JWKS; requires `role=admin`.

### 2.1 `POST verifyPinAndAppend` — the transactional submit
The PIN entry *is* the submit. One call → verify → identify → append immutable row(s).

```jsonc
// request
{
  "clientTxnId": "9f2c…",          // uuid, idempotency
  "deviceId": "kiosk-01",           // for per-device rate limiting
  "pin": "4821",
  "action": {
    "type": "peminjaman",           // or pemakaian | pengambilan | pengembalian | adjust
    "itemId": "ITM-…",              // OR assetId
    "assetId": "ALQ-PHBI-0007",
    "qtyDelta": -2,                 // signed; 0 for instance moves
    "recipient": "Pos Potong 1",
    "condition": "normal",          // only for pengembalian
    "note": ""
  }
}
```
```jsonc
// response (ok)
{ "ok": true, "txnId": "TX-000123", "ts": 1750000000000,
  "actor": { "userId": "usr_…", "displayName": "Andi" },
  "stokAwal": 10, "stokAkhir": 8 }

// response (bad pin)  → 401, device fail-counter incremented
{ "ok": false, "error": "PIN_INVALID", "cooldownMs": 0 }

// response (locked)   → 429
{ "ok": false, "error": "DEVICE_LOCKED", "cooldownMs": 30000 }

// response (dup)      → 200, no second append
{ "ok": true, "duplicate": true, "txnId": "TX-000123" }
```

**Gateway steps:** check `deviceId` lockout → look up `pin` in `pinHash` map (constant-time compare) → on miss, bump device counter, maybe lock, return → on hit, check `clientTxnId` not already present → compute `stokAwal/stokAkhir` from current derived state → append row(s) with server `ts` + `actorUserId` → return. A **kit** issue expands to N appended rows in one call, sharing a `clientTxnId` prefix.

### 2.2 Reads
- `GET state` — PII-free derived snapshot (stock levels, instance status counts, low/rusak/hilang) → cacheable, powers the board + public dashboard. **No recipient/actor names.**
- `GET stateDetailed` — Clerk-gated; adds holder/recipient + actor identities.
- `GET history` — Clerk-gated; the `Transactions` log (Histori Data).

### 2.3 Admin (Clerk session, role=admin)
`createItem · editItem · retireItem · setMinStock · adjustStock · addAsset · retireAsset · createUserPin · disableUser`. Each **appends** to `CatalogLog` (or `Transactions` for `adjust`) — never edits history. `createUserPin` enforces global PIN uniqueness and writes `pinHash` to Clerk `privateMetadata`.

---

## 3. `deriveState` reducer (pure TypeScript)

No I/O, no framework — the heart of the app, identical on client and gateway.

```ts
type Domain = 'kebersihan'|'sanitasi_plumbing'|'listrik'|'elektronik'|'sipil'|'keamanan'|'phbi'|'lain_lain';
type ItemType = 'perlengkapan'|'peralatan';
type Kind = 'consumable'|'equipment';
type TrackBy = 'quantity'|'instance';
type MovementType = 'pemakaian'|'pengambilan'|'peminjaman'|'pengembalian'|'adjust'|'status_change'|'reversal';
type Condition = 'normal'|'rusak'|'hilang';
type InstanceStatus = 'available'|'out'|'broken'|'lost'|'retired';

interface Item { itemId:string; barcode:string; name:string; domain:Domain; type:ItemType;
  kind:Kind; unit:string; trackBy:TrackBy; minStock:number; initialStock:number; active:boolean; }
interface AssetInstance { assetId:string; itemId:string; label:string; acquiredTs:number; active:boolean; }
interface Txn { txnId:string; clientTxnId:string; ts:number; type:MovementType;
  itemId?:string; assetId?:string; qtyDelta:number; recipient?:string; actorUserId:string;
  condition?:Condition; note?:string; reversesTxnId?:string; }

interface DerivedItem { item:Item; qty:number; status:'available'|'low'|'out'; outstanding:number; }
interface DerivedInstance { instance:AssetInstance; status:InstanceStatus; holder?:string; since?:number; }
interface DerivedState {
  items: Record<string,DerivedItem>;
  instances: Record<string,DerivedInstance>;
  lowStock: DerivedItem[]; rusak: DerivedInstance[]; hilang: DerivedInstance[];
  outByHolder: Record<string,DerivedInstance[]>;
}

const DAY_MS = 24*60*60*1000;

// 1) dedupe by clientTxnId, drop reversed originals + the reversal markers, sort by time
function activeTxns(txns: Txn[]): Txn[] {
  const reversed = new Set<string>();
  for (const t of txns) if (t.type==='reversal' && t.reversesTxnId) reversed.add(t.reversesTxnId);
  const seen = new Set<string>(); const out: Txn[] = [];
  for (const t of txns) {
    if (t.clientTxnId) { if (seen.has(t.clientTxnId)) continue; seen.add(t.clientTxnId); }
    if (t.type==='reversal') continue;        // reversal's only effect is negating its target
    if (reversed.has(t.txnId)) continue;      // original was reversed → gone
    out.push(t);
  }
  return out.sort((a,b)=>a.ts-b.ts);
}

// 2) fold events → current state (pure function of `now`, so time-rules need no cron)
function deriveState(items: Item[], instances: AssetInstance[], txns: Txn[], now: number): DerivedState {
  const T = activeTxns(txns);

  const qty: Record<string,number> = {};
  const outstanding: Record<string, {ts:number; qty:number}[]> = {};
  items.forEach(i => { qty[i.itemId] = i.initialStock; outstanding[i.itemId] = []; });

  const inst: Record<string,DerivedInstance> = {};
  instances.forEach(a => { inst[a.assetId] = { instance:a, status:'available' }; });

  for (const t of T) {
    // --- equipment instance lifecycle ---
    if (t.assetId && inst[t.assetId]) {
      const di = inst[t.assetId];
      if (t.type==='peminjaman') { di.status='out'; di.holder=t.recipient; di.since=t.ts; }
      else if (t.type==='pengembalian') {
        if (t.condition==='rusak') { di.status='broken'; di.holder=undefined; di.since=undefined; }
        else if (t.condition==='hilang') { di.status='lost'; di.since=undefined; }   // keep holder for "hilang oleh"
        else { di.status='available'; di.holder=undefined; di.since=undefined; }
      }
      else if (t.type==='status_change') {
        if (t.condition==='normal') di.status='available';
        else if (t.condition==='rusak') di.status='broken';
        else if (t.condition==='hilang') di.status='lost';
        else di.status='retired';
      }
    }
    // --- quantity items (consumables + quantity-tracked) ---
    if (t.itemId && qty[t.itemId] !== undefined) {
      switch (t.type) {
        case 'pemakaian':   qty[t.itemId] += t.qtyDelta; break;                 // delta < 0, permanent
        case 'pengambilan': qty[t.itemId] += t.qtyDelta;                        // delta < 0, may return
                            outstanding[t.itemId].push({ ts:t.ts, qty:-t.qtyDelta }); break;
        case 'pengembalian':qty[t.itemId] += t.qtyDelta; break;                 // delta > 0, restock
        case 'adjust':      qty[t.itemId] += t.qtyDelta; break;                 // admin correction
      }
    }
  }

  // 24-jam rule: an outstanding *pengambilan* of a consumable is only "awaiting return"
  // for 24h. Stock was already decremented at take-time (conservative); if it isn't
  // returned within the window it simply stays consumed — nothing to undo, no cron.
  // The window only affects the `outstanding` figure we surface for reconciliation.
  const derivedItems: Record<string,DerivedItem> = {};
  items.forEach(i => {
    const q = qty[i.itemId];
    const pend = outstanding[i.itemId]
      .filter(o => now - o.ts <= DAY_MS)
      .reduce((s,o) => s + o.qty, 0);
    const status = q <= 0 ? 'out' : (q <= i.minStock ? 'low' : 'available');
    derivedItems[i.itemId] = { item:i, qty:q, status, outstanding:pend };
  });

  const lowStock = Object.values(derivedItems).filter(d => d.status !== 'available');
  const rusak    = Object.values(inst).filter(d => d.status === 'broken');
  const hilang   = Object.values(inst).filter(d => d.status === 'lost');
  const outByHolder: Record<string,DerivedInstance[]> = {};
  Object.values(inst).filter(d => d.status === 'out')
    .forEach(d => { (outByHolder[d.holder ?? '?'] ??= []).push(d); });

  return { items:derivedItems, instances:inst, lowStock, rusak, hilang, outByHolder };
}
```

Notes:
- **Sign convention:** takes are negative, returns/restocks positive — the reducer just sums. This is what makes it purely incremental.
- **24-jam rule** is a `now`-parameterised filter, so it needs no scheduled job — re-deriving at any time yields the correct picture.
- **Corrections** never touch history: append a `reversal { reversesTxnId }`; `activeTxns` removes the original on the next derive.
- **Catalog** is folded the same way from `CatalogLog` by a sibling `deriveCatalog(catalogEvents)` → `{ items, instances }`.

---

## 4. Equipment state machine (reference)

```
available ──peminjaman──► out
   out ──pengembalian:normal──► available
   out ──pengembalian:rusak───► broken ──status:normal──► available
                                   └──status:retired──► retired (terminal)
   out ──pengembalian:hilang──► lost ──status:normal(ditemukan)──► available
                                   └──status:retired(write-off)──► retired
```
Active asset base = everything except `lost` and `retired`.

---

## 5. Key flows (step form)

- **Ambil consumable:** scan rack QR → qty → keterangan (pemakaian/pengambilan) → **PIN** → gateway appends `{type, itemId, qtyDelta<0, actor}` → board re-derives.
- **Pinjam equipment:** scan asset QR → recipient/pos → **PIN** → append `{peminjaman, assetId, recipient}` → instance = out.
- **Kembali:** scan asset (or open holder → batch) → condition normal/rusak/hilang → **PIN** → append `pengembalian` per asset → instances route to available/broken/lost.
- **Koreksi:** admin (Clerk) → append `reversal{reversesTxnId}`; original stays, effect removed.
- **Setel stok / min:** admin → `adjust` (stok awal) or `setMinStock` (alarm) → appended.

---

## 6. Build order
1. **Reducer + types** (pure TS, unit-tested against sample logs) — no infra needed.
2. **Sheets + gateway** (`verifyPinAndAppend`, `GET state`) — thinnest slice that persists.
3. **SPA board** (Octane) reading `GET state`, deriving locally, submitting via gateway; QR scan + PIN keypad.
4. **Equipment lifecycle + kits + close-out report.**
5. **Admin/Setting** (Clerk-gated) — catalog CRUD, PIN management, history.
6. **Hardening** — per-device lockout, PII-free public dashboard, optional snapshot compaction.

---

## 7. Notifikasi Stok (rev) — derived, no new storage

The rev adds a **MENU ADMIN → Notifikasi Stok** screen (and renames SETTING → ADMIN). It is a
projection of the same log, not new state.

**Admin actions are now:** Penyetelan Waktu · Buat Password · Ganti Password · Edit Jenis Barang ·
Tambah/Kurang Stok · **Notifikasi Stok** · Cek Histori Data.

**Selector** (`domain/notifications.ts`, tested):
```ts
deriveNotifications(items: Item[], txns: Txn[], now: number): StockNotification[]
// StockNotification = { itemId, name, ts, stokAkhir, setMin, keterangan }
// ts = the transaction that pushed the item to ≤ minStock (resets if it recovers above min)
```
Maps to the screen columns: `NAMA BARANG=name · STOK AKHIR=stokAkhir · SET MIN=setMin ·
HARI/TGL/JAM=ts · KETERANGAN=keterangan`. `GET state` can include this array for the board's
"Menipis" tile; a scheduled gateway job turns new breaches into push/email/WA notifications.

---

## 8. Rev 2 deltas

- **Roles (3):** `admin_utama` (permanent super-admin) · `admin` · `anggota`. Admin Utama is the undeletable seed account.
- **User roster admin endpoints:** `listUsers` (name + role, never pinHash) · `createUserPin` (role → PIN, enforces global uniqueness) · `disableUser` (delete). All append to CatalogLog / audit.
- **Admin PIN valid at transactions:** `verifyPinAndAppend` accepts any active user's PIN (admin or anggota); the resolved user fills PENGAMBIL.
- **`minStock` nullable:** `Item.minStock: number | null`. `null` = Setting Minimum "(-)" → no low-stock notification; `deriveState` won't flag it "low"; `deriveNotifications` skips it.
- **PENDING (not specced here yet):** dynamic categories (Edit Menu Utama). Blocked on the §48 modeling decision — do not build the categories table until `kind`-inheritance is confirmed.

- **Category/kind model (v1.2):** `Item.domain`/`type` are **removed**. Item now has `categoryId`
  (→ free-form `Categories` tab: `categoryId · name · order · active`, editable via Edit Menu Utama)
  and `kind` as the per-item behaviour flag (consumable = quantity/depletes; equipment =
  durable/borrow-return/rusak-hilang). `trackBy` defaults from `kind`, overridable. `kind` drives
  the lifecycle; categories are organizational only.

- **Keterangan "Digunakan" (v1.3):** added to `MovementType`. Stock effect **pending confirmation** — currently a no-op usage log (see Design doc §52).

- **Digunakan → in-use (v1.4):** `digunakan` sets a durable instance to **`in_use`** (transient), resolved via pengembalian (normal/rusak/hilang) exactly like `out`. New statuses **`in_use`** and **`maintenance`** ("unavailable"); `Txn` gains optional **`toStatus: InstanceStatus`** for admin `status_change`. On consumables, `digunakan` is a no-op. See Design doc §53 for the full state machine.

- **In-use reduces stock (v1.5):** `digunakan` also **reduces available stock temporarily** — instance:
  the unit drops out of the available count; quantity: available qty is reduced (restored by pengembalian,
  **no 24h auto-consume**). It counts toward STOK AKHIR / Notifikasi Stok.
