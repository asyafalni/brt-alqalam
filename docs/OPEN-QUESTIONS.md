# Open items

All *design* forks are resolved (DECISIONS.md; Design doc Parts I–XVI). What remains is not
design — it is **three things only a human can find out**, plus the build.

> Account/config setup (Clerk, the Spreadsheet, the gateway deployment) is in **`SETUP.md`**.
> This file is only the things that change the *design*.

## Actions on the owner (these invalidate work if wrong)

0. **Who are all the users, and how many?** Marbot are one group among several — the roster size
   is unknown, and it drives PIN uniqueness pressure, lockout policy, how many devices need
   enrolling, and whether attribution or throughput is the priority. **NEXT.**


1. **Watch the marbot for one hour.** How many are there, own phone or a shared gudang tablet,
   comfortable with apps or WhatsApp-only, do they read fluently. Write it up as Design doc §0.5.
   Currently assumed: shared tablet, Bahasa, icon-led, large touch targets.
   *Sharp risk to watch for:* if a marbot has to walk to a tablet and type a PIN to take a bar of
   soap, they will simply take the soap. Only placement and tap-count fix that, not software.

2. **Ask the boss for two real examples of things that went missing**, and what happened. This
   settles whether loan tracking is the fix for his #1 pain, or whether things are mostly **lost
   in the mess** — in which case the stock-take and QR labels are the fix and loan tracking is a
   much smaller feature than Parts II/III/XV assume. (Design doc §60.)

3. **Ask the boss whether he's attached to the specifics** — *these* 16 categories, *these* 5
   keterangan — or whether he just wants inventory tracked. Two decisions in Part XVI (inferred
   keterangan, deleted `digunakan`) change things he wrote. Take him **one page of proposed
   deviations, each framed as "your goal, fewer steps"**, for batch approval.

## Settled by running it, not by arguing about it

- **The scanner works on a real phone** (2026-09-07, against https://brt-alqalam.fly.dev). Camera
  opens over HTTPS, a QR decodes, the deep link resolves, and a movement is recorded. §15.4 had
  flagged this as needing an explicit device test; it has now had one.
- **The inferred keterangan survives contact with a person.** The same *Ambil* button logged a
  `pemakaian` on a consumable and a `peminjaman` on a durable, with nobody choosing a word —
  which is the whole bet of Part XVI decision 2, and the first time it has been taken by a human
  rather than by a test.

## Blocked on research in flight
- `docs/SMARTINV-REUSE-MAP.md` — being filled from the real cloned template.
- `docs/OCTANE-FINDINGS.md` — how Octane actually works (it's 0.2.3; no `@octanejs/clerk` exists).
- `docs/GATEWAY-FINDINGS.md` — Apps Script + Clerk verification, CORS, PIN hashing, rate limiting.

## Nice-to-haves (optional, non-blocking)
- Write-off metadata — replacement cost / procurement note at write-off.
- `maintenance` status — deleted in Part XVI; re-add as an admin `status_change` if a real need appears.
