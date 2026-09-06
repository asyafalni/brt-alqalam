// One item, everything known about it.
//
// Reached by tapping a row anywhere, or by scanning its label — the same screen either way,
// because "what is this and what has happened to it" is one question however you arrived at it.

import { useMemo } from 'octane';
import { ArrowLeft, History, MapPin, Package, Pencil, QrCode } from '@octanejs/lucide';
import { keteranganLabel } from '../../../../domain/keterangan';
import type { Route } from '../../state/route';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CARD_FLUSH, CODE, PageHeader, TD, TH } from '../../components/ui';
import { instancesFor } from '../stocktake/draft';
import { instanceStatusBadge, itemStatusBadge, PILL } from '../scan/resolve';
import { itemIcon } from './itemIcon';

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
  const Icon = itemIcon(item, draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '');
  const rack = draft.locations.find((l) => l.locationId === item.locationId);

  const instances = useMemo(
    () => (item.trackBy === 'instance' ? instancesFor(item, now) : []),
    [item, now],
  );

  // Newest first: what happened last is what someone came here to find out.
  const history = useMemo(
    () => inventory.txns
      .filter((t) => t.itemId === item.itemId || instances.some((a) => a.assetId === t.assetId))
      .sort((a, b) => b.ts - a.ts),
    [inventory.txns, item.itemId, instances],
  );

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
        subtitle={draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? item.categoryId}
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
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <Icon class="h-7 w-7 text-slate-500" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex flex-wrap items-center gap-3">
                <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                <span class="text-2xl font-bold tabular-nums text-slate-900">
                  {derived?.qty ?? item.initialStock}{' '}
                  <span class="text-base font-normal text-slate-400">{item.unit}</span>
                </span>
              </div>
              <p class={CODE}>{item.barcode}</p>
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

        <button
          type="button"
          class={`${CARD} text-left transition-colors hover:bg-slate-50`}
          onClick={() => onNavigate({ name: 'racks' })}
        >
          <div class="mb-1 flex items-center gap-2">
            <MapPin class="h-4 w-4 text-slate-400" />
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Letak</span>
          </div>
          {rack ? (
            <>
              <p class="text-xl font-bold text-slate-900">Rak {rack.code}</p>
              <p class="text-sm text-slate-500">{rack.name || rack.zone}</p>
            </>
          ) : (
            <>
              <p class="text-xl font-bold text-slate-900">Belum ditempatkan</p>
              <p class="text-sm text-slate-500">Barang tanpa rak paling sering hilang.</p>
            </>
          )}
        </button>
      </div>

      {instances.length > 0 && (
        <section class={CARD}>
          <h2 class="mb-3 font-bold text-slate-900">
            Unit berlabel <span class="font-normal text-slate-500">({instances.length})</span>
          </h2>
          <ul class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {instances.map((a) => {
              const chip = instanceStatusBadge(inventory.derived.instances[a.assetId]?.status ?? 'available');
              return (
                <li key={a.assetId} class="rounded-xl border border-slate-200 px-3 py-2">
                  <p class="text-sm font-bold text-slate-900">{a.label}</p>
                  <p class={CODE}>{a.assetId}</p>
                  <span class={`${PILL} ${chip.chip} mt-1 inline-block`}>{chip.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section class={CARD_FLUSH}>
        <div class="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
          <History class="h-4 w-4 text-slate-400" />
          <h2 class="text-sm font-bold text-slate-900">Riwayat</h2>
          {history.length > 0 && (
            <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {history.length} catatan
            </span>
          )}
        </div>

        {history.length === 0 ? (
          <div class="px-6 py-12 text-center">
            <Package class="mx-auto mb-3 h-8 w-8 text-slate-300 opacity-40" />
            <p class="italic text-slate-400">
              {inventory.offline
                ? 'Riwayat transaksi tersimpan di gateway, yang belum terpasang.'
                : 'Belum ada transaksi untuk barang ini.'}
            </p>
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th class={TH}>Waktu</th>
                  <th class={TH}>Keterangan</th>
                  <th class={`${TH} text-right`}>Jumlah</th>
                  <th class={TH}>Oleh</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                {history.map((t) => (
                  <tr key={t.txnId}>
                    <td class={`${TD} text-sm text-slate-500`}>
                      {new Date(t.ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td class={`${TD} text-sm font-semibold text-slate-900`}>
                      {keteranganLabel(t.type, t.condition)}
                      {t.recipient && <span class="ml-2 font-normal text-slate-500">→ {t.recipient}</span>}
                    </td>
                    <td class={`${TD} text-right text-sm font-bold tabular-nums ${t.qtyDelta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {t.qtyDelta > 0 ? '+' : ''}{t.qtyDelta || '—'}
                    </td>
                    <td class={`${TD} text-sm text-slate-500`}>{t.actorUserId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd class="text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
