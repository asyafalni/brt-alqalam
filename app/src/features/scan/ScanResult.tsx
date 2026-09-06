import { useMemo } from 'octane';
import type { Category, Item } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CODE } from '../../components/ui';
import { PILL, resolveScan, statusBadge } from './resolve';

interface Props {
  target: 'item' | 'asset';
  id: string;
  items: Item[];
  categories: Category[];
  inventory: Inventory;
  now: number;
  onBack: () => void;
}

export function ScanResult(p: Props) {
  const resolution = useMemo(
    () => resolveScan(p.target, p.id, p.items, p.categories, p.inventory.derived, p.now),
    [p.target, p.id, p.items, p.categories, p.inventory.derived, p.now],
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

      <div class={`${CARD} border-sky-100 bg-gradient-to-br from-white to-sky-50/30`}>
        <p class="text-sm text-slate-600">
          <span class="font-bold text-slate-900">Belum bisa mencatat keluar/masuk.</span>{' '}
          Transaksi ditulis lewat gateway, dan gateway belum terpasang. Sementara ini layar
          pindai hanya menampilkan status.
        </p>
      </div>

      <Button variant="outline" size="touch" class="w-full" onClick={p.onBack}>Kembali</Button>
    </div>
  );
}
