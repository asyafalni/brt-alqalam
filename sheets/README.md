# sheets/ — importable templates for the Google Spreadsheet

**Do not hand-type these headers.** They must match `data/parse.ts` exactly; a mismatch
quarantines every row. Import each CSV as its own tab, named exactly as the filename
(`Categories`, `Locations`, `Items`, `Stock`, `AssetInstances`, `Transactions`).

> In Google Sheets: **File → Import → Upload → Insert new sheet(s)**, then rename the tab to the
> filename. Repeat per file. Delete the example rows once you have real data — they are marked
> below and exist only to show the accepted formats.

## Tabs

| Tab | Written by | Notes |
| --- | --- | --- |
| `Categories` | admin (by hand) | Free-form and editable (design doc Part XI). Seeded with the boss's 8 domains. |
| `Locations` | admin **and** the stock-take | Racks, shelves and bins — **one QR per rack** (§14.2), never one per bar of soap. `code` is what is painted on the shelf ("B3"); `zone` groups racks into rooms. |
| `Items` | admin by hand **and** the stock-take screen | The catalog: what a thing **is**. No quantity, no rack. |
| `Stock` | the stock-take screen, and every cycle count | **How much of an item sits on which rack** — one row per (barang × rak). This is where quantity lives. |
| `AssetInstances` | admin / label tool | Only for `trackBy: instance` durables — one row per physical unit. |
| `Transactions` | **the gateway only** | Append-only event log. **Never edit or delete a row here** — corrections are `reversal` rows. |

### Why `Stock` is a separate tab

The same thing is routinely kept on more than one rack, and the item used to carry a single
`initialStock` and a single `locationId`. That did not merely limit the model, it made cycle
counting **wrong**: counting rack A1 wrote what you found there over the item's whole quantity,
so the stock on A3 silently disappeared. Counting is the one mechanism keeping the numbers
honest, so it has to be per rack — which means quantity has to be per rack too.

Two rows for one item is normal and correct:

```
itemId,locationId,initialStock
ITM-0001,LOC-A1,4
ITM-0001,LOC-A3,6
```

A **blank `locationId` is the unplaced pile**, not an error — real, visible, and the state most
likely to end in something going missing. `minStock` stays on the *item*, because the alarm is
about the thing as a whole: nobody wants to be told sabun is low on A1 while there are twelve
of them on A3.

## Column formats the parser accepts

- **`kind`** — plain language, as admins actually type it: `Bisa habis` / `habis` / `perlengkapan`
  / `consumable` all mean *consumable*; `Barang tetap` / `tetap` / `peralatan` / `equipment` all
  mean *equipment*. Anything else is quarantined, not guessed.
- **`trackBy`** — leave **blank** to default from `kind` (consumable→`quantity`, equipment→
  `instance`). Override with `quantity`/`jumlah` or `instance`/`unit` — e.g. `ITM-0005` (terpal)
  is a durable you count rather than label individually.
- **`minStock`** (Setting Minimum) — a number, or **`(-)`**, `-`, or blank for *no minimum,
  never notify*.
- **numbers** — `10` or `10.5` or `10,5`. Text like `sepuluh` is quarantined, never coerced to 0.
- **`locationId`** (on `Items`) — which rack it sits on. **Blank is allowed and meaningful**:
  "belum ditempatkan" is a real state, and surfacing it is the point — that pile in the corner
  is exactly the mess this system exists to make visible.
- **`active`** — `TRUE`/`FALSE`, or `ya`/`tidak`, or blank (defaults to TRUE).
- **timestamps** (`ts`, `acquiredTs`) — **ISO-8601 only** (`2026-09-06T13:45:00Z`) or epoch ms.
  A locale date like `9/6/2026` is **quarantined on purpose**: JavaScript would parse it and pick
  a month on its own — 9 June or 6 September? — silently corrupting the 24-jam rule.

## Privacy (design doc §12.4, settled in Part XVI)
This spreadsheet holds `recipient` and `actorUserId` — **it is never published to the web.**
Reads that include a person go through the gateway. The public dashboard reads a separate
PII-free projection (stock levels, low-stock, status *counts* — never who has what).

## Bad rows are not silently dropped
`data/parse.ts` quarantines any row it cannot read and reports it with the **sheet row number**,
e.g. `Baris 7 (initialstock): "sepuluh" bukan angka`. Fix the cell; nothing is lost.
