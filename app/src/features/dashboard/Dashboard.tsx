// Beranda — the one screen that answers "is anything wrong, and what do I do about it".
//
// Every number here is derived, so the dashboard cannot drift from the board the way a
// separately-maintained summary would. Deliberately absent: week-on-week deltas. They need a
// transaction history we do not have yet, and a "+3.4%" computed from nothing is a lie with a
// green arrow on it.

import { useMemo, useState } from 'octane';
import {
  CircleCheck, ClipboardCheck, MapPin, Package, ShoppingCart, TriangleAlert, Wrench,
} from '@octanejs/lucide';
import { racksNeedingAttention, rollupLocations } from '../../../../domain/locations';
import { coverage, racksToCount } from '../../../../domain/cycleCount';
import { overdueLoans } from '../../../../domain/loans';
import type { Route } from '../../state/route';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE, PageHeader } from '../../components/ui';
import { LazyList, useLazyCount } from '../../components/LazyList';
import { rupiah } from '../../components/format';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';
import { StockAlerts } from '../alerts/StockAlerts';
import { RackArt, rackArtFor } from '../racks/RackArt';
import { openRequests, openTotal } from '../../../../domain/requests';

/** How many rows arrive at a time as the column is scrolled. */
const PAGE = 6;

export function Dashboard(
  { draft, inventory, now, onNavigate, onAjukan, onRestock, canReview = true }:
  {
    draft: Draft; inventory: Inventory; now: number; onNavigate: (r: Route) => void;
    /** Opens the request FORM. Available to everybody, unlike the list. */
    onAjukan?: () => void;
    /** The same form, prefilled for one item that has run low. */
    onRestock?: (itemId: string) => void;
    /** False when this device may file requests but not read them back. */
    canReview?: boolean;
  },
) {
  const { items, locations, categories } = draft;
  const categoryNameOf = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? '';

  /* `Object.values` INSIDE the memo, not above it. Outside, it is a new array on every render,
     which is a dependency that never matches — so the memo below never once hit and the whole
     catalog was walked six times for every keystroke anywhere on the page. */
  const counts = useMemo(() => {
    const derived = Object.values(inventory.derived.items);
    return {
    total: items.length,
    units: derived.reduce((n, d) => n + d.qty, 0),
    available: derived.filter((d) => d.status === 'available').length,
    low: derived.filter((d) => d.status === 'low').length,
    out: derived.filter((d) => d.status === 'out').length,
    // Unplaced means "no shelf anywhere", not "one of its shelves is blank": an item kept on
    // A1 and also sitting in the unplaced pile is placed, and does not belong on this list.
    unplaced: items.filter((i) => {
      const rows = inventory.derived.items[i.itemId]?.byLocation ?? {};
      return !Object.keys(rows).some((id) => id !== '');
    }).length,
    // Below zero means more was recorded leaving than ever arrived. Not a rounding
    // artefact — the log and the shelf disagree, and only a physical recount settles it.
    negative: derived.filter((d) => d.qty < 0).length,
    };
  }, [items, inventory.derived]);

  const racks = useMemo(
    () => rollupLocations(locations, items, inventory.derived),
    [locations, items, inventory.derived],
  );
  const needWalk = racksNeedingAttention(racks);
  const due = useMemo(() => racksToCount(locations, now), [locations, now]);
  /* How much of the gudang has EVER been walked — a different question from what is due for a
     recount, and the only one with a finish. Opname counted itself in items recorded, which
     only go up, so the one job in this app that genuinely ends looked endless. It lives on the
     heading of the list it describes rather than in a card of its own (§82). */
  const walk = useMemo(() => coverage(locations), [locations]);

  /*
   * HOW FAR THROUGH THE SHOPPING WE ARE — not how healthy the stock is.
   *
   * This bar first measured "items at a safe level", which read as reassurance while three
   * things were HABIS in the list directly beneath it. A bar over a task list has to measure
   * the TASK, and the task on this card is buying: a low item is dealt with when somebody has
   * filed a request for it, and stops being on the list at all once that purchase lands.
   *
   * So the denominator is the list itself and the numerator is how many of those already have
   * an open pengajuan, and the bar cannot ever look calm while nothing has been done about an
   * empty shelf.
   *
   * `requestedItemIds` and not `requests`, because it is the one fact here that EVERYBODY may
   * see. The rows name who asked, who decided and why, so they are admin-only (§39) — but
   * "somebody has already asked for more sabun" names nobody, and a marbot is exactly the
   * person who needs it: they can file a request, and should not file a second one.
   */
  const shopping = useMemo(() => {
    const asked = new Set(draft.requestedItemIds);
    const total = inventory.notifications.length;
    return { total, done: inventory.notifications.filter((n) => asked.has(n.itemId)).length };
  }, [draft.requestedItemIds, inventory.notifications]);
  const dueCount = due.length;
  // A request nobody looks at is a request nobody answers, so it joins the row of things
  // waiting on a person.
  const openRequestCount = openRequests(draft.requests).length;
  /* Unpriced requests stay out of the sum rather than counting as zero — a total that treats
     "we do not know yet" as "free" is a number somebody takes to a takmir meeting. */
  const requestMoney = openTotal(draft.requests);

  // Broken and lost were invisible from here, so the only screen anyone opens first said
  // nothing about the two states that need a person to act. Both are derived from the log.
  const assets = useMemo(() => {
    const all = Object.values(inventory.derived.instances);
    return {
      broken: all.filter((d) => d.status === 'broken').length,
      lost: all.filter((d) => d.status === 'lost').length,
      out: all.filter((d) => d.status === 'out').length,
      /* Loans past a week. This is the only one of the four that nobody would ever go looking
         for: broken and lost are reported by a person, and a loan that is quietly becoming a
         loss is reported by nobody — which is exactly how things go missing. */
      overdue: overdueLoans(all, now),
    };
  }, [inventory.derived, now]);

  /* Both columns scroll and grow as they are scrolled, rather than ending in a "see all"
     button. The button asked whether to read the rest before showing any of it, and answering
     it re-laid the page out under the cursor; scrolling asks nothing. */
  const alerts = useLazyCount(inventory.notifications.length, PAGE);
  const dueScroll = useLazyCount(due.length, PAGE);
  const shownDue = due.slice(0, dueScroll.count);
  const shownAlerts = inventory.notifications.slice(0, alerts.count);

  const nothingWrong =
    inventory.notifications.length === 0 && counts.out === 0
    && assets.broken === 0 && assets.lost === 0 && assets.overdue === 0;

  if (items.length === 0) {
    return (
      <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
        <PageHeader title="Beranda" subtitle="Ringkasan inventaris BRT Masjid Al-Qalam." />
        <div class={`${CARD} py-20 text-center`}>
          <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada data.</p>
          <p class="mb-5 text-sm italic text-slate-500">Mulai dari Opname Gudang.</p>
          <div class="flex flex-wrap justify-center gap-2">
            <Button size="touch" onClick={() => onNavigate({ name: 'opname' })}>Buka Opname Gudang</Button>
            {/* Also offered here, because this is now the first screen anyone sees — sending
                someone elsewhere just to look at the thing is a poor introduction. */}
            <Button variant="secondary" size="touch" onClick={draft.loadDemo}>Muat contoh data</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      {/* No Pindai action here: the navbar already carries it on desktop and the bottom bar's
          raised centre button carries it on mobile. Two of the same button on one screen is
          just a question about which one is the real one. */}
      <PageHeader title="Beranda" subtitle="Ringkasan inventaris BRT Masjid Al-Qalam." />

      {/* Tappable, because a count nobody can act on is just anxiety. Each chip goes straight
          to the screen that fixes it. Hidden entirely when there is nothing to act on — an
          empty row of zeroes trains people to ignore the whole area. */}
      {(counts.out > 0 || counts.low > 0 || counts.negative > 0 || assets.broken > 0
        || assets.lost > 0 || needWalk > 0 || counts.unplaced > 0 || openRequestCount > 0) && (
        // One scrolling row, not a wrapping block: wrapped, four chips took three rows and
        // pushed everything below the fold on a phone; scrolled, they cost one.
        // A labelled group, not a bare row of buttons: a screen reader otherwise announces
        // four unrelated controls with no idea what connects them.
        // The right-hand mask hints that the row scrolls; without it a chip is simply cut
        // off mid-word at the screen edge and reads as a rendering bug.
        <div
          role="group"
          aria-label="Perlu diurus"
          class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none]"
        >
          {/* First, because it is the only chip that says the numbers themselves are wrong. */}
          {counts.negative > 0 && (
            <Chip tone="red" count={counts.negative} label="stok minus" onClick={() => onNavigate({ name: 'board' })} />
          )}
          {counts.out > 0 && (
            <Chip tone="red" count={counts.out} label="habis" onClick={() => onNavigate({ name: 'board' })} />
          )}
          {counts.low > 0 && (
            <Chip tone="amber" count={counts.low} label="menipis" onClick={() => onNavigate({ name: 'board' })} />
          )}
          {assets.broken > 0 && (
            <Chip tone="orange" count={assets.broken} label="rusak" onClick={() => onNavigate({ name: 'aset' })} />
          )}
          {assets.lost > 0 && (
            <Chip tone="rose" count={assets.lost} label="hilang" onClick={() => onNavigate({ name: 'aset' })} />
          )}
          {assets.overdue > 0 && (
            <Chip
              tone="amber"
              count={assets.overdue}
              label="pinjaman lewat seminggu"
              onClick={() => onNavigate({ name: 'aset' })}
            />
          )}
          {needWalk > 0 && (
            <Chip tone="slate" count={needWalk} label="rak perlu didatangi" onClick={() => onNavigate({ name: 'racks' })} />
          )}
          {openRequestCount > 0 && (
            <Chip
              tone="slate"
              count={openRequestCount}
              label="pengajuan menunggu"
              onClick={() => onNavigate({ name: 'pengajuan' })}
            />
          )}
          {/* Peta Rak was the wrong destination: it lists RACKS, and the whole complaint is
              that these rows have none. The stock list, filtered to exactly them, is the
              screen where each one can be given a shelf. */}
          {counts.unplaced > 0 && (
            <Chip
              tone="slate"
              count={counts.unplaced}
              label="belum ditempatkan"
              onClick={() => onNavigate({ name: 'board', filter: 'belum-ditempatkan' })}
            />
          )}
        </div>
      )}

      {/* The headline is a verdict, not a number. Someone opening this at 5am wants to know
          whether they can put the phone down. */}
      <div class={`${CARD} ${nothingWrong ? 'border-green-200' : 'border-amber-200'}`}>
        <div class="flex items-start gap-3">
          {nothingWrong
            ? <CircleCheck class="mt-0.5 h-6 w-6 shrink-0 text-green-500" />
            : <TriangleAlert class="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />}
          <div>
            <p class="font-bold text-slate-900">
              {nothingWrong
                ? 'Semua aman.'
                : `${inventory.notifications.length + counts.out + assets.broken + assets.lost} hal perlu diurus.`}
            </p>
            {/* The chips above already itemise it. Repeating the same list here was noise —
                the verdict's job is the one-line answer, not a second copy of the detail. */}
            <p class="text-sm text-slate-500">
              {nothingWrong
                ? 'Tidak ada stok yang menipis atau habis.'
                : 'Ketuk salah satu di atas untuk membukanya.'}
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <Kpi value={counts.total} label="Jenis barang" sub={`${counts.units} unit`} tone="ink" />
        <Kpi value={counts.available} label="Tersedia" tone="green" />
        <Kpi value={counts.low} label="Menipis" tone="amber" />
        <Kpi value={counts.out} label="Habis" tone="red" />
      </div>

      {counts.negative > 0 && (
        <div class={`${CARD} border-red-300 bg-red-50/40`} role="alert">
          <div class="flex items-start gap-3">
            <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <p class="font-bold text-slate-900">
                {counts.negative} barang tercatat minus.
              </p>
              <p class="text-sm text-slate-600">
                Tercatat keluar lebih banyak daripada yang pernah ada — berarti catatan dan rak
                tidak cocok. Hitung ulang raknya lewat <strong>Cek rak</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Two lists, side by side: the two errands this screen exists to hand somebody.
          One is "go and buy", the other is "go and count" — different verbs, different places,
          so they sit beside each other rather than stacked, where the second would live below
          the fold on a phone and be read by nobody. Stacked below `lg`, where there is no room
          for two and reading order is the only ordering available. */}
      {/* No `items-start` on the grid: the two cards are a matched pair, and one ending 40px
          above the other reads as a rendering slip rather than as "this list is shorter". They
          stretch, and each footer is pushed to the bottom with `mt-auto`. */}
      {(inventory.notifications.length > 0 || dueCount > 0) && (
        <div class="grid gap-4 lg:grid-cols-2">
          {inventory.notifications.length > 0 && (
            <section class={`${CARD} flex h-full flex-col border-amber-200`}>
              <div class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <TriangleAlert class="h-5 w-5 shrink-0 text-amber-500" />
                <h2 class="font-bold text-slate-900">Perlu dibeli lagi</h2>
                <span class="rounded-full bg-amber-700 px-2 py-0.5 text-[10px] font-bold text-white ring-4 ring-amber-50">
                  {inventory.notifications.length}
                </span>
                {/* His word for this screen, kept beside ours. The spec calls it Notifikasi
                    Stok; "Perlu dibeli lagi" says what to do about it (Part XVII). */}
                <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Notifikasi Stok
                </span>
              </div>
              <p class="mb-3 text-sm text-slate-500">
                Stok yang sudah menyentuh atau melewati batas minimumnya.
              </p>

              {shopping.total > 0 && (
                <Meter label="Sudah diajukan" done={shopping.done} total={shopping.total} unit="barang" />
              )}

              <LazyList sentinel={alerts.sentinel} done={alerts.done}>
                <StockAlerts
                  notifications={shownAlerts}
                  derived={inventory.derived}
                  categoryNameOf={categoryNameOf}
                  now={now}
                  onOpenItem={(id) => onNavigate({ name: 'item', id })}
                  /* The bar above this list counts how many of these have been asked for. With
                     no way to ask from here it could never move off zero — a progress bar over
                     a list you cannot act on is a progress bar that measures nothing. */
                  onRestock={onRestock}
                />
              </LazyList>
            </section>
          )}

          {dueCount > 0 && (
            <section class={`${CARD} flex h-full flex-col`}>
              <div class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <ClipboardCheck class="h-5 w-5 shrink-0 text-slate-500" />
                <h2 class="font-bold text-slate-900">Rak perlu dicek</h2>
                <span class="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-50">
                  {dueCount}
                </span>
              </div>
              <p class="mb-3 text-sm text-slate-500">
                Hitung ulang satu rak saja — dua menit, dan catatan tetap benar.
              </p>

              {/*
                * THE FIRST WALK'S PROGRESS, and only while there is one.
                *
                * Opname counted itself in items recorded — a number that only goes up, past no
                * target — so the one job in this app that genuinely ends looked endless. What
                * is finite is the racks. It belongs HERE, on the list it describes, rather than
                * in a card of its own on Opname: that shipped first, and was two cards saying
                * one thing (§82).
                *
                * It disappears at 100%. A permanent "14 dari 14" is a number nobody needs
                * twice, and from then on the only question this list answers is the rotation.
                */}
              {!walk.done && (
                <Meter label="Sudah pernah didata" done={walk.walked} total={walk.total} unit="rak" />
              )}

              <LazyList sentinel={dueScroll.sentinel} done={dueScroll.done}>
              <ul class="-mx-[var(--card-pad)] divide-y divide-slate-100">
                {shownDue.map((d) => (
                  <li key={d.location.locationId}>
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 px-[var(--card-pad)] py-3 text-left hover:bg-slate-50"
                      aria-label={`Buka Rak ${d.location.code}`}
                      onClick={() => onNavigate({ name: 'racks', id: d.location.locationId })}
                    >
                      {/* The same weight as the drawing on the reorder list beside it. Two
                          columns of the same height read as two columns; one with pictures and
                          one with pin glyphs reads as a main list and an afterthought. */}
                      <RackArt art={rackArtFor(d.location)} size={30} />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-bold text-slate-900">
                          Rak {d.location.code}
                        </p>
                        <p class="truncate text-xs text-slate-500">
                          {d.location.name || d.location.zone}
                        </p>
                      </div>
                      {/* An uncounted rack is UNKNOWN, not overdue, and the two deserve
                          different words — "belum pernah" is a gap in the register, not a
                          late chore. */}
                      <span class="shrink-0 text-xs tabular-nums text-slate-500">
                        {d.freshness === 'never' ? 'belum pernah' : `${d.daysSince} hari lalu`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              </LazyList>
            </section>
          )}
        </div>
      )}

      {/* Four now, so two rows of two on a tablet rather than three-then-one, which leaves a
          card stranded on a line of its own. */}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Action
          icon={MapPin}
          title="Peta Rak"
          body={locations.length === 0
            ? 'Belum ada rak. Tambahkan saat mencatat barang.'
            : `${locations.length} rak · ${needWalk} perlu didatangi${dueCount ? ` · ${dueCount} belum dicek` : ''}`}
          onClick={() => onNavigate({ name: 'racks' })}
        />
        <Action
          icon={Wrench}
          title="Aset"
          body={assets.broken + assets.lost === 0
            ? `${assets.out} dipinjam · tidak ada yang rusak atau hilang.`
            : `${assets.out} dipinjam · ${assets.broken} rusak · ${assets.lost} hilang.`}
          onClick={() => onNavigate({ name: 'aset' })}
        />
        <Action
          icon={Package}
          title="Belum ditempatkan"
          body={counts.unplaced === 0
            ? 'Semua barang sudah punya rak.'
            : `${counts.unplaced} barang belum punya rak — itu yang paling sering hilang.`}
          onClick={() => onNavigate(counts.unplaced === 0
            ? { name: 'board' }
            : { name: 'board', filter: 'belum-ditempatkan' })}
        />
        {/* The badge in the sidebar says a number; this says what the number is ABOUT, and it
            is the only screen here somebody opens to make a decision rather than to look
            something up. */}
        {/* TWO different errands behind one word, and only admins have both.
            Filing a request names only yourself; reading the list names who asked and who
            decided (§39). So the list is admin-only and the FORM is not — the person who
            notices the mop is finished is rarely the person with a Clerk password, and making
            an admin type it in for them is the bookkeeping §0.0 says to refuse. */}
        {canReview ? (
          <Action
            icon={ShoppingCart}
            title="Pengajuan"
            body={openRequestCount === 0
              ? 'Tidak ada yang menunggu diputuskan.'
              : `${openRequestCount} menunggu diputuskan${requestMoney.total > 0 ? ` · ${rupiah(requestMoney.total)}` : ''}.`}
            onClick={() => onNavigate({ name: 'pengajuan' })}
          />
        ) : onAjukan ? (
          <Action
            icon={ShoppingCart}
            title="Ajukan barang"
            body="Perlu beli baru, atau ada yang rusak dan bisa diperbaiki? Ajukan di sini."
            onClick={onAjukan}
          />
        ) : null}
      </div>
    </div>
  );
}

// Literal class strings — Tailwind never sees an interpolated one. The families match the
// status language exactly: rusak is orange, hilang is a deeper rose, because they are
// different outcomes needing different actions and must never read as the same thing.
/*
 * The BORDERS are `-600`, not `-200`, and each stays in its own hue.
 *
 * A chip is a control, so WCAG 1.4.11 wants 3:1 on its edge, and `-200` on a `-50` fill measures
 * 1.00–1.09 — a hairline nobody can see. `-600` was not enough either: amber came back at 2.64
 * and orange at 2.36, which is why this is `-700` and why it was measured twice. §77 already moved every other control boundary to
 * `slate-500` for this reason; the difference here is that flattening these to grey would put a
 * neutral ring around five pills whose whole job is to be told apart by colour. Darkening each
 * within its own hue clears the ratio and leaves the status language exactly where it was.
 */
const CHIP_TONE = {
  red: { chip: 'bg-red-50 text-red-800 border-red-700 hover:bg-red-100', dot: 'bg-red-500' },
  amber: { chip: 'bg-amber-50 text-amber-800 border-amber-700 hover:bg-amber-100', dot: 'bg-amber-500' },
  orange: { chip: 'bg-orange-50 text-orange-800 border-orange-700 hover:bg-orange-100', dot: 'bg-orange-500' },
  rose: { chip: 'bg-rose-50 text-rose-900 border-rose-700 hover:bg-rose-100', dot: 'bg-rose-500' },
  slate: { chip: 'bg-white text-slate-700 border-slate-500 hover:bg-slate-50', dot: 'bg-slate-400' },
} as const;

/**
 * A follow-up shortcut. Small on purpose: these are a summary of what the screen below already
 * says in full, so at the old size a row of seven read as the page's headline rather than as
 * its index. The colour moves into a dot and out of the type, which lets the label sit at a
 * darker weight — smaller and MORE legible at once, rather than smaller and fainter.
 *
 * The count and the label are separate props so the number can carry the emphasis; passing one
 * pre-joined string would mean bolding by regex.
 */
/**
 * A bar and its fraction, shared by the two cards on this row so they cannot drift apart.
 *
 * Both measure WORK — racks walked, items asked for — never a state. A bar over a task list
 * that reports how healthy things are will read as reassurance at exactly the moment the list
 * beneath it is full of emergencies, which is how the first version of this went wrong.
 */
function Meter(
  { label, done, total, unit }: { label: string; done: number; total: number; unit: string },
) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div class="mb-3">
      <div class="mb-1.5 flex items-baseline justify-between gap-3">
        <span class="text-xs font-semibold text-slate-600">{label}</span>
        <span class="text-xs tabular-nums text-slate-600">
          <span class="font-bold text-slate-900">{done}</span> dari {total} {unit}
        </span>
      </div>
      <div
        class="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${label}: ${pct} persen`}
      >
        <div
          class="h-full rounded-full bg-slate-900 transition-[width] duration-500"
          style={`width:${pct}%;print-color-adjust:exact`}
        />
      </div>
    </div>
  );
}

function Chip(
  { tone, count, label, onClick }:
  { tone: keyof typeof CHIP_TONE; count: number; label: string; onClick: () => void },
) {
  const skin = CHIP_TONE[tone];
  return (
    <button
      type="button"
      // shrink-0 and whitespace-nowrap are load-bearing: inside a flex row a chip would
      // otherwise compress and wrap its own two words onto separate lines, turning a pill
      // into a tall oval. Seen on a 390px screen, not reasoned about.
      class={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${skin.chip}`}
      onClick={onClick}
    >
      <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${skin.dot}`} aria-hidden="true" />
      <span class="font-bold tabular-nums">{count}</span>
      <span class="font-medium">{label}</span>
    </button>
  );
}

/*
 * `-700` on a `-50` ground, not `-600`.
 *
 * Measured, not chosen: at `-600` these came out at 3.08 (amber), 3.09 (green) and 4.36 (red),
 * and the number is 16px bold — short of the 18.66px that would let 3:1 apply, so it needs 4.5.
 * `-700` clears it on every tint without touching the hue, so the status language is unchanged.
 */
const TONE = {
  ink: 'bg-slate-900 text-slate-50',
  zero: 'bg-slate-100 text-slate-600',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
} as const;

function Kpi(
  { value, label, sub, tone }: { value: number; label: string; sub?: string; tone: keyof typeof TONE },
) {
  // A zero wearing a warning colour is backwards: "0 habis" is good news, and an amber or red
  // badge on it teaches people to ignore the colour when it finally means something.
  const shade = value === 0 && tone !== 'ink' ? TONE.zero : TONE[tone];

  return (
    // Badge beside the label on a phone, stacked above it from `sm`. Four stacked cards cost
    // most of a 390px screen for four numbers; side by side they cost a third of that.
    <div class="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm sm:block sm:p-5">
      <div class={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 text-base font-bold tabular-nums sm:mb-2 sm:h-10 sm:min-w-10 sm:text-lg ${shade}`}>
        {value}
      </div>
      <div class="min-w-0">
        <p class="truncate text-[10px] font-semibold uppercase leading-tight tracking-wider text-slate-500 sm:text-xs">
          {label}
        </p>
        {sub && <p class={`${CODE} truncate`}>{sub}</p>}
      </div>
    </div>
  );
}

function Action(
  { icon: Icon, title, body, onClick }:
  { icon: (p: { class?: string }) => unknown; title: string; body: string; onClick: () => void },
) {
  return (
    <button
      type="button"
      /* `border-slate-500`, overriding CARD's `slate-200`. §77 set card outlines deliberately
         low because a card is not a control — but this card IS one, and 1.4.11 wants 3:1 on the
         edge of something you press. Measured at 1.34 before. */
      class={`${CARD} flex w-full items-start gap-3 border-slate-500 text-left transition-colors hover:bg-slate-50`}
      onClick={onClick}
    >
      <Icon class="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <span class="min-w-0">
        <span class="block font-bold text-slate-900">{title}</span>
        <span class="block text-sm text-slate-500">{body}</span>
      </span>
    </button>
  );
}
