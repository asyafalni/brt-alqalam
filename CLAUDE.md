# Sistem Inventaris BRT Masjid Al-Qalam — Development Design Doc

**Status:** v1.6 (real problem statement; keterangan inferred; in-use deleted) · **Owner:** Alfin · **Base template:** [spessolve/smart-inventory-system](https://github.com/spessolve/smart-inventory-system)

---

## 0. The actual problem (established 2026-09-06 — read this before §1)

**There is no paper process.** Nothing in this repo replaces an existing workflow. The
requirements PDF is a **proposal written by the owner's boss**, who is not an inventory
specialist and has said that *"valid enhancement and improvement is open to discuss."* Treat
the PDF as **input, not specification**: it carries the goal, not the design.

**What is actually wrong today**, in the boss's own words:

1. **Nobody knows what we own.** There is no asset register at all.
2. **Things go missing.** Items leave and nobody can say where they went.
3. **Reporting upward** — the takmir/management cannot see that BRT's assets are managed.
4. Underneath all three: the inventory is **very messy, both physically and informationally**
   — the gudang itself is chaotic *and* there are no records.

**Who uses it.** *(Corrected 2026-09-06 — see the note below.)* The **marbot masjid** are
**one user group among several**, not the only operators. They use a **PIN** because their job is
to report *fast* what was taken and what was used. Admins (and the boss) sign in with a Clerk
password. **Equipment borrowers may be outsiders** — jamaah, panitia, contractors — who have no
accounts and will never open the app.

> ⚠️ **This paragraph originally said the daily operators were "one to three marbot".** That was
> wrong, and one conclusion was built on it: that with so few people the PIN is merely *access
> control*, since everyone already knows who took the soap, making the daily flow a consumption
> counter rather than an accountability ledger. **With a larger roster that reasoning does not
> hold** — attribution is real work, and both the PIN and device enrolment (§65.2) matter more,
> not less. The roster size is still unknown; see OPEN-QUESTIONS.md.

**Consequences that override earlier Parts:**

- **The top risk is adoption, not the stack.** Replacing a paper book is easy — the habit
  already exists. Replacing *nothing* means asking people to acquire a habit that has never
  existed, with no felt pain to relieve. Systems like that die quietly. This risk outranks
  everything in §12, §17 and §21.
- **Because the room and the records are both a mess, a checkout flow has nothing to stand on.**
  Logging withdrawals against a catalog that does not exist, from starting quantities nobody
  counted, produces confident wrong numbers — worse than no system, because people believe them.
  **Phase 1 is therefore the stock-take (opname), not the checkout flow.** See Part XVI.
- **Qurban is not the design driver it was treated as.** Parts II, III and XV argue from a
  Qurban day nobody has observed or instrumented. Those arguments have no more evidentiary
  weight than the PDF, and where they conflict with the four problems above, the problems win.

---

## 1. Goal & guiding principles

Build a modern, maintainable inventory system for BRT Masjid Al-Qalam. The requirements PDF
(Menu 1 categories, Menu-Admin flows, Menu 2 stock list, Menu 3 checkout flow, Histori Data) is
the **shape** the boss proposed; §0 is the **problem** it is meant to solve. Where the two
conflict, §0 wins — with the deviation written down and taken back to him (see Part XVI).

Non-negotiable constraints from you:

1. **Google Spreadsheet as the source of truth (SoT).**
2. **Clerk** for auth.
3. **SPA**, deployable as a **static site (no server we operate)** if at all possible; Zig backend only as a fallback.
4. **Octane** (octanejs) instead of pure React.
5. **TanStack Query** (server-state) + **TanStack Store** (client-state).
6. **TanStack Charts** for charts.
7. Extend the template repo's **design/UI**.
8. **Barcode** for borrow/return.
9. **Assets with several statuses** and lifecycles.
10. **Google Forms (prefill API)** as a write path when the sheet alone is not enough.

**Design principle that makes all of this possible:** *derive state, don't mutate it.* We treat the system as an **append-only event log** and compute current stock/status by folding events. This is what lets a static site with no backend still act like a real inventory system, and it gives us the full audit trail (Histori Data) for free.

---

## 2. Traceability: how this maps to your existing PDF spec

| PDF concept | New system |
| --- | --- |
| Menu 1: 12 kategori (Perlengkapan 1–6, Peralatan 7–12) | `category` field on each Item; drives navigation |
| **Perlengkapan** (stok awal / pengambilan / stok akhir) | Item `kind = consumable` — tracked by quantity, can run out (*habis*) |
| **Peralatan** (mis. Menu 2.11 punya kolom AMBIL **dan** KEMBALI) | Item `kind = equipment` — borrowed & returned |
| Menu-Setting 1: Penambahan Jenis Barang | Admin CRUD on the `Items` catalog sheet |
| Menu-Setting 2: Penambahan/Pengurangan Stok + set minimum untuk Alarm | `adjust` events + `min_stock` threshold per item |
| Menu-Setting 3: Pengecekan Histori Data | The `Transactions` event log (this is the SoT, not a side-effect) |
| Menu-Setting 4: Password Admin + Password Anggota | Clerk roles: `admin` + `member`. No home-grown PINs. |
| Menu 3: pilih baris → pilih jumlah → DONE → masukkan password → sistem hitung stok + catat siapa & kapan | Barcode scan → qty → confirm → Clerk identity attached → append event |
| "Sistem beri tahu Admin via Notifikasi bila stok menipis" | Low-stock rule in the derive layer → optional email/WA via Apps Script |

> ⚠️ **CORRECTED 2026-09-06.** This section originally claimed: *"this is not a rewrite of what
> the masjid does — it's the same workflow, digitised and made barcode-first."* **That was false.**
> There is no existing workflow (see §0). The left-hand column traces to the boss's proposal, not
> to observed practice, and nothing in it is evidence about how the masjid actually operates.
> The table is still useful as a map of *what he asked for*. It is not a requirements source.

---

## 3. Architecture: backend-free, event-sourced

```
                         READ (fast, cacheable)
   ┌─────────────────┐   ────────────────────────►   ┌──────────────────┐
   │  Google Sheets  │                                │   Static SPA     │
   │  (Source of     │   Items catalog (CSV/API)      │  (Octane +       │
   │   Truth)        │   Transactions log (CSV/API)   │   TanStack)      │
   │                 │◄────────────────────────       │                  │
   └────────┬────────┘   WRITE (append-only)          │  derive(items,   │
            │            via Google Form POST         │   instances,     │
            │                                          │   txns, now)     │
   ┌────────▼─────────┐                                │   = live state   │
   │ Google Form(s)   │◄───── prefill + submit ────────┤                  │
   │ → response sheet │                                │  Clerk (identity)│
   └──────────────────┘                                └──────────────────┘
            ▲
   (optional, zero-infra) Apps Script: notifications, log compaction, JWT-gated writes
```

**Reads:** the SPA reads the `Items` catalog and the `Transactions` log from Sheets — either the published-to-web CSV endpoint or the Sheets API v4 with a read-only API key. TanStack Query owns this layer (cache, staleTime, background refetch).

**Writes:** every action (borrow, return, consume, adjust, status change) is **one appended event**, submitted through a **Google Form** using the prefill/formResponse endpoint. Forms accept submissions without us running a server, and each Form is backed by a response sheet. This is your no-backend write path.

**Current state is computed, never stored authoritatively.** A pure function `deriveState(items, instances, transactions, now)` folds the log into current stock and asset status. Because it's a pure function of `now`, time-based rules (like the 24-hour auto-consume) need no cron — they simply evaluate differently as time passes.

**Where a tiny bit of Google-hosted "backend" helps (optional, still no infra you run):** a Google Apps Script bound to the sheet can (a) send low-stock notifications by email/WhatsApp, (b) periodically compact the event log into a snapshot so the client doesn't replay unbounded history, and (c) verify a Clerk JWT to gate writes if the open Form endpoint gets abused. None of these are required for the MVP.

**When you'd actually reach for Zig:** only if you outgrow Sheets — real atomic multi-item transactions, strict concurrency control, private data that can't live in a sheet, or tens of thousands of events. At masjid scale you very likely won't for a long time. Keep the domain logic framework- and storage-agnostic (Section 6) so this swap stays cheap.

---

## 4. The write/read model in detail

### 4.1 Writing an event (no backend)
A "checkout" of 2 galon sabun becomes an appended row via a Form submit:

```ts
// Each Form field maps to a column in the response sheet.
async function appendEvent(e: InventoryEvent) {
  const url = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
  const body = new URLSearchParams({
    "entry.1001": e.type,          // checkout | return | consume | adjust | status_change
    "entry.1002": e.itemId ?? "",
    "entry.1003": e.assetId ?? "",
    "entry.1004": String(e.qty ?? ""),
    "entry.1005": e.actorId,       // Clerk user id
    "entry.1006": e.condition ?? "",// normal | rusak
    "entry.1007": e.note ?? "",
    "entry.1008": e.clientTxnId,   // uuid for idempotency/optimistic reconciliation
  });
  await fetch(url, { method: "POST", mode: "no-cors", body });
}
```

Notes:
- Use the **Google-assigned Timestamp** column of the response sheet as the authoritative event time, not the client clock — this prevents drift and tampering and gives a consistent basis for the 24h rule (Masjid runs on WIB / UTC+7; store/interpret consistently).
- `clientTxnId` (a UUID) makes submissions idempotent and lets us reconcile optimistic UI once the row appears.

### 4.2 Reading + deriving
```ts
const items = useQuery({ queryKey: ["items"], queryFn: fetchItemsCsv });
const txns  = useQuery({ queryKey: ["txns"],  queryFn: fetchTxnsCsv, refetchInterval: 15_000 });

const state = useMemo(
  () => deriveState(items.data, instances.data, txns.data, Date.now()),
  [items.data, instances.data, txns.data /* + a coarse clock tick for the 24h rule */]
);
```

### 4.3 The consistency gotcha (call this out early)
There is **propagation lag** between a Form submit and the row appearing in the published-CSV read (seconds, occasionally longer). So:
- Apply an **optimistic update** immediately (append the pending event to a local buffer in TanStack Store).
- Reconcile by `clientTxnId` when the real row lands; drop the buffered copy.
- Keep the buffer in IndexedDB so a refresh/offline doesn't lose a pending write (natural stepping stone to the offline PWA in Section 10).

---

## 5. Auth & roles (Clerk)

Clerk runs fully client-side in a SPA — no backend needed for sign-in/session. Map the PDF's password model onto Clerk roles:

- **`admin`** (was: Password Admin) — CRUD items, adjust stock, set thresholds, see full history, manage members.
- **`member` / anggota** (was: per-member 4-digit password) — scan to borrow/return/consume; actions are attributed to their Clerk identity.

**Important nuance — attribution vs authorization.** Clerk proves *who is using the app*, but the Google Form endpoint is public, so Clerk alone does not *authorize the write*. Two options:
- **v1 (simplest):** attach the Clerk user id to each event for attribution; accept that the endpoint is obscured-but-open. Fine for a trusted internal volunteer tool.
- **v2 (if needed):** route writes through an Apps Script Web App that verifies a short-lived Clerk JWT (Clerk publishes a JWKS the script can check). Upgrades attribution → real authorization, still infra-free.

---

## 6. Domain model & asset lifecycle

Keep this layer **pure TypeScript, zero framework/storage imports.** It's the heart of the app and the thing that must survive a view-layer or storage swap.

### 6.1 Entities
```ts
type ItemKind = "consumable" | "equipment";
type TrackBy  = "quantity" | "instance";

interface Item {
  id: string; barcode: string; name: string;
  category: Category;          // 12 PDF categories
  kind: ItemKind;              // consumable = habis; equipment = pinjam/kembali
  unit: string;                // galon, buah, meter, pak...
  minStock: number;            // for the low-stock alarm
  initialStock: number;
  trackBy: TrackBy;            // quantity, or per-physical-unit
  active: boolean;
}

// Only for equipment tracked per physical unit:
interface AssetInstance {
  assetId: string; itemId: string; label: string; // printed barcode label
  acquiredDate: string; notes?: string;
}

interface InventoryEvent {
  txnId: string; ts: number; type: EventType;
  itemId?: string; assetId?: string; qty?: number;
  actorId: string; condition?: "normal" | "rusak"; note?: string;
  clientTxnId: string;
}
```

### 6.2 The three lifecycles you described (a/b/c) — unified
Your a/b/c cases and the 24h rule collapse into **one checkout concept** with a per-kind resolution policy:

**(a) Consumable — bisa habis.** Tracked by quantity. Derived states: `available` (qty > minStock), `low` (0 < qty ≤ minStock), `out` (qty = 0). A checkout of a consumable creates an *outstanding reservation*; the reducer resolves it:
- returned within 24h → restock (net zero, e.g. a cable borrowed and brought back);
- **not returned within 24h → treated as `consumed`, permanently decrementing stock.** This is your hybrid rule, and it's just a branch in the reducer — no server job.

**(b) Equipment — dipinjam & dikembalikan (normal/rusak).** State machine per instance:
```
available ──borrow──► borrowed ──return:normal──► available
                         │
                         ├─return:rusak──► damaged ──repair──► available
                         │                         └─retire──► retired
                         └─report:lost──► lost
available/borrowed ──► maintenance ──► available
```

**(c) Equipment — dipinjam & hilang.** `lost` is a terminal state reachable from `borrowed` (with an optional `found → available` recovery path).

So the full status set for equipment is: **available, borrowed, damaged, maintenance, lost, retired.** That satisfies "manage assets with several status."

### 6.3 The reducer (shape)
```ts
function deriveState(items, instances, txns, now): DerivedState {
  // 1. index catalog
  // 2. fold txns in ts order:
  //    - checkout(consumable)  -> add outstanding reservation
  //    - checkout(equipment)   -> instance status = borrowed, holder = actor
  //    - return                -> restock / status back per condition
  //    - consume/adjust        -> apply delta
  //    - status_change         -> set instance status
  // 3. resolve outstanding consumable reservations older than 24h as `consumed`
  // 4. compute per-item qty, per-instance status, low-stock flags
}
```

---

## 7. Barcode workflows

- **Consumables:** barcode = the item SKU. Scan → choose qty (*ambil*) → confirm → append `checkout`/`consume` event.
- **Equipment (per-instance):** each physical unit gets a printed label encoding a unique `assetId` (e.g. `ALQ-PHBI-0007`). Scan on borrow → `checkout`; scan on return → `return` with condition `normal`/`rusak`, or mark `lost`.

**Scanning options for a static SPA:**
- **Camera-based:** `@zxing/browser` (robust 1D+2D) or `html5-qrcode`. Good for phones.
- **USB scanner (recommended for a fixed store-room station):** cheap USB barcode guns act as a **keyboard wedge** — just focus a hidden input and read the "typed" value. Zero library, very reliable. Ideal for a check-in/check-out counter at the gudang.

Label generation (asset tagging) is its own small admin tool: generate `assetId`s, render Code-128/QR labels, print on a label printer or A4 sticker sheet.

---

## 8. Tech stack & honest maturity notes

| Layer | Choice | Note |
| --- | --- | --- |
| UI framework | **Octane** (`octane`, `@octanejs/*`) | React API, compiled, no VDOM. **Very new (weeks old); binding parity varies** — check `docs/bindings-status.md` per package before relying on it. `OctaneCompat` can render Octane inside React 19, easing migration from the template. |
| Server-state | **TanStack Query** via `@octanejs/tanstack-query` | Owns Sheets reads + Form mutations, optimistic updates. |
| Client-state | **TanStack Store** via `@octanejs/tanstack-store` | Scan buffer, pending-write queue, UI state. |
| Charts | **TanStack Charts** (`@tanstack/charts`) | Framework-agnostic core + React adapter. **Pre-alpha (0.14.0), API may change.** shadcn is moving its Chart to it. |
| Styling/UX | Tailwind + `@octanejs/motion` + `@octanejs/sonner` + `@octanejs/lucide` | Mirrors the template's stack (Framer Motion → motion, Sonner, Lucide). |
| Auth | **Clerk** (client-side) | Roles: admin / member. |
| Data | **Google Sheets** (read) + **Google Forms** (write) | Event log = SoT. |
| i18n | `i18next` (id default) | UI is Bahasa Indonesia first. |
| Hosting | Vercel/Cloudflare Pages (static) | Same as template. |

**The one risk worth repeating:** three core pieces (Octane, its TanStack bindings, TanStack Charts) are all pre-1.0 and moving fast. For an internal masjid tool that's an acceptable, even fun, bet — *if* you isolate the pure-TS domain layer (Section 6) so a blocked binding never forces a rewrite. If any binding blocks you, `OctaneCompat` lets you drop to plain React 19 for that screen without leaving the ecosystem.

---

## 9. Extending the template repo

**Reuse from the template (SmartInv) — its whole design system, not just code:**
- **Styling foundation:** the Tailwind config + design tokens and the "premium" component library — Sidebar, Navbar, Card — plus **Lucide** icons and **Sonner** toasts. Reuse as-is; this is the look-and-feel we extend.
- **Layout & page shells:** sticky headers, responsive layout, and the existing shells (Dashboard, Inventory, Login) — remap Login → PIN/Clerk, Inventory → the stok menus, Dashboard → the status board.
- **Motion:** Framer Motion micro-interactions (→ `@octanejs/motion` under Octane).
- **Pipeline:** Vite + TS, the Vitest test gate (tests must pass before deploy), Docker, Vercel.

**Theming decision.** Start from SmartInv's theme and keep its component structure; apply **field-ops overrides only where the qurban context demands** — higher sunlight contrast, larger touch targets, and the five-status colour language (dipinjam / menipis / rusak / hilang / tersedia).
> ⚠️ The current `brt-inventory-prototype.html` uses a **proposed** field-ops theme (deep-pine/brass, Space Grotesk/IBM Plex) built from scratch to test legibility — it is **not** SmartInv's actual palette. To reconcile: pull SmartInv's `tailwind.config` / CSS tokens, then either **(a)** re-skin the prototype to match SmartInv, or **(b)** layer the field-ops overrides on top of SmartInv's tokens. Decide a/b before the UI build.

**Swap:**
- React Context (`context.tsx`) → TanStack Query + Store + the derive layer.
- Simulated auth → Clerk.
- Mock data → Google Sheets/Forms adapters.
- React 19 components → Octane components (or keep as React under `OctaneCompat` incrementally).

**Add:** barcode scanning, asset instance/label tooling, the event-log reader/writer, the 24h-rule reducer, low-stock notifications.

---

## 10. Suggested project structure

```
src/
├── domain/            # PURE TS — no framework, no I/O
│   ├── types.ts
│   ├── deriveState.ts # the reducer (heart of the app)
│   ├── lifecycle.ts   # equipment state machine
│   └── rules.ts       # 24h auto-consume, low-stock
├── data/              # adapters (swappable: Sheets today, Zig later)
│   ├── sheetsRead.ts  # CSV / Sheets API v4
│   ├── formsWrite.ts  # Google Form append
│   └── queries.ts     # TanStack Query hooks
├── state/             # TanStack Store: scan buffer, offline queue
├── features/          # borrow, return, consume, admin, history, dashboard
├── components/        # extended from template
├── pages/
└── i18n/
```

---

## 11. Phased roadmap

- **Phase 0 — Spike (de-risk the unknowns):** prove the two riskiest paths in isolation — (1) Form append → published-CSV read round-trip incl. lag, (2) an Octane app consuming `@octanejs/tanstack-query` + rendering a TanStack Chart. Decide go/no-go on the alpha stack here.
- **Phase 1 — MVP (consumables):** Items catalog, quantity tracking, ambil/consume, low-stock, history, dashboard. Clerk admin/member. Camera + USB barcode. This alone replaces the paper Menu 1/2/3 for perlengkapan.
- **Phase 2 — Equipment lifecycle:** per-instance assets, borrow/return with condition, lost/damaged/maintenance, label generation & printing.
- **Phase 3 — Hardening:** Apps Script for notifications + log compaction; optional JWT-gated writes; offline PWA (queue events in IndexedDB, replay when online — a real win for spotty gudang wifi).

---

## 12. Challenges, risks & open decisions

1. **Alpha stack** (Octane + bindings + TanStack Charts). *Mitigation:* isolate pure domain layer; `OctaneCompat` fallback; pin versions.
2. **Sheets isn't a database:** no atomic transactions, concurrent-write races, propagation lag, quota/size limits, unbounded log growth. *Mitigation:* append-only + derive + `clientTxnId` idempotency + Phase-3 compaction. Fine at masjid scale; know the ceiling.
3. **Write-authorization gap:** public Form endpoint = attribution, not authorization. *Decision needed:* is v1 attribution-only acceptable, or do we want the Apps Script + Clerk-JWT gate from the start?
4. **PRIVACY — the sharp one:** a *published* Google Sheet is world-readable at its URL. If borrower names/identities live there, that's a PII leak for a community org. *Mitigation:* read via Sheets API with a restricted key instead of publish-to-web; or keep the published sheet PII-free (store Clerk user ids, resolve names client-side); or route reads through an authed Apps Script. **Pick one before go-live.**
5. **24h-rule edge cases:** use the Google Timestamp (not client clock); define behaviour for late returns (already-consumed → treat as a fresh restock adjust), partial returns, and WIB/timezone consistency.
6. **Barcode label ops:** who tags equipment, label durability/placement, printer choice. A small but real operational project.
7. **Offline reliability** at the gudang — designed-for by the append-only model, but formally a Phase-3 feature.

---

## 13. Open questions for you (these change the design)

1. **Equipment granularity — the biggest fork:** per-instance (each physical unit its own barcode + status + current holder) or quantity-level (just counts of available/borrowed/broken)? Instance-level matches "asset with several statuses," barcode-per-asset, and "who has the drill and is it broken" — but it's heavier and means labelling every unit. The PDF's Peralatan tables are quantity-level today.
2. **Write path for v1:** pure Forms (simplest, attribution-only) or Forms + Apps Script gateway (verifies Clerk, also unlocks notifications + compaction)?
3. **Privacy stance:** must borrower identity be protected from public read? (Drives the read path — published CSV vs API key vs authed Apps Script.)
4. **Scale reality-check:** roughly how many item types, transactions/month, and simultaneous scanning stations? (Validates the Sheets ceiling and whether Zig ever enters the picture.)
5. **Offline in v1 or later?** How reliable is wifi in the storage room?
6. **Language:** Indonesian-only UI, or bilingual ID/EN?

---

# Part II — Locked decisions & refined design (v0.2)

## 14. Decisions locked this round
1. **Equipment: per-instance.** Every unit gets its own QR (asset id + status + current holder).
2. **Consumables: tracked by location/rack.** One durable QR per rack/bin; quantity entered on scan (not a barcode per bar of soap).
3. **Borrower identity: visible to any logged-in user.** Public dashboard (later) = aggregate only, no borrower detail → drives a **two-tier data model**.
4. **Scanning: QR, phone camera, mobile-first PWA. No hardware scanners** — avoid any purchase.
5. **Scale: spiky.** Normal = low/medium. **Ramadhan & Idul Adha = peaks** (qurban day: ~40 sapi + 120+ kambing, many concurrent volunteers, hectic, poor connectivity) → offline + compaction promoted to **core**.

## 15. Refined flows

### 15.1 Consumable withdrawal + optional recount (polished)
- Scan rack QR → shows item + system-computed remaining.
- "Ambil berapa?" → enter qty → confirm → append `consume` event. *(mandatory, fast: ~2 taps)*
- Optional "Hitung sisa fisik?" → enter counted remaining → if it differs from the system, append an `adjust` (cycle-count) event that reconciles drift. *(encouraged, never blocking)*
- Admin/periodic full recount = a batch of `adjust` events. This is the antidote to the counting drift a hectic day introduces.

### 15.2 Session / rapid-scan mode (qurban-day throughput)
- Pick borrower once (or scan the borrower's QR badge) → open a **session**.
- Rapid-scan multiple assets; each auto-logs a checkout to that borrower with one tap. Scan, scan, scan.
- Return: scan the borrower's open items → **batch return, `normal` by default, flag only exceptions (`rusak`/`hilang`)**. Handing back 20 knives = one action + a couple of exception taps.

### 15.3 Scan guard (hectic-day safety)
- On every scan, immediately show derived status: *"Pisau #7 — sedang dipinjam Budi."* Prevents double-borrow / double-consume from duplicate scans. `clientTxnId` + debounce dedupes.

### 15.4 QR & mobile specifics
- **QR, not 1D barcodes** — faster on phones, encodes asset id + type + location.
- Scan via a JS lib that works on all phones (`@zxing/browser` or `html5-qrcode`); use the native `BarcodeDetector` API as progressive enhancement where present (Android). **iOS Safari needs the JS fallback — test on iPhone explicitly.**
- **Deep-link QRs** (`…/scan?a=ALQ-PHBI-0007`) so even the phone's native camera app opens the right screen.
- Installable PWA, camera permission, one-handed operation.

## 16. Architecture updated for scale + privacy

**Two data tiers (privacy):**
- **Public (PII-free):** catalog, current stock, asset-status counts, aggregates → published CSV/API → most screens + the future public dashboard.
- **Private (borrower identity, full history):** served **only via an Apps Script gateway that verifies the Clerk JWT.**

**Split paths so the peak-day hot path never bottlenecks:**
- **Writes → raw Google Form endpoint**, queued in IndexedDB, submitted when online. Append-only = concurrency-safe = scales on Google's infra = survives bad wifi. This is the qurban workhorse.
- **Private reads → Apps Script gateway** (Clerk-verified), lower frequency, cacheable.
- **Compaction (scheduled Apps Script) → snapshot** `CurrentStock`/`AssetStatus` + archive old events, so the client folds only *snapshot + recent events*, never the whole log. **Now core (Phase 1–2), not optional.**

**Offline-first is now core, not Phase 3.** Peak day is exactly when connectivity fails; append + local queue + derive is the design that keeps working through it.

**Where Zig actually enters:** only if Apps Script's quotas/latency for the authed-read gateway or compaction become the bottleneck at peak — then a small Zig service replaces *just those two roles* (authed read + compaction). Writes stay on Google Forms regardless. Escape hatch, not starting point.

## 17. New risks introduced by scale
- **No hard reservation atomicity:** two offline volunteers can both grab the "last" unit; derive reconciles it to `borrowed` once synced. Accepted tradeoff (availability/throughput over locking). Soft-warn for scarce items; for qurban you usually have ample stock.
- **Apps Script quotas** under peak private-read load → cache aggressively, keep private reads rare, keep the Zig fallback ready.
- **Consumable drift** during hectic use → optional recount + admin reconciliation; make recount easy.
- **Log growth** with two big annual spikes → compaction + archival from the start.

## 18. Still open (these change the design)
- **Public dashboard:** a truly public URL (no login) or a role-gated view? Truly public → a fully separate PII-free build/tier.
- **Qurban returns:** confirm **batch-return-with-exceptions** as the default.
- **Scope check:** strictly tools + consumables, or do you also want tracking around **animals / meat distribution** on qurban day? (That's a separate module if yes.)

---

# Part III — Scale re-framed: breadth, not concurrency (v0.3)

**Correction to v0.2.** Qurban is run by a **few admins**, not the whole jamaah. So concurrency and connectivity are *not* the hard part. This walks back two over-promotions:
- **Offline-first → downgrade to optional resilience.** Keep a small local queue for safety, but it is not a core driver.
- **Compaction → downgrade to "when history grows," not day-one urgent.**

**The actual hard problem.** A *large, varied* set of tools + consumables (pisau, asahan, talenan, timbangan, terpal, cooler, gas, kompor, panci besar, kantong daging, sabun, es…) tracked by *few people* on a hectic day. This is a **breadth + low-friction-throughput-per-admin** problem, not a scale-out problem.

## 19. Architecture simplification this unlocks
Because concurrent load is low, collapse the v0.2 split (Forms-write + published-read + gateway-private-read) into **one Clerk-JWT-gated Apps Script gateway for both read and write.**
- Simpler mental model — a single mechanism.
- Upgrades writes from *attribution* to real *authorization* for free (the gateway verifies the Clerk session).
- Google Forms becomes an optional bulk-drop / offline fallback, not the primary path.
- The public dashboard reads a PII-free snapshot the gateway maintains.
- Still zero infrastructure you operate (Google-hosted). Zig re-enters only if Apps Script latency/quota ever bites — unlikely at a few-admin load.

## 20. Features that make breadth manageable for few admins (new priority)
- **Kits / packing lists (headline).** Define named bundles — e.g. *"Pos Potong 1" = 5 pisau + 2 talenan + 1 asahan + 1 timbangan*. Issue or return the whole kit in one action; reconcile only exceptions. Mirrors how mosques organise qurban into stations/pos.
- **Event presets (working set).** An *"Idul Adha 1447H"* event scopes a subset of the catalog with expected quantities, pre-staged — admins act on a focused list, not the full inventory.
- **Bulk operations.** Multi-select check-out / check-in / status; "return everything for this kit/event"; quantity steppers.
- **Bulk catalog population.** Admins edit the `Items` sheet directly (it *is* a Google Sheet) or paste-import — never add hundreds of items one-by-one in the UI.
- **End-of-event close-out report.** Expected vs actual: what is still out, unaccounted, rusak, hilang, and which consumables were used — so a few admins can close the books fast.
- **Search + category filters first, QR second.** For hundreds of small consumables, fast search/filter often beats hunting labels; QR shines for durable equipment instances and rack/location codes.

## 21. Roadmap & risk deltas
- **Roadmap:** move kits + event presets + bulk ops + close-out report into **Phase 2**. Offline + compaction drop to **Phase 3 / optional**.
- **Top risk is no longer concurrency** — it is **admin data-entry friction and keeping an accurate picture across a big, fast day.** Kits, bulk ops, and the close-out reconciliation are the direct mitigations.

## 22. New open question
- Do you organise qurban by **stations / pos**? If yes, **kits become the core primitive** and the whole UX is built around issuing/returning/reconciling kits per station. (Plus the three still-open items from §18.)

---

# Part IV — Rusak vs Hilang are different asset outcomes (v0.4)

**Correction.** `rusak` (damaged) and `hilang` (lost) are not one "problem" bucket. They differ in what they *are* and what they *demand*:

| | **Rusak** (damaged) | **Hilang** (lost) |
| --- | --- | --- |
| Asset still exists? | Yes — in your possession | No — gone |
| Nature | Temporary, out-of-service | Terminal write-off (shrinkage) |
| Counts against active base? | Yes (unavailable, but present) | **No** — removed from the active asset base |
| Primary action | **Perbaiki** (repair → available) or **Pensiunkan** (retire, if unrepairable → disposed) | **Tandai ganti** (write-off + flag for procurement) or, rarely, **Ditemukan** (found → available) |
| Belongs in | a **repair queue** (worklist) | a **loss log** (accountability + replacement) |
| Money implication | repair cost | replacement cost / possible ganti-rugi |

## 23. Model changes
- Equipment states become explicit and distinct: `available · out · broken · lost · retired`. (`broken` = rusak; `lost` = hilang; `retired` = rusak yang tidak bisa diperbaiki.)
- **Active asset base** = everything except `lost` and `retired`. Those two leave the count entirely, so "how many do we own that still exist" stays honest.
- On return (`Masuk`), the condition segment offers three outcomes — **Normal / Rusak / Hilang** — routing the asset into the right lifecycle at the moment it comes back.
- State machine (updated):
```
available ──keluar──► out ──masuk:normal──► available
                        ├─masuk:rusak──► broken ──perbaiki──► available
                        │                        └─pensiun───► retired (terminal)
                        └─masuk:hilang─► lost ──ditemukan──► available
                                              └─tandai-ganti─► lost + needsReplacement (procurement)
```

## 24. UX treatment (reflected in the prototype)
- The status ledger now shows **five** distinct answers: Dipinjam · Menipis · **Rusak** · **Hilang** · Tersedia — each its own colour, filter, and pill (rusak = burnt-orange, hilang = deep maroon).
- **Rusak view = repair queue:** each row shows the fault + who reported it, with `Perbaiki` / `Pensiun` actions.
- **Hilang view = loss log:** rows show who lost it and when, with `Ditemukan` / `Tandai ganti`. On the main board, lost assets also surface as a distinct maroon **alert banner** ("N aset hilang — perlu penggantian"), because a write-off is an exception to follow up, not a live stock counter to watch.
- Retired assets drop out of the active list (visible only via filter/history) — the write-off is recorded, not deleted.

---

# Part V — Merge with updated requirements PDF (v0.5)

The revised spec refines several things. This part **merges** them; the architecture from Parts I–IV (single Clerk-gated Apps Script gateway, event-sourced + derive, QR mobile-first, kits, rusak≠hilang) stands unchanged.

## 25. Categories: now 16 + Setting (supersedes the "12" in §2 / §6)
Eight domains × two types. Domains: **Kebersihan · Sanitasi & Plumbing · Listrik · Elektronik · Sipil · Keamanan · PHBI · Lain-lain.**
- Perlengkapan (consumable) × 8 → Menu Stok 1–8
- Peralatan (equipment) × 8 → Menu Stok 9–16

So `Item.category = { domain: <one of 8>, type: perlengkapan | peralatan }`, and `kind` (consumable | equipment) follows `type`. Navigation is domain → type, but the data model stays flat.

## 26. Movement type (KETERANGAN) — required on every transaction
The PENDATAAN screen forces one of four keterangan (+ optional free-text note):
- **Pemakaian** — consumable used up → permanent stock decrease.
- **Pengambilan** — stock taken out → decrease.
- **Peminjaman** — equipment borrowed → opens an outstanding loan (expects a Pengembalian).
- **Pengembalian** — item returned → closes a loan; carries a **condition: normal | rusak | hilang** (our Part IV layer).

This composes with the lifecycle: Peminjaman → `out`; Pengembalian(normal) → `available`; Pengembalian(rusak) → `broken`; Pengembalian(hilang) → `lost`. `movementType` becomes a field on every event and fills the HISTORI DATA **KETERANGAN** column. The four keterangan are the operator's declared intent; condition is captured only on return.

## 27. Identity: reconcile Clerk with the spec's 4-digit PIN
The spec keeps a per-person **4-digit PIN + name + role (Admin/Anggota)**, created/changed in Setting and verified at each transaction (VERIFIKASI screen). Reconciliation:
- **Clerk** = app/session + **admin** identity (Setting, management, gateway auth). Few admins; deserves real auth.
- **Member PIN** = fast **per-transaction attribution** for Anggota during events — matches the spec's "masukkan 4 digit password" and fills the HISTORI DATA **PENGAMBIL** column without a full login per scan.
- A Members registry (name, role, **hashed** PIN) lives in a sheet; the gateway verifies PIN on write.
- Caveat: a 4-digit PIN is **attribution-grade, not security-grade** — hash it, rate-limit attempts, treat it as "who did this," not a secret key.
- **Decision:** → **Resolved in Part VI** — per-role PIN, stored in Clerk org `privateMetadata` (server-verified), and possibly unnecessary under a per-person Clerk login.

## 28. Setting menu (6 actions) → our model
- **Penyetelan Waktu (Manual / Otomatis):** default **Otomatis**; authoritative event time comes from the gateway (Google server time) so the 24-jam rule can't be gamed by a wrong local clock. Manual = rare offline override.
- **Buat / Ganti Password:** manage the Members registry (name + role + PIN), or Clerk admin invites, per §27.
- **Edit Jenis Barang:** catalog CRUD — name + **Satuan (unit)**; Tambah Jenis Barang adds name + satuan. Every catalog change is logged as a `catalog_edit` event.
- **Tambah / Kurang Stok:** STOK AWAL stepper = adjust base stock (`adjust` event); **STOK AKHIR stepper = set the min-stock alarm threshold** → notifikasi to Admin when near-empty. Current stock stays derived = base − pengambilan.
- **Cek Histori Data:** the event log itself.

## 29. Audit scope widened
Not just movements — **catalog edits and stock adjustments are also events**, timestamped, so Histori Data is a full audit trail. Event types are now:
`pemakaian · pengambilan · peminjaman · pengembalian · adjust · catalog_edit · status_change`.

## 30. HISTORI DATA columns → Transactions schema
`NO · HARI/TGL/JAM (ts) · NAMA BARANG (itemId) · STOK AWAL · AMBIL (qty) · STOK AKHIR · KETERANGAN (movementType[+condition]) · PENGAMBIL (actor / PIN name)`. STOK AWAL/AKHIR are snapshots the reducer computes at event time for display; the reducer stays the source of truth.

## 31. Prototype updated (v2)
The **Keluar** flow now captures **keterangan** (Peminjaman / Pengambilan / Pemakaian) and a **4-digit PIN verification** step before committing; **Masuk** = Pengembalian with the normal/rusak/hilang condition from Part IV. Categories remain modelled as Perlengkapan/Peralatan; the 8 domains are a navigation layer.

---

# Part VI — Identity resolved: per-role PIN, stored in Clerk (v0.6)

**Decision:** one PIN **per role** (Admin, Anggota), not per member.

- **Attribution becomes role-level**, not per-person — acceptable because the recipient ("untuk siapa / pos mana") is already captured specifically in the Keluar flow. "Who has it / where did it go" is still answered; only the *operator who logged it* drops to role granularity.
- **Storing the PIN in Clerk — yes, with a hard rule:** put the **hashed** role PINs in the Clerk **Organization `privateMetadata`** (backend-only, never sent to the browser). **Never** `publicMetadata` or `unsafeMetadata` — both are readable in the browser, and a 4-digit PIN hash exposed client-side is brute-forced instantly (10⁴ combinations). Verify the PIN **server-side at the gateway** (the one component holding the Clerk secret key).
- **Simpler alternative:** since verification already happens at the gateway, keep the two hashes in the gateway's own secret store (Apps Script `PropertiesService`) and skip the Clerk Backend API round-trip. Clerk `privateMetadata` wins for a single config home; gateway store wins on fewest moving parts.

## 32. The fork that may remove the PIN entirely
- **(A) Per-person Clerk login on each admin's own phone** → the Clerk session already proves role and identity, so **no per-action PIN is needed** — and per-person attribution comes for free. Simplest; best when operators are few and use their own devices.
- **(B) Shared device / kiosk** (one phone, no per-person login) → a **role PIN** authorizes each action; attribution stays role-level.

The PIN only earns its place in (B). Given qurban is run by a few admins with their own phones, **(A) is likely simpler and stronger** — decide the operating model before building any PIN flow. (The prototype's 4-digit keypad already represents the role PIN for model B; under model A it would simply be removed.)

## 33. Rejected: deriving the PIN from the Clerk password
Considered deriving the 4-digit PIN by truncating the Clerk password hash. Rejected:
1. **Not possible** — Clerk never exposes the password plaintext or hash for reading (by design); there's nothing to trim.
2. **No security gain** — any value truncated to 4 digits is still a 10⁴ space; brute force targets the output, so the strong source is wasted.
3. **Coupling bugs** — the PIN would change whenever the password changes, and duplicate PINs appear across users as the roster grows.

**Rule of thumb:** a 4-digit PIN is only safe because of **server-side rate-limiting / lockout at the gateway**, never because of how it's generated.

**Adopted instead:** an independent 4-digit PIN, set at user creation, stored **hashed in the user's Clerk `privateMetadata`**, verified server-side at the gateway with lockout. Clerk stays the single identity store; `pinHash` is just a field on the user — per-person, revocable, survives password changes.

---

# Part VII — Model C + append-only transactional core (v0.7)

**Identity = Model C:** a single **personal PIN**, entered alone, that both identifies and verifies the person. No login, no name tap — matches the spec's "masukkan 4 digit Password" screen exactly.
- **PINs must be globally unique** (the PIN alone resolves *who*). Enforced at creation — the gateway rejects a taken PIN ("pilih Password lain", as the spec already draws).
- **Rate-limiting is per-device** (no user is identified yet to lock) — a few wrong entries → cooldown. This is the load-bearing control; without it 10⁴ is brute-forceable.
- **Lookup:** gateway keeps a `pinHash → userId` map (cached from Clerk `privateMetadata`, or in its own secret store). Never client-side.
- **Accepted trade:** a shoulder-surfed PIN is full impersonation. Fine for a trusted internal tool; C's tracking is "as trustworthy as the PIN stays private."

**Append-only transactional core:** every PIN-confirmed action is **one immutable appended row**, like a Google Form submission. The PIN entry *is* the submit.
- **No mutation, ever.** You never write "stok = 8"; you append a signed delta ("ambil −2"). Current stock/status = initial + fold of deltas, always **derived**. There is no "current data" to modify.
- **Corrections are new rows** — a `reversal` that references the original; the original is never edited or deleted. Audit stays intact.
- **Idempotency:** every submission carries a `clientTxnId`; a double-PIN or retry can't double-append.
- **Catalog changes too** (`catalog_edit`, `adjust`, `status_change`) are appended events — the only mutable thing in the system is the PIN/identity, which lives in Clerk, separate from the log.
- **Where the PIN is checked:** a public Google Form can't verify a PIN, so submit routes through the **gateway** (verify PIN → identify actor → append immutable row with server timestamp + computed stok-awal/akhir snapshot). Same Form semantics — append-only, confirm-to-submit, immutable — with real verification.

Full schema, gateway API, and the `deriveState` reducer are in **BRT-Inventory-Build-Spec.md**.

---

# Part VIII — Merge with requirements PDF (rev) (v0.9)

Reviewed the revised spec against our design. **No hard contradictions** — changes are additive/confirmatory, so merged directly. Interpretation calls flagged at the end for correction.

## 34. Terminology: SETTING → ADMIN
Menu item 17 is now **ADMIN → MENU ADMIN** (was "SETTING → MENU SETTING"), gated by an Admin password first. All "Setting menu" references now read **Admin menu**. Rename only; admin-role gating unchanged.

## 35. NEW — Notifikasi Stok (Admin screen)
A dedicated Admin list of every item that has breached its **Setting Minimum**. Columns:
`NO · HARI/TGL/JAM (when it breached) · NAMA BARANG · STOK AKHIR (current) · SET MIN · KETERANGAN`.
- **Fits our model with no new storage — it is a derived projection.** For each quantity item whose current stock ≤ minStock, the breach timestamp is the transaction that pushed it there (found by replaying the log; resets if it recovers above min). Implemented as the pure selector `deriveNotifications(items, txns, now)` → `domain/notifications.ts` (7 tests passing).
- **STOK AKHIR = Setting Minimum:** the Tambah/Kurang Stok "STOK AKHIR" stepper *is* `minStock`; breaches collate here.
- **The push part** ("mengirimkan notifikasi ke Admin") is a **gateway** function (email/WA/push). The *screen* is derived and static; active notification needs the gateway — consistent with our architecture.

## 36. Confirmations (no change needed)
- **Histori Data** columns `NO · HARI/TGL/JAM · NAMA BARANG · STOK AWAL · AMBIL · STOK AKHIR · KETERANGAN · PENGAMBIL` = our Transactions schema (§30) exactly.
- **Buat/Ganti Password** = per-person password + name under an **Admin/Anggota** role = Model C (per-person PIN + role in Clerk).
- **PENDATAAN → VERIFIKASI (4-digit) → auto-compute + record PENGAMBIL** = Model C + append-only.
- 16 categories, keterangan set, Edit Jenis Barang (name+satuan), Penyetelan Waktu (Manual/Otomatis) — already merged (Part V).

## 37. Interpretation calls (correct me if wrong)
1. **Notifikasi Stok is derived, not a separate mutable table** — matches derive-don't-mutate; no persisted table needed.
2. **RESOLVED — KETERANGAN in Notifikasi = the breaching transaction's keterangan.** An item has no single "default" keterangan (the same row moves under pemakaian *and* pengambilan over time), so there is no such field to read; the breaching txn is what caused the alert, answers "what drove this below minimum?", and falls straight out of the log replay. No new storage, no invented field. This is what `deriveNotifications` already returns.
3. **rusak/hilang stays our extension.** The rev's keterangan set carries no condition on Pengembalian; our normal/rusak/hilang lifecycle remains an addition on top (labelled as an extension), not something the rev removed.

---

# Part IX — Remaining forks resolved (v1.0)

All open spec/design decisions are now settled. Only action items remain (OPEN-QUESTIONS.md).

## 38. Operating model = Model C kiosk (confirmed)
Shared device, opens to the board, each action authorized by a personal 4-digit PIN — no login.
This is what the spec draws and what the whole design already assumes.

## 39. Public dashboard = truly public URL, no login
A publicly reachable, unauthenticated, **PII-free** read-only reporting view (for higher
management), reachable like any public page. Consumes **only** the PII-free `GET state` tier:
stock levels, Notifikasi Stok (low stock), and asset-status **counts** — never borrower/actor
identities or "who has it." Confirms the two-tier read split; the detailed "who" view stays
behind the Clerk/PIN wall.

## 40. Qurban returns = batch "as-is" (normal) + exceptions only
On return, everything defaults to **normal / returned as-is**; the admin only flags exceptions:
- **hilang** (equipment lost) and **rusak** (equipment broken), plus
- **short** (a consumable returned with less than taken → the shortfall is consumed; handled by
  the return `qtyDelta` being smaller than the take — no new mechanism).
Matches the Masuk flow (normal default, tap only the exceptions).

## 41. Scope boundary — items only, no livestock
Tracking covers **item stock only** (tools + consumables). **Animal / meat distribution is out of
scope** — we track item stocks, not "life stocks." Separate concern if ever needed; not this system.

## 42. Write-off metadata — nice-to-have
Capturing a replacement cost / procurement note at write-off (so the loss log doubles as a
"re-buy before Idul Adha" list) is a **nice-to-have**: an optional field on the write-off event;
include if cheap, defer otherwise. Not required for v1.

---

# Part X — Merge with requirements PDF (rev 2) (v1.1)

Reviewed rev 2. Non-contradictory changes merged below. **One is model-affecting and ambiguous — §48 — held for Q&A; not merged until confirmed.**

## 43. Roles: three tiers (Admin Utama · Admin · Anggota)
Buat Password now distinguishes **Admin Utama** (permanent super-admin, "Tetap" — undeletable), **Admin**, **Anggota**. Clerk roles → `admin_utama · admin · anggota`; Admin Utama is the seed account that can't be removed. Model C (per-person PIN) unchanged — just a third role.

## 44. Buat Password = user roster management
Lists every user (name + role, **password hidden**), with per-row **Hapus** (delete + YA/TIDAK confirm) and **Buat Password baru** (role → PIN → verify → name → simpan). Changes logged to Histori Data. Maps to Clerk user management + gateway admin API (`createUserPin`, `disableUser`, `listUsers`). Delete removes the pinHash / disables the user. Consistent with "pinHash never shown."

## 45. Admin PIN also valid at transactions
At the stock VERIFIKASI step an **Admin's** PIN works too, not only Anggota. Consistent with Model C — any valid person's PIN identifies + records them as PENGAMBIL. Admins aren't blocked from stock transactions.

## 46. Setting Minimum can be "(-)" → no notification (merged, tested)
The Tambah/Kurang Stok "STOK AKHIR" (Setting Minimum) stepper accepts **"(-)"** = *no minimum* → that item never triggers a notification. `minStock` is now **nullable**: `deriveState` won't mark a null-min item "low" (still "out" at 0); `deriveNotifications` skips null-min items. 23 domain tests passing.

## 47. Minor
Penyetelan Waktu pre-fills the current date/time (consistent with default Otomatis).

## 48. ⚠️ PENDING Q&A — Edit Menu Utama (dynamic categories)
Rev 2 adds **MENU ADMIN → Edit Menu Utama**: categories become **editable** (add / edit / delete), not a fixed 16. This changes the model — `domain` was a fixed enum; it would become a managed list.
**Not merged yet, because how it's modeled changes `kind` (consumable vs equipment)** — which drives the entire borrow-vs-consume + rusak/hilang lifecycle. Recommended model (to confirm): categories = a managed list seeded with the 16, **each tagged Perlengkapan (→ consumable) or Peralatan (→ equipment)**, so a newly-added category still declares its kind and items inherit it. Alternative: free-form categories with no perlengkapan/peralatan nature — then we need another way to set each item's kind. Awaiting your answer.

---

# Part XI — Category/kind model resolved (v1.2)

Resolves §48. Owner's call, and a genuine simplification.

## 49. Behaviour flag on the item, not the category
The Perlengkapan/Peralatan split was only a **proxy for "consumable vs durable."** Forcing that
label at input is friction; the behaviour is what matters. So we decouple:

- **Category = free-form, editable** (Edit Menu Utama: add/edit/delete). Organizational only
  (kebersihan, listrik, PHBI…). `Item.categoryId → Category`. No behavioural meaning.
- **Kind = a per-item flag, set in plain language** at item creation:
  - **"Bisa habis (dihitung)"** → `kind: consumable` — quantity, depletes (e.g. sabun).
  - **"Barang tetap (bisa rusak/hilang)"** → `kind: equipment` — stays, but can aus/rusak/hilang
    (e.g. pisau).
- `kind` drives everything (quantity+pemakaian vs borrow/return+rusak/hilang). `trackBy` **defaults
  from kind** (consumable→quantity, equipment→instance) and can be overridden — a durable you don't
  tag individually can be quantity-counted.
- **Dropped:** the `domain` enum (→ dynamic `categoryId`) and the `type` (perlengkapan/peralatan)
  field — `kind` replaces its function.

**Intentional divergence from the spec (flagged per working agreement):** the rev doc names
categories "PERLENGKAPAN …/PERALATAN …". We keep those as *category names* if the admin likes, but
the functional flag now lives on the item, in plain language — an owner-approved improvement over
the doc's category-implied typing.

**UI:** Edit Jenis Barang → Tambah asks Nama · Satuan · **Jenis: [Bisa habis / dihitung] or [Barang
tetap / bisa rusak-hilang]**. Edit Menu Utama manages the free-form category list.

**Domain code:** `types.ts` updated (`Category` added; `Item.domain/type` → `categoryId`; `kind`
kept as the flag). Reducers unchanged — they key off `trackBy` / assetId, not category. 23 tests green.

## 50. Two sub-defaults I chose (correct if wrong)
1. **`trackBy` defaults from `kind`** (consumable→quantity, equipment→instance), overridable per item.
2. **Kept the internal value name `equipment`** for the durable kind (the whole rusak/hilang lifecycle
   uses it); only the *UI label* changes to plain language. No functional impact.

---

# Part XII — Keterangan: "Digunakan" added (v1.3)

Rev (minor): the PENDATAAN Keterangan Barang now has a **fifth** option — **Digunakan** — alongside Pemakaian, Pengambilan, Pengembalian, Peminjaman.

## 51. Merged
`MovementType` now includes `digunakan`. Added to the domain union and to the prototype's Keluar keterangan chips. 24 domain tests passing.

## 52. ⚠️ PENDING confirmation — what does "Digunakan" do to stock?
The doc adds the option but doesn't state its stock effect, and it's ambiguous against the existing five. **Not invented — flagged.** Current implementation is the conservative default:
- **ASSUMED: "Digunakan" = a usage-log entry with *no stock effect*** — it records that an item was used (fills Histori Data KETERANGAN) but doesn't change quantity or asset status. This keeps it distinct from **Pemakaian** (which consumes/reduces stock).
- The reducer has an explicit `case 'digunakan': break;` marked pending; a test asserts no stock change.

**Question for owner:** is that right, or should "Digunakan" (a) reduce stock like Pemakaian, or (b) mark a durable temporarily in-use (unavailable, then back), or (c) stay a no-effect usage log? One-line answer and I'll wire the reducer accordingly.

---

# Part XIII — "Digunakan" resolved: in-use state (v1.4)

Resolves §52. Owner's call: **(b)** — Digunakan marks an item **in-use**, a transient state that later resolves to another status (back/returned, broken, lost, unavailable…). It is **not** a stock action.

## 53. Model
- New instance status **`in_use`** (plus **`maintenance`** for "unavailable / out-of-service, not broken").
- **`digunakan` (durable) → `in_use`**, with optional context in `holder` (e.g. "Sholat Jumat"), `since` = ts. Distinct from `out` (peminjaman = lent to a borrower, off-site).
- **Resolution from in_use** reuses pengembalian conditions: normal → available (back), rusak → broken, hilang → lost — same paths as from `out`.
- **General transitions** (→ maintenance/"unavailable", admin overrides) use `status_change` with a new optional **`toStatus`** field.
- On a **quantity-tracked** item, `digunakan` **reduces available stock temporarily** (restored by pengembalian) — see §55.

Updated equipment state machine:
```
available ──peminjaman──► out ────┐
available ──digunakan───► in_use ─┤─ pengembalian:normal ─► available
                                  ├─ pengembalian:rusak ──► broken ─► (repair) available / (retire) retired
                                  ├─ pengembalian:hilang ─► lost ───► (found) available
                                  └─ status_change(toStatus) ─► maintenance | available | retired | …
```
Active asset base = everything except `lost` and `retired`. (`out`, `in_use`, `broken`, `maintenance` are all "present but unavailable".)

## 54. Interpretation flagged
"unavailable" is modelled as **`maintenance`** (out-of-service, not broken) — rename/confirm if you meant otherwise. None of the 5 keterangan set it directly (they reach out / in_use / available / broken / lost); maintenance is reached via an admin `status_change(toStatus)`.

Domain updated: `types.ts` (statuses + `toStatus`), `deriveState.ts` (digunakan→in_use; status_change via toStatus). **27 tests green.**

---

# Part XIV — Digunakan also reduces available stock (v1.5)

Refines §53. Owner: in-use **also reduces stock temporarily**, until the next status is informed.

## 55. Temporary reduction — both tracking modes
- **Instance-tracked durable:** `digunakan` → `in_use`; that unit is no longer counted **available**,
  so the available-instance count drops automatically. Restored on pengembalian:normal; permanently
  gone on rusak/hilang.
- **Quantity-tracked item:** `digunakan` **reduces available qty** by its amount (like a checkout) and
  is **restored by pengembalian**. Unlike `pengambilan`, there is **no 24-jam auto-consume** — it stays
  reduced until the next status is informed; if never returned, it simply stays out.
- The reduction flows into **STOK AKHIR** and therefore **Notifikasi Stok** (`digunakan` is now counted
  in the low-stock replay) — heavy in-use that drops available ≤ Setting Minimum notifies, and clears
  when restored.

Domain updated: `deriveState` (quantity `digunakan` reduces), `notifications` (counts `digunakan`).
**29 tests green.**

---

# Part XV — Rationale: why in-use exists (borrower-tracking is impractical at events)

Records the *reason* behind the out vs in-use split, so it isn't "helpfully" undone later.

## 56. Track the borrower only when the item leaves with a person
- **Peminjaman (→ out)** answers *"who has it?"* — ties the item to a specific borrower/pos. Worth the
  data entry when one person takes something **away** and you may need to chase it down.
- **Digunakan (→ in_use)** answers only *"is it available right now?"* — **no borrower recorded.**

**Why it matters — Qurban.** With ~40 sapi + 120+ kambing in a day, knives, talenan, and timbangan pass
through many hands at every pos, constantly. Forcing a borrower name on each of hundreds of grab-and-use
moments is pure friction — nobody keeps up, and the data rots. So for on-site event use we **skip the
borrower and just mark in-use**: stock drops (temporarily), and it clears when the item is set down /
returned / marked rusak-hilang. Same availability effect, a fraction of the bookkeeping.

**Rule of thumb the model encodes:** borrower tracking only when the item leaves *with a person*; for
on-site event use, in-use with no borrower. This is the same reasoning behind batch-return-as-normal and
the kits/session flows — everything is tuned so a few admins can keep an accurate **availability** picture
on a chaotic day without per-item, per-person bookkeeping.

> ⚠️ Do **not** add a mandatory borrower/recipient field to the in-use (`digunakan`) flow. `holder` on an
> in_use instance is *optional context* (e.g. "Pos Potong 1", "Sholat Jumat"), never a required borrower.


---

# Part XVI — Reality check: real problem, inferred keterangan, in-use deleted (v1.6)

Recorded 2026-09-06 after a full grilling pass over §1 and everything built on it. This Part
**corrects and deletes** earlier decisions; where it conflicts with Parts I–XV, this Part wins.

## 57. What was wrong with the doc
- **§2's central claim was false** — see the correction inline. No paper process exists.
- **The risk register had the wrong top risk.** §12/§17/§21 list alpha-stack, Sheets ceiling,
  quotas, data-entry friction. The real top risk is **adoption** (§0).
- **Parts XII–XV spent three revisions defining `Digunakan`** — a word the boss picked, argued
  about in the abstract, for a system nobody had used. That is the shape of the failure mode
  this Part is meant to stop: design iterating on itself with no contact with reality.

## 58. Decisions locked this session
1. **Write path = the Apps Script gateway.** Forced, not chosen: PINs live in Clerk
   `privateMetadata` (never in the Sheet), and reading that needs Clerk's secret key, which
   cannot ship in a static SPA. A public Google Form verifies nothing — Clerk + raw Forms gives
   *attribution*, not authorization. Forms stays as the offline/bulk fallback (§19 confirmed).
   Cost is not a factor either way: Apps Script on a consumer account is free (20k UrlFetch/day,
   90 min trigger runtime/day, 6 min/execution, 30 concurrent).
2. **Keterangan is INFERRED, never chosen** (`domain/keterangan.ts`). The operator scans and
   types a quantity; the word is derived from the item's `kind` plus the direction of travel:
   consumable + keluar → `pemakaian`; equipment + keluar → `peminjaman`; anything + masuk →
   `pengembalian`. `pengambilan` survives as the one explicit exception ("taken, but coming
   back"). HISTORI DATA renders exactly as the spec draws it — the column is derived, the same
   trick as STOK AWAL/AKHIR (§30). **This dissolves the Part XII–XV `Digunakan` question**: it
   stops being something anyone has to answer.
3. **`digunakan` / `in_use` DELETED**, and `maintenance` with it. Status set returns to Part IV's
   `available · out · broken · lost · retired`. Rationale: in-use recorded **no borrower** by
   design, while the boss's #1 pain is *things go missing*; it offered a one-tap path strictly
   easier than `peminjaman`, and people take the easier path. The friction-saving feature
   defeated the primary requirement. **This overturns the WORKING-AGREEMENT guardrail** — done
   deliberately and with the owner's agreement, because the information changed: when that
   guardrail was written there was no stated problem. `maintenance` can return as an admin
   `status_change` if a real need ever appears.
4. **Speed budget: ~10 seconds / ≤6 taps per item**, measured, not asserted. The daily flow is
   **scan rack QR → qty → Simpan**.
5. **PIN per SESSION, not per transaction.** The spec's VERIFIKASI-per-transaction screen is
   gone: 20 knives cost one PIN, not twenty. **A session is one visit, not a time window** —
   PIN → log everything → `Simpan` commits the batch and ends the session immediately, with a
   90-second idle auto-cancel (discard, not commit). This makes shared-kiosk misattribution
   structurally impossible rather than merely unlikely.
6. **Two identity tiers.** `admin_utama` + `admin` → Clerk **password** login (catalog, stock
   adjustment, reports, roster). `anggota` (marbot) → **PIN** on the kiosk. "Developer" is an
   access level (Clerk dashboard + Apps Script project), not a role the app models.
   **With 1–3 marbot, the PIN's real job is access control, not attribution** — everyone already
   knows who took it. The daily flow is a *consumption counter*, not an accountability ledger.
7. **Read path & privacy** (closes the §12.4 "sharp one"): anything with a person's name on it is
   served by the **gateway**; the **PII-free** tier (stock levels, low-stock, status *counts*)
   goes to a published CSV for the public dashboard (§39). Note published-to-web CSV is cached
   with reported lag up to ~15 minutes — which is why the **scan guard (§15.3) must read through
   the gateway**, or it will confidently show stale status exactly when scans come fastest.
8. **Validation means two separate things**, and they no longer borrow each other's urgency:
   **user validation** (watch a real marbot use it) and **runtime validation** (parse the Sheet's
   CSV into domain types at the `data/` boundary; quarantine and surface malformed rows rather
   than dropping them). A hand-edited Google Sheet is a hostile data source; TypeScript
   interfaces are a promise the compiler cannot keep.
9. **Architecture vocabulary**: name what already exists — **hexagonal core + adapters**
   (`domain/` is the pure core, `data/` the adapters), **repository interfaces** at the boundary,
   and **CQRS/event-sourcing** naming for the append-write / derived-read split you already have.
   **No aggregates, no value-object ceremony** — the domain is ~6 entity types. Hard line:
   **nothing puts I/O or a framework import inside `domain/`.**

## 59. Roadmap, inverted
Because both the room and the records are a mess (§0), the order is forced by data dependency,
not preference — the checkout flow reads a catalog that does not exist yet:

1. **Stock-take (opname).** Walk the gudang with a phone: add each item as you find it, count it,
   print/stick a QR label on the rack or the tool. Output: a real catalog with real starting
   stock and real labels. This alone answers the boss's *"nobody knows what we own"* before a
   single transaction is logged, and it is usable by the owner and the boss on day one with no
   staff training. **The first screen built is not Keluar/Masuk — it is "Tambah barang sambil
   keliling gudang."**
2. **Daily consumables (marbot).** The thing that keeps the register from rotting. Sabun,
   pembersih, plastik sampah — scan rack, qty, Simpan.
3. **Equipment loans.** Borrower capture for outsiders (see §60).

## 60. Still open
- **Who is actually losing things?** Not the marbot — they are permanent and trusted. It is
  whoever else handles equipment (jamaah, panitia, contractors), and **those people are not
  users of this system**. The design conflates *operator* (PIN holder) with *borrower* (the one
  who walks away with the drill); the borrower is the identity that matters for "things go
  missing", and it is currently an optional free-text field. Proposed: a lightweight **borrower
  registry** (tap-to-select, add-new inline, optional phone number — chasing a missing drill
  happens over WhatsApp anyway), in Phase 3. **Action: ask the boss for two real examples of
  things that went missing and what happened.** Two stories settle this faster than more design.
  Strong prior: with a *very messy* gudang, most things are not lent-and-lost but **lost in the
  mess** — in which case the stock-take and labels are the fix, and loan tracking is smaller than
  this doc assumes.
- **Marbot specifics** — how many, own phone or shared gudang tablet, comfort with apps, reading
  fluency. Assumed for now: shared tablet, Bahasa, icon-led, large touch targets.
  **Action: watch them for one hour and write it up as §0.5.**
  Sharp risk to watch for: *if a marbot must walk to a tablet and type a PIN to take a bar of
  soap, they will simply take the soap.* No software fixes that — only physical placement and
  tap count do.
- **Is the boss attached to the specifics?** Whether he cares about *these* 16 categories and
  *these* 5 keterangan, or just wants inventory tracked. Decisions 2 and 3 above both quietly
  change things he wrote. **Action: one page of proposed deviations, each framed as "your goal,
  fewer steps", approved as a batch.**

## 61. Domain layer as of this Part
`domain/` — pure TS, no I/O, no framework. **36 tests green, `tsc --strict` clean.**
- `types.ts` — `MovementType` loses `digunakan`; `InstanceStatus` back to five
  (`available · out · broken · lost · retired`); new `Direction` (`keluar | masuk`).
- `keterangan.ts` **(new)** — `planMovement(item, intent)` → `{ type, qtyDelta }`, the whole of
  decision 2 in one call, plus `keteranganLabel()` for the HISTORI DATA column.
- `deriveState.ts` — `digunakan`/`in_use` branches removed.
- `notifications.ts` — `digunakan` dropped from the quantity-affecting types.

## 62. Verified stack facts (2026-09-06) — corrections to §8

Established from primary sources; full detail in `docs/OCTANE-FINDINGS.md` (22 cited sources)
and `docs/SMARTINV-REUSE-MAP.md`. **Nothing here blocks the build.**

**Corrections to §8's table:**
- **`OctaneCompat` ships in `octane/react`**, not `@octanejs/compat` (which does not exist).
  `ReactCompat` (React inside Octane) is the direction we would actually use. Limits: it adds a
  wrapper `div` (illegal inside table rows and SVG), and React context needs `bridgeReactContext`.
- **Charts: RESOLVED, §8 stands.** There is no `@octanejs/tanstack-charts` — but that is the
  wrong package name. TanStack ships its own adapters under its own scope: **`@tanstack/charts`
  exposes an `./octane` subpath** (verified in the 0.16.0 exports map, alongside `./octane/canvas`
  and `./octane/core`), with `octane` as an optional peer. Do **not** use `@tanstack/octane-charts`
  — its own description says it is a compatibility shim for existing apps and that new apps use
  `@tanstack/charts/octane`. ⚠️ Its declared peer range is `octane: ^0.1.13` while octane is at
  **0.2.3**, so expect a peer-range complaint at install; confirm the resolution at spike time.
- **`docs/bindings-status.md` is real and CI-enforced**, covering **107** bindings.
- **Toolchain is pinned harder than §8 implies**: `octane@0.2.3` requires **Vite 8**,
  **Node ≥ 22.22.2** (we run 24.20.0 ✓) and **TypeScript `^5.9.3`** — a newer TS major breaks
  `tsrx-tsc`. `domain/` and `data/` now pin `~5.9.3` for this reason.
- **Standard `.tsx` compiles as-is, hooks included.** The `.tsrx` dialect (`@if`/`@for`) is opt-in.
  So porting SmartInv's React components does **not** require a rewrite — this is the single
  biggest de-risking fact for §9.
- **Static build works**: plain `vite build` output, SSR is opt-in. Vercel/Cloudflare Pages fine.

**Binding health.** All 29 known failing parity pins across all 107 packages are in
**`@octanejs/floating-ui`** (focus management, list/grid keyboard nav, typeahead) — everything
else in our stack is at zero. `@octanejs/tanstack-query` is the standout: 58/58 exports,
byte-identical surface locked by test. Consequence: **overlays (dropdown/popover focus-return)
are the least-proven UI area**, since floating-ui is the substrate for Radix/shadcn overlays.
This does *not* affect using shadcn's **token layer**, which is plain CSS variables.

**The porting trap to watch for: native events, no synthetic layer.** `onChange` is the
*platform* change event and fires on blur. **Every text input must use `onInput`**, and tests
must use `fireEvent.input`, not `fireEvent.change`. This will be the highest-frequency bug in
the SmartInv port.

**Clerk under Octane** (no `@octanejs/clerk` exists): use **`@clerk/clerk-js`**, which has zero
peer dependencies and is genuinely framework-agnostic — mount imperatively
(`clerk.mountSignIn(el)`, `clerk.mountUserButton(el)`, `clerk.isSignedIn`) from an Octane ref +
effect. ⚠️ Caveat with a direct bearing on §0's gudang: Clerk's quickstart pulls `@clerk/ui`
from Clerk's CDN **at runtime**, so sign-in has a live network dependency a service worker will
not cover. Admins sign in; the marbot PIN path must not depend on it.

**Template reuse is smaller than §9 assumed** (`docs/SMARTINV-REUSE-MAP.md`): SmartInv has **no
design-token layer at all** — `tailwind.config.js` extends only `fontFamily`, there are zero CSS
variables, no dark mode, and every colour is a stock Tailwind utility or one of eight hardcoded
hex literals. It ships **three** status colours; we need **eight**. `context.tsx` mutates state
and emits its log as a side effect — the inverse of append-and-derive — so it is **deleted, not
ported**. What genuinely transfers: the class-string conventions, the layout recipes, and five
context-free primitives (Button, Card, Input, Modal, StockBadge).

**Unknowns, honestly recorded** (Phase-0 spike items, not assumptions): no Octane PWA/service-
worker docs exist anywhere — `vite-plugin-pwa@1.3.0` declares Vite `^8.0.0` so the ranges are
compatible, but no source says the two have been tested together; the required Vitest DOM
environment for `@octanejs/testing-library`; and Clerk's session-change listener signature.

## 63. Resolved by these findings

- **Charts — no change to §8.** `@tanstack/charts/octane` is the adapter (see §62). TanStack
  Charts remains the choice, as constraint #6 specifies.
- **Token layer — §9's "reuse SmartInv's tokens" is DEAD; there are none.** Replacement decided:
  **shadcn's token system** (Tailwind-native CSS variables, light/dark included) supplies the
  layer, **SmartInv's layout recipes and class-string conventions** supply the look, and
  **field-ops overrides are layered only where a written need requires them** — sunlight
  contrast, gudang-tablet touch targets, and the five-status colour language. This keeps the
  working agreement intact: reuse what SmartInv actually has, take the missing layer from a real
  system rather than inventing one, and keep every deviation traceable to a stated requirement.
  Note `@octanejs/floating-ui` holds *all* 29 known parity gaps, so shadcn **overlay components**
  (dropdown/popover focus-return) are the least-proven area — the **token layer is plain CSS and
  is unaffected**.

## 64. Install probe (2026-09-06) — the stack resolves, with two costs

Ran a full `npm install --dry-run` of octane 0.2.3 + vite 8 + typescript 5.9.3 +
`@tanstack/charts` 0.16.0 + the `@octanejs/*` bindings + `@clerk/clerk-js` + tailwindcss.

**Result: clean. No ERESOLVE, no peer conflict**, 555 packages, 35s. The `octane ^0.1.13` peer
range on `@tanstack/charts` does not bite, because `octane` is declared an *optional* peer.
Resolved: vite **8.2.2** · typescript **5.9.3** · tailwindcss **4.3.3** · octane **0.2.3** ·
`@tanstack/charts` **0.16.0** · `@clerk/clerk-js` **6.31.0**.

### 64.1 Tailwind 3 → 4 is a real porting cost nobody had priced
SmartInv runs **tailwindcss ^3.4.17, Vite ^6, TypeScript ~5.8.2**. Our stack forces
**Tailwind 4.3.3, Vite 8, TS 5.9.3**. Tailwind 4 is **CSS-first**: the theme lives in an
`@theme` block in CSS, `tailwind.config.js` is gone, and PostCSS/autoprefixer config goes with
it. Since the reuse map found that **the class strings are the only thing that genuinely
transfers** from SmartInv, they now need a v3→v4 review as they are ported — most utilities are
unchanged, but this is a concrete cost, not a free copy-paste.

*Silver lining:* the two problems partly cancel. SmartInv has no token layer to port (§62), and
Tailwind 4's `@theme` is exactly where the shadcn token layer wants to live. We were authoring
that layer either way; v4 gives it the right home.

### 64.2 `@clerk/clerk-js` drags a Web3 + payments tree into the bundle
Its **hard dependencies** (not optional peers — these ship) include `@solana/wallet-adapter-*`,
`@solana/wallet-standard`, `@coinbase/wallet-sdk`, `@base-org/account`, `@stripe/stripe-js`,
`crypto-js`, `core-js` and `@zxcvbn-ts/*`. It exposes only two entry points (`.` and `./no-rhc`)
— there is no headless or tree-shaken build. For a masjid inventory kiosk that is a large amount
of wallet and payments code, and a correspondingly large supply-chain surface, for zero benefit.

**Decision: do not bundle Clerk. Load it lazily, from Clerk's CDN, only on admin routes.**
This follows directly from §0 and Part XVI:
- Only **admins** sign in. The **marbot PIN path is the hot path** and must not depend on Clerk
  at all — which also removes the §62 caveat about Clerk's runtime CDN fetch for `@clerk/ui`
  being a live network dependency in a gudang with poor wifi.
- The kiosk bundle then contains **no Clerk code whatsoever**: it ships the board, the scan
  flow, and a PIN pad that talks only to the gateway.
- Admin sign-in is a rare, deliberate action where a CDN round-trip is acceptable.

## 65. Gateway facts (2026-09-06) — buildable, with one correction to Part VII

From `docs/GATEWAY-FINDINGS.md` (54 cited sources + 3 direct probes).

### 65.1 A browser CAN call the gateway — as a CORS "simple request" only
Deploy with manifest `access: ANYONE_ANONYMOUS` + `executeAs: USER_DEPLOYING`, and return
`ContentService` `TextOutput` (`HtmlService` causes CORS errors). Hard constraints:
- **No custom request headers.** Apps Script handles only GET/POST; there is no `doOptions`, and
  `TextOutput` has **no header-setting method at all**. The widely-blogged "add a `doOptions()`
  that sets `Access-Control-Allow-Origin`" advice is **impossible**, not merely discouraged.
- **`Content-Type` must be `text/plain`**, never `application/json`.
- ⚠️ **Naming trap:** the IDE's "Anyone" = manifest `ANYONE_ANONYMOUS`. Manifest `ANYONE` means
  *logged-in*, and returns a Google login page with **HTTP 200** — silent breakage.

### 65.2 ⚠️ CORRECTION TO PART VII — per-IP rate limiting is IMPOSSIBLE
The documented `doGet`/`doPost` event object is exhaustive and carries **no request headers, no
cookies, and no client IP**. Consequences:
- Bearer-token auth cannot use a header — the token travels in the POST body.
- Clerk's `__session` cookie transport is impossible.
- **IP-based rate limiting cannot be done at all.** Part VII calls rate-limiting "the load-bearing
  control" for a 4-digit PIN, and a client-supplied device id is worthless here: an attacker
  POSTing to the public web-app URL could rotate it and walk the entire 10^4 keyspace.

**Fix — device enrolment (new, required for Model C to be honest).** An admin enrols each kiosk
once, signed in with Clerk; the gateway issues a **long random device secret** the kiosk stores.
Every PIN attempt carries it. Then:
- lockout is per **enrolled** device and cannot be reset by clearing storage;
- an attacker without an enrolled secret cannot reach the PIN endpoint at all;
- a lost or stolen kiosk is **revoked** by deleting one row.
Add a **global** failed-PIN ceiling as a backstop. Without enrolment, the PIN is decorative.

### 65.3 Clerk verification: HS256 JWT template, not RS256
Two confirmed dead ends: Apps Script has **no RSA signature *verification* primitive** (Utilities
offers RSA/HMAC *signing* and hashing only; V8 has no `crypto`/`SubtleCrypto`), and **no Clerk
endpoint verifies a session JWT** — `POST /v1/sessions/{id}/verify` is deprecated and absent from
every API spec >= 2025-04-10; `/v1/tokens/verify` never existed. "Just ask Clerk" is unavailable.

**Path: a Clerk JWT template with a custom HS256 signing key** (documented by Clerk in their Hasura
integration). Apps Script then verifies natively with `Utilities.computeHmacSignature`, with
algorithm pinning, constant-time compare, and `exp`/`nbf`/`iss`/`azp` checks — no RSA maths, no
network call. Trade: a symmetric key means the gateway can also *mint* tokens.
⚠️ **UNCONFIRMED: whether JWT templates require a paid Clerk plan.** This bears directly on the
owner's "keep the free version" constraint — a 2-minute dashboard check, and the first spike.
*(Rejected fallback: `jsrsasign` went end-of-support 14 Aug 2026, all npm versions deprecated.)*

### 65.4 Other constraints now known
- **Cannot look up a user by `private_metadata`** — `GET /v1/users` has no metadata filter. The
  Model C `pinHash -> userId` map therefore lives in the gateway's own `PropertiesService`, as
  Part VII already assumed. Putting the hash in `external_id` to make it filterable would
  **publish** it — never do this.
- **Breaking change:** metadata is rejected on `PATCH /v1/users/{user_id}` as of API version
  2026-05-12 — use `PATCH /v1/users/{user_id}/metadata`, and pin `Clerk-API-Version`.
- **Clerk tokens live 60 seconds** — a token must never be stored in the offline queue; mint at
  flush time.
- **PIN hashing:** no bcrypt/scrypt/argon2/PBKDF2 exists in Apps Script. Best available is
  **HMAC-SHA256 with a per-user salt plus a secret pepper** in `PropertiesService`. The keyed
  construction is the only real defence — a leaked plain hash over a 10^4 keyspace is enumerated
  instantly.
- **Idempotency needs `LockService`:** neither `appendRow` nor Sheets `values.append` documents
  atomicity, and `clientTxnId` dedup is a check-then-append.
- **clasp is healthy** (v3.4.1, 2026-08-28) — the script lives in git; secrets do not.

## 66. The theme, corrected (2026-09-06) — reuse means reuse

§63 recorded the token layer as **"shadcn's token system + SmartInv's layout recipes"**. Building
it that way produced an app that shared SmartInv's *conventions* but not its *look* — an
authored teal palette and plain tabs against a slate-and-sky sidebar app. **That is a gap
against the working agreement's prime directive, not a design decision**, and the owner was
right to call it. §63's token choice is superseded by this section.

**What we actually do now.** SmartInv has no token layer (§62), but it does have a *convention*:
stock Tailwind utilities, a `slate` ground with `sky` brand, and `Plus Jakarta Sans` as the only
theme extension. We adopt that convention rather than substituting a different system:

- `styles.css` declares **only the font**, exactly as `frontend/tailwind.config.js:11-13` does,
  plus their `.glass` and `.custom-scrollbar` utilities. Everything else is stock Tailwind.
  **Dark mode is dropped** — the template ships none, and a sunlit gudang wants a light ground.
- `components/ui.tsx` ports their `Card`, `Button`, `Input`, page header, stat tile and table
  class strings verbatim, each cited to a file and line.
- `components/Sidebar.tsx` and `Navbar.tsx` port their shell class-for-class — the
  `md:rounded-[32px]` dark panel, the sky-gradient brand mark, the active-nav gradient pill with
  its `border-l-4 border-sky-400`, the blurred background glows, the `h-20` translucent header.
- **Hash routing**, as their `HashRouter` does. Independently the better choice for us: a hash
  never reaches the server, so a printed QR works on any static host with **zero rewrite config**
  — with path routing, a host missing its SPA fallback turns every sticker into dead paper, and
  only after they are printed.

**The status palette now extends the template instead of replacing it.** `StockBadge.tsx:10-17`
uses a `bg-X-50 / text-X-700 / border-X-100` triple from a stock Tailwind family and ships three
statuses. We keep those three unchanged (green/amber/red) and add four more in the identical
shape: **dipinjam** sky · **rusak** orange · **hilang** rose (deliberately deeper — a terminal
write-off, not a repair-queue item) · **pensiun** slate. Pill geometry is theirs, verbatim.

**Extensions kept, each against a written need** — and only these:
- `--spacing-touch: 3.5rem` and a `touch` Button size. SmartInv's controls are 32–44px; a shared
  tablet handled with wet or gloved hands needs 56px (Part XVI).
- `font-size: max(16px, 1em)` on inputs, so a mis-tap never zooms the kiosk.
- The four extra status colours above.
- The notification bell is **bound** to Notifikasi Stok. In the template its unread dot is always
  rendered and wired to nothing (`Navbar.tsx:47-53`); carrying that over would ship a permanent
  red dot that means nothing.
- `.custom-scrollbar` is **defined**. The template applies it in three files but never declares
  it anywhere — a no-op there.

**Departures forced by the port, not chosen:** no `useAuth` in the Sidebar or Navbar (nobody is
signed in on a kiosk), and framer-motion's spring widths and `layoutId` shared-layout pill become
CSS transitions — `@octanejs/motion` is not yet a dependency, and its `layoutId` is single-element
FLIP rather than a projection tree (§62). Static appearance is identical; only the animation
between nav items is lost. Revisit when motion is added.
