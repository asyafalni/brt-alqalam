# Checklist — feature progress

**Updated:** 2026-09-06 · **Tests:** 252 green (68 domain · 46 data · 138 app) · **Build:** clean

Legend: ✅ done & tested · 🔨 partly done · ⛔ blocked on you · ⬜ not started · ➖ deliberately not doing

> Spec coverage is verified against `docs/SPEC-INVENTORY.md`, extracted page-by-page from
> *Sistem Data Inventaris BRT Masjid Al-Qalam – rev.pdf*. Where we deliver something a
> **different way**, the row says how — the test is whether the boss's need is met, not whether
> the screen looks identical (his words: *"tidak harus sama"*).

---

## 1. The boss's spec — MENU STOK

| Spec | Status | How we deliver it |
| --- | --- | --- |
| 16 kategori (Menu Stok 1–16) | ✅ | Categories are **free-form and editable**, seeded with his 8 domains. Part XI dropped the fixed 16 because the perlengkapan/peralatan split was a proxy for "consumable vs durable" — that behaviour now lives on the **item** as a plain-language flag, so a new category still works. |
| Daftar barang per kategori | ✅ | `Stok` board, filterable; plus `Peta Rak` by physical location. |
| Nama barang · Satuan · Stok | ✅ | Item catalog, built by the Opname screen. |
| Ambil / pengambilan barang | ⛔ | Flow designed, gateway written; blocked on deployment. |
| **KETERANGAN per catalog row** | ✅ | `Item.keterangan`. Added after reading the spec properly — §37.2 had reasoned this field did not exist. |
| **PENGAMBILAN running counter** | ✅ | `DerivedItem.takenTotal` — cumulative, never reduced by returns. Feeds HISTORI DATA's `AMBIL`. |
| 5 keterangan incl. **Digunakan** | ✅ | All five accepted. `digunakan` behaves as `peminjaman` — out, *with someone* — so the word survives without the borrower-less hole that let things go missing. |
| Free-text keterangan box | ✅ | `Txn.note`, alongside the inferred word. |
| Kembali / pengembalian | ⛔ | Same. Condition (normal/rusak/hilang) already in the domain and tested. |

## 2. The boss's spec — MENU ADMIN

| Spec | Status | How we deliver it |
| --- | --- | --- |
| **Penyetelan Waktu** (manual/otomatis) | ✅ by design | Always automatic: the **gateway stamps server time**, never the device clock. Manual time entry is deliberately not offered — the 24-jam rule depends on a trustworthy clock, and a settable one can be gamed or simply wrong. This is a *safer* delivery of the same need. |
| **Buat Password** | 🔨 | `setUserPin()` in the gateway; PIN hashed HMAC-SHA256 + per-user salt + secret pepper. **Globally unique enforced** — refuses a taken PIN, exactly as his "pilih Password lain" screen does. Admin *screen* not built; runs from the Apps Script editor for now. |
| **Ganti Password** | 🔨 | Same function replaces an existing person's PIN. |
| Roles: Admin Utama · Admin · Anggota | ✅ | Modelled; `admin_utama` is the undeletable seed. |
| **Edit Menu Utama** (kategori) | ✅ | Add/edit categories inline while walking the gudang, so hitting something that fits nowhere never stops the walk. |
| **Edit Jenis Barang** (nama + satuan) | ✅ | Opname form; rows editable in place, ids preserved (they may be on a printed label). |
| **Tambah/Kurang Stok** | 🔨 | Quantities editable in Opname and via **Cek Rak** (cycle count). Post-gateway this becomes an appended `adjust` event rather than an edit — flagged in code. |
| **Setting Minimum** (STOK AKHIR stepper) | ✅ | Per item, and **nullable**: "(-)" means never notify, as rev 2 specifies. |
| **Notifikasi Stok** | ✅ | Derived projection (`deriveNotifications`) — no stored table. Shown on the board and bound to the navbar bell. Push-to-admin is a gateway job. |
| **Histori Data** | ⛔ | Schema settled and columns match his exactly. Needs the transaction log, so blocked on the gateway. |
| VERIFIKASI (4-digit PIN per transaction) | ✅ changed | **PIN once per visit, not per transaction.** 20 knives cost one PIN, not twenty; a session is one visit and ends at Simpan, so there is no idle window for the next person to be misattributed into. Same identity guarantee, a twentieth of the tapping. |

## 3. Ours — beyond the spec

| | Status | Why it earns its place (§0.0: does it remove work?) |
| --- | --- | --- |
| **Opname Gudang** (stock-take) | ✅ | Nothing to build a catalog on otherwise. Sticky context = ~2 taps per item. |
| **Peta Rak** + location model | ✅ | "12 galon sabun" doesn't help someone who can't find them. "Rak B3" does. |
| **QR labels**, printable A4 | ✅ | Racks print first — the labels §14.2 actually asked for. Refuses to print against `localhost`. |
| **In-app QR scanner** | ✅ | Native detector on Android, zxing lazily on iOS. ⚠️ Needs HTTPS. |
| **Cek Rak** (cycle counts) | ✅ | A one-off opname is true for a day. Re-counting one rack is two minutes; the whole gudang never happens. |
| **rusak ≠ hilang** | ✅ | Different outcomes, different actions, never the same colour. |
| Mobile bottom bar + scan FAB | ✅ | One-handed, in the thumb arc. |
| Demo data | ✅ | See it populated before any real opname. |
| CSV export per sheet tab | ✅ | Round-trip verified through the real parser. |

## 4. Infrastructure

| | Status | Note |
| --- | --- | --- |
| Pure domain layer | ✅ | 61 tests. No I/O, no framework — the thing that survives a stack swap. |
| Parse boundary (`data/`) | ✅ | Bad rows quarantined with sheet row numbers, never silently dropped. |
| Ports (repository interfaces) | ✅ | Append-only log with no update/delete path, by design. |
| **Gateway — PIN + device + append** | 🔨 | Written, not deployed. Needs no Clerk. |
| **Gateway — admin auth (Clerk)** | ⛔ | Needs the JWT Templates answer. |
| Google Sheet | ⛔ | Templates ready in `sheets/`; needs creating. |
| Deploy (HTTPS) | ⛔ | Needed for the scanner and for printed labels. |
| Offline queue (IndexedDB) | ⬜ | Phase 3. Ports already shaped for it. |
| PWA / installable | ⬜ | `vite-plugin-pwa` supports Vite 8; untested with Octane. |
| Log compaction | ⬜ | Only when history grows. |

## 5. Deliberately not doing

| | Why |
| --- | --- |
| ➖ Supplier / purchase orders | A masjid buys sabun at the shop. |
| ➖ Sales analytics, costing, FIFO/LIFO | Nothing is sold; no inventory accounting. |
| ➖ Multi-channel / 3PL sync | Nothing to sync. |
| ➖ Livestock & meat distribution | Out of scope (§41) — we track item stocks, not life stocks. |
| ➖ Google Forms as the write path | Opaque responses: the app could never truthfully say "tersimpan". Kept only as a Phase-3 offline fallback. |
| ➖ `digunakan` / in-use state | Recorded no borrower while "things go missing" is the top pain. Deleted in Part XVI. |

---

## What's actually blocking

1. ⛔ **Clerk → JWT Templates** — free or paid? Blocks admin auth only. *(2 min)*
2. ⛔ **Create the spreadsheet**, send the ID. *(10 min)*
3. ⛔ **Deploy to HTTPS**, send the URL. Blocks the scanner and label printing. *(20 min)*
4. 📋 **Watch the marbot for an hour** — can invalidate UI work already done.
5. 📋 **Two "it went missing" stories** — decides how much loan tracking is worth building.

## Ambiguities in the spec — need the boss, not a decision from us

1. **TAMBAH KATEGORI is drawn as a Jenis Barang / Satuan form** and never captures a category
   name. Copy-paste artefact, or "create a category with its first item"?
2. **"kurang/bermasalah"** — NOTIFIKASI STOK covers low *or problematic* stock. "Bermasalah" is
   never defined. It may be his word for rusak/hilang — if so, our extension is closer to his
   intent than we assumed.
3. **Audit scope vs schema**: password/category/item changes are said to be logged in HISTORI
   DATA, but its eight columns are stock-shaped. We keep a separate catalog log.
4. **`17. ADMIN` has an edit/delete control** — deleting the admin menu should not be possible.

Full detail: `docs/SPEC-INVENTORY.md` and Design doc Part XVII. Click-paths: `docs/SETUP.md`.
