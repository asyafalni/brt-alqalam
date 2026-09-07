import { useMemo } from 'octane';
import type { Category, Item, Location, StockLine } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { ArrowDownLeft, ArrowUpRight } from '@octanejs/lucide';
import { Button, CARD, CODE } from '../../components/ui';
import type { MovementTarget } from '../movement/MovementSheet';
import { itemStatusBadge, PILL, resolveScan, statusBadge } from './resolve';

interface Props {
  target: 'item' | 'asset' | 'location';
  id: string;
  items: Item[];
  categories: Category[];
  locations: Location[];
  stock: StockLine[];
  inventory: Inventory;
  now: number;
  onBack: () => void;
  /** Scanning is the designed path to recording a movement (§58), not just a lookup. */
  onMove: (target: MovementTarget) => void;
}

export function ScanResult(p: Props) {
  const resolution = useMemo(
    () => resolveScan(
      p.target, p.id, p.items, p.categories, p.locations, p.inventory.derived, p.now, p.stock,
    ),
    [p.target, p.id, p.items, p.categories, p.locations, p.inventory.derived, p.now, p.stock],
  );

  if (!resolution.found) {
    return (
      <div class="mx-auto max-w-2xl space-y-6 pt-6">
        <div class={`${CARD} border-red-100 text-center`} role="alert">
          <h1 class="mb-2 text-2xl font-bold text-slate-900">
            {resolution.reason === 'no-catalog' ? 'Katalog masih kosong' : 'Label tidak dikenal'}
          </h1>
          <p class="mb-1 text-slate-500">
            {resolution.reason === 'no-catalog'
              ? 'Belum ada barang yang dicatat di perangkat ini.'
              : 'Label ini tidak ada di katalog. Mungkin dicetak dari daftar yang berbeda.'}
          </p>
          <p class="mb-5 font-mono text-sm text-slate-400">{resolution.id}</p>
          <Button size="touch" onClick={p.onBack}>Buka Opname Gudang</Button>
        </div>
      </div>
    );
  }

  const badge = statusBadge(resolution);

  // Scanning a shelf answers "what is on this rack, and does anything here need me?"
  if (resolution.kind === 'rack') {
    const { rack, contents } = resolution;
    return (
      <div class="mx-auto max-w-2xl space-y-4 pt-6">
        <div class={CARD}>
          <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {rack.location.zone}
          </p>
          <h1 class="text-2xl font-bold text-slate-900">Rak {rack.location.code}</h1>
          {rack.location.name && <p class="text-slate-500">{rack.location.name}</p>}
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
            <span class="text-sm text-slate-500">
              {rack.itemCount} barang · {rack.unitCount} unit
            </span>
          </div>
        </div>

        <div class={CARD}>
          {contents.length === 0 ? (
            <p class="py-6 text-center italic text-slate-400">Rak ini kosong.</p>
          ) : (
            <ul class="divide-y divide-slate-100">
              {contents.map((i) => {
                const d = p.inventory.derived.items[i.itemId];
                const chip = itemStatusBadge(d?.status ?? 'available');
                return (
                  <li key={i.itemId} class="flex items-center gap-3 py-3">
                    <span class="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{i.name}</span>
                    <span class={`${PILL} ${chip.chip}`}>{chip.label}</span>
                    <span class="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                      {/* What is on this rack, not the item's total across the gudang. */}
                      {d?.byLocation[p.id] ?? 0}{' '}
                      <span class="text-xs font-normal text-slate-400">{i.unit}</span>
                    </span>
                    {/* The point of scanning a shelf: you are standing at it, holding the thing.
                        Anything further than one tap from here loses to just walking away. */}
                    {i.trackBy === 'quantity' && (
                      <Button
                        size="sm"
                        class="min-h-11 shrink-0"
                        aria-label={`Ambil ${i.name}`}
                        onClick={() => p.onMove({ item: i, direction: 'keluar', locationId: p.id })}
                      >
                        Ambil
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button variant="outline" size="touch" class="w-full" onClick={p.onBack}>Kembali</Button>
      </div>
    );
  }

  const { item, instance } = resolution;

  return (
    <div class="mx-auto max-w-2xl space-y-4 pt-6">
      {/* The scan guard (§15.3): what it is and what state it is in, BEFORE any action —
          so a duplicate scan cannot quietly become a duplicate withdrawal. */}
      <div class={CARD}>
        <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {resolution.categoryName}
        </p>
        <h1 class="text-2xl font-bold text-slate-900">{instance?.label ?? item.name}</h1>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
          {!instance && (
            <span class="text-2xl font-bold tabular-nums text-slate-900">
              {resolution.qty}{' '}
              <span class="text-base font-normal text-slate-400">{item.unit}</span>
            </span>
          )}
        </div>

        <p class={`mt-4 ${CODE}`}>{instance?.assetId ?? item.barcode}</p>
      </div>

      {/* Equipment is deliberately still read-only here. Loans need a borrower, and §60 says
          we do not yet know whether things are lent-and-lost or lost in the mess — which
          decides how big that flow should be. Saying so beats a half-built one. */}
      {item.trackBy === 'quantity' ? (
        <div class="grid grid-cols-2 gap-3">
          <Button size="touch" onClick={() => p.onMove({ item, direction: 'keluar' })}>
            <ArrowUpRight class="h-5 w-5" /> Ambil
          </Button>
          <Button variant="secondary" size="touch" onClick={() => p.onMove({ item, direction: 'masuk' })}>
            <ArrowDownLeft class="h-5 w-5" /> Kembalikan
          </Button>
        </div>
      ) : (
        <div class={`${CARD} border-slate-200`}>
          <p class="text-sm leading-relaxed text-slate-600">
            <span class="font-bold text-slate-900">Peminjaman belum bisa dicatat di sini.</span>{' '}
            Barang berlabel satu-satu perlu tahu siapa yang membawanya, dan bagian itu belum
            dibuat. Yang bisa dicatat sekarang adalah barang yang dihitung jumlahnya.
          </p>
        </div>
      )}

      <Button variant="outline" size="touch" class="w-full" onClick={p.onBack}>Kembali</Button>
    </div>
  );
}
