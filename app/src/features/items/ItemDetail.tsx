// One item, everything known about it.
//
// Reached by tapping a row anywhere, or by scanning its label — the same screen either way,
// because "what is this and what has happened to it" is one question however you arrived at it.

import { useMemo } from 'octane';
import { ArrowLeft, History, MapPin, Package, Pencil, QrCode } from '@octanejs/lucide';
import { keteranganLabel } from '../../../../domain/keterangan';
import type { Txn } from '../../../../domain/types';
import type { Route } from '../../state/route';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CARD_FLUSH, CODE, PageHeader } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { instancesFor } from '../stocktake/draft';
import { totalFor } from '../../../../domain/stock';
import { instanceStatusBadge, itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from './ItemArt';
import { ItemPhotos } from './ItemPhotos';
import { createIndexedDbPhotoStore } from '../../../../data/indexedDbPhotos';

/* One store for the whole app, created once. Building it per render would open a fresh
   IndexedDB connection every time somebody opened an item. */
const photoStore = createIndexedDbPhotoStore();

const when = (ts: number) =>
  new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

// The history table's four columns, in desk order. `mobile` decides what each becomes on a
// phone: the keterangan is what happened, so it is the headline; the quantity delta is the
// number being looked for, so it is pinned to the right of it; when and by whom are context.
const HISTORY: Column<Txn>[] = [
  {
    key: 'ts',
    header: 'Waktu',
    mobile: 'meta',
    cell: (t) => <span class="whitespace-nowrap text-sm text-slate-500">{when(t.ts)}</span>,
  },
  {
    key: 'keterangan',
    header: 'Keterangan',
    mobile: 'title',
    cell: (t) => (
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-slate-900">
          {keteranganLabel(t.type, t.condition)}
        </p>
        {t.recipient && <p class="truncate text-xs text-slate-500">→ {t.recipient}</p>}
      </div>
    ),
  },
  {
    key: 'qty',
    header: 'Jumlah',
    align: 'right',
    mobile: 'trailing',
    cell: (t) => (
      <span
        class={`text-sm font-bold tabular-nums ${
          t.qtyDelta < 0 ? 'text-red-600' : t.qtyDelta > 0 ? 'text-green-600' : 'text-slate-400'
        }`}
      >
        {t.qtyDelta > 0 ? '+' : ''}{t.qtyDelta || '—'}
      </span>
    ),
  },
  {
    key: 'actor',
    header: 'Oleh',
    mobile: 'meta',
    cell: (t) => <span class="text-sm text-slate-500">{t.actorUserId || '—'}</span>,
  },
];

export function ItemDetail(
  { id, draft, inventory, now, onNavigate }:
  { id: string; draft: Draft; inventory: Inventory; now: number; onNavigate: (r: Route) => void },
) {
  const item = draft.items.find((i) => i.itemId === id || i.barcode === id);

  if (!item) {
    return (
      <div class="space-y-4 pt-4 sm:pt-6">
        <div class={`${CARD} border-red-100 py-16 text-center`} role="alert">
          <h1 class="mb-2 text-2xl font-bold text-slate-900">Barang tidak ditemukan</h1>
          <p class="mb-1 text-slate-500">Tidak ada barang dengan kode ini di katalog.</p>
          <p class="mb-5 font-mono text-sm text-slate-400">{id}</p>
          <Button size="touch" onClick={() => onNavigate({ name: 'board' })}>Lihat semua stok</Button>
        </div>
      </div>
    );
  }

  const derived = inventory.derived.items[item.itemId];
  const badge = itemStatusBadge(derived?.status ?? 'available');
  const categoryName = draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '';
  const art = artFor(item, categoryName);
  /** Every shelf this thing is kept on, with what is on each — the unplaced pile included. */
  const shelves = useMemo(() => {
    const rows = derived?.byLocation ?? {};
    return Object.entries(rows).map(([locationId, qty]) => ({
      locationId,
      qty,
      location: draft.locations.find((l) => l.locationId === locationId),
    }));
  }, [derived, draft.locations]);

  const instances = useMemo(
    () => (item.trackBy === 'instance'
      ? instancesFor(item, now, totalFor(draft.stock, item.itemId))
      : []),
    [item, now, draft.stock],
  );

  // Newest first: what happened last is what someone came here to find out.
  const history = useMemo(
    () => inventory.txns
      .filter((t) => t.itemId === item.itemId || instances.some((a) => a.assetId === t.assetId))
      .sort((a, b) => b.ts - a.ts),
    [inventory.txns, item.itemId, instances],
  );

  // A count per status, so a shelf of twenty knives reads at a glance instead of one pill
  // at a time. Ordered by the status list itself, not by frequency, so it never reshuffles.
  const instanceTally = useMemo(() => {
    const acc = new Map<string, number>();
    for (const a of instances) {
      const status = inventory.derived.instances[a.assetId]?.status ?? 'available';
      acc.set(status, (acc.get(status) ?? 0) + 1);
    }
    return [...acc.entries()];
  }, [instances, inventory.derived]);

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <button
        type="button"
        class="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        onClick={() => onNavigate({ name: 'board' })}
      >
        <ArrowLeft class="h-4 w-4" /> Semua stok
      </button>

      <PageHeader
        title={item.name}
        subtitle={categoryName || item.categoryId}
        action={
          <div class="flex gap-2">
            <Button variant="secondary" onClick={() => onNavigate({ name: 'opname' })}>
              <Pencil class="h-4 w-4" /> Ubah
            </Button>
            <Button variant="secondary" onClick={() => onNavigate({ name: 'label' })}>
              <QrCode class="h-4 w-4" /> Label
            </Button>
          </div>
        }
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class={`${CARD} sm:col-span-2`}>
          <div class="flex items-start gap-4">
            {/* Big here on purpose. This is the one screen with room for it, and the
                illustration is what makes an item recognisable before it is read — the same
                asset as the 36px row, drawn as filled shapes so it holds up at this size
                instead of becoming a large thin outline. */}
            <ItemArt art={art} size={96} class="hidden sm:block" />
            <ItemArt art={art} size={64} class="sm:hidden" />
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex flex-wrap items-center gap-3">
                <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                <span class="text-2xl font-bold tabular-nums text-slate-900">
                  {derived?.qty ?? 0}{' '}
                  <span class="text-base font-normal text-slate-400">{item.unit}</span>
                </span>
              </div>
              <p class={`${CODE} truncate`}>{item.barcode}</p>
            </div>
          </div>

          <dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <Fact label="Jenis" value={item.kind === 'consumable' ? 'Bisa habis' : 'Barang tetap'} />
            <Fact label="Cara catat" value={item.trackBy === 'instance' ? 'Label satu-satu' : 'Dihitung'} />
            <Fact label="Minimum" value={item.minStock == null ? 'Tidak diatur ( - )' : String(item.minStock)} />
            {/* The spec's per-item PENGAMBILAN counter: everything ever taken, never netted off. */}
            <Fact label="Total diambil" value={String(derived?.takenTotal ?? 0)} />
          </dl>
        </div>

        {/* Racks, plural. A thing kept on two shelves has two answers to "where is it", and
            showing only the first would send somebody to whichever one happens to be empty.
            Each row carries its own quantity, because that is the number they will be
            standing in front of. */}
        <div class={`${CARD} flex flex-col`}>
          <div class="mb-2 flex items-center gap-2">
            <MapPin class="h-4 w-4 shrink-0 text-slate-400" />
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Letak</span>
            {shelves.length > 1 && (
              <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {shelves.length} rak
              </span>
            )}
          </div>
          {shelves.length === 0 ? (
            <>
              <p class="text-xl font-bold text-slate-900">Belum ditempatkan</p>
              <p class="text-sm text-slate-500">Barang tanpa rak paling sering hilang.</p>
            </>
          ) : (
            <ul class="divide-y divide-slate-100">
              {shelves.map((shelf) => (
                <li key={shelf.locationId || 'unplaced'}>
                  <button
                    type="button"
                    class="flex w-full items-baseline gap-3 py-2 text-left hover:text-slate-900"
                    disabled={!shelf.location}
                    aria-label={shelf.location ? `Buka Rak ${shelf.location.code}` : undefined}
                    onClick={() => shelf.location
                      && onNavigate({ name: 'racks', id: shelf.location.locationId })}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-bold text-slate-900">
                        {shelf.location ? `Rak ${shelf.location.code}` : 'Belum ditempatkan'}
                      </p>
                      {shelf.location && (
                        <p class="truncate text-xs text-slate-500">
                          {shelf.location.name || shelf.location.zone}
                        </p>
                      )}
                    </div>
                    {/* Only when it is split. On a single shelf this is the headline figure
                        said twice, and a number repeated is a number to reconcile. */}
                    {shelves.length > 1 && (
                      <span class="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                        {shelf.qty}
                        <span class="ml-1 text-xs font-normal text-slate-400">{item.unit}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {instances.length > 0 && (
        <section class={CARD}>
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 class="font-bold text-slate-900">
              Unit berlabel <span class="font-normal text-slate-500">({instances.length})</span>
            </h2>
            <ul class="flex flex-wrap items-center gap-x-3 gap-y-1">
              {instanceTally.map(([status, n]) => {
                const chip = instanceStatusBadge(status);
                return (
                  <li key={status} class="flex items-center gap-1.5">
                    <span class={`h-2 w-2 shrink-0 rounded-full ${chip.rail}`} aria-hidden="true" />
                    <span class="text-xs text-slate-500">
                      {n} {chip.label.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Two across on a phone, then as many as fit. A fixed auto-fill alone left a lone
              card stretched the full width of a tablet, which reads as a mistake. */}
          <ul class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-3">
            {instances.map((a) => {
              const chip = instanceStatusBadge(inventory.derived.instances[a.assetId]?.status ?? 'available');
              return (
                <li
                  key={a.assetId}
                  class="flex items-stretch gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 sm:gap-3 sm:p-3"
                >
                  {/* The status is the first thing read, before any word of it. */}
                  <span class={`w-1 shrink-0 rounded-full ${chip.rail}`} aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-slate-900">{a.label}</p>
                    <p class={`${CODE} truncate`}>{a.assetId}</p>
                    <span class={`${PILL} ${chip.chip} mt-2 inline-block`}>{chip.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Above the history, below the identity: a photo answers "is this the one?", which is a
          question asked before "what happened to it?" and after "what is it?". */}
      <ItemPhotos itemId={item.itemId} itemName={item.name} store={photoStore} />

      <section class={CARD_FLUSH}>
        <div class="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
          <History class="h-4 w-4 shrink-0 text-slate-400" />
          <h2 class="text-sm font-bold text-slate-900">Riwayat</h2>
          {history.length > 0 && (
            <span class="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {history.length} catatan
            </span>
          )}
        </div>

        <DataTable
          columns={HISTORY}
          rows={history}
          keyOf={(t) => t.txnId}
          empty={
            <div class="px-6 py-12 text-center">
              <Package class="mx-auto mb-3 h-8 w-8 text-slate-300 opacity-40" />
              <p class="mx-auto max-w-sm text-sm italic text-slate-400">
                {inventory.offline
                  ? 'Riwayat transaksi tersimpan di gateway, yang belum terpasang.'
                  : 'Belum ada transaksi untuk barang ini.'}
              </p>
            </div>
          }
        />
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div class="min-w-0">
      <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd class="truncate text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
