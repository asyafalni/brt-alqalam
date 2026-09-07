// The rack board — a map of the room, not a list of things.
//
// Answers the question a messy gudang actually poses. "We own 12 galon sabun" does not help a
// marbot who cannot find them; "Rak B3, and it is nearly empty" does. Each cell is one rack,
// coloured by the worst status on it, because that is what earns a walk.
//
// Layout follows the Arche reference the owner shared: dense labelled cells grouped into
// captioned blocks per zone, with one hot accent reserved for selection — not for status,
// since orange already means `rusak`.

import { useMemo, useState } from 'octane';
import { ClipboardCheck, MapPin, Package } from '@octanejs/lucide';
import { groupByZone, rollupLocations, racksNeedingAttention } from '../../../../domain/locations';
import type { LocationSummary, LocationStatus } from '../../../../domain/locations';
import { countState, racksToCount } from '../../../../domain/cycleCount';
import type { Category, Item } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE, PageHeader, Stat } from '../../components/ui';
import { applyCount, markCounted } from '../stocktake/draft';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';
import { CountSheet } from './CountSheet';

/** Cell skins. Literal class strings — Tailwind never sees an interpolated one. */
const CELL: Record<LocationStatus, string> = {
  out: 'bg-red-50 border-red-200 text-red-800 hover:border-red-300',
  low: 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300',
  available: 'bg-white border-slate-400 text-slate-700 hover:border-slate-900',
  empty: 'bg-slate-50 border-dashed border-slate-400 text-slate-500 hover:border-slate-900',
};

const ZONE_NOTE: Record<LocationStatus, string> = {
  out: 'Ada yang habis',
  low: 'Ada yang menipis',
  available: 'Aman',
  empty: 'Kosong',
};

export function RackBoard(
  { draft, inventory, search, now, onOpenItem }:
  { draft: Draft; inventory: Inventory; search: string; now: number; onOpenItem: (id: string) => void },
) {
  const { items, categories, locations } = draft;
  const [selected, setSelected] = useState<string | null>(null);
  const [counting, setCounting] = useState<string | null>(null);

  const racks = useMemo(
    () => rollupLocations(locations, items, inventory.derived),
    [locations, items, inventory.derived],
  );
  const zones = useMemo(() => groupByZone(racks), [racks]);
  const attention = racksNeedingAttention(racks);
  // IronNest's "section health", per zone rather than per cell.
  const due = useMemo(() => racksToCount(locations, now), [locations, now]);

  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;
  const selectedRack = racks.find((r) => r.location.locationId === selected) ?? null;

  const contents = selectedRack
    ? items.filter((i) => (i.locationId ?? '') === selectedRack.location.locationId)
    : [];

  const q = search.trim().toLowerCase();
  const matchesSearch = (rack: LocationSummary) =>
    q === '' ||
    `${rack.location.code} ${rack.location.name} ${rack.location.zone}`.toLowerCase().includes(q) ||
    items.some((i) =>
      (i.locationId ?? '') === rack.location.locationId && i.name.toLowerCase().includes(q));

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Peta Rak"
        subtitle="Setiap kotak satu rak. Warnanya mengikuti isi yang paling perlu diurus."
      />

      {locations.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <MapPin class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada rak.</p>
          <p class="mx-auto max-w-md text-sm italic text-slate-400">
            Tambahkan rak lewat tombol <strong>+</strong> di sebelah kolom "Rak / tempat" saat
            mencatat barang. Satu QR per rak — bukan per barang.
          </p>
        </div>
      ) : (
        <>
          <div class="grid grid-cols-3 gap-2 sm:gap-4">
            <Stat value={racks.length} label="Rak terdaftar" />
            <Stat
              value={attention}
              label="Rak perlu didatangi"
              tint={attention > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}
            />
            <Stat
              value={items.filter((i) => !i.locationId).length}
              label="Belum ditempatkan"
              tint="bg-slate-100 text-slate-500"
            />
          </div>

          {/* Two columns on a wide screen: the map stays put while the detail changes beside
              it, so choosing a rack never scrolls the grid out from under you. Stacked on a
              phone, where there is no room for two and the detail follows the tap. */}
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
          <div class="space-y-4">
          {zones.map((zone) => (
            <section key={zone.zone} class={CARD}>
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <h2 class="font-bold text-slate-900">{zone.zone}</h2>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {zone.racks.length} rak ·{' '}
                  {zone.racks.filter((r) => r.status === 'low' || r.status === 'out').length} perlu diurus ·{' '}
                  {zone.racks.reduce((n, r) => n + r.unitCount, 0)} unit
                </span>
              </div>

              <div class="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {zone.racks.map((rack) => {
                  const id = rack.location.locationId;
                  const isSelected = selected === id;
                  const dimmed = !matchesSearch(rack);
                  return (
                    <button
                      key={id || 'unassigned'}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Rak ${rack.location.code}, ${rack.itemCount} barang, ${ZONE_NOTE[rack.status]}`}
                      class={
                        'flex min-h-touch flex-col items-start justify-center rounded-xl border px-3 py-2 ' +
                        'text-left transition-all ' + CELL[rack.status] +
                        (isSelected ? ' ring-2 ring-orange-500 ring-offset-1' : '') +
                        (dimmed ? ' opacity-30' : '')
                      }
                      onClick={() => setSelected(isSelected ? null : id)}
                    >
                      <span class="text-sm font-bold uppercase tabular-nums">{rack.location.code}</span>
                      <span class="text-[10px] opacity-70">
                        {rack.itemCount === 0 ? 'kosong' : `${rack.itemCount} barang`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          </div>

          <div class="space-y-4 lg:sticky lg:top-24">
          {due.length > 0 && (
            <section class={CARD}>
              <div class="mb-3 flex items-center gap-3">
                <ClipboardCheck class="h-5 w-5 text-slate-500" />
                <h2 class="font-bold text-slate-900">Perlu dicek</h2>
                <span class="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-slate-50">
                  {due.length}
                </span>
              </div>
              <p class="mb-3 text-sm text-slate-500">
                Hitung ulang satu rak saja — dua menit, dan catatan tetap benar.
              </p>
              <div class="flex flex-wrap gap-2">
                {due.slice(0, 6).map((d) => (
                  <Button
                    key={d.location.locationId}
                    variant="secondary"
                    size="sm"
                    onClick={() => { setSelected(d.location.locationId); setCounting(d.location.locationId); }}
                  >
                    {d.location.code}
                    <span class="ml-1 font-normal text-slate-400">
                      {d.freshness === 'never' ? 'belum pernah' : `${d.daysSince} hari`}
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          )}

          {counting && selectedRack && (
            <CountSheet
              rack={selectedRack.location}
              contents={contents}
              inventory={inventory}
              onCancel={() => setCounting(null)}
              onApply={(counted) => {
                draft.setItems((prev) => applyCount(prev, counted));
                draft.setLocations((prev) => markCounted(prev, counting, Date.now()));
                setCounting(null);
              }}
            />
          )}

          {!selectedRack && !counting && (
            <section class={`${CARD} hidden lg:block`}>
              <MapPin class="mb-2 h-6 w-6 text-slate-300" />
              <p class="font-semibold text-slate-700">Pilih satu rak</p>
              <p class="text-sm text-slate-500">Isinya akan tampil di sini.</p>
            </section>
          )}

          {selectedRack && !counting && (
            <section class={`${CARD} border-orange-200`}>
              <div class="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 class="font-bold text-slate-900">
                    Rak {selectedRack.location.code}
                    {selectedRack.location.name && (
                      <span class="ml-2 font-normal text-slate-500">{selectedRack.location.name}</span>
                    )}
                  </h2>
                  <p class="text-xs text-slate-400">
                    {selectedRack.location.zone}
                    {' · '}
                    {(() => {
                      const c = countState(selectedRack.location, now);
                      if (c.freshness === 'never') return 'belum pernah dicek';
                      return c.daysSince === 0 ? 'dicek hari ini' : `dicek ${c.daysSince} hari lalu`;
                    })()}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  {selectedRack.location.locationId && (
                    <Button size="sm" onClick={() => setCounting(selectedRack.location.locationId)}>
                      Cek rak
                    </Button>
                  )}
                  <button
                    type="button"
                    class="text-sm font-semibold text-slate-500 underline"
                    onClick={() => setSelected(null)}
                  >
                    Tutup
                  </button>
                </div>
              </div>

              {contents.length === 0 ? (
                <div class="py-8 text-center">
                  <Package class="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p class="italic text-slate-400">Rak ini kosong.</p>
                </div>
              ) : (
                <ul class="divide-y divide-slate-100">
                  {contents.map((i) => {
                    const d = inventory.derived.items[i.itemId];
                    const badge = itemStatusBadge(d?.status ?? 'available');
                    return (
                      <li key={i.itemId}>
                        <button
                          type="button"
                          class="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
                          aria-label={`Buka ${i.name}`}
                          onClick={() => onOpenItem(i.itemId)}
                        >
                        <ItemArt art={artFor(i, categoryName(i.categoryId))} size={30} />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-bold text-slate-900">{i.name}</p>
                          <p class={CODE}>{categoryName(i.categoryId)}</p>
                        </div>
                        <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                          <span class="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                            {d?.qty ?? i.initialStock}{' '}
                            <span class="text-xs font-normal text-slate-400">{i.unit}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
