# SmartInv reuse map

Per `docs/WORKING-AGREEMENT.md`: every row is filled from a REAL file in the cloned template.
Anything not found in a file is written as `UNKNOWN — needs <file>`. Nothing here is inferred.

**Template repo:** https://github.com/spessolve/smart-inventory-system
**Read from local clone:** `/home/asyafalni/Documents/smart-inventory-system`
**Verified:** 2026-09-06. All paths below are relative to that clone.

Column meaning:
- **SmartInv source** — file:line in the clone.
- **What it actually is** — literal values/classes read from that file.
- **How we'd reuse it** — the mechanical mapping onto our screens.
- **Extension + why** — **TBD (owner decides).** Not filled by this audit.

---

## 0. Headline finding: there is no token layer

`frontend/tailwind.config.js:9-15` extends **only** `fontFamily`. There are **no** custom colours,
spacing, radii, shadows, breakpoints or plugins (`plugins: []`, line 16). Every colour in the app is
either a **stock Tailwind utility** (`sky-500`, `slate-900`, …) or a **hardcoded hex literal** inline in
a component. There is no CSS-variable theme, no `:root` block, and no dark mode anywhere in the repo.

Consequence: "pull SmartInv's tokens" is not possible as stated in the design doc — there are no tokens
to pull. What exists is a **convention** (which stock Tailwind classes get used where), not a theme.

---

## 1. Colour palette

### 1a. Where colour is actually declared

| SmartInv source | What it actually is | How we'd reuse it | Extension + why |
|---|---|---|---|
| `frontend/tailwind.config.js:9-15` | `theme.extend` contains **only** `fontFamily.sans`. No `colors` key. | Nothing to inherit — we would author the token layer ourselves. | TBD |
| `frontend/index.css:5-9` | Global body: `@apply bg-slate-50 text-slate-900 font-sans;` — the app ground + default ink. | Same base for our app shell. | TBD |
| `frontend/index.css:11-15` | `.glass` utility = `bg-white/70 backdrop-blur-md border border-white/30`. The only custom class in the CSS. | Reusable as-is for elevated panels. | TBD |
| `frontend/index.css:24-28` | Scrollbar thumb `bg-slate-300`, hover `bg-slate-400`, width `6px` (line 19). | Reuse as-is. | TBD |

### 1b. Hex literals hardcoded in components (complete list — `grep '#[0-9A-Fa-f]{3,8}'`)

| Hex | Occurrences (file:line) | Role in the file |
|---|---|---|
| `#38BDF8` | `components/Button.tsx:25`, `components/Input.tsx:17` (×2), `pages/Dashboard.tsx:181,182,196,239` | Primary / brand sky. Button `primary` bg, Input focus ring+border, chart "Stock In" stroke & gradient, alert hover bg. |
| `#0EA5E9` | `components/Button.tsx:25` | Primary **hover** state. |
| `#22C55E` | `components/Button.tsx:28` | `success` variant bg. |
| `#F59E0B` | `components/Button.tsx:29` | `warning` variant bg. |
| `#0F172A` | `pages/Dashboard.tsx:168`, `pages/Login.tsx:72` | Near-black: active segmented-control chip; full-page Login background. |
| `#94A3B8` | `pages/Dashboard.tsx:185,186,190,191,197` | Chart "Stock Out" stroke/gradient + axis tick colour. |
| `#E2E8F0` | `pages/Dashboard.tsx:189` | Chart cartesian grid stroke. |
| `#f8fafc` | `components/Sidebar.tsx:168` | `whileHover` background of the sidebar collapse toggle. |

These hexes are the Tailwind `sky-400/500`, `green-500`, `amber-500`, `slate-900/400/200`, `slate-50`
values written out longhand; they are **not** defined as tokens anywhere.

### 1c. Utility-class colour usage (measured frequency across `**/*.tsx`)

| Family | Counts read from source |
|---|---|
| slate | `slate-400` ×54, `slate-900` ×37, `slate-500` ×29, `slate-100` ×25, `slate-50` ×22, `slate-200` ×19, `slate-700` ×10, `slate-600` ×4, `slate-300` ×3, `slate-800` ×1, `slate-950` ×1 |
| sky (brand) | `sky-500` ×39, `sky-600` ×10, `sky-400` ×8, `sky-50` ×6, `sky-200` ×4 |
| red (danger) | `red-500` ×10, `red-600` ×3, `red-50` ×4, `red-100` ×2, `red-400` ×1, `red-700` ×1 |
| green (safe) | `green-500` ×4, `green-50` ×4, `green-600` ×2, `green-100` ×1, `green-700` ×1 |
| amber (warn) | `amber-500` ×4, `amber-50` ×4, `amber-600` ×3, `amber-100` ×2, `amber-700` ×1 |
| blue | `blue-600` ×2, `blue-200` ×1 |
| orange | `orange-500` ×1, `orange-50` ×1 (only `pages/Inventory.tsx:182`, the "Stock Out" row action) |

**Status colour language the template actually ships** — `components/StockBadge.tsx:10-14`, exactly three:

| Status | Classes (StockBadge.tsx) |
|---|---|
| `Safe` | `bg-green-50 text-green-700 border-green-100` |
| `Low` | `bg-amber-50 text-amber-700 border-amber-100` |
| `Out of Stock` | `bg-red-50 text-red-700 border-red-100` |

Our model needs five+ answers (tersedia / dipinjam / menipis / rusak / hilang, plus `in_use`,
`maintenance`, `retired`). The template supplies **three**; the rest is TBD (owner decides).

---

## 2. Typography

| SmartInv source | What it actually is | How we'd reuse it | Extension + why |
|---|---|---|---|
| `frontend/tailwind.config.js:11-13` | `fontFamily.sans: ['Plus Jakarta Sans', 'sans-serif']` — the entire theme extension. | Same declaration; swap family only if owner decides. | TBD |
| `frontend/index.html:8-10` | Font loaded from Google Fonts CDN: `Plus+Jakarta+Sans:wght@300;400;500;600;700`, with `preconnect` to fonts.googleapis.com / fonts.gstatic.com. | Same loading mechanism. | TBD |
| `frontend/index.css:7` | `body { @apply … font-sans; }` — family applied globally. | Same. | TBD |
| `pages/Dashboard.tsx:110`, `pages/Inventory.tsx:92`, `pages/TransactionLogs.tsx:68`, `pages/UserManagement.tsx:51` | **Page title convention**: `<h1 className="text-2xl font-bold text-slate-900">`, followed by `<p className="text-slate-500">` subtitle (Dashboard:111, Inventory:93, TransactionLogs:69). | Reuse verbatim as the page-header pattern for all our screens. | TBD |
| `pages/Dashboard.tsx:148` | Stat value: `text-2xl font-bold text-slate-900`. | Reuse for the status-board numbers. | TBD |
| `pages/Dashboard.tsx:147` | Stat label: `text-xs font-semibold text-slate-500 uppercase tracking-wider`. | Reuse for tile labels. | TBD |
| `pages/Inventory.tsx:134-139` | Table header cell: `text-xs font-bold text-slate-500 uppercase tracking-wider`. | Reuse for HISTORI DATA / stok table headers. | TBD |
| `components/StockBadge.tsx:17` | Badge text: `text-[10px] font-bold uppercase tracking-wider`. | Reuse for status pills. | TBD |
| `components/Navbar.tsx:63` | Role caption: `text-[10px] font-bold text-sky-500 uppercase tracking-tighter`. | Reuse for role/PIN identity chip. | TBD |
| `pages/Inventory.tsx:160` | SKU/code: `text-[10px] text-slate-400 font-mono uppercase tracking-tighter` — the only `font-mono` usage in the app. | Reuse for asset IDs / QR codes (`ALQ-…`). | TBD |
| `pages/Login.tsx:109` | Hero: `text-4xl lg:text-5xl font-extrabold text-white leading-[1.1]`. | Login/kiosk hero. | TBD |

Observed type scale, from smallest to largest, is: `text-[9px]` (Navbar:36), `text-[10px]`, `text-[11px]`,
`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-4xl`, `text-5xl`. There is **no**
declared scale in config — these are stock Tailwind sizes used ad hoc.

---

## 3. Spacing, radii, shadows

| Aspect | SmartInv source | What it actually is | Extension + why |
|---|---|---|---|
| Spacing scale | `frontend/tailwind.config.js:9-15` | **Not extended.** Stock Tailwind spacing only. | TBD |
| Vertical page rhythm | `pages/Dashboard.tsx:107`, `pages/Inventory.tsx:89`, `pages/TransactionLogs.tsx:65`, `pages/UserManagement.tsx:49` | `space-y-6` between page sections (Dashboard/TransactionLogs/UserManagement also add `pb-8` / `pb-10`). | TBD |
| Grid gaps | `pages/Dashboard.tsx:140` (`gap-4`), `:154` (`gap-6`), `pages/UserManagement.tsx:57` (`gap-6`) | `gap-4` for stat tiles, `gap-6` for major columns/cards. | TBD |
| Main content padding | `App.tsx:77` | `px-4 md:px-8 pb-8`. | TBD |
| Card padding | `components/Card.tsx:17` | `p-5` (baked into Card; overridable via `className`, e.g. `p-0` at `pages/Inventory.tsx:100`). | TBD |
| Table cell padding | `pages/Inventory.tsx:134-186`, `pages/TransactionLogs.tsx:182-216` | `px-6 py-4` for both `th` and `td`. | TBD |
| Radii (measured usage) | across `**/*.tsx` | `rounded-lg` ×25, `rounded-full` ×14, `rounded-2xl` ×11, `rounded-xl` ×9, `rounded-md` ×2, `rounded-3xl` ×2, `rounded-[32px]` ×2 (`Sidebar.tsx:77`, `Login.tsx:93`), `rounded-[20px]` ×1 (`Navbar.tsx:26`). No radius tokens declared. | TBD |
| Radius convention | `components/Card.tsx:17` = `rounded-lg`; `components/Button.tsx:22` = `rounded-lg`; `components/Input.tsx:15` = `rounded-lg`; `components/Modal.tsx:39` = `rounded-xl`; chrome (Sidebar/Navbar/Login shell) uses `rounded-2xl`/`rounded-[32px]`. | Content = `lg`, chrome = `2xl`+. | TBD |
| Shadows (measured usage) | across `**/*.tsx` | `shadow-sm` ×15, `shadow-lg` ×5, `shadow-xl` ×3, `shadow-2xl` ×3, `shadow-md` ×3, `shadow-sky-500/20` ×3 (coloured brand glow: `Sidebar.tsx:87`, `Login.tsx:102,166`), and one arbitrary `shadow-[0_4px_12px_rgba(0,0,0,0.1)]` (`Sidebar.tsx:171`). No shadow tokens declared. | TBD |
| Blur / glow decoration | `App.tsx:69-70`, `Login.tsx:78,84`, `Sidebar.tsx:80` | Fixed decorative blobs: `blur-[120px]` at 40%×40% with `bg-sky-200/20` / `bg-blue-200/10` (App), `bg-sky-500/20` / `bg-blue-600/20` (Login); sidebar glow `bg-sky-500/10 blur-3xl`. | TBD |

---

## 4. Component structure & class conventions

### 4.1 `Card` — `frontend/components/Card.tsx` (27 lines)

| Aspect | Source | Value |
|---|---|---|
| Props | `Card.tsx:5-9` | `{ children: React.ReactNode; className?: string; glass?: boolean }`. Nothing else — no `title`, `header`, `footer`, `padding` props. |
| Element | `Card.tsx:13` | `motion.div` (framer-motion). |
| Entry motion | `Card.tsx:14-15` | `initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}`. No `exit`, no explicit `transition` (framer default). |
| Base classes | `Card.tsx:17` | `rounded-lg p-5` |
| Default variant | `Card.tsx:18` | `bg-white shadow-sm border border-slate-100` |
| `glass` variant | `Card.tsx:18` | `glass shadow-lg border border-white/40` (`.glass` from `index.css:12-14`) |
| Composition | `Card.tsx:19` | Trailing `${className}` — every override is done by passing utilities (e.g. `p-0 overflow-hidden` at `Inventory.tsx:100`, `border-amber-100 bg-gradient-to-br from-white to-amber-50/20` at `Dashboard.tsx:207`). |
| Coupling | verified — no `context` import | **Pure presentational.** Portable as-is. |

**Reuse:** direct. It is a container + entry animation and nothing more; it works for stat tiles
(`Dashboard.tsx:142`), table wrappers (`Inventory.tsx:100`), filter panels (`TransactionLogs.tsx:73`)
and user cards (`UserManagement.tsx:59`) with no changes.

### 4.2 `Sidebar` — `frontend/components/Sidebar.tsx` (182 lines)

| Aspect | Source | Value |
|---|---|---|
| Props | `Sidebar.tsx:17-20` | `{ collapsed: boolean; setCollapsed: (v:boolean)=>void }` — state is owned by `App.tsx:48`. |
| Coupling | `Sidebar.tsx:15` | Imports `useAuth` from `../context` — reads `user`, calls `logout`. **Not portable without our own auth hook.** |
| Nav model | `Sidebar.tsx:34-39` | Hardcoded array `{name, icon, path}`: Dashboard `/`, Inventory `/inventory`, Logs `/logs`, Profile `/profile`. |
| Role gate | `Sidebar.tsx:41-43` | `if (user?.role === 'SUPER_ADMIN') menuItems.push({name:'Users', icon:Users, path:'/users'})` — mutates the array in render. |
| Responsive | `Sidebar.tsx:27-32` | Own `isMobile` state via `window.innerWidth < 768` + a `resize` listener (duplicated in `App.tsx:51-64`). |
| Widths | `Sidebar.tsx:63` | mobile `280px`, desktop collapsed `90px`, desktop expanded `260px`. |
| Positioning | `Sidebar.tsx:65-66,70-72` | `margin: 16px` (desktop) / `0px` (mobile); `fixed inset-y-0 left-0 z-50 h-full md:sticky md:top-4 md:h-[calc(100vh-32px)] md:shrink-0`. |
| Transition | `Sidebar.tsx:68` | `{ type:"spring", stiffness:300, damping:30 }`. |
| Panel skin | `Sidebar.tsx:76-78` | `bg-slate-900/95 backdrop-blur-xl border-r border-white/10 flex flex-col overflow-hidden relative md:rounded-[32px] md:border md:shadow-2xl`. |
| Decorative glow | `Sidebar.tsx:80` | `absolute top-0 left-0 w-full h-32 bg-sky-500/10 blur-3xl pointer-events-none`. |
| Brand block | `Sidebar.tsx:83-100` | `p-6 mb-4`; logo `w-11 h-11 bg-gradient-to-br from-sky-400 to-blue-600 rounded-2xl … shadow-lg shadow-sky-500/20` with `Warehouse` icon `w-6 h-6`; wordmark `font-bold text-xl text-white tracking-tight`. |
| Nav rail | `Sidebar.tsx:110` | `flex-1 px-3 space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10`. |
| Nav item | `Sidebar.tsx:118-122` | `relative flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all group`; active `text-white`, idle `text-slate-400 hover:text-slate-200`; collapsed adds `justify-center`. |
| Active indicator | `Sidebar.tsx:124-130` | Shared-layout pill: `motion.div layoutId="activeNav"` with `absolute inset-0 bg-gradient-to-r from-sky-500/20 to-sky-500/5 border-l-4 border-sky-400 rounded-2xl z-0`, spring `300/30`. |
| Collapsed tooltip | `Sidebar.tsx:144-148` | `absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-xl opacity-0 group-hover:opacity-100 …`. |
| Sign-out | `Sidebar.tsx:155-163` | `p-4 mt-auto border-t border-white/5`; button `px-4 py-4 text-red-400 hover:bg-red-500/10 rounded-2xl`. |
| Collapse toggle | `Sidebar.tsx:167-176` | Floating `w-7 h-7` white circle at `-right-3.5 top-20`, `hidden md:flex`, `z-[60]`, chevron rotates 180°. |
| Mobile backdrop | `Sidebar.tsx:48-58` | `fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45]`, fades in/out via `AnimatePresence`. |

**Reuse:** the shell markup + motion is reusable; the nav model (`:34-43`) and the `useAuth` import
(`:15`) must be replaced for our 16-category / kiosk navigation. Touch target of a nav row is
`py-3.5` + `gap-3` (`:119`).

### 4.3 `Navbar` — `frontend/components/Navbar.tsx` (76 lines)

| Aspect | Source | Value |
|---|---|---|
| Props | `Navbar.tsx:7-9` | `{ toggleSidebar: () => void }`. |
| Coupling | `Navbar.tsx:4` | Imports `useAuth` **and** `useInventory` — the search box writes global `searchTerm` (`:13,31-32`). Not portable without both hooks. |
| Shell | `Navbar.tsx:16` | `h-20 flex items-center justify-between px-8 shrink-0 z-40 sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200/50`. |
| Mobile menu button | `Navbar.tsx:18-24` | `md:hidden p-3 bg-white text-slate-500 shadow-sm rounded-2xl border border-slate-100`, `whileTap scale .9`. |
| Search field | `Navbar.tsx:26-43` | `hidden sm:flex … bg-white/60 backdrop-blur-md px-5 py-3 rounded-[20px] border border-white shadow-sm w-72 md:w-96 … focus-within:ring-4 focus-within:ring-sky-500/10 focus-within:border-sky-400/50`; input is `bg-transparent border-none outline-none text-sm`; clear button appears only when `searchTerm` is set. |
| ⌘K hint | `Navbar.tsx:34-37` | `Command` icon + `K` in a `bg-slate-100 rounded-md` chip. **Decorative only — no keyboard handler exists in this file.** |
| Notification bell | `Navbar.tsx:47-53` | `relative p-3 bg-white text-slate-500 shadow-sm rounded-2xl border border-slate-100`; unread dot `absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white` — **always rendered, not bound to any state.** |
| User chip | `Navbar.tsx:57-70` | `flex items-center gap-3 pl-2 pr-1 py-1 bg-white/80 backdrop-blur-sm rounded-2xl border border-white shadow-sm`; name `text-sm font-bold`, role `text-[10px] font-bold text-sky-500 uppercase`; avatar `w-10 h-10 rounded-xl object-cover ring-2 ring-sky-500/10 shadow-md`. |
| Avatar fallback | `Navbar.tsx:66` | External URL `https://ui-avatars.com/api/?name=…&background=38BDF8&color=fff` — a third-party network dependency. |

**Reuse:** header shell + search + user chip are directly reusable as markup. The bell (`:47-53`) is a
static shell with no notification source — our Notifikasi Stok would need to bind it.

### 4.4 Other shared primitives (all context-free, all portable)

| Component | Source | Structure read from file |
|---|---|---|
| `Button` | `components/Button.tsx` | Props `variant?: primary\|secondary\|danger\|ghost\|success\|warning`, `size?: sm\|md\|lg`, `isLoading?`, `icon?` (`:5-11`). Base `inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none active:scale-95 disabled:opacity-50 disabled:pointer-events-none` (`:22`). Variants `:24-31` (primary `bg-[#38BDF8] hover:bg-[#0EA5E9]`, success `bg-[#22C55E]`, warning `bg-[#F59E0B]`, danger `bg-red-500`, secondary `bg-slate-100 text-slate-900`, ghost `bg-transparent hover:bg-slate-100 text-slate-600`). Sizes `:33-37` — `sm: px-3 py-1.5 text-xs`, `md: px-4 py-2 text-sm`, `lg: px-6 py-3 text-base`. Motion `whileHover scale 1.01 / whileTap 0.98` (`:41-42`). `isLoading` sets `disabled` and swaps in an inline SVG spinner (`:44,48-52`). Note `{...props as any}` cast at `:46`. |
| `Input` | `components/Input.tsx` | Props `label?`, `error?` + native input props (`:4-7`). Label `block text-sm font-medium text-slate-700 mb-1.5` (`:12`). Field `w-full px-4 py-2.5 rounded-lg border bg-white text-slate-900 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#38BDF8]/20 focus:border-[#38BDF8] placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500` (`:15-19`); error state `border-red-500 bg-red-50/20` (`:20`), message `mt-1.5 text-xs text-red-500 font-medium` (`:25`). |
| `Modal` | `components/Modal.tsx` | Props `isOpen, onClose, title, children, footer?, size? sm\|md\|lg\|xl` (`:7-14`). Sizes map to `max-w-sm/md/lg/2xl` (`:17-22`). Wrapper `fixed inset-0 z-[100] flex items-center justify-center p-4` (`:27`); overlay `absolute inset-0 bg-slate-900/60 backdrop-blur-sm`, click-to-close (`:32-33`); panel `relative w-full ${size} bg-white rounded-xl shadow-2xl overflow-hidden` with `initial/animate/exit` scale+y motion (`:36-39`); header `px-6 py-4 border-b border-slate-100` + `text-lg font-bold` title (`:41-42`); body `p-6 max-h-[70vh] overflow-y-auto` (`:47`); footer `px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3` (`:51`). Wrapped in `AnimatePresence` (`:25`). |
| `StockBadge` | `components/StockBadge.tsx` | Props `{ status: StockStatus }` (`:5-7`), imports the union from `../types:16`. Three styles only (`:10-14`, listed in §1c). Pill classes `px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border` (`:17`). |

**Reuse:** `Card`, `Button`, `Input`, `Modal`, `StockBadge` are drop-in. `StockBadge`'s **shape** is
reusable; its **status set** is not (three vs our eight).

---

## 5. Page shell & layout patterns

| Pattern | Source | What it actually is | How we'd reuse it | Extension + why |
|---|---|---|---|---|
| Root mount | `frontend/index.tsx:13-20` | `createRoot` + `React.StrictMode` + **`HashRouter`** (not BrowserRouter). | Hash routing works for pure static hosting — same constraint we have. | TBD |
| Route split | `App.tsx:103-110` | `/login` public; `/*` wrapped in `ProtectedRoute` → `Layout`. | Map `/login` → PIN/kiosk entry. | TBD |
| Auth guard | `App.tsx:19-33` | `ProtectedRoute` reads `isAuthenticated/isLoading/user`; loading = a spinning `w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full` on `bg-slate-950`; redirects to `/login`, or `/` if role not allowed. | Same shape, backed by Clerk/PIN instead. | TBD |
| App frame | `App.tsx:67` | `flex h-screen bg-slate-50 font-sans` — Sidebar + column. | Reuse verbatim. | TBD |
| Background decoration | `App.tsx:69-70` | Two fixed blurred blobs (`bg-sky-200/20`, `bg-blue-200/10`, `blur-[120px]`, `pointer-events-none`). | Optional; purely decorative. | TBD |
| Content column | `App.tsx:74-77` | `flex-1 flex flex-col min-w-0 relative` → `<Navbar>` → `<main className="flex-1 overflow-y-auto px-4 md:px-8 pb-8 custom-scrollbar relative z-10">`. | Reuse verbatim. | TBD |
| Page transition | `App.tsx:35-45,78-79` | `AnimatePresence mode="wait"` keyed on `location.pathname`; `PageWrapper` does `opacity/y/scale` in-out with `{type:"spring", duration:0.5, bounce:0.3}`. | Reuse. | TBD |
| Sidebar collapse state | `App.tsx:48,51-64` | Owned in `Layout`; a `resize` listener force-collapses <768px and force-expands ≥768px (note: this **overrides** the user's manual choice on every resize). | Reuse the lifting pattern. | TBD |
| Page header | `Dashboard.tsx:108-113`, `Inventory.tsx:90-98`, `TransactionLogs.tsx:66-71`, `UserManagement.tsx:50-55` | `flex items-center justify-between` → left `h1 text-2xl font-bold` + `p text-slate-500`; right optional primary `Button` with `icon`. | Reuse for every screen. | TBD |
| Stat tile row | `Dashboard.tsx:140-152` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`; each tile is `<Card className="flex items-center gap-4">` + a `w-12 h-12 {bg} rounded-xl` icon well + label/value. Stat definitions (label/icon/colour/bg) at `Dashboard.tsx:95-100`. | Direct basis for our five-status ledger tiles. | TBD |
| Two-column dashboard | `Dashboard.tsx:154-262` | `grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-[600px]`; chart `lg:col-span-8`, alert rail `lg:col-span-4`. | Reuse for board + alert rail. | TBD |
| Alert list pattern | `Dashboard.tsx:207-261` | Amber-tinted `Card`; header with `AlertTriangle` + count pill `bg-amber-500 text-white text-[10px] … ring-4 ring-amber-50`; scrollable list of `motion.div layout` rows (`p-3 rounded-xl border`, red-tinted when `stock<=0`); empty state = green check circle + "All Stock Safe"; footer CTA link. | Direct basis for **Notifikasi Stok**. | TBD |
| Table page pattern | `Inventory.tsx:100-205`, `TransactionLogs.tsx:169-233` | `<Card className="p-0 overflow-hidden …">` → toolbar strip (`p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between gap-4`) → `overflow-x-auto` → `<table className="w-full text-left">` with `thead bg-slate-50 border-b border-slate-100` and `tbody divide-y divide-slate-100 bg-white`. | Direct basis for stok list + HISTORI DATA. | TBD |
| Table row motion | `Inventory.tsx:143-149` | `AnimatePresence mode="popLayout"` + `motion.tr layout` with opacity in/out. | Reuse. | TBD |
| Row actions | `Inventory.tsx:177-187` | Right-aligned icon buttons, `p-2 … rounded-lg transition-colors`, colour-coded: green (Stock In), orange (Stock Out), slate→sky (edit), slate→red (delete), each with a `title`. | Direct basis for our Keluar/Masuk quick actions. Touch target is `p-2` around a 16px icon ≈ 32px. | TBD |
| Filter controls | `Inventory.tsx:106-127`, `TransactionLogs.tsx:80-165` | Native `<select className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-semibold outline-none focus:ring-2 focus:ring-sky-500/20">` with a `text-[10px] font-bold text-slate-400 uppercase` label. Date pickers use a two-layer trick: a visual layer (`pointer-events-none z-0`) under a transparent `<input type="date" className="opacity-0 … z-10">` that calls `showPicker()` on click (`TransactionLogs.tsx:105-155`). | Reuse the select pattern; the date-picker trick is reusable for our history filters. | TBD |
| Empty state | `Inventory.tsx:192-201`, `TransactionLogs.tsx:219-229` | Full-width `td` with `px-6 py-20 text-center`, a 40px muted icon, `opacity-40`, italic muted text (+ "clear filters" link in the logs page). | Reuse. | TBD |
| Segmented control | `Dashboard.tsx:163-173` | `flex bg-slate-50 p-1 rounded-lg border border-slate-100 shadow-sm`; chips `px-3 py-1 text-[10px] font-bold rounded-md`; active `bg-[#0F172A] text-white shadow-sm`. | Reuse for our Keluar keterangan chips / range switches. | TBD |
| Card-grid page | `UserManagement.tsx:57-101` | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` of `<Card className="space-y-4">` with avatar + role pill + icon actions. | Basis for a category/kit grid. | TBD |
| Login shell | `Login.tsx:72-220` | Full-screen `bg-[#0F172A]` with two animated blurred blobs (`blobVariants`, `:39-50`) and a cubes texture from `transparenttextures.com` at `opacity-[0.03]` (`:86`). Card is `max-w-[1000px] grid md:grid-cols-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[32px] overflow-hidden shadow-2xl` (`:93`): left = dark branding panel (`p-12`, gradient `from-sky-500/10`), right = white form panel (`p-8 lg:p-12 bg-white`). Stagger via `containerVariants` (`:53-63`) + `itemVariants` (`:66-69`). Submit button is `w-full py-4 text-base font-bold rounded-2xl shadow-xl shadow-sky-500/20` (`:166`). Copy is already Indonesian ("Selamat Datang", "Masuk Sekarang", "Kata Sandi"). | Basis for the kiosk/PIN screen: keep the split-panel shell, replace the two `Input`s with the keypad. **Note `Login.tsx:194-203` hardcodes demo credentials in the UI — must not be carried over.** | TBD |
| Profile page | `Profile.tsx:56` | `max-w-3xl mx-auto space-y-6 pb-12` centered-form layout; avatar upload capped at 2MB (`:37`) via `FileReader` → data URI (`:41-44`). | Basis for any single-form admin screen. | TBD |

---

## 6. Motion (framer-motion)

| Usage | Source | What it actually is |
|---|---|---|
| Library | `frontend/package.json:13` | `framer-motion: ^11.11.17`. |
| Card entry | `Card.tsx:14-15` | fade + 10px rise, framer default transition. |
| Page transitions | `App.tsx:35-45` | spring `duration:0.5, bounce:0.3`; in `opacity/y:20/scale:.98`, out `y:-20/scale:1.02`. |
| Sidebar width/slide | `Sidebar.tsx:60-68` | animated `width`/`x`/`margin`, spring `stiffness:300, damping:30`. |
| Shared-layout nav pill | `Sidebar.tsx:125-129` | `layoutId="activeNav"` — the one shared-layout animation in the app. |
| Icon micro-interactions | `Sidebar.tsx:86` (`whileHover: rotate 15, scale 1.1`), `Sidebar.tsx:168-169` (`whileHover scale 1.1 + backgroundColor #f8fafc`, `whileTap scale .9`), `Navbar.tsx:19` (`whileTap .9`), `Navbar.tsx:48` (`whileHover y:-2`), `Navbar.tsx:58` (`whileHover scale 1.02`) | Hover/tap feedback only. |
| Button feedback | `Button.tsx:41-42` | `whileHover 1.01`, `whileTap 0.98` (plus CSS `active:scale-95` at `:22`). |
| List enter/exit | `Dashboard.tsx:221-224`, `Inventory.tsx:143-149` | `AnimatePresence mode="popLayout"` + `motion.div/tr layout`. |
| Modal | `Modal.tsx:25,28-38` | `AnimatePresence`; overlay fade, panel `scale .95 + y 20`. |
| Login choreography | `Login.tsx:39-69` | `blobVariants` (10s linear infinite loop), `containerVariants` (`staggerChildren: 0.1`), `itemVariants` (x-slide). |
| Loading spinners | `App.tsx:23-27` (motion scale+rotate loop), `Button.tsx:49-52` (CSS `animate-spin` SVG) | Two different spinner implementations. |

**Reuse:** all of the above is portable to `@octanejs/motion` **if** that package exposes the same API
(`motion.*`, `AnimatePresence`, `whileHover/whileTap`, `layout`, `layoutId`, `variants`).
`UNKNOWN — needs @octanejs/motion's docs/bindings-status.md` to confirm `layoutId` / `layout` /
`variants` / `mode="popLayout"` parity. That is the one binding the Sidebar's active-pill depends on.

---

## 7. Icons

| Aspect | Source | Value |
|---|---|---|
| Library | `frontend/package.json:14` | `lucide-react: ^0.474.0`. |
| Import style | e.g. `Sidebar.tsx:5-14`, `Dashboard.tsx:3-12` | Named per-icon imports (tree-shakeable). No icon wrapper component exists. |
| Sizing convention | throughout | Two idioms used side by side: the `size={n}` prop (`size={20}`, `size={18}`, `size={16}`, `size={14}`, `size={12}`, `size={10}`) and Tailwind classes (`w-5 h-5`, `w-6 h-6`, `w-7 h-7` — `Sidebar.tsx:89,132,160`). |
| Icons in use | `Sidebar.tsx:5-14` | LayoutDashboard, Package, History, Users, UserCircle, LogOut, Warehouse, ChevronRight |
| | `Navbar.tsx:3` | Bell, Search, Menu, X, Command |
| | `Dashboard.tsx:3-12` | Package, TrendingUp, AlertTriangle, XCircle, Search, ArrowRight, ShoppingBag, CheckCircle2 |
| | `Inventory.tsx:4-14` | Plus, Search, Filter, Edit3, Trash2, PackageCheck, ArrowDownLeft, ArrowUpRight, Tags |
| | `TransactionLogs.tsx:2` | ArrowUpRight, ArrowDownLeft, Calendar, Filter, RotateCcw, ChevronDown |
| | `UserManagement.tsx:3` | UserPlus, Edit2, Trash2, KeyRound |
| | `Profile.tsx:2` | User, Mail, Shield, Smartphone, MapPin, Calendar, Edit3, Save, X, ChevronDown, Camera |
| | `Login.tsx:5` | LogIn, Warehouse, ShieldCheck, ChevronRight, Info |
| Semantic pairing | `Inventory.tsx:180,182`; `TransactionLogs.tsx:194` | `ArrowDownLeft` = stock **IN** (green), `ArrowUpRight` = stock **OUT** (orange/red). Consistent across both pages. |
| Brand mark | `Sidebar.tsx:89`, `Login.tsx:103` | `Warehouse` icon in a gradient/solid sky tile. |

**Reuse:** direct via `@octanejs/lucide` — assuming named-export parity.
`UNKNOWN — needs @octanejs/lucide's docs/bindings-status.md`.

---

## 8. Toasts (Sonner)

| Aspect | Source | Value |
|---|---|---|
| Library | `frontend/package.json:19` | `sonner: ^2.0.1`. |
| Mount | `App.tsx:102` | `<Toaster position="top-right" richColors toastOptions={{ style: { borderRadius: '16px' } }} />`, rendered inside `AppProvider` and outside the routes. |
| Call sites | `context.tsx:107` (`User added`), `:124` (`Password for … has been reset.`) | Toasts fired from inside the state provider. |
| | `Inventory.tsx:60,67,75,84,248`; `UserManagement.tsx:23`; `Profile.tsx:27,38`; `Login.tsx:22,31,34` | `toast.success` / `toast.error` only. No `toast.promise`, `toast.loading`, custom JSX toasts, or dismiss/undo actions anywhere in the repo. |
| Language | `Login.tsx:22,31,34` | Indonesian ("Silakan isi semua bidang", "Selamat datang kembali!", "Kredensial tidak valid"); everywhere else English. |

**Reuse:** the mount config (`position`, `richColors`, `borderRadius: 16px`) is worth copying verbatim.
`UNKNOWN — needs @octanejs/sonner's docs/bindings-status.md` for `Toaster` prop parity.

---

## 9. Build / test / deploy pipeline

| Aspect | Source | What it actually is | How we'd reuse it | Extension + why |
|---|---|---|---|---|
| Package manager scripts | `frontend/package.json:6-11` | `dev: vite`, `build: vite build`, `preview: vite preview`, `test: vitest`. **No `lint` script and no ESLint config in the repo** (despite `README.md:117` claiming "GitHub Actions verifies linting"). | Reuse the four scripts. | TBD |
| Vite config | `frontend/vite.config.ts:5-25` | `server.port 3000`, `host 0.0.0.0`; plugin `@vitejs/plugin-react-swc`; `define` injects `process.env.API_KEY` **and** `process.env.GEMINI_API_KEY` from `env.GEMINI_API_KEY` (`:13-16`); `build.minify: 'terser'` (`:18`); alias `@ → __dirname` (`:20-24`). | Reuse the shape; the Gemini `define` block is dead weight for us — **no file in `frontend/` reads `process.env.API_KEY`** (grep: only the config defines it). | TBD |
| PostCSS | `frontend/postcss.config.js:1-6` | `tailwindcss` + `autoprefixer`. | Reuse. | TBD |
| Tailwind content globs | `frontend/tailwind.config.js:3-8` | `./index.html`, `./src/**`, `./components/**`, `./pages/**` — note `App.tsx`/`context.tsx` sit at the root and are **not** matched by any glob. | If we keep root-level `App.tsx`, our globs must include it. | TBD |
| TS config | `frontend/tsconfig.json` | `target/lib ES2022`, `module ESNext`, `moduleResolution bundler`, `jsx react-jsx`, `isolatedModules`, `allowJs`, `allowImportingTsExtensions`, `noEmit`, `paths {"@/*": ["./*"]}`, `types: ["node"]`. **No `strict: true`** — strict mode is off. | Reuse as a starting point. | TBD |
| Vitest config | `frontend/vitest.config.ts:4-12` | `environment: 'happy-dom'`, `globals: true`, `setupFiles: './src/test/setup.ts'`, `include: ['src/**/*.{test,spec}.…']`, `pool: 'forks'`. | Reuse verbatim; note the `include` glob means tests must live under `src/`. | TBD |
| Test setup | `frontend/src/test/setup.ts:1-7` | `@testing-library/jest-dom/vitest` + `afterEach(() => { cleanup(); localStorage.clear() })`. | Reuse. | TBD |
| Test suite | `frontend/src/__tests__/` | 5 files, **166 lines total**: `Auth.test.tsx` (47), `Dashboard.test.tsx` (47), `Inventory.test.tsx` (26), `TransactionLogs.test.tsx` (21), `UserManagement.test.tsx` (25). All render a page inside `<MemoryRouter><AppProvider>` and assert on rendered text. `Dashboard.test.tsx:8-26` mocks the whole `recharts` module. This is smoke-level coverage — the README's "100% Core Coverage" (`README.md:68`) is not supported by these files. | Keep the "tests gate the build" discipline; do not inherit the coverage claim. | TBD |
| Dockerfile | `frontend/Dockerfile` | 4 stages: `base` (node:20, `npm install`, forced esbuild install `:7`) → `test` (copies sources, runs `npm test -- --run` at `:28`) → `build` (`npm run build`) → `production` (`nginx:alpine`, copies `dist` to `/usr/share/nginx/html`, custom `nginx.conf`, `EXPOSE 80`). The test stage is a hard gate: a failing test breaks the image build. | Reuse the multi-stage + test-gate pattern directly. | TBD |
| nginx | `frontend/nginx.conf:1-8` | SPA fallback `try_files $uri $uri/ /index.html;` on port 80. | Reuse if we containerise. | TBD |
| docker-compose | `docker-compose.yml:1-8` | Single `frontend` service, builds `./frontend`, maps `8080:80`. | Reuse. | TBD |
| CI | `.github/workflows/ci.yml` | Triggers on push/PR to `main` (`:3-7`). Job `build-and-test` on `ubuntu-latest`: checkout@v4, setup-node@v4 with **node 20** + npm cache keyed on `frontend/package-lock.json` (`:15-20`), `npm ci`, `npm run test`, `npm run build` with `VITE_GEMINI_API_KEY: "mock_key"` (`:26-34`). No lint step, no deploy step, no coverage upload. | Reuse the workflow shape. Note the env var is `VITE_GEMINI_API_KEY` but `vite.config.ts:14-15` reads `GEMINI_API_KEY` — they do not match. | TBD |
| Deployment | `README.md:4,113-118` | Vercel, claimed to auto-deploy `main` after CI. **There is no `vercel.json`, no deploy job in `ci.yml`, and no Vercel config file anywhere in the repo** — the wiring is dashboard-side, not in-repo. | `UNKNOWN — needs the repo's Vercel project settings` (not a file). | TBD |
| Node version | `frontend/Dockerfile:2`, `.github/workflows/ci.yml:18` | Node **20** in both. No `.nvmrc`, no `engines` field in `package.json`. | TBD | TBD |

### Exact dependency versions (`frontend/package.json:12-39`)

**dependencies**
| Package | Version |
|---|---|
| framer-motion | `^11.11.17` |
| lucide-react | `^0.474.0` |
| react | `^19.0.0` |
| react-dom | `^19.0.0` |
| react-router-dom | `^7.1.1` |
| recharts | `^2.15.0` |
| sonner | `^2.0.1` |

**devDependencies**
| Package | Version |
|---|---|
| @testing-library/dom | `^10.4.1` |
| @testing-library/jest-dom | `^6.9.1` |
| @testing-library/react | `^16.3.1` |
| @testing-library/user-event | `^14.6.1` |
| @types/node | `^22.14.0` |
| @vitejs/plugin-react | `^4.3.4` |
| @vitejs/plugin-react-swc | `^4.2.2` |
| autoprefixer | `^10.4.23` |
| happy-dom | `^14.0.0` |
| jsdom | `^27.4.0` |
| msw | `^2.12.7` |
| postcss | `^8.5.6` |
| tailwindcss | `^3.4.17` |
| terser | `^5.44.1` |
| typescript | `~5.8.2` |
| vite | `^6.0.0` |
| vitest | `^2.1.8` |

Facts about this list, read from the files:
- **Charts are `recharts`, not TanStack Charts** (`package.json:18`; used only in `pages/Dashboard.tsx:13-21,177-199`). `README.md:53-57` omits recharts from its library list.
- `msw ^2.12.7` is installed but **unused** — no file under `frontend/src/` references it (grep).
- Both `jsdom` and `happy-dom` are installed; `vitest.config.ts:7` uses `happy-dom` only.
- Both `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` are installed; both configs use `-swc`.
- **Tailwind is v3** (`^3.4.17`) — a JS config file, not the v4 CSS-first `@theme` model.

---

## 10. Defects / dead code found in the template (record, don't fix)

Factual, each cited:

1. **`.custom-scrollbar` is never defined.** It is applied at `App.tsx:77`, `Sidebar.tsx:110` and
   `Dashboard.tsx:220`, but `frontend/index.css` only defines bare `::-webkit-scrollbar` selectors
   (`:18-28`) — there is no `.custom-scrollbar` rule in any file. The class is a no-op.
2. **Duplicate stylesheet link.** `frontend/index.html:11` and `:12` both load `/index.css`.
3. **Tailwind content globs miss root files.** `tailwind.config.js:3-8` covers `src/`, `components/`,
   `pages/` and `index.html`, but `App.tsx` and `context.tsx` live at `frontend/` root — classes used
   only there (e.g. the `App.tsx:69-70` blob backgrounds) are outside the scanned set.
4. **CI env var mismatch.** `ci.yml:34` sets `VITE_GEMINI_API_KEY`; `vite.config.ts:14-15` reads
   `env.GEMINI_API_KEY`.
5. **Dead Gemini wiring.** `vite.config.ts:13-16` defines `process.env.API_KEY` / `GEMINI_API_KEY`, but
   no source file reads either. `metadata.json:3` still advertises "AI-powered insights"; there is no AI
   code in the repo.
6. **Demo credentials are rendered in the login UI.** `pages/Login.tsx:194-203` prints
   `superadmin / superadmin123` and `admingudang / admin123`; the same values are the plaintext password
   map at `context.tsx:69-74`.
7. **Navbar bell has no data source.** The unread dot at `Navbar.tsx:52` is unconditionally rendered.
8. **⌘K chip is decorative.** `Navbar.tsx:34-37` renders the shortcut hint; no keydown handler exists in
   that file.
9. **Two independent `isMobile` breakpoint listeners.** `Sidebar.tsx:27-32` and `App.tsx:51-64` each
   register their own `resize` handler at 768px; the App one overwrites the user's manual collapse
   choice on any resize.
10. **`README.md:117` claims CI "verifies linting"** — there is no lint script (`package.json:6-11`) and
    no ESLint config in the repo.
11. **External runtime dependencies in the UI**: `ui-avatars.com` (`Navbar.tsx:66`,
    `UserManagement.tsx:32`), `picsum.photos` (`context.tsx:55-56`),
    `transparenttextures.com` (`Login.tsx:86`), Google Fonts (`index.html:8-10`).

---

## 11. Items that stay UNKNOWN

| Item | Why | What would resolve it |
|---|---|---|
| SmartInv colour/spacing/radius/shadow **tokens** | They do not exist. `tailwind.config.js:9-15` extends only `fontFamily`. | Nothing — this is a settled negative finding, not a missing file. |
| Dark-mode palette | No `darkMode` key in `tailwind.config.js`, no `dark:` class in any `.tsx` (grep), no CSS variables in `index.css`. | Same — settled negative. |
| Vercel deployment configuration | Claimed at `README.md:4,113-118`; no `vercel.json` or deploy job exists in the repo. | `UNKNOWN — needs the repo's Vercel dashboard project settings.` |
| `@octanejs/motion` API parity (`layoutId`, `layout`, `variants`, `AnimatePresence mode="popLayout"`) | Not determinable from this repo. | `UNKNOWN — needs @octanejs/motion docs/bindings-status.md` |
| `@octanejs/lucide` export parity | Same. | `UNKNOWN — needs @octanejs/lucide docs/bindings-status.md` |
| `@octanejs/sonner` `<Toaster>` prop parity (`position`, `richColors`, `toastOptions`) | Same. | `UNKNOWN — needs @octanejs/sonner docs/bindings-status.md` |
| Whether TanStack Charts can reproduce the Dashboard area chart | Template uses recharts (`package.json:18`, `Dashboard.tsx:13-21`). | `UNKNOWN — needs @tanstack/charts docs` |
| Whether SmartInv's UI meets any contrast/touch-target standard | No accessibility test, no audit artefact, no `aria-*` beyond native elements in the repo. | `UNKNOWN — needs an actual contrast/target measurement pass` |
| Screenshots / a rendered reference of the template | No image assets in the repo (`find` shows none). | `UNKNOWN — needs a screenshot or a local dev-server run` |

---

## 12. Field-ops extensions (OURS — justified by requirement, NOT from the template)

Unchanged from the previous revision; restated so reuse vs invention stays visible.

- **Five+ status colour language** (tersedia / dipinjam / menipis / rusak / hilang, plus `in_use`,
  `maintenance`, `retired`) — the template ships **three** (`StockBadge.tsx:10-14`). Everything beyond
  those three is ours.
- **Higher-contrast palette + larger touch targets** — for outdoor qurban use. The template's smallest
  interactive targets are `p-1.5` around a 16px icon (`UserManagement.tsx:75,83,90`) and `p-2` around a
  16px icon (`Inventory.tsx:179-186`); its smallest text is `text-[9px]` (`Navbar.tsx:36`).
- **PIN keypad (VERIFIKASI)** — Model C identity. The template's `Login.tsx` is an email/username +
  password form; there is no keypad component.
- **QR scanner, rapid session mode, kits, close-out report** — none of these exist in the template.
- **`prototype/brt-inventory-prototype.html`'s deep-pine/brass theme** — invented, still PROPOSED per
  `WORKING-AGREEMENT.md:19-21`. Note that with §0 established, "re-base the prototype on SmartInv's real
  tokens" has no target to re-base onto; option (a)/(b) in the design doc §9 needs restating by the owner.

---

## Honest assessment of the template's structure

**`context.tsx` is doing far too much, and it is the file we are replacing anyway.**
It is 176 lines holding, in one `AppProvider` (`context.tsx:66`): auth state, the user roster, a
**plaintext password map** (`:69-74`), the product catalog, the transaction log, and the global search
term — six unrelated concerns behind two contexts that are always mounted together (`:170-171`).
Three concrete problems, each cited:

- **Mock data is hardcoded inside the state layer**, not injected: `INITIAL_PRODUCTS` (`:46-52`),
  `INITIAL_USERS` (`:54-57`), `SEED_LOGS` (`:59-63`). There is no data-adapter seam at all — swapping in
  Sheets/Apps Script means rewriting this file, not configuring it.
- **A state updater fires another state update as a side effect.** `adjustStock` (`:149-167`) calls
  `setTransactions(...)` at `:162` *inside* the `setProducts` updater callback. React updater functions
  are expected to be pure, and under React 19 StrictMode they are double-invoked in development. This is
  the single clearest sign the file was written as an imperative store, not a reducer.
- **UI side effects live in the provider**: `toast.success` at `:107` and `:124`.

Architecturally it is also the exact opposite of our model: SmartInv **mutates current state** and emits
a log as a by-product (`:153-161` builds a `Transaction` *after* computing `newStock` at `:152`). We
**append events and derive state**. So there is nothing in `context.tsx` worth porting — not its shape,
not its API. The correct read is: this file is a demo harness for the UI, and the UI is what we came for.

**The components split cleanly in two, and the split matters.**
Five of the seven are context-free and genuinely portable — verified by grep: `Button.tsx`, `Card.tsx`,
`Input.tsx`, `Modal.tsx`, `StockBadge.tsx` import no context. `Card` (27 lines) and `StockBadge`
(23 lines) are almost trivially thin; `Button` (62 lines), `Input` (30) and `Modal` (62) are conventional,
well-formed primitives with sensible variant APIs. These are real reusable primitives.

The other two are **app-coupled shells, not primitives**: `Sidebar.tsx:15` imports `useAuth`;
`Navbar.tsx:4` imports both `useAuth` and `useInventory` and drives the *global* search term
(`Navbar.tsx:13,31-32`). Beyond the import coupling, `Sidebar` hardcodes its nav model (`:34-39`) and its
role check (`:41-43`) in the render body. Reusing them means taking the markup and motion and rewriting
the data-binding — a copy-and-adapt, not an import.

Also worth saying plainly: **there is no primitive for the patterns we will use most.** The table
(`Inventory.tsx:130-203`), the filter toolbar (`:101-128`), the empty state (`:192-201`) and the stat tile
(`Dashboard.tsx:142-150`) are inline JSX, duplicated between `Inventory.tsx` and `TransactionLogs.tsx`
(compare `Inventory.tsx:132-142` with `TransactionLogs.tsx:180-189` — the same `thead`/`tbody` class
strings). Those are conventions to extract, not components to import.

**Where the value actually is: neither pure CSS/tokens nor the component architecture — it is the
class-string conventions and the layout compositions.**
- It is **not tokens**: §0 — `tailwind.config.js:9-15` extends only `fontFamily`. There is no theme to
  inherit. Colour discipline exists only as habit (slate for structure, sky-500 for brand, green/amber/red
  for status), enforced by nothing, and undermined by eight hardcoded hexes (§1b).
- It is **not the component architecture**: seven components, five of them thin, two of them coupled, no
  compound components, no `forwardRef`, no `cn`/`clsx` utility (class merging is bare template-string
  concatenation everywhere, e.g. `Card.tsx:16-20`, `Button.tsx:43`), no variant library, no
  `components/ui/` layer. Nothing here is a design *system*; it is a tidy set of files.
- It **is** the accumulated class strings and layout recipes: the page-header pattern, the table-in-a-Card
  pattern, the stat-tile row, the alert rail, the sidebar shell with its `layoutId` pill, the Navbar glass
  strip, the Login split-panel. Those encode the "premium" look the owner picked, and they transfer
  verbatim as strings regardless of framework — which is exactly what survives an Octane port.

**The blunt consequence for our decision:** "extend the template" is realistically *copy its class
conventions and layout compositions, re-import its five clean primitives, rewrite Sidebar/Navbar's
data-binding, and delete `context.tsx` entirely.* That is a smaller inheritance than the design doc's §9
implies — and it means the design-token layer this project needs does not exist yet and has to be authored
from scratch, with SmartInv's usage patterns as the reference, not as a source.
