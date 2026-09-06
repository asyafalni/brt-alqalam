# Working Agreement — read before designing anything

The prime directive for this project, set by the owner:

> **Reuse the template's design patterns. Polish / extend only where a stated need requires it.
> Do not hallucinate or imagine design patterns.**

Concretely:

1. **Reuse = cite the source.** Every claim about SmartInv's design ("uses this token", "Card
   looks like X", "sidebar layout is Y") must trace to a specific file in the cloned repo. If it
   can't be cited from a file, it is not asserted.
2. **Extend only against a written need.** Any deviation from SmartInv (five-status colours,
   sunlight contrast, larger touch targets, PIN keypad, QR scanner) must be labelled an
   *extension* and tied to the requirement it serves — never presented as if it came from the
   template.
3. **Mark gaps, don't fill them.** If a file isn't available, write `UNKNOWN — needs <file>` in
   the reuse map. Never substitute an assumption.
4. **The prototype is PROPOSED, not derived.** `prototype/brt-inventory-prototype.html` uses an
   invented field-ops theme built to test legibility. It stays flagged as proposed until it is
   re-based on SmartInv's real tokens. Do not promote its palette into "the design".
5. **The reuse map is auditable.** `docs/SMARTINV-REUSE-MAP.md` must always show, per element:
   SmartInv source (file) → our use → extension + why. Reuse vs invention stays visible.

If in doubt: read the repo file. If the file isn't there: say UNKNOWN.

## Model guardrails (don't "helpfully" undo these)

> **SUPERSEDED 2026-09-06 (Design doc Part XVI).** The previous guardrail here said in-use
> (`digunakan`) must never require a borrower. **`digunakan` and `in_use` have been deleted.**
> That rule was written before the real problem was known; the boss's #1 pain is *things go
> missing*, and a status that deliberately records no holder defeats it. Kept here as a record
> of what changed and why, so it isn't silently reintroduced.

Current guardrails:

- **The operator never picks a keterangan.** It is inferred from the item's `kind` and the
  direction of travel (`domain/keterangan.ts`). Do not add a keterangan chooser to the default
  flow — that tap-tax is exactly what was removed, and a KETERANGAN column people guess at is a
  column nobody can report from. `pengambilan` is the one explicit exception path.
- **Everything that leaves the gudang has a holder.** There is no "out, but we didn't record who."
- **`domain/` stays pure.** No I/O, no framework imports, ever. It is the reason a blocked binding
  or a storage swap never forces a rewrite.
- **Derive, don't mutate.** Never write "stok = 8"; append a signed delta. Corrections are
  `reversal` rows, never edits or deletes.
- **The PDF is input, not specification** (Design doc §0). It is the boss's proposal, and he is
  not an inventory specialist. Deviating is allowed and expected — but each deviation is written
  down and taken back to him, never made silently.
