// Laporan — the report for takmir and management.
//
// PII-free by construction (design doc §39): it is built from `domain/report.ts`, which never
// reads a name. That is what makes it safe to print, email or hand to someone outside BRT.
//
// Charts are CSS, not a charting library. Eight categories and three statuses are a table with
// a visual sort — a chart library would add ~50kB to draw eight rectangles. TanStack Charts
// earns its place when there is a time series worth plotting, which needs the event log.
//
// THIS SCREEN IS A DOCUMENT. It is read on paper at least as often as on glass, so every
// section is written to survive the trip: the app frame is already `.no-print` (styles.css),
// the on-screen header swaps for a printed masthead, no section is allowed to split across a
// page, and every fill carries `print-color-adjust: exact` from the root so a printer does not
// silently drop the one thing that makes the proportions readable.
//
// LAYOUT NOTE (why this is not one long column). At 1440px an unconstrained column stretches a
// 2px bar to ~1470px — a hairline with a 700:1 aspect ratio, where a 6% slice is an
// indistinguishable stub floating in grey. So the page is capped at `max-w-6xl` and the two
// distribution sections sit side by side, which halves every bar's length and doubles how much
// of the screen carries information. The measure also keeps the on-screen page close to the
// printed one, which is the shape this content is really for.

import { useMemo } from 'octane';
import { CircleCheck, FileText, Printer, TriangleAlert, Wrench, XCircle } from '@octanejs/lucide';
import { buildReport, percent } from '../../../../domain/report';
import type { AssetProblem, Slice } from '../../../../domain/report';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD } from '../../components/ui';

/** What every card on this page needs in order to print like part of a document. */
const SHEET = 'print:break-inside-avoid print:border-slate-400 print:shadow-none';

/**
 * Backgrounds are decoration on screen and *meaning* here — a bar with no fill is a bar with
 * no value. Browsers strip background paint when printing unless told otherwise, and the
 * property inherits, so one declaration at the root covers every bar, ring and pill below.
 * Not a Tailwind utility because Tailwind ships none for it.
 */
const PRINT_COLOR = 'print-color-adjust:exact;-webkit-print-color-adjust:exact';

/** Section heading, one shape everywhere, so the eye can find the seams without reading. */
function SectionTitle({ children, note }: { children?: unknown; note?: string }) {
  return (
    <div class="mb-4 flex items-baseline justify-between gap-3">
      <h2 class="text-sm font-bold uppercase tracking-wider text-slate-600">{children}</h2>
      {note && <span class="shrink-0 text-xs tabular-nums text-slate-600">{note}</span>}
    </div>
  );
}

export function Report(
  { draft, inventory, now }: { draft: Draft; inventory: Inventory; now: number },
) {
  const report = useMemo(
    () => buildReport(
      draft.items,
      draft.locations,
      (id) => draft.categories.find((c) => c.categoryId === id)?.name ?? id,
      inventory.derived,
      now,
      !inventory.offline,
    ),
    [draft.items, draft.locations, draft.categories, inventory, now],
  );

  const today = new Date(now).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  if (report.totalItems === 0) {
    return (
      <div class="mx-auto w-full max-w-6xl space-y-4 pt-4 sm:pt-6">
        <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Laporan</h1>
        <div class={`${CARD} py-20 text-center`}>
          <FileText class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="italic text-slate-600">Belum ada data untuk dilaporkan.</p>
          <p class="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            Laporan ini terisi sendiri begitu barang pertama dicatat di Opname Gudang.
          </p>
        </div>
      </div>
    );
  }

  const score = Math.round(report.health.score * 100);
  const grade = score >= 80
    ? {
      ring: '#16a34a',
      tone: 'text-green-700',
      verdict: 'Katalog rapi.',
      detail: 'Hampir semua barang punya rak dan batas minimum, jadi angka di atas bisa dipakai.',
    }
    : score >= 50
      ? {
        ring: '#d97706',
        tone: 'text-amber-700',
        verdict: 'Sebagian sudah rapi.',
        detail: 'Sebagian barang belum punya rak atau batas minimum, jadi belum semuanya bisa dipantau.',
      }
      : {
        ring: '#dc2626',
        tone: 'text-red-700',
        verdict: 'Belum bisa diandalkan.',
        detail: 'Sebagian besar barang belum punya rak atau batas minimum — angka di atas baru sebagian cerita.',
      };

  return (
    <div
      class="mx-auto w-full max-w-6xl space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6 print:max-w-none print:space-y-4 print:pb-0 print:pt-0"
      style={PRINT_COLOR}
    >
      {/* Not `PageHeader`: its action wraps to its own line on a phone, which turned a rarely
          used print button into the largest black object on the screen. Title and action share
          one row at every width; the subtitle sits under both, where it can use the full
          measure instead of being squeezed beside a button. */}
      <div class="no-print">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-slate-900 sm:text-2xl">Laporan</h1>
            <p class="text-xs text-slate-600 sm:text-sm">Keadaan per {today}</p>
          </div>
          <Button variant="secondary" size="sm" class="mt-1 shrink-0" onClick={() => print()}>
            <Printer class="h-4 w-4" />
            <span class="hidden sm:inline">Cetak</span>
          </Button>
        </div>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">
          Ringkasan untuk takmir dan pengurus. Tidak memuat nama siapa pun.
        </p>
      </div>

      {/* Only on paper: a printed sheet has no navigation to say what it is, whose it is, or
          when it was true. A masthead is the cheapest way to stop a stray page being anonymous. */}
      <header class="hidden print:block">
        <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-600">
          Badan Rumah Tangga · Masjid Al-Qalam
        </p>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">Laporan Inventaris</h1>
        <p class="mt-0.5 text-sm text-slate-600">Keadaan per {today}</p>
        <hr class="mt-3 border-slate-400" />
      </header>

      {/* The four headline numbers, on ink. One dark block gives the page a single anchor and
          settles the reading order before a word is read; it also echoes the sidebar, so the
          report looks like part of this app rather than a form pasted into it. Inverted for
          print — a full-bleed black panel is a toner tax on a sheet nobody asked to be glossy. */}
      <section
        class={`overflow-hidden rounded-lg bg-slate-900 text-slate-50 shadow-sm ${SHEET} print:border print:border-slate-400 print:bg-white print:text-slate-900`}
        style={PRINT_COLOR}
      >
        <div class="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0 print:grid-cols-4 print:divide-slate-300">
          <Figure value={report.totalItems} label="Jenis barang" />
          <Figure value={report.totalUnits} label="Total unit" />
          <Figure value={draft.locations.filter((l) => l.active).length} label="Rak" />
          <Figure value={report.byZone.filter((z) => z.key).length} label="Zona" />
        </div>
      </section>

      {/* The section management actually needs, and therefore the one placed first: not "what
          do we own" but "how far can this register be trusted". A confident number from an
          unplaced, unmonitored catalog is worse than an honest gap. */}
      <section class={`${CARD} border-slate-300 ${SHEET}`}>
        <SectionTitle note="Baca bagian ini lebih dulu">Kualitas data</SectionTitle>

        <div class="flex items-center gap-4 sm:gap-5">
          {/* A ring, not a fourth progress bar. The page already spends its bars on
              proportions; the trust score is a different kind of number and reads faster when
              it does not look like one more row in a list. Pure CSS — a conic gradient with a
              punched-out centre, which prints as drawn. */}
          <div
            class="relative h-24 w-24 shrink-0 rounded-full sm:h-28 sm:w-28"
            style={`background:conic-gradient(${grade.ring} ${score * 3.6}deg, var(--color-slate-200) 0deg);${PRINT_COLOR}`}
            role="img"
            aria-label={`Skor kualitas data ${score} persen`}
          >
            <div class="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white sm:inset-[11px]">
              <span class="text-2xl font-bold tabular-nums text-slate-900">{score}%</span>
              <span class="text-[9px] font-bold uppercase tracking-wider text-slate-600">skor</span>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <p class={`text-base font-bold sm:text-lg ${grade.tone}`}>{grade.verdict}</p>
            <p class="mt-1 text-sm leading-relaxed text-slate-600">{grade.detail}</p>
          </div>
        </div>

        {/* Three across from `sm`: stacked full-width, each bar is a 1000px hairline saying
            one number, and the three are meant to be compared rather than read in turn. */}
        <dl class="mt-5 grid gap-2 sm:grid-cols-3 print:grid-cols-3">
          <Health
            label="Barang punya rak"
            good={report.health.placed}
            bad={report.health.unplaced}
            badLabel="belum ditempatkan"
            note="Barang tanpa rak harus dicari, dan paling sering hilang."
          />
          <Health
            label="Barang punya batas minimum"
            good={report.health.withMinimum}
            bad={report.health.withoutMinimum}
            badLabel="tanpa minimum"
            note="Tanpa batas minimum, tidak akan pernah ada peringatan stok menipis."
          />
          <Health
            label="Rak pernah dihitung ulang"
            good={report.health.racksCounted}
            bad={report.health.racksNeverCounted}
            badLabel="belum pernah dicek"
            note="Rak yang belum pernah dicek bukan berarti aman — isinya belum diketahui."
          />
        </dl>
      </section>

      <StatusPanel slices={report.byStatus} total={report.totalItems} />

      {/* Placed directly under the stock status, and above the composition charts, because it
          is the part of this report that asks somebody to *do* something. Composition is
          background; a broken timbangan and six missing knives are the agenda. */}
      <AssetTrouble broken={report.broken} lost={report.lost} active={report.activeAssets} now={now} />

      {/* Side by side from `lg`: two 8-row lists stacked is a scroll, and the comparison
          between them is the point. */}
      <div class="grid gap-4 sm:gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        <Distribution title="Komposisi per kategori" slices={report.byCategory} total={report.totalItems} />
        <Distribution title="Sebaran per zona" slices={report.byZone} total={report.totalItems} />
      </div>

      {inventory.notifications.length > 0 && (
        <section class={`${CARD} border-amber-200 bg-amber-50/40 ${SHEET}`} style={PRINT_COLOR}>
          <div class="mb-3 flex items-center gap-2.5">
            <TriangleAlert class="h-5 w-5 shrink-0 text-amber-600" />
            <h2 class="text-sm font-bold uppercase tracking-wider text-amber-800">Perlu dibeli lagi</h2>
            <span class="ml-auto shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-800">
              {inventory.notifications.length}
            </span>
          </div>
          <ul class="grid gap-1.5 sm:grid-cols-2 print:grid-cols-2">
            {inventory.notifications.map((n) => (
              <li
                key={n.itemId}
                class="flex items-center gap-3 rounded-md bg-white px-3 py-2 print:break-inside-avoid print:border print:border-amber-200"
              >
                <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{n.name}</span>
                <span class="shrink-0 text-xs tabular-nums text-slate-600">
                  sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span> · min {n.setMin}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!report.movementAvailable && (
        <section class={`rounded-lg border border-dashed border-slate-300 p-5 ${SHEET}`}>
          <h2 class="mb-1 text-sm font-bold uppercase tracking-wider text-slate-600">Belum tersedia</h2>
          <p class="max-w-3xl text-sm leading-relaxed text-slate-600">
            Pergerakan stok dari waktu ke waktu, kecepatan pemakaian, dan barang yang lama tidak
            bergerak membutuhkan riwayat transaksi. Riwayat itu tersimpan di gateway, yang belum
            terpasang — jadi bagian ini sengaja dikosongkan daripada menampilkan angka karangan.
          </p>
        </section>
      )}

      <footer class="hidden print:block print:break-inside-avoid">
        <hr class="mb-2 border-slate-300" />
        <p class="text-xs text-slate-600">
          Laporan ini tidak memuat nama pengambil maupun peminjam. Dicetak {today}.
        </p>
      </footer>
    </div>
  );
}

/** Fill + text for the three stock statuses. Literal strings: Tailwind cannot see a template. */
const STATUS_TONE: Record<string, { bar: string; dot: string; text: string }> = {
  Tersedia: { bar: 'bg-green-500', dot: 'bg-green-500', text: 'text-green-700' },
  Menipis: { bar: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-700' },
  Habis: { bar: 'bg-red-500', dot: 'bg-red-500', text: 'text-red-700' },
};
const STATUS_ORDER = ['Tersedia', 'Menipis', 'Habis'];
const NEUTRAL = { bar: 'bg-slate-400', dot: 'bg-slate-400', text: 'text-slate-600' };

/**
 * Status is three parts of one whole, so it is drawn as one whole: a single stacked bar plus a
 * legend. Three separate tracks made the reader compare three stubs against three different
 * baselines to answer a question — "is most of the store in good shape?" — that a segmented bar
 * answers before it is read.
 */
function StatusPanel({ slices, total }: { slices: Slice[]; total: number }) {
  if (slices.length === 0) return null;
  // Fixed best-to-worst order, not the count order the aggregation happens to produce. A
  // stacked bar reading green, red, amber makes the reader decode a sequence that carries no
  // meaning; green, amber, red is a gradient anyone can read without a legend.
  const ordered = [...slices].sort(
    (a, b) => STATUS_ORDER.indexOf(a.label) - STATUS_ORDER.indexOf(b.label),
  );
  return (
    <section class={`${CARD} ${SHEET}`}>
      <SectionTitle note={`${total} jenis`}>Status stok</SectionTitle>

      <div class="flex h-4 overflow-hidden rounded-full bg-slate-100" style={PRINT_COLOR}>
        {ordered.map((s) => (
          <div
            key={s.key || s.label}
            class={(STATUS_TONE[s.label] ?? NEUTRAL).bar}
            style={`width:${percent(s.items, total)}%;${PRINT_COLOR}`}
          />
        ))}
      </div>

      <ul class="mt-4 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
        {ordered.map((s) => {
          const tone = STATUS_TONE[s.label] ?? NEUTRAL;
          return (
            <li key={s.key || s.label} class="flex items-baseline gap-2 print:break-inside-avoid">
              <span class={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} style={PRINT_COLOR} />
              <div class="min-w-0">
                <p class="text-lg font-bold tabular-nums text-slate-900">
                  {s.items}
                  <span class="ml-1.5 text-xs font-semibold text-slate-600">
                    {percent(s.items, total)}%
                  </span>
                </p>
                <p class={`text-xs font-semibold ${tone.text}`}>{s.label}</p>
                <p class="text-xs text-slate-600 tabular-nums">{s.units} unit</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Rusak and hilang, kept apart on purpose (design doc Part IV).
 *
 * They are not two flavours of "masalah". A damaged unit is still ours and still on the
 * premises — it costs a repair and belongs in a worklist. A lost one has left the asset base —
 * it costs a replacement and belongs in a procurement list. Merging them produces a single
 * number that cannot be acted on, which is precisely the state the boss described: knowing
 * something is wrong and not what to do about it.
 *
 * Each column leads with a per-item rollup rather than the individual units, because the
 * pattern is the finding. Six rows reading "Pisau #3 · Pisau #7 · Pisau #11…" are six facts;
 * "Pisau daging — 6 unit" is the one the owner already knows to be true, and the one that
 * decides what gets bought before the next Qurban.
 */
function AssetTrouble(
  { broken, lost, active, now }:
  { broken: AssetProblem[]; lost: AssetProblem[]; active: number; now: number },
) {
  // Nothing broken and nothing lost is a real answer, and worth printing — but only once
  // there are tagged units for the answer to be about.
  if (broken.length === 0 && lost.length === 0 && active === 0) return null;

  return (
    <section class={`${CARD} ${SHEET}`}>
      <SectionTitle note={`${active} unit bertanda`}>Aset rusak &amp; hilang</SectionTitle>

      {broken.length === 0 && lost.length === 0 ? (
        <p class="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50/60 px-3 py-2.5 text-sm text-green-800">
          <CircleCheck class="h-4 w-4 shrink-0" />
          Tidak ada aset yang rusak atau hilang. Semua {active} unit bertanda ada di tempat.
        </p>
      ) : (
        <div class="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <TroubleColumn
            tone="broken"
            icon={<Wrench class="h-4 w-4 shrink-0 text-orange-600" />}
            title="Rusak"
            caption="Masih ada, tidak bisa dipakai — perlu diperbaiki atau dipensiunkan."
            rows={broken}
            now={now}
          />
          <TroubleColumn
            tone="lost"
            icon={<XCircle class="h-4 w-4 shrink-0 text-rose-600" />}
            title="Hilang"
            caption="Sudah tidak ada — perlu diganti, atau dicari sampai ketemu."
            rows={lost}
            now={now}
          />
        </div>
      )}
    </section>
  );
}

const TROUBLE = {
  broken: {
    box: 'border-orange-200 bg-orange-50/40',
    chip: 'bg-orange-100 text-orange-800',
    rollup: 'text-orange-900',
  },
  lost: {
    box: 'border-rose-200 bg-rose-50/40',
    chip: 'bg-rose-100 text-rose-800',
    rollup: 'text-rose-900',
  },
} as const;

function TroubleColumn(
  { tone, icon, title, caption, rows, now }:
  {
    tone: keyof typeof TROUBLE; icon: unknown; title: string; caption: string;
    rows: AssetProblem[]; now: number;
  },
) {
  const skin = TROUBLE[tone];

  // Rolled up by the catalog item, largest first — the repeated name is the story.
  const byItem = new Map<string, number>();
  for (const r of rows) byItem.set(r.itemName, (byItem.get(r.itemName) ?? 0) + 1);
  const rollup = [...byItem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div class={`rounded-lg border p-3 ${skin.box} print:break-inside-avoid`} style={PRINT_COLOR}>
      <div class="mb-2 flex items-center gap-2">
        {icon}
        <h3 class="text-sm font-bold text-slate-900">{title}</h3>
        <span class={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${skin.chip}`}>
          {rows.length}
        </span>
      </div>
      <p class="mb-3 text-xs leading-relaxed text-slate-600">{caption}</p>

      {rows.length === 0 ? (
        <p class="py-2 text-sm italic text-slate-600">Tidak ada.</p>
      ) : (
        <>
          <ul class="mb-3 space-y-1">
            {rollup.map(([name, n]) => (
              <li key={name} class={`flex items-baseline gap-2 text-sm font-bold ${skin.rollup}`}>
                <span class="min-w-0 truncate">{name}</span>
                <span class="ml-auto shrink-0 tabular-nums">{n} unit</span>
              </li>
            ))}
          </ul>
          {/* The individual units, so somebody can go and look for a specific one. Never a
              holder — this sheet leaves the building (§39). */}
          <ul class="space-y-1 border-t border-white/60 pt-2">
            {rows.map((r) => (
              <li key={r.assetId} class="flex items-baseline gap-2 text-xs print:break-inside-avoid">
                <span class="min-w-0 truncate font-semibold text-slate-700">{r.label}</span>
                {r.zone && <span class="shrink-0 text-slate-600">{r.zone}</span>}
                <span class="ml-auto shrink-0 tabular-nums text-slate-600">{age(r.since, now)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * How long it has been in this state, in the coarsest unit that is still true. "3 bulan" is
 * what makes a row feel overdue; a date makes the reader do the subtraction themselves.
 */
function age(since: number | undefined, now: number): string {
  if (since == null) return '';
  const days = Math.max(0, Math.floor((now - since) / 86_400_000));
  if (days === 0) return 'hari ini';
  if (days < 31) return `${days} hari`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} bln` : `${Math.floor(months / 12)} thn`;
}

/**
 * The palette for a composition.
 *
 * A sequential warm-neutral ramp, darkest slice first, rather than eight different hues. Two
 * reasons, and both are about this app rather than about taste: colour in this UI *means
 * status* — green available, amber low, red out, rose lost — and spending eight more hues on
 * categories, which carry no such meaning, would make the report's loudest colours the ones
 * that signal nothing. And because the ramp is ordered, the ring reads largest-to-smallest on
 * its own, so the eye can rank the slices without crossing to the legend.
 */
const RAMP = ['#000000', '#2b2926', '#45413b', '#5f5a52', '#7a746a', '#968f83', '#b2aa9d', '#cec6b8'];

/** Even coverage of the ramp whatever the slice count — 4 zones should not all be near-black. */
const shade = (i: number, n: number): string =>
  RAMP[n <= 1 ? 0 : Math.round((i * (RAMP.length - 1)) / (n - 1))];

/**
 * Composition as a ring, because that is the question being asked: not "how big is Kebersihan"
 * but "how is the store divided up", and a circle answers that before it is read.
 *
 * The legend beside it is not decoration — it is the part that supports comparison. A ring is
 * poor at telling 10% from 12%, which is exactly what the sorted list with its figures is good
 * at, so the two carry different halves of the same answer rather than repeating one.
 *
 * Drawn with a conic gradient: no library, no canvas, no layout cost, and it prints as drawn.
 */
function Donut({ slices, total, label }: { slices: Slice[]; total: number; label: string }) {
  // Cumulative stops, so the ring is one paint rather than one element per slice.
  let at = 0;
  const stops = slices.map((s, i) => {
    const from = at;
    at += (percent(s.items, total) / 100) * 360;
    return `${shade(i, slices.length)} ${from}deg ${at}deg`;
  });
  // Rounding leaves a hairline gap at the end; the last slice closes the circle.
  const gradient = `conic-gradient(${stops.join(',')}${at < 360 ? `,${shade(slices.length - 1, slices.length)} ${at}deg 360deg` : ''})`;

  return (
    <div
      class="relative h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36"
      style={`background:${gradient};${PRINT_COLOR}`}
      role="img"
      aria-label={label}
    >
      <div class="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white">
        <span class="text-xl font-bold tabular-nums text-slate-900">{total}</span>
        <span class="text-[9px] font-bold uppercase tracking-wider text-slate-600">jenis</span>
      </div>
    </div>
  );
}

/** A composition: the ring for the shape of it, the sorted legend for the figures. */
function Distribution({ title, slices, total }: { title: string; slices: Slice[]; total: number }) {
  if (slices.length === 0) return null;
  return (
    <section class={`${CARD} ${SHEET}`}>
      <SectionTitle note={`${slices.length} kelompok`}>{title}</SectionTitle>
      <div class="flex flex-col items-center gap-5 sm:flex-row sm:items-start print:flex-row">
        <Donut slices={slices} total={total} label={`${title}: ${slices.map((s) => `${s.label || 'belum ditempatkan'} ${percent(s.items, total)} persen`).join(', ')}`} />
        <ul class="w-full min-w-0 flex-1 space-y-1">
          {slices.map((s, i) => (
            <li
              key={s.key || 'none'}
              class="flex items-center gap-2.5 border-b border-slate-50 py-1 last:border-b-0 print:break-inside-avoid"
            >
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={`background:${shade(i, slices.length)};${PRINT_COLOR}`}
              />
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                {s.label || 'Belum ditempatkan'}
              </span>
              <span class="shrink-0 text-xs tabular-nums text-slate-600">
                <span class="font-bold text-slate-900">{percent(s.items, total)}%</span>
                {' · '}{s.items} jenis · {s.units} unit
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div class="min-w-0 px-4 py-4 sm:px-5 sm:py-5">
      <p class="text-3xl font-bold tabular-nums sm:text-4xl">{value}</p>
      <p class="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400 print:text-slate-600">
        {label}
      </p>
    </div>
  );
}

/**
 * One health line. The bar is ink, not amber: three amber bars stacked read as three separate
 * alarms, when the alarm is the ring above them and these are its workings. Colour stays on the
 * one line that names what to do about it.
 */
function Health(
  { label, good, bad, badLabel, note }:
  { label: string; good: number; bad: number; badLabel: string; note: string },
) {
  const total = good + bad;
  const pct = percent(good, total);
  const ok = bad === 0;
  return (
    <div class="rounded-lg border border-slate-100 p-3 print:break-inside-avoid">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="min-w-0 truncate text-sm font-semibold text-slate-900">{label}</dt>
        {/* One element, one string: the fraction and its percentage are the same fact said
            twice, and splitting them makes two numbers to reconcile at a glance. */}
        <dd class="shrink-0 text-sm tabular-nums text-slate-500">
          {good}/{total} · <span class="font-bold text-slate-900">{pct}%</span>
        </dd>
      </div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" style={PRINT_COLOR}>
        <div
          class={`h-full rounded-full ${ok ? 'bg-green-500' : 'bg-slate-900'}`}
          style={`width:${pct}%;${PRINT_COLOR}`}
        />
      </div>
      {ok ? (
        <p class="mt-2 flex items-center gap-1 text-xs text-green-700">
          <CircleCheck class="h-3 w-3 shrink-0" /> Lengkap.
        </p>
      ) : (
        <p class="mt-2 text-xs leading-relaxed text-slate-600">
          <span class="font-bold text-amber-700">{bad} {badLabel}</span> — {note}
        </p>
      )}
    </div>
  );
}
