# Locked decisions (quick reference)

Full reasoning in BRT-Inventory-System-Design.md (Parts I–XVI) and BRT-Inventory-Build-Spec.md.

> ⚠️ **Read the v1.6 section at the bottom first.** It corrects several entries above —
> most importantly: there is no paper process (the PDF is the boss's proposal, not a spec),
> keterangan is now **inferred not chosen**, and `digunakan`/`in_use` is **deleted**.

## Architecture
- **Source of truth = Google Sheets**, event-sourced. **Derive-don't-mutate**: current stock/
  status is computed from an append-only log, never stored/edited.
- **Single Clerk-gated Apps Script gateway** handles writes + privacy-sensitive reads (chosen
  because qurban is run by a *few admins* → low concurrency, so no need to split write paths).
- **Static SPA**, no server we operate. **Zig** only if Apps Script quotas/latency ever bite.
- **Offline / compaction = optional** (downgraded once we learned concurrency is low).

## Data model
- ~~**16 categories**: 8 domains × {perlengkapan, peralatan}.~~ **SUPERSEDED v1.2** — category is a
  free-form editable list (`categoryId`); `kind` is a per-item behaviour flag.
- **Consumables** tracked by quantity (rack/location QR). **Equipment** tracked per-instance
  (every unit its own QR label).
- **Append-only logs**: `Transactions` (movements) + `CatalogLog` (catalog edits). `Items` /
  `AssetInstances` are rebuildable projections.

## Movement + lifecycle
- ~~**Keterangan (required per txn)**: pemakaian · pengambilan · peminjaman · pengembalian.~~
  **SUPERSEDED v1.6 — keterangan is INFERRED from `kind` + direction; the operator never picks one.**
- **Pengembalian carries a condition**: normal → available · **rusak → broken (repairable)** ·
  **hilang → lost (write-off, leaves the active asset base)**. rusak ≠ hilang.
- Equipment states: **available · out · broken · lost · retired** (v1.6 restored this five-state set;
  `in_use` and `maintenance` are deleted).
- **24-jam rule**: a consumable taken and not returned in 24h is consumed. Implemented as a pure
  function of `now` (decrement at take, restock on return-within-window) — no cron.
- **Corrections = reversal rows**, never edits/deletes.

## Identity (Model C)
- **One personal PIN**, entered alone, that identifies AND verifies (matches the spec screen).
- **Clerk** is the identity store; each user carries a hashed PIN in **`privateMetadata.pinHash`**.
- **PINs globally unique** (enforced at creation). **Rate-limit per device**. Verify server-side
  at the gateway. Never client-side; never publicMetadata/unsafeMetadata.
- Rejected: deriving the PIN from the Clerk password (can't read the hash; 4 digits is still 10⁴;
  couples PIN to password). See Design doc §33.
- Accepted trade: a shoulder-surfed PIN = impersonation; fine for a trusted internal tool.

## Admin menu (rev)
- **SETTING renamed → ADMIN / MENU ADMIN** (admin-password gated).
- Actions: Penyetelan Waktu · Buat/Ganti Password · Edit Jenis Barang · Tambah/Kurang Stok ·
  **Notifikasi Stok** (NEW) · Cek Histori Data.
- **Notifikasi Stok** = derived low-stock projection (`deriveNotifications`), no new storage;
  push to Admin is a gateway job. STOK AKHIR stepper = Setting Minimum (minStock).

## Transactional core
- The **PIN entry IS the submit** — one immutable appended row per action, like a Google Form
  response. `clientTxnId` makes it idempotent.

## Template + theme
- **Base = spessolve/smart-inventory-system** (React 19 + Vite + TS + Tailwind + Framer Motion +
  Lucide + Sonner; Sidebar/Navbar/Card; Dashboard/Inventory/Login; Vitest + Docker + Vercel).
- **Theme approach = (b)**: reuse SmartInv's tokens + components, layer field-ops overrides ONLY
  where the qurban context requires (contrast, touch targets, five-status colours). See reuse map.

## Stack (chosen)
- Octane (octanejs) UI · TanStack Query (server-state) · TanStack Store (client-state) ·
  TanStack Charts · Clerk (auth) · i18next (id-first). All pre-1.0 pieces isolated behind the
  pure domain layer so a blocked binding never forces a rewrite.

## Operations & scope (resolved)
- **Operating model = Model C kiosk** — shared device, opens to the board, personal PIN per action, no login.
- **Public dashboard = truly public URL, no login** — PII-free (stock levels + Notifikasi Stok + status
  COUNTS only; never "who has it"). Reads only the PII-free `GET state` tier.
- **Qurban returns = batch "as-is" (normal default) + exceptions only**: hilang / rusak (equipment) and
  short (consumable returned < taken → shortfall consumed via return qtyDelta).
- **Scope = item stock only.** Animal / meat distribution is OUT of scope ("we track item stocks, not life stocks").
- **Write-off metadata = nice-to-have** — optional replacement-cost/procurement note on the write-off event.
- **Alpha stack accepted** — no Phase-0 spike; owner confident Octane + TanStack bindings +
  TanStack Charts are good enough. Domain layer stays isolated/tested as the safety net.

## Rev 2 (merged)
- **Roles = 3 tiers:** Admin Utama (permanent) · Admin · Anggota.
- **Admin PIN valid at transactions** (not only Anggota).
- **Buat Password = roster mgmt** (list/delete/create; passwords hidden; logged).
- **minStock nullable** — "(-)" = no minimum, no notification. (domain updated, 23 tests green)
- **PENDING — dynamic categories (Edit Menu Utama):** not merged; needs the §48 kind-inheritance answer.
- **Category/kind resolved (v1.2):** category = free-form editable list (`categoryId`);
  **kind is a per-item plain-language flag** ("Bisa habis/dihitung" = consumable · "Barang tetap" =
  equipment). Dropped `domain` enum + `type`. `trackBy` defaults from kind. Reducers unchanged; 23 tests green.
- **Keterangan = 5 options (v1.3):** + **Digunakan** (was 4). Stock effect ASSUMED no-op usage log — pending owner confirmation (Design §52).
- **Digunakan resolved (v1.4):** it's a **status transition, not a stock action** → durable goes to
  **in_use** (transient), resolves via pengembalian to available/broken/lost; admin `status_change(toStatus)`
  can set **maintenance** ("unavailable"). New statuses in_use + maintenance; Txn gains `toStatus`. 27 tests green.
- **In-use reduces stock (v1.5):** digunakan also **temporarily reduces available** (instance: unit not
  counted available; quantity: qty reduced, restored by pengembalian, no 24h auto-consume). Counts toward
  Notifikasi Stok. 29 tests green.
- **Out vs in-use rationale (v1.5):** track borrower ONLY when the item leaves with a person (peminjaman→out).
  For on-site event use (Qurban), skip the borrower → mark in-use (digunakan). Borrower field must stay
  OPTIONAL on the in-use flow — never required. (Design §56)


---

## v1.6 — Reality check (2026-09-06). Corrects everything above where they conflict.

### The problem (Design doc §0) — this is new, and it outranks the PDF
- **There is no paper process.** The requirements PDF is the **boss's proposal**; he is not an
  inventory specialist and has said improvements are open to discuss. **PDF = input, not spec.**
- **Real pains:** (1) nobody knows what we own · (2) things go missing · (3) reporting upward ·
  (4) inventory is **very messy, physically and informationally**.
- **Top risk is ADOPTION**, not the alpha stack. Replacing nothing is harder than replacing a book.
- **Users:** **marbot are one group among several**, not the only operators — they use a PIN to
  report *fast* what was taken and used · admins/boss via Clerk password · equipment borrowers
  may be **outsiders with no accounts**. ⚠️ Corrected from "1–3 marbot"; the claim that the PIN
  is merely access control rested on that and **no longer holds** — attribution is real work.

### Locked
- **Write path = Apps Script gateway** (forced: PIN hashes live in Clerk `privateMetadata`, reading
  which needs a secret key that cannot ship in a static SPA; a public Form verifies nothing).
  Forms = offline/bulk fallback. Apps Script is free — cost does not distinguish the two.
- **Keterangan INFERRED, never chosen** (`domain/keterangan.ts`): consumable+keluar → `pemakaian`;
  equipment+keluar → `peminjaman`; anything+masuk → `pengembalian`. `pengambilan` = the one
  explicit exception ("taken, but coming back"). HISTORI DATA renders unchanged — the column is
  derived. **Dissolves the Parts XII–XV `Digunakan` question entirely.**
- **`digunakan` / `in_use` DELETED**, `maintenance` with it. It recorded no borrower by design,
  which defeats pain (2), and it was the easiest path — so it would have become the only path.
  **This deliberately overturns a WORKING-AGREEMENT guardrail**, with the owner's agreement.
- **Speed budget ~10s / ≤6 taps per item.** Daily flow: **scan rack QR → qty → Simpan.**
- **PIN per SESSION, and a session is one visit** — PIN → log everything → `Simpan` commits and
  ends it; 90s idle auto-cancel (discard). No idle window for the next person to be misattributed
  into. Replaces the spec's VERIFIKASI-per-transaction screen.
- **Two identity tiers:** `admin_utama` + `admin` → Clerk password · `anggota` (marbot) → PIN.
  "Developer" is an access level, not a role. With 1–3 marbot the PIN is **access control, not
  attribution** — the daily flow is a consumption counter, not an accountability ledger.
- **Read path / privacy (closes §12.4):** named data → gateway; PII-free tier (stock, low-stock,
  status counts) → published CSV for the public dashboard. Published CSV lags up to ~15 min, so
  **the scan guard must read through the gateway** or it will show stale status.
- **Validation = two separate things:** user validation (watch a marbot) *and* runtime validation
  (parse Sheet CSV → domain types at the `data/` boundary; quarantine bad rows, never drop silently).
- **Architecture vocabulary:** hexagonal core (`domain/`) + adapters (`data/`), repository
  interfaces, CQRS/event-sourcing naming. **No aggregates.** Nothing puts I/O in `domain/`.

### Roadmap, inverted (data dependency, not preference)
1. **Stock-take (opname)** — walk the gudang, add each item, count it, QR-label it. First screen
   built is *"Tambah barang sambil keliling gudang"*, **not** Keluar/Masuk. Answers pain (1) before
   a single transaction is logged.
2. **Daily consumables (marbot)** — the thing that keeps the register from rotting.
3. **Equipment loans** — including borrower capture for outsiders.

### Domain layer
`domain/` — pure TS, **36 tests green**, `tsc --strict` clean. New `keterangan.ts`
(`planMovement`, `keteranganLabel`). `digunakan`/`in_use` removed from types, reducer, notifications.

### v1.6 addendum — verified stack facts (2026-09-06)
- **Charts: `@tanstack/charts` + the `/octane` subpath.** NOT `@tanstack/octane-charts` (a compat
  shim its own README tells new apps to skip). §8 unchanged. Peer range says `octane ^0.1.13` vs
  actual 0.2.3 — expect an install complaint; confirm at spike.
- **Token layer: shadcn tokens + SmartInv layout recipes + justified field-ops overrides.**
  SmartInv has **no** token layer (no custom Tailwind theme, no CSS variables, no dark mode,
  8 hardcoded hex literals, 3 status colours vs our 8). §9's "reuse its tokens" is impossible.
- **`OctaneCompat` lives in `octane/react`** (not `@octanejs/compat`, which doesn't exist).
- **Standard `.tsx` compiles as-is under Octane** — the SmartInv port needs no rewrite. `.tsrx` is opt-in.
- **Toolchain pins:** Vite 8 · Node ≥ 22.22.2 · TypeScript `~5.9.3` (TS 6 breaks `tsrx-tsc`).
- **Octane uses NATIVE events**: `onChange` fires on blur — text inputs use **`onInput`**, tests
  use `fireEvent.input`. Highest-frequency porting bug.
- **Clerk: `@clerk/clerk-js`** (zero peer deps), mounted imperatively. ⚠️ Sign-in pulls `@clerk/ui`
  from Clerk's CDN at runtime — a live network dependency. The marbot PIN path must not depend on it.
- **`context.tsx` is deleted, not ported** — it mutates state and emits its log as a side effect,
  the inverse of append-and-derive.
- **Binding health:** all 29 known parity gaps are in `@octanejs/floating-ui`; the rest of our
  stack is at zero. `@octanejs/tanstack-query` is 58/58, byte-identical, locked by test.
- **Install probe passes** (§64): octane 0.2.3 + vite 8.2.2 + TS 5.9.3 + @tanstack/charts 0.16.0
  + @octanejs/* + @clerk/clerk-js + tailwindcss 4.3.3 resolve with **no peer conflict**.
- **Tailwind 3 → 4 migration is a real port cost.** SmartInv is Tailwind 3.4 / Vite 6 / TS 5.8;
  we are on Tailwind 4 (CSS-first `@theme`, no `tailwind.config.js`). Class strings — the only
  thing that genuinely transfers — need a v3→v4 review as they are ported.
- **Clerk is NOT bundled.** `@clerk/clerk-js` hard-depends on Solana/Coinbase/Base wallet SDKs,
  Stripe.js, crypto-js and core-js, with no headless build. Load it **lazily from Clerk's CDN,
  admin routes only**. The kiosk bundle contains zero Clerk code — the marbot PIN path talks only
  to the gateway, which also removes the offline risk of Clerk's runtime CDN fetch.

### v1.6 addendum — gateway facts (§65)
- **Gateway is callable from the browser** as a CORS *simple request* only: `ANYONE_ANONYMOUS` +
  `executeAs: USER_DEPLOYING`, `ContentService` TextOutput, `Content-Type: text/plain`, **no custom
  headers** (`doOptions` CORS advice is impossible — TextOutput cannot set headers).
- ⚠️ **CORRECTS Part VII: per-IP rate limiting is impossible.** `doPost` sees no headers, no
  cookies, no client IP. **Device ENROLMENT is now required** — an admin registers each kiosk and
  the gateway issues a long device secret; lockout is per enrolled device and revocable. Without
  it the 4-digit PIN is decorative.
- **Clerk verification = HS256 JWT template** verified with `Utilities.computeHmacSignature`.
  Apps Script has no RSA *verify*; no Clerk endpoint verifies a session JWT any more.
  ⚠️ **OPEN: does a JWT template need a paid Clerk plan?** Bears on the "keep it free" constraint.
- **pinHash → userId map lives in gateway `PropertiesService`** (Clerk cannot filter users by
  private_metadata; putting it in `external_id` would publish it).
- **PIN hash = HMAC-SHA256 + per-user salt + secret pepper.** No bcrypt/argon2 in Apps Script.
- **Clerk tokens live 60s** — never store one in the offline queue; mint at flush time.
- **`LockService` required** for `clientTxnId` idempotency (append is not documented atomic).
