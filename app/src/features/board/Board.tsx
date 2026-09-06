import type { Category, Item } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { itemStatusBadge } from '../scan/resolve';
import { CARD } from '../stocktake/ItemForm';

export function Board(
  { items, categories, inventory }: { items: Item[]; categories: Category[]; inventory: Inventory },
) {
  const { derived, notifications, offline } = inventory;
  const rows = items.map((i) => derived.items[i.itemId]).filter(Boolean);
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  return (
    <main class="mx-auto max-w-3xl p-4 pb-24">
      <header class="mb-5">
        <h1 class="text-3xl font-bold tracking-tight">Stok Sekarang</h1>
        <p class="mt-1 text-muted-foreground">
          Dihitung dari stok awal ditambah seluruh riwayat — bukan angka yang disimpan.
        </p>
      </header>

      {offline && (
        <p class={`${CARD} mb-4 px-5 py-4 text-muted-foreground`}>
          <strong class="text-foreground">Belum terhubung ke gateway.</strong>{' '}
          Riwayat transaksi masih kosong, jadi yang tampil adalah stok awal hasil opname.
        </p>
      )}

      {items.length === 0 ? (
        <p class={`${CARD} px-5 py-8 text-center text-muted-foreground`}>
          Belum ada barang. Catat dulu di Opname Gudang.
        </p>
      ) : (
        <>
          {notifications.length > 0 && (
            <section class="mb-6 rounded-2xl border-2 border-menipis p-5">
              <h2 class="mb-1 text-xl font-bold">Notifikasi Stok</h2>
              <p class="mb-3 text-sm text-muted-foreground">
                Sudah di bawah atau sama dengan batas minimum.
              </p>
              <ul class="flex flex-col gap-2">
                {notifications.map((n) => (
                  <li key={n.itemId} class="flex items-center gap-3 rounded-xl bg-menipis/10 px-4 py-3">
                    <span class="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
                    <span class="shrink-0 tabular-nums">
                      sisa <strong>{n.stokAkhir}</strong> · min {n.setMin}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul class="flex flex-col gap-2">
            {rows.map((d) => {
              const badge = itemStatusBadge(d.status);
              return (
                <li key={d.item.itemId} class={`${CARD} flex items-center gap-3 px-4 py-3`}>
                  <span
                    class={`h-10 w-1.5 shrink-0 rounded-full ${badge.dot}`}
                    aria-hidden="true"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{d.item.name}</p>
                    <p class="text-sm text-muted-foreground">
                      {categoryName(d.item.categoryId)}
                      {d.item.trackBy === 'instance' && ' · label satu-satu'}
                    </p>
                  </div>
                  <span class={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${badge.chip}`}>
                    {badge.label}
                  </span>
                  <span class="w-24 shrink-0 text-right text-lg font-bold tabular-nums">
                    {d.qty} <span class="text-sm font-normal text-muted-foreground">{d.item.unit}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
