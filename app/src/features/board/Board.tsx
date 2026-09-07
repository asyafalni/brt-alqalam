// Layout ported from SmartInv's Dashboard + Inventory pages: page header (Dashboard.tsx:108-113),
// stat tile row (:140-152), amber alert rail (:207-261), and the table-in-a-flush-Card pattern
// (Inventory.tsx:100-205). See docs/SMARTINV-REUSE-MAP.md §5.
//
// The list itself is a <DataTable>, not a hand-rolled <table>: at 390px the old markup pushed
// the Stok column off the right edge, so the one number the screen exists to show was reachable
// only by scrolling sideways. DataTable renders a table on a desk and stacked cards on a phone
// from the same column definitions, so the two shapes cannot drift apart.

import { CircleCheck, Package, TriangleAlert } from '@octanejs/lucide';
import type { Category, DerivedItem, Item } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Stat } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { itemIcon } from '../items/itemIcon';

export function Board(
  { items, categories, inventory, search, onOpenItem }:
  { items: Item[]; categories: Category[]; inventory: Inventory; search: string;
    onOpenItem: (itemId: string) => void },
) {
  const { derived, notifications, offline } = inventory;
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  const q = search.trim().toLowerCase();
  const rows = items
    .map((i) => derived.items[i.itemId])
    .filter(Boolean)
    .filter((d) => q === '' || `${d.item.name} ${d.item.unit}`.toLowerCase().includes(q));

  const totalUnits = rows.reduce((n, d) => n + d.qty, 0);
  const negative = rows.filter((d) => d.qty < 0);

  // Only the name column is allowed to grow. Everything else is `whitespace-nowrap`, so in an
  // auto-layout table the browser hands the slack to the column that can use it — which is what
  // stops four columns drifting apart into a sprawl on a 1440px screen.
  const columns: Column<DerivedItem>[] = [
    {
      key: 'barang',
      header: 'Barang',
      mobile: 'title',
      cell: (d) => {
        const badge = itemStatusBadge(d.status);
        const Icon = itemIcon(d.item, categoryName(d.item.categoryId));
        return (
          <div class="flex min-w-0 items-center gap-3">
            <span class={`h-8 w-1 shrink-0 rounded-full ${badge.rail}`} aria-hidden="true" />
            <Icon class="h-5 w-5 shrink-0 text-slate-400" />
            <div class="min-w-0 max-w-[26rem]">
              <p class="truncate text-sm font-bold text-slate-900">{d.item.name}</p>
              <p class={`${CODE} truncate`}>{d.item.barcode}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'kategori',
      header: 'Kategori',
      mobile: 'meta',
      cell: (d) => (
        <span class="block max-w-[14rem] truncate whitespace-nowrap text-sm text-slate-500">
          {categoryName(d.item.categoryId)}
        </span>
      ),
    },
    {
      key: 'catat',
      header: 'Cara catat',
      // A phone has no room for it, and it answers a question nobody asks while standing at a
      // rack — it matters when planning labels, which is a desk job.
      mobile: 'hidden',
      cell: (d) => (
        <span class="whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-400">
          {d.item.trackBy === 'instance' ? 'label satu-satu' : 'hitung jumlah'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'trailing',
      cell: (d) => {
        const badge = itemStatusBadge(d.status);
        return <span class={`${PILL} ${badge.chip} whitespace-nowrap`}>{badge.label}</span>;
      },
    },
    {
      key: 'stok',
      header: 'Stok',
      align: 'right',
      mobile: 'trailing',
      cell: (d) => (
        <span class="whitespace-nowrap">
          <span class="text-sm font-bold tabular-nums text-slate-900">{d.qty}</span>{' '}
          <span class="text-xs text-slate-400">{d.item.unit}</span>
        </span>
      ),
    },
  ];

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Stok Sekarang"
        subtitle="Dihitung dari stok awal ditambah seluruh riwayat — bukan angka yang disimpan."
      />

      {/* The old copy claimed the log was empty, which stopped being true the moment demo
          data arrived with a history. A banner that states something false about the data it
          sits above is worse than no banner. */}
      {offline && (
        <div class={`${CARD} border-slate-200`}>
          <p class="text-sm leading-relaxed text-slate-600">
            <span class="font-bold text-slate-900">Belum terhubung ke gateway.</span>{' '}
            {inventory.txns.length === 0
              ? 'Riwayat transaksi masih kosong, jadi yang tampil adalah stok awal hasil opname.'
              : `Angka di bawah dihitung dari ${inventory.txns.length} catatan yang tersimpan di perangkat ini saja — belum tersinkron ke mana pun.`}
          </p>
        </div>
      )}

      {/* Louder than low stock, and deliberately above it: this says the numbers themselves
          are wrong, not that something needs buying. */}
      {negative.length > 0 && (
        <div class={`${CARD} border-red-300 bg-red-50/40`} role="alert">
          <div class="flex items-start gap-3">
            <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div class="min-w-0">
              <p class="font-bold text-slate-900">
                {negative.length} barang tercatat minus.
              </p>
              <p class="text-sm leading-relaxed text-slate-600">
                Tercatat keluar lebih banyak daripada yang pernah ada, jadi catatan dan rak
                tidak cocok. Hitung ulang raknya untuk memperbaikinya.
              </p>
              <p class="mt-1 text-sm font-semibold text-slate-900">
                {negative.map((d) => `${d.item.name} (${d.qty})`).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Belum ada barang"
          body="Catat dulu di Opname Gudang — daftar ini dihitung dari katalog hasil opname."
        />
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
              <TriangleAlert class="h-5 w-5 shrink-0 text-amber-500" />
              <h2 class="font-bold text-slate-900">Notifikasi Stok</h2>
              {notifications.length > 0 && (
                <span class="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white ring-4 ring-amber-50">
                  {notifications.length}
                </span>
              )}
            </div>

            {notifications.length === 0 ? (
              <div class="flex items-center gap-3 rounded-xl border border-green-100 bg-green-50/40 px-4 py-3 text-slate-500">
                <CircleCheck class="h-5 w-5 shrink-0 text-green-500" />
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
                    <span
                      class={`h-8 w-1 shrink-0 rounded-full ${n.stokAkhir <= 0 ? 'bg-red-500' : 'bg-amber-500'}`}
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{n.name}</span>
                    <span class="shrink-0 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                      sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span> · min {n.setMin}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Inventory.tsx:100-205 — table in a flush Card. */}
          <div class={CARD_FLUSH}>
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
              <h2 class="text-sm font-bold text-slate-900">
                Daftar Stok
                {q !== '' && <span class="ml-2 font-normal text-slate-500">· hasil cari "{search}"</span>}
              </h2>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {rows.length} baris
              </span>
            </div>

            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(d) => d.item.itemId}
              onRowClick={(d) => onOpenItem(d.item.itemId)}
              rowLabel={(d) => `Buka ${d.item.name}`}
              empty={(
                <div class="px-6 py-16 text-center">
                  <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  <p class="italic text-slate-400">Tidak ada yang cocok dengan "{search}".</p>
                </div>
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** A blank screen should still say what to do next, not just that there is nothing here. */
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div class={`${CARD} px-6 py-16 text-center`}>
      <Package class="mx-auto mb-4 h-10 w-10 text-slate-300" />
      <p class="text-base font-bold text-slate-600">{title}</p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-slate-400">{body}</p>
    </div>
  );
}
