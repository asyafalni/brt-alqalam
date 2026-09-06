// Layout ported from SmartInv's Dashboard + Inventory pages: page header (Dashboard.tsx:108-113),
// stat tile row (:140-152), amber alert rail (:207-261), and the table-in-a-flush-Card pattern
// (Inventory.tsx:100-205). See docs/SMARTINV-REUSE-MAP.md §5.

import { CircleCheck, Package, TriangleAlert } from '@octanejs/lucide';
import type { Category, Item } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Stat, TD, TH } from '../../components/ui';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { itemIcon } from '../items/itemIcon';

export function Board(
  { items, categories, inventory, search }:
  { items: Item[]; categories: Category[]; inventory: Inventory; search: string },
) {
  const { derived, notifications, offline } = inventory;
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  const q = search.trim().toLowerCase();
  const rows = items
    .map((i) => derived.items[i.itemId])
    .filter(Boolean)
    .filter((d) => q === '' || `${d.item.name} ${d.item.unit}`.toLowerCase().includes(q));

  const totalUnits = rows.reduce((n, d) => n + d.qty, 0);

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Stok Sekarang"
        subtitle="Dihitung dari stok awal ditambah seluruh riwayat — bukan angka yang disimpan."
      />

      {offline && (
        <div class={`${CARD} border-slate-200`}>
          <p class="text-sm text-slate-600">
            <span class="font-bold text-slate-900">Belum terhubung ke gateway.</span>{' '}
            Riwayat transaksi masih kosong, jadi yang tampil adalah stok awal hasil opname.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="italic text-slate-400">Belum ada barang. Catat dulu di Opname Gudang.</p>
        </div>
      ) : (
        <>
          <div class="grid grid-cols-3 gap-2 sm:gap-4">
            <Stat value={items.length} label="Jenis barang" />
            <Stat value={totalUnits} label="Total unit" tint="bg-green-50 text-green-600" />
            <Stat
              value={notifications.length}
              label="Perlu perhatian"
              tint={notifications.length > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}
            />
          </div>

          {/* Dashboard.tsx:207-261 — the amber alert rail, our Notifikasi Stok. */}
          <div class={`${CARD} border-amber-200`}>
            <div class="mb-4 flex items-center gap-3">
              <TriangleAlert class="h-5 w-5 text-amber-500" />
              <h2 class="font-bold text-slate-900">Notifikasi Stok</h2>
              {notifications.length > 0 && (
                <span class="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white ring-4 ring-amber-50">
                  {notifications.length}
                </span>
              )}
            </div>

            {notifications.length === 0 ? (
              <div class="flex items-center gap-3 py-4 text-slate-500">
                <CircleCheck class="h-5 w-5 text-green-500" />
                <span class="text-sm">Semua stok aman.</span>
              </div>
            ) : (
              <ul class="space-y-2">
                {notifications.map((n) => (
                  <li
                    key={n.itemId}
                    class={`flex items-center gap-3 rounded-xl border p-3 ${
                      n.stokAkhir <= 0 ? 'border-red-100 bg-red-50/50' : 'border-amber-100 bg-white'
                    }`}
                  >
                    <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{n.name}</span>
                    <span class="shrink-0 text-xs text-slate-500 tabular-nums">
                      sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span> · min {n.setMin}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Inventory.tsx:100-205 — table in a flush Card. */}
          <div class={CARD_FLUSH}>
            <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-4">
              <h2 class="text-sm font-bold text-slate-900">
                Daftar Stok
                {q !== '' && <span class="ml-2 font-normal text-slate-500">· hasil cari "{search}"</span>}
              </h2>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {rows.length} baris
              </span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead class="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th class={TH}>Barang</th>
                    <th class={TH}>Kategori</th>
                    <th class={TH}>Status</th>
                    <th class={`${TH} text-right`}>Stok</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                  {rows.length === 0 ? (
                    <tr>
                      <td colspan={4} class="px-6 py-20 text-center">
                        <Package class="mx-auto mb-3 h-10 w-10 text-slate-300 opacity-40" />
                        <p class="italic text-slate-400">Tidak ada yang cocok dengan "{search}".</p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((d) => {
                      const badge = itemStatusBadge(d.status);
                      return (
                        <tr key={d.item.itemId} class="transition-colors hover:bg-slate-50/50">
                          <td class={TD}>
                            <div class="flex items-center gap-3">
                              <span class={`h-8 w-1 shrink-0 rounded-full ${badge.rail}`} aria-hidden="true" />
                              {(() => {
                                const Icon = itemIcon(d.item, categoryName(d.item.categoryId));
                                return <Icon class="h-5 w-5 shrink-0 text-slate-400" />;
                              })()}
                              <div class="min-w-0">
                                <p class="truncate text-sm font-bold text-slate-900">{d.item.name}</p>
                                <p class={CODE}>{d.item.barcode}</p>
                              </div>
                            </div>
                          </td>
                          <td class={`${TD} text-sm text-slate-500`}>
                            {categoryName(d.item.categoryId)}
                            {d.item.trackBy === 'instance' && (
                              <span class="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                                label satu-satu
                              </span>
                            )}
                          </td>
                          <td class={TD}>
                            <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                          </td>
                          <td class={`${TD} text-right`}>
                            <span class="text-sm font-bold tabular-nums text-slate-900">{d.qty}</span>{' '}
                            <span class="text-xs text-slate-400">{d.item.unit}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
