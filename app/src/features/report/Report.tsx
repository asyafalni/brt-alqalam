// Laporan — the report for takmir and management.
//
// PII-free by construction (design doc §39): it is built from `domain/report.ts`, which never
// reads a name. That is what makes it safe to print, email or hand to someone outside BRT.
//
// Bars are CSS, not a charting library. A distribution of eight categories is a table with a
// visual sort — a chart library would add ~50kB to draw eight rectangles. TanStack Charts earns
// its place when there is a time series worth plotting, which needs the event log.

import { useMemo } from 'octane';
import { CircleCheck, Printer, TriangleAlert } from '@octanejs/lucide';
import { buildReport, percent } from '../../../../domain/report';
import type { Slice } from '../../../../domain/report';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, PageHeader } from '../../components/ui';

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
        <p class={`${CARD} py-20 text-center italic text-slate-400`}>
          Belum ada data untuk dilaporkan.
        </p>
      </div>
    );
  }

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <div class="no-print">
        <PageHeader
          title="Laporan"
          subtitle="Ringkasan untuk takmir dan pengurus. Tidak memuat nama siapa pun."
          action={<Button onClick={() => print()}><Printer class="h-4 w-4" /> Cetak</Button>}
        />
      </div>

      {/* Only on paper: a printed sheet has no navigation to say what it is or when. */}
      <header class="hidden print:block">
        <h1 class="text-2xl font-bold text-slate-900">Laporan Inventaris BRT</h1>
        <p class="text-slate-500">Masjid Al-Qalam · {today}</p>
      </header>

      <section class={CARD}>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure value={report.totalItems} label="Jenis barang" />
          <Figure value={report.totalUnits} label="Total unit" />
          <Figure value={draft.locations.filter((l) => l.active).length} label="Rak" />
          <Figure value={report.byZone.filter((z) => z.key).length} label="Zona" />
        </div>
      </section>

      <Bars title="Status stok" slices={report.byStatus} total={report.totalItems} tone={STATUS_TONE} />
      <Bars title="Komposisi per kategori" slices={report.byCategory} total={report.totalItems} />
      <Bars title="Sebaran per zona" slices={report.byZone} total={report.totalItems} />

      {/* The section management actually needs: not "what do we own" but "how far can this
          register be trusted". A confident number from an unplaced, unmonitored catalog is
          worse than an honest gap. */}
      <section class={CARD}>
        <h2 class="mb-1 font-bold text-slate-900">Kualitas data</h2>
        <p class="mb-4 text-sm text-slate-500">
          Seberapa jauh angka di atas bisa dipercaya.
        </p>

        <div class="mb-4 flex items-center gap-4">
          <div class={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${
            report.health.score >= 0.8 ? 'bg-green-50 text-green-600'
              : report.health.score >= 0.5 ? 'bg-amber-50 text-amber-600'
              : 'bg-red-50 text-red-600'
          }`}>
            {Math.round(report.health.score * 100)}%
          </div>
          <p class="text-sm text-slate-600">
            {report.health.score >= 0.8
              ? 'Katalog rapi: hampir semua barang punya rak dan batas minimum.'
              : 'Sebagian barang belum punya rak atau batas minimum, jadi belum semuanya bisa dipantau.'}
          </p>
        </div>

        <dl class="divide-y divide-slate-100">
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

      {inventory.notifications.length > 0 && (
        <section class={`${CARD} border-amber-200`}>
          <div class="mb-3 flex items-center gap-3">
            <TriangleAlert class="h-5 w-5 text-amber-500" />
            <h2 class="font-bold text-slate-900">Perlu dibeli lagi</h2>
          </div>
          <ul class="divide-y divide-slate-100">
            {inventory.notifications.map((n) => (
              <li key={n.itemId} class="flex items-center gap-3 py-2">
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
        <section class={`${CARD} border-slate-200`}>
          <h2 class="mb-1 font-bold text-slate-900">Belum tersedia</h2>
          <p class="text-sm text-slate-500">
            Pergerakan stok dari waktu ke waktu, kecepatan pemakaian, dan barang yang lama tidak
            bergerak membutuhkan riwayat transaksi. Riwayat itu tersimpan di gateway, yang belum
            terpasang — jadi bagian ini sengaja dikosongkan daripada menampilkan angka karangan.
          </p>
        </section>
      )}

      <p class="hidden text-xs text-slate-400 print:block">
        Laporan ini tidak memuat nama pengambil maupun peminjam. Dicetak {today}.
      </p>
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
    <section class={CARD}>
      <h2 class="mb-4 font-bold text-slate-900">{title}</h2>
      <ul class="space-y-3">
        {slices.map((s) => {
          const pct = percent(s.items, total);
          return (
            <li key={s.key || 'none'}>
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
    <div>
      <p class="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function Health(
  { label, good, bad, badLabel, note }:
  { label: string; good: number; bad: number; badLabel: string; note: string },
) {
  const total = good + bad;
  return (
    <div class="py-3">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-sm font-semibold text-slate-900">{label}</dt>
        <dd class="shrink-0 text-sm tabular-nums text-slate-500">
          {good}/{total} · {percent(good, total)}%
        </dd>
      </div>
      {bad > 0 ? (
        <p class="mt-0.5 text-xs text-amber-700">{bad} {badLabel} — {note}</p>
      ) : (
        <p class="mt-0.5 flex items-center gap-1 text-xs text-green-700">
          <CircleCheck class="h-3 w-3" /> Lengkap.
        </p>
      )}
    </div>
  );
}
