// Laporan — the report for takmir and management.
//
// PII-free by construction (design doc §39): it is built from `domain/report.ts`, which never
// reads a name. That is what makes it safe to print, email or hand to someone outside BRT.
//
// Bars are CSS, not a charting library. A distribution of eight categories is a table with a
// visual sort — a chart library would add ~50kB to draw eight rectangles. TanStack Charts earns
// its place when there is a time series worth plotting, which needs the event log.
//
// THIS SCREEN IS A DOCUMENT. It is read on paper at least as often as on glass, so every
// section is written to survive the trip: the app frame is already `.no-print` (styles.css),
// the on-screen header swaps for a printed masthead, no section is allowed to split across a
// page, and the bars carry `print-color-adjust: exact` from the root so a printer does not
// silently drop the one thing that makes them readable.

import { useMemo } from 'octane';
import { CircleCheck, FileText, Printer, TriangleAlert } from '@octanejs/lucide';
import { buildReport, percent } from '../../../../domain/report';
import type { Slice } from '../../../../domain/report';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, PageHeader } from '../../components/ui';

/** What every card on this page needs in order to print like part of a document. */
const SHEET = 'print:break-inside-avoid print:border-slate-400 print:shadow-none';

/**
 * Backgrounds are decoration on screen and *meaning* here — a bar with no fill is a bar with
 * no value. Browsers strip background paint when printing unless told otherwise, and the
 * property inherits, so one declaration at the root covers every bar, pill and score chip
 * below. Not a Tailwind utility because Tailwind ships none for it.
 */
const PRINT_COLOR = 'print-color-adjust:exact;-webkit-print-color-adjust:exact';

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
      <div class="space-y-4 pt-4 sm:pt-6">
        <PageHeader title="Laporan" subtitle="Ringkasan untuk takmir dan pengurus." />
        <div class={`${CARD} py-20 text-center`}>
          <FileText class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="italic text-slate-400">Belum ada data untuk dilaporkan.</p>
          <p class="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Laporan ini terisi sendiri begitu barang pertama dicatat di Opname Gudang.
          </p>
        </div>
      </div>
    );
  }

  const score = Math.round(report.health.score * 100);
  const grade = score >= 80
    ? {
      chip: 'bg-green-50 text-green-700 border border-green-100',
      bar: 'bg-green-500',
      verdict: 'Katalog rapi.',
      detail: 'Hampir semua barang punya rak dan batas minimum, jadi angka di atas bisa dipakai.',
    }
    : score >= 50
      ? {
        chip: 'bg-amber-50 text-amber-700 border border-amber-100',
        bar: 'bg-amber-500',
        verdict: 'Sebagian sudah rapi.',
        detail: 'Sebagian barang belum punya rak atau batas minimum, jadi belum semuanya bisa dipantau.',
      }
      : {
        chip: 'bg-red-50 text-red-700 border border-red-100',
        bar: 'bg-red-500',
        verdict: 'Belum bisa diandalkan.',
        detail: 'Sebagian besar barang belum punya rak atau batas minimum — angka di atas baru sebagian cerita.',
      };

  return (
    <div
      class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6 print:space-y-4 print:pb-0 print:pt-0"
      style={PRINT_COLOR}
    >
      <div class="no-print">
        <PageHeader
          title="Laporan"
          subtitle="Ringkasan untuk takmir dan pengurus. Tidak memuat nama siapa pun."
          action={<Button onClick={() => print()}><Printer class="h-4 w-4" /> Cetak</Button>}
        />
      </div>

      {/* Only on paper: a printed sheet has no navigation to say what it is, whose it is, or
          when it was true. A masthead is the cheapest way to stop a stray page being anonymous. */}
      <header class="hidden print:block">
        <p class="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
          Badan Rumah Tangga · Masjid Al-Qalam
        </p>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">Laporan Inventaris</h1>
        <p class="mt-0.5 text-sm text-slate-600">Keadaan per {today}</p>
        <hr class="mt-3 border-slate-400" />
      </header>

      <section class={`${CARD} ${SHEET}`}>
        <h2 class="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Ringkasan</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
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
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 class="text-lg font-bold text-slate-900">Kualitas data</h2>
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Baca bagian ini lebih dulu
          </p>
        </div>
        <p class="mt-1 text-sm text-slate-500">Seberapa jauh angka di atas bisa dipercaya.</p>

        <div class="mt-4 flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-center print:break-inside-avoid">
          <div class={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold tabular-nums ${grade.chip}`}>
            {score}%
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-base font-bold text-slate-900">{grade.verdict}</p>
            <p class="mt-0.5 text-sm text-slate-600">{grade.detail}</p>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                class={`h-full rounded-full ${grade.bar}`}
                style={`width:${Math.max(score, 1)}%`}
              />
            </div>
          </div>
        </div>

        <dl class="mt-2 divide-y divide-slate-100">
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

      <Bars title="Status stok" slices={report.byStatus} total={report.totalItems} tone={STATUS_TONE} />
      <Bars title="Komposisi per kategori" slices={report.byCategory} total={report.totalItems} />
      <Bars title="Sebaran per zona" slices={report.byZone} total={report.totalItems} />

      {inventory.notifications.length > 0 && (
        <section class={`${CARD} border-amber-200 ${SHEET}`}>
          <div class="mb-1 flex items-center gap-3">
            <TriangleAlert class="h-5 w-5 shrink-0 text-amber-500" />
            <h2 class="font-bold text-slate-900">Perlu dibeli lagi</h2>
            <span class="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {inventory.notifications.length} barang
            </span>
          </div>
          <p class="mb-3 text-sm text-slate-500">
            Stok yang sudah menyentuh atau melewati batas minimumnya.
          </p>
          <ul class="divide-y divide-slate-100">
            {inventory.notifications.map((n) => (
              <li key={n.itemId} class="flex items-center gap-3 py-2 print:break-inside-avoid">
                <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{n.name}</span>
                <span class="shrink-0 text-sm tabular-nums text-slate-500">
                  sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span> · min {n.setMin}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!report.movementAvailable && (
        <section class={`${CARD} border-slate-200 ${SHEET}`}>
          <h2 class="mb-1 font-bold text-slate-900">Belum tersedia</h2>
          <p class="text-sm text-slate-500">
            Pergerakan stok dari waktu ke waktu, kecepatan pemakaian, dan barang yang lama tidak
            bergerak membutuhkan riwayat transaksi. Riwayat itu tersimpan di gateway, yang belum
            terpasang — jadi bagian ini sengaja dikosongkan daripada menampilkan angka karangan.
          </p>
        </section>
      )}

      <footer class="hidden print:block print:break-inside-avoid">
        <hr class="mb-2 border-slate-300" />
        <p class="text-xs text-slate-500">
          Laporan ini tidak memuat nama pengambil maupun peminjam. Dicetak {today}.
        </p>
      </footer>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  Tersedia: 'bg-green-500', Menipis: 'bg-amber-500', Habis: 'bg-red-500',
};

function Bars(
  { title, slices, total, tone }:
  { title: string; slices: Slice[]; total: number; tone?: Record<string, string> },
) {
  if (slices.length === 0) return null;
  return (
    <section class={`${CARD} ${SHEET}`}>
      <h2 class="mb-4 font-bold text-slate-900">{title}</h2>
      <ul class="space-y-3">
        {slices.map((s) => {
          const pct = percent(s.items, total);
          return (
            <li key={s.key || 'none'} class="print:break-inside-avoid">
              <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span class="min-w-0 truncate font-semibold text-slate-900">{s.label}</span>
                <span class="shrink-0 tabular-nums text-slate-500">
                  {s.items} jenis · {s.units} unit · {pct}%
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  class={`h-full rounded-full ${tone?.[s.label] ?? 'bg-slate-900'}`}
                  style={`width:${Math.max(pct, 1)}%`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div class="min-w-0">
      <p class="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p class="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function Health(
  { label, good, bad, badLabel, note }:
  { label: string; good: number; bad: number; badLabel: string; note: string },
) {
  const total = good + bad;
  const pct = percent(good, total);
  return (
    <div class="py-3 print:break-inside-avoid">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="min-w-0 truncate text-sm font-semibold text-slate-900">{label}</dt>
        {/* One element, one string: the fraction and its percentage are the same fact said
            twice, and splitting them makes two numbers to reconcile at a glance. */}
        <dd class="shrink-0 text-sm tabular-nums text-slate-500">
          {good}/{total} · {pct}%
        </dd>
      </div>
      <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          class={`h-full rounded-full ${bad > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={`width:${pct}%`}
        />
      </div>
      {bad > 0 ? (
        <p class="mt-1.5 text-xs text-amber-700">{bad} {badLabel} — {note}</p>
      ) : (
        <p class="mt-1.5 flex items-center gap-1 text-xs text-green-700">
          <CircleCheck class="h-3 w-3 shrink-0" /> Lengkap.
        </p>
      )}
    </div>
  );
}
