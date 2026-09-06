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
- **The minimum defaults to "(-)"** — no alarm — because most items don't need one, and a
  default that nags is a default people turn off.
- **Durables are asked how they're tracked**, in plain language: *Label satu-satu* (each unit
  gets its own QR) or *Hitung jumlahnya* (just the count). Defaulting silently to per-unit would
  generate 200 labels for 200 knives without anyone choosing that — labelling every blade is a
  real operational project, so it is a decision, not a default.
- **Categories are free-form.** Hitting something that fits nowhere must not stop the walk;
  that is exactly when a stock-take gets abandoned. Add one inline and it's selected immediately.
- **Rows are editable in place.** Re-adding would burn an id that may already be on a printed
  label, so `itemId` and `barcode` survive an edit.
- **Search appears once the list is long enough to need it** (>5 rows).
- **Export is one file per sheet tab** — `Items`, `Categories`, and `AssetInstances` when any
  item is labelled one-by-one. Separate downloads, because firing three from one tap gets
  blocked by browsers, silently. Tests assert every file round-trips through the real
  `data/parse.ts` with zero quarantine, so what these buttons produce is by construction what
  the sheet accepts.
- **No `prompt()` or `confirm()` anywhere.** Native dialogs are small, unstyled and suppressible
  — the opposite of the 56px targets the rest of the UI uses. Adding a category and deleting a
  row are both inline, and destructive actions take two taps.

**Asset instances are derived, not stored.** An instance-tracked durable with `initialStock` N
*is* N physical units; `instancesFor()` generates them at export time, so there is no second
collection to keep in sync. Lower the count from 20 to 18 and the last two simply stop existing
— correct during a stock-take, where nothing has a history yet.

That means **it is useful before any Google setup exists**: walk the gudang today, export a CSV,
import it into the Items tab. The gateway replaces the export later; nothing here changes.

## Cetak Label — the second screen
Completes the loop: **walk → count → label**.

- **QR encodes a deep link**, not a bare id (design doc §15.4): `…/scan?i=<itemId>` for a rack or
  bin, `…/scan?a=<assetId>` for one physical unit. A URL opens the right screen from the phone's
  own camera app with nothing installed; a bare id would only work inside a scanner we wrote,
  which is the one situation where the label is least needed.
- **Vector SVG, not canvas.** These get printed. An SVG path prints at the printer's resolution,
  where a canvas bitmap would be resampled and lose module edges — which is what makes a scan
  fail at an angle in bad light. Horizontal runs are merged into single path commands so a sheet
  of a few hundred labels stays responsive.
- **Error correction H (~30%).** Higher than the usual M because these live in a gudang: they get
  scratched, greasy and part-peeled. Redundancy is cheaper than reprinting a sheet.
- **The quiet zone is painted white**, not left transparent — a transparent QR on a coloured
  sticker is the classic reason a code will not scan.
- **It refuses to print against a dev-server address.** A sticker outlives the laptop that
  printed it; catching `localhost` here costs a sentence, catching it later costs reprinting
  every label in the gudang.
- Sized in **millimetres** for A4 sticker sheets (24 or 40 per page), because a millimetre is the
  only unit that survives the trip from screen to printer.

## Layout
```
src/
├── features/stocktake/
│   ├── draft.ts        PURE logic — ids, validation, instances, categories, CSV
│   ├── StockTake.tsx   the screen — thin; all rules live in draft.ts
│   └── ItemForm.tsx    the form, extracted
├── features/labels/
│   ├── qr.ts           PURE — QR matrix to SVG path
│   ├── labels.ts       PURE — what gets printed, deep links, sheet geometry
│   └── LabelSheet.tsx  the printable sheet
├── state/useDraft.ts   the draft, owned once and shared by both screens
├── state/persist.ts    localStorage, defensive on every read
├── data/seedCategories.ts
└── styles.css          the authored token layer + print rules
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
