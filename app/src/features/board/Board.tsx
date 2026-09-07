// Layout ported from SmartInv's Dashboard + Inventory pages: page header (Dashboard.tsx:108-113),
// stat tile row (:140-152), amber alert rail (:207-261), and the table-in-a-flush-Card pattern
// (Inventory.tsx:100-205). See docs/SMARTINV-REUSE-MAP.md §5.
//
// The list itself is a <DataTable>, not a hand-rolled <table>: at 390px the old markup pushed
// the Stok column off the right edge, so the one number the screen exists to show was reachable
// only by scrolling sideways. DataTable renders a table on a desk and stacked cards on a phone
// from the same column definitions, so the two shapes cannot drift apart.

import { MapPin, Package, TriangleAlert } from '@octanejs/lucide';
import type { Category, DerivedItem, Item, Location } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Stat } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';

export function Board(
  { items, categories, locations, inventory, search, onOpenItem, onOpenRack }:
  { items: Item[]; categories: Category[]; locations: Location[]; inventory: Inventory;
    search: string; onOpenItem: (itemId: string) => void; onOpenRack: (locationId: string) => void },
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
        return (
          <div class="flex min-w-0 items-center gap-3">
            <span class={`h-8 w-1 shrink-0 rounded-full ${badge.rail}`} aria-hidden="true" />
            {/* Drawn, not a glyph: this is the list somebody scans for "the soap", and a
                recognisable object is found faster than a word or an outline. */}
            <ItemArt art={artFor(d.item, categoryName(d.item.categoryId))} size={36} />
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
      // "We own 12 galon sabun" does not help anybody who cannot find them; "Rak A1" does.
      // The rack was one tap away on the item screen, which is one tap too many for the
      // question this list exists to answer while somebody is standing in the gudang.
      key: 'rak',
      header: 'Rak',
      mobile: 'meta',
      cell: (d) => {
        // Racks, plural: the same thing is routinely kept in more than one place, and naming
        // only the first would send somebody to a shelf that may be the empty one.
        const here = Object.keys(d.byLocation)
          .filter((id) => id !== '')
          .map((id) => locations.find((l) => l.locationId === id))
          .filter((l): l is Location => l != null);

        if (here.length === 0) {
          // Not blank: an unplaced item is a real, visible state and the thing most likely to
          // go missing, so it says so rather than leaving a gap that reads as a rendering bug.
          return <span class="whitespace-nowrap text-sm italic text-slate-400">belum ditempatkan</span>;
        }
        return (
          <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            {here.map((rack) => (
              <button
                key={rack.locationId}
                type="button"
                class="inline-flex items-center gap-1 whitespace-nowrap rounded hover:text-slate-900 hover:underline"
                aria-label={`Buka Rak ${rack.code}`}
                onClick={(e: Event) => { e.stopPropagation(); onOpenRack(rack.locationId); }}
              >
                <MapPin class="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span class="font-semibold">{rack.code}</span>
                {/* Only when it is split. On a single shelf this number is the Stok column
                    said twice, and a number repeated is a number somebody has to reconcile. */}
                {here.length > 1 && (
                  <span class="text-slate-400 tabular-nums">{d.byLocation[rack.locationId]}</span>
                )}
              </button>
            ))}
          </span>
        );
      },
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

          {/* NO alert list here any more.
              It was the same derived list as Beranda's "Perlu dibeli lagi" — same source, same
              rows, on two screens. The duplicate is worse than wasted space: two lists of one
              thing invite the question of which is current, and somebody eventually acts on
              the staler-looking one. Beranda keeps it, because that is the screen people open
              first and the one the bell points at. What belongs here is the stock itself, and
              the tile above already says how many rows need attention. */}

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
