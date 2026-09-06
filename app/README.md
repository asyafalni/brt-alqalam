# app/ — the SPA (Octane)

Phase 1 of the inverted roadmap (design doc §59): **the stock-take (opname) screen**.
Both the gudang and the records are a mess, so there is no catalog for a checkout flow to
stand on. This is the screen that builds one.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest — pure logic + component tests
npm run typecheck  # tsrx-tsc (NOT plain tsc — Octane pins TypeScript ~5.9.3)
npm run build      # static output in dist/
```

## What the screen does
Walk the gudang with the tablet. For each thing you find: name, category, unit, *Bisa habis /
Barang tetap*, count, and an optional minimum. **Tambah barang**, repeat.

- **Sticky context.** Category, unit and kind carry over to the next item; only the name and the
  count reset. Walking one shelf means many items sharing all three — this is the difference
  between six taps per item and two.
- **Saved automatically** to `localStorage` on every change, so closing the app mid-walk loses
  nothing. (IndexedDB is reserved for the Phase-3 offline transaction queue, where durability
  under replay actually matters. A stock-take draft is a few hundred small rows.)
- **Ekspor CSV** produces exactly the `Items` tab format in `sheets/`. A test asserts the export
  round-trips through the real `data/parse.ts` with zero quarantine — so what this button
  produces is, by construction, what the sheet accepts.
- **The minimum defaults to "(-)"** — no alarm — because most items don't need one, and a
  default that nags is a default people turn off.

That means **it is useful before any Google setup exists**: walk the gudang today, export a CSV,
import it into the Items tab. The gateway replaces the export later; nothing here changes.

## Layout
```
src/
├── features/stocktake/
│   ├── draft.ts        PURE logic — ids, validation, CSV. No framework, no DOM.
│   ├── draft.test.ts   12 tests, including the round-trip through data/parse.ts
│   ├── StockTake.tsx   the screen — thin, all rules live in draft.ts
│   └── StockTake.test.tsx  10 component tests
├── state/persist.ts    localStorage, defensive on every read
├── data/seedCategories.ts
└── styles.css          the authored token layer (see below)
```

## Two things that will bite you
1. **Octane uses NATIVE events.** `onChange` is the platform change event and fires on *blur*.
   Every text input uses **`onInput`**, and tests use **`fireEvent.input`**. This is the
   highest-frequency porting bug (OCTANE-FINDINGS.md).
2. **Typecheck with `tsrx-tsc`, not `tsc`.** TypeScript is pinned to `~5.9.3` repo-wide; a newer
   major breaks `tsrx-tsc`.

## The token layer is authored, not inherited
SmartInv ships **no** design tokens (`docs/SMARTINV-REUSE-MAP.md`): its `tailwind.config.js`
extends only `fontFamily`, there are no CSS variables, no dark mode, and every colour is a stock
utility or one of eight inline hex literals. So `styles.css` **authors** the layer, following
shadcn's token names in Tailwind 4's CSS-first `@theme` form (Part XVI §63).

Field-ops extensions, each tied to a written need rather than taste:
- `--spacing-touch: 3.5rem` — 56px targets, not the usual 44px: a shared tablet handled with wet
  or gloved hands.
- 17px base type, `font-size: max(16px, 1em)` on inputs so a mis-tap never zooms the kiosk.
- **Seven status colours.** SmartInv ships three. `rusak` and `hilang` are different outcomes
  demanding different actions (Part IV), so they must never share a colour.

## Not here yet, deliberately
`@octanejs/tanstack-store`, `@tanstack/charts/octane` and `i18next` are all in the agreed stack
but earn their place later — there is no cross-component state, no data worth charting, and one
language. Clerk is **never bundled**: it loads lazily from Clerk's CDN on admin routes only, so
the kiosk ships zero Clerk code (§64.2).
