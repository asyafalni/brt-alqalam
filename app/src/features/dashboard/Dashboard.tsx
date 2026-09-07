// Beranda — the one screen that answers "is anything wrong, and what do I do about it".
//
// Every number here is derived, so the dashboard cannot drift from the board the way a
// separately-maintained summary would. Deliberately absent: week-on-week deltas. They need a
// transaction history we do not have yet, and a "+3.4%" computed from nothing is a lie with a
// green arrow on it.

import { useMemo } from 'octane';
import { CircleCheck, MapPin, Package, TriangleAlert, Wrench } from '@octanejs/lucide';
import { racksNeedingAttention, rollupLocations } from '../../../../domain/locations';
import { racksToCount } from '../../../../domain/cycleCount';
import type { Route } from '../../state/route';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE, PageHeader } from '../../components/ui';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { itemIcon } from '../items/itemIcon';

export function Dashboard(
  { draft, inventory, now, onNavigate }:
  { draft: Draft; inventory: Inventory; now: number; onNavigate: (r: Route) => void },
) {
  const { items, locations, categories } = draft;
  const derived = Object.values(inventory.derived.items);
  const categoryNameOf = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? '';

  const counts = useMemo(() => ({
    total: items.length,
    units: derived.reduce((n, d) => n + d.qty, 0),
    available: derived.filter((d) => d.status === 'available').length,
    low: derived.filter((d) => d.status === 'low').length,
    out: derived.filter((d) => d.status === 'out').length,
    unplaced: items.filter((i) => !i.locationId).length,
  }), [items, derived]);

  const racks = useMemo(
    () => rollupLocations(locations, items, inventory.derived),
    [locations, items, inventory.derived],
  );
  const needWalk = racksNeedingAttention(racks);
  const dueCount = useMemo(() => racksToCount(locations, now).length, [locations, now]);

  // Broken and lost were invisible from here, so the only screen anyone opens first said
  // nothing about the two states that need a person to act. Both are derived from the log.
  const assets = useMemo(() => {
    const all = Object.values(inventory.derived.instances);
    return {
      broken: all.filter((d) => d.status === 'broken').length,
      lost: all.filter((d) => d.status === 'lost').length,
      out: all.filter((d) => d.status === 'out').length,
    };
  }, [inventory.derived]);

  const nothingWrong =
    inventory.notifications.length === 0 && counts.out === 0 && assets.broken === 0 && assets.lost === 0;

  if (items.length === 0) {
    return (
      <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
        <PageHeader title="Beranda" subtitle="Ringkasan inventaris BRT Masjid Al-Qalam." />
        <div class={`${CARD} py-20 text-center`}>
          <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada data.</p>
          <p class="mb-5 text-sm italic text-slate-400">Mulai dari Opname Gudang.</p>
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
      {(counts.out > 0 || counts.low > 0 || assets.broken > 0 || assets.lost > 0
        || needWalk > 0 || counts.unplaced > 0) && (
        // One scrolling row, not a wrapping block: wrapped, four chips took three rows and
        // pushed everything below the fold on a phone; scrolled, they cost one.
        // A labelled group, not a bare row of buttons: a screen reader otherwise announces
        // four unrelated controls with no idea what connects them.
        <div
          role="group"
          aria-label="Perlu diurus"
          class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {counts.out > 0 && (
            <Chip tone="red" label={`${counts.out} habis`} onClick={() => onNavigate({ name: 'board' })} />
          )}
          {counts.low > 0 && (
            <Chip tone="amber" label={`${counts.low} menipis`} onClick={() => onNavigate({ name: 'board' })} />
          )}
          {assets.broken > 0 && (
            <Chip tone="orange" label={`${assets.broken} rusak`} onClick={() => onNavigate({ name: 'aset' })} />
          )}
          {assets.lost > 0 && (
            <Chip tone="rose" label={`${assets.lost} hilang`} onClick={() => onNavigate({ name: 'aset' })} />
          )}
          {needWalk > 0 && (
            <Chip tone="slate" label={`${needWalk} rak perlu didatangi`} onClick={() => onNavigate({ name: 'racks' })} />
          )}
          {counts.unplaced > 0 && (
            <Chip tone="slate" label={`${counts.unplaced} belum ditempatkan`} onClick={() => onNavigate({ name: 'racks' })} />
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

      {inventory.notifications.length > 0 && (
        <section class={`${CARD} border-amber-200`}>
          <div class="mb-3 flex items-center gap-3">
            <TriangleAlert class="h-5 w-5 text-amber-500" />
            <h2 class="font-bold text-slate-900">Perlu dibeli lagi</h2>
            <span class="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white ring-4 ring-amber-50">
              {inventory.notifications.length}
            </span>
          </div>
          <ul class="divide-y divide-slate-100">
            {inventory.notifications.slice(0, 6).map((n) => {
              const d = inventory.derived.items[n.itemId];
              const badge = itemStatusBadge(d?.status ?? 'low');
              const Icon = d ? itemIcon(d.item, categoryNameOf(d.item.categoryId)) : Package;
              return (
                <li key={n.itemId} class="flex items-center gap-3 py-2.5">
                  <Icon class="h-4 w-4 shrink-0 text-slate-400" />
                  <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{n.name}</span>
                  <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                  <span class="w-24 shrink-0 text-right text-sm tabular-nums text-slate-500">
                    sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span> · min {n.setMin}
                  </span>
                </li>
              );
            })}
          </ul>
          {inventory.notifications.length > 6 && (
            <button
              type="button"
              class="mt-3 text-sm font-semibold text-slate-900 underline"
              onClick={() => onNavigate({ name: 'board' })}
            >
              Lihat semua {inventory.notifications.length}
            </button>
          )}
        </section>
      )}

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          onClick={() => onNavigate({ name: counts.unplaced === 0 ? 'board' : 'racks' })}
        />
      </div>
    </div>
  );
}

// Literal class strings — Tailwind never sees an interpolated one. The families match the
// status language exactly: rusak is orange, hilang is a deeper rose, because they are
// different outcomes needing different actions and must never read as the same thing.
const CHIP_TONE = {
  red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  rose: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
  slate: 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
} as const;

function Chip(
  { tone, label, onClick }: { tone: keyof typeof CHIP_TONE; label: string; onClick: () => void },
) {
  return (
    <button
      type="button"
      class={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${CHIP_TONE[tone]}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

const TONE = {
  ink: 'bg-slate-900 text-slate-50',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
} as const;

function Kpi(
  { value, label, sub, tone }: { value: number; label: string; sub?: string; tone: keyof typeof TONE },
) {
  return (
    <div class={CARD}>
      <div class={`mb-2 inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-lg font-bold tabular-nums ${TONE[tone]}`}>
        {value}
      </div>
      <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {sub && <p class={CODE}>{sub}</p>}
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
      class={`${CARD} flex w-full items-start gap-3 text-left transition-colors hover:bg-slate-50`}
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
