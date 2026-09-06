import { useMemo } from 'octane';
import type { Category, Item } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { CARD } from '../stocktake/ItemForm';
import { resolveScan, statusBadge } from './resolve';

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
      <main class="mx-auto max-w-2xl p-4">
        <div class={`${CARD} border-2 border-destructive p-6 text-center`} role="alert">
          <h1 class="mb-2 text-2xl font-bold">
            {resolution.reason === 'no-catalog' ? 'Katalog masih kosong' : 'Label tidak dikenal'}
          </h1>
          <p class="mb-1 text-muted-foreground">
            {resolution.reason === 'no-catalog'
              ? 'Belum ada barang yang dicatat di perangkat ini.'
              : 'Label ini tidak ada di katalog. Mungkin dicetak dari daftar yang berbeda.'}
          </p>
          <p class="mb-5 font-mono text-sm">{resolution.id}</p>
          <button
            type="button"
            class="min-h-touch rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
            onClick={p.onBack}
          >
            Buka Opname Gudang
          </button>
        </div>
      </main>
    );
  }

  const badge = statusBadge(resolution);
  const { item, instance } = resolution;

  return (
    <main class="mx-auto max-w-2xl p-4">
      {/* The scan guard (§15.3): what it is and what state it is in, BEFORE any action —
          so a duplicate scan cannot quietly become a duplicate withdrawal. */}
      <div class={`${CARD} p-6`}>
        <p class="mb-1 text-sm font-semibold text-muted-foreground">{resolution.categoryName}</p>
        <h1 class="text-3xl font-bold tracking-tight">{instance?.label ?? item.name}</h1>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span class={`rounded-full px-4 py-2 font-bold ${badge.chip}`}>
            {badge.label}
          </span>
          {!instance && (
            <span class="text-2xl font-bold tabular-nums">
              {resolution.qty}{' '}
              <span class="text-base font-normal text-muted-foreground">{item.unit}</span>
            </span>
          )}
        </div>

        <p class="mt-4 font-mono text-sm text-muted-foreground">
          {instance?.assetId ?? item.barcode}
        </p>
      </div>

      <div class={`${CARD} mt-4 p-5`}>
        <p class="text-muted-foreground">
          <strong class="text-foreground">Belum bisa mencatat keluar/masuk.</strong>{' '}
          Transaksi ditulis lewat gateway, dan gateway belum terpasang. Sementara ini layar
          pindai hanya menampilkan status.
        </p>
      </div>

      <button
        type="button"
        class="mt-4 min-h-touch w-full rounded-xl border-2 border-border font-semibold"
        onClick={p.onBack}
      >
        Kembali
      </button>
    </main>
  );
}
