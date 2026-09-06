# BRT Inventaris — Masjid Al-Qalam

Mobile-first inventory system for BRT Masjid Al-Qalam. Static SPA (Octane), Google Sheets as the
source of truth, a Clerk-gated Apps Script gateway as the only server-side component.

> **Read `docs/BRT-Inventory-System-Design.md` §0 first.** There is no paper process being
> replaced: the requirements PDF is the boss's proposal, and he is not an inventory specialist.
> The real problems are (1) nobody knows what we own, (2) things go missing, (3) reporting
> upward, on top of an inventory that is messy both physically and informationally.
> **The top risk is adoption, not the stack.**

## Layout

```
├── docs/
│   ├── BRT-Inventory-System-Design.md   Design log, Parts 0–XVI (the "why")
│   ├── BRT-Inventory-Build-Spec.md      Schema, gateway API, reducer (the "how")
│   ├── DECISIONS.md                     Every locked decision — read the v1.6 section first
│   ├── SETUP.md                         ⚙️ What YOU need to prepare (Clerk, Sheet, gateway)
│   ├── OPEN-QUESTIONS.md                Three things only a human can find out
│   ├── WORKING-AGREEMENT.md             ⚠️ READ FIRST — anti-hallucination rules + guardrails
│   ├── SMARTINV-REUSE-MAP.md            Template reuse, every row cited to a real file
│   ├── OCTANE-FINDINGS.md               How Octane actually works (22 primary sources)
│   └── GATEWAY-FINDINGS.md              Apps Script + Clerk facts (54 sources + 3 probes)
├── domain/     PURE TS — types, deriveState reducer, keterangan inference, notifications
├── data/       Adapters — ports (repository interfaces) + the CSV parse boundary
├── app/        The SPA (Octane + Vite 8 + Tailwind 4) — stock-take screen
├── sheets/     Importable CSV templates for the Google Spreadsheet tabs
├── gateway/    Apps Script gateway — SPEC ONLY, not built
└── prototype/  Early UX prototype (PROPOSED theme, superseded by app/)
```

## Status

| Layer | State |
| --- | --- |
| **Design** | Complete through Part XVI. Real problem statement written (§0). |
| **`domain/`** | Built & verified. **36 tests**, `tsc --strict` clean. |
| **`data/`** | Built & verified. **23 tests**. Parse boundary quarantines bad rows, never drops them. |
| **`app/`** | Stock-take screen built. **22 tests**, typecheck clean, static build works. |
| **`gateway/`** | Specced, not built. Blocked on one Clerk dashboard check (see below). |

**81 tests green** across the three packages.

## Run

```bash
# Node 24 LTS required (Octane pins Node >= 22.22.2, TypeScript ~5.9.3, Vite 8)
cd domain && npm install && npm test && npm run typecheck && cd ..
cd data   && npm install && npm test && npm run typecheck && cd ..
cd app    && npm install && npm run dev          # http://localhost:5173
```

## What to do next

**You can use this today, before any Google setup exists.** Open `app/`, walk the gudang, add
what you find, tap **Ekspor CSV**, import the result into the `Items` tab. That answers
"nobody knows what we own" before a single transaction is logged.

**Setting it up for real: `docs/SETUP.md`** — staged, with exact click-paths and the traps.

Three things that need a human (`docs/OPEN-QUESTIONS.md`):
1. **Clerk dashboard → Configure → JWT Templates** — is it available on the free plan? This is
   the last unknown blocking the gateway; Apps Script has no RSA verify, so an HS256 JWT template
   is the only path (§65.3).
2. **Watch the marbot for an hour** — the daily operators. Every UI assumption rests on this.
3. **Ask the boss for two real "it went missing" stories** — settles whether loan tracking is the
   fix for his top pain, or whether things are simply lost in the mess.

## Rules of engagement
- **Derive, don't mutate.** Stock is folded from an append-only log, never stored. Corrections
  are `reversal` rows, never edits.
- **`domain/` stays pure.** No I/O, no framework imports, ever.
- **The operator never picks a keterangan** — it is inferred from the item's `kind` and the
  direction of travel.
- **If the model changes, change the tests first.**
