// Layout ported from SmartInv's Dashboard + Inventory pages: page header (Dashboard.tsx:108-113),
// stat tile row (:140-152), amber alert rail (:207-261), and the table-in-a-flush-Card pattern
// (Inventory.tsx:100-205). See docs/SMARTINV-REUSE-MAP.md §5.
//
// The list itself is a <DataTable>, not a hand-rolled <table>: at 390px the old markup pushed
// the Stok column off the right edge, so the one number the screen exists to show was reachable
// only by scrolling sideways. DataTable renders a table on a desk and stacked cards on a phone
// from the same column definitions, so the two shapes cannot drift apart.

import { useMemo, useState } from 'octane';
import { ArrowUpDown, MapPin, Package, TriangleAlert, X } from '@octanejs/lucide';
import type { Category, DerivedItem, Item, Location } from '../../../../domain/types';
import type { BoardFilter, BoardKind, BoardSort } from '../../state/route';
import { BOARD_FILTERS, BOARD_KINDS } from '../../state/route';
import type { Inventory } from '../../state/useInventory';
import { CARD, CARD_FLUSH, CODE, PageHeader, Select, Stat } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { FilterField } from '../../components/FilterField';
import type { Column } from '../../components/DataTable';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';
import { FILTER_LABEL, KIND_LABEL, SORT_LABEL, matchesFilter, matchesKind, sortRows } from './filters';

export function Board(
  { items, categories, locations, inventory, filter = 'semua', category = '',
    kind = 'semua', sort = 'nama', onOpenItem, onOpenRack, onView }:
  { items: Item[]; categories: Category[]; locations: Location[]; inventory: Inventory;
    filter?: BoardFilter; category?: string; kind?: BoardKind; sort?: BoardSort;
    onOpenItem: (itemId: string) => void; onOpenRack: (locationId: string) => void;
    /** Changing a control changes the URL, so the view somebody is looking at is linkable. */
    onView: (next: {
      filter?: BoardFilter; category?: string; kind?: BoardKind; sort?: BoardSort;
    }) => void },
) {
  const { derived, notifications, offline } = inventory;
  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  /* Owned HERE, not in the navbar. It narrows this table and nothing else, so it lives on
     this screen, empties when you leave, and cannot silently follow you to another one. The
     navbar box is a finder, which is a different job (see components/FilterField). */
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();

  /** Everything the search matches, before the filter — the counts on the chips read from it. */
  const found = useMemo(
    () => items
      .map((i) => derived.items[i.itemId])
      .filter(Boolean)
      .filter((d) => q === '' || `${d.item.name} ${d.item.unit}`.toLowerCase().includes(q))
      .filter((d) => category === '' || d.item.categoryId === category)
      /* Scoping, like the category and the search — so the chip counts below describe the
         subset actually on screen rather than the whole gudang. */
      .filter((d) => matchesKind(d, kind)),
    [items, derived.items, q, category, kind],
  );

  const rows = useMemo(
    () => sortRows(found.filter((d) => matchesFilter(d, filter)), sort, locations),
    [found, filter, sort, locations],
  );

  /* Counted on the chips themselves. A filter that turns out to select nothing is a wasted tap
     and a moment of "is this broken?"; the number says so before it is pressed. */
  const counts = useMemo(() => {
    const out = {} as Record<BoardFilter, number>;
    for (const f of BOARD_FILTERS) out[f] = found.filter((d) => matchesFilter(d, f)).length;
    return out;
  }, [found]);

  /* The whole catalog, not the filtered view. These three tiles are headline totals about the
     gudang; making them move with the chips would mean "50 jenis barang" and "9 total unit"
     sitting side by side, describing different populations. The filtered count belongs on the
     list header, where it says "3 baris". */
  /* OWNED, not available. This tile answers §0's first problem — "nobody knows what we own" —
     and a borrowed senter is still ours. The Stok column beside it answers the other question,
     what can be picked up now, which is why the two numbers differ and both are right. */
  const totalUnits = useMemo(
    () => items.reduce((n, i) => n + (derived.items[i.itemId]?.ownedQty ?? 0), 0),
    [items, derived.items],
  );
  const negative = found.filter((d) => d.qty < 0);

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
          return <span class="whitespace-nowrap text-sm italic text-slate-500">belum ditempatkan</span>;
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
                  <span class="text-slate-500 tabular-nums">{d.byLocation[rack.locationId]}</span>
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
        <span class="whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-500">
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
          <span class="text-xs text-slate-500">{d.item.unit}</span>
          {/* Only when they differ, which is only ever a labelled item with a unit out or
              broken. "3 buah" alone would lose the fact that a fourth exists and is coming
              back; "3 dari 4" every time would be the same number said twice. */}
          {d.ownedQty > d.qty && (
            <span class="block text-xs text-slate-500">dari {d.ownedQty}</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Stok Sekarang"
        subtitle="Dihitung dari stok awal ditambah seluruh riwayat — bukan angka yang disimpan."
        action={(
          <FilterField
            value={search}
            onChange={setSearch}
            label="Saring daftar stok"
            placeholder="Saring daftar…"
          />
        )}
      />

      {/* The old copy claimed the log was empty, which stopped being true the moment demo
          data arrived with a history. A banner that states something false about the data it
          sits above is worse than no banner. */}
      {offline && (
        <div class={`${CARD} border-slate-200`}>
          <p class="text-sm leading-relaxed text-slate-600">
            <span class="font-bold text-slate-900">Belum terhubung ke gateway.</span>{' '}
            {/* Only shown while that is true. `offline` is passed from `useInventory`, which
                knows whether the numbers came from this device or from the sheet. */}
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
            {/* Title and controls share one tinted band. As two strips — a grey header above a
                white filter row — they read as two separate things stacked, and the controls
                looked like they belonged to the table rather than to the list's own heading. */}
            <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 class="text-sm font-bold text-slate-900">
                  Daftar Stok
                  {q !== '' && <span class="ml-2 font-normal text-slate-500">· hasil cari "{search}"</span>}
                </h2>
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {rows.length} baris
                </span>
              </div>

              {/* All three controls are 40px tall: the group is 36px buttons in 2px of padding,
                  the selects are `compact`. They were 44 and 56, which is what made the row look
                  assembled from parts.

                  One segmented control, not four separate pills: they are one choice, and four
                  outlined buttons in a row made the loudest thing on the page a set of filters
                  nobody has pressed yet. The single border around the group is also what keeps
                  WCAG 1.4.11 satisfied without a boundary on every segment. */}
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <div
                  class="inline-flex flex-wrap rounded-lg border border-slate-400 bg-white p-px"
                  role="group"
                  aria-label="Saring stok"
                >
                  {BOARD_FILTERS
                    // `minus` is a contradiction in the data, not an everyday view, so it only
                    // appears when there is one — otherwise it is a permanent zero.
                    .filter((f) => f !== 'minus' || counts.minus > 0)
                    .map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={filter === f}
                        class={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${filter === f
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                        onClick={() => onView({ filter: f })}
                      >
                        {FILTER_LABEL[f]}
                        <span class={`text-xs tabular-nums ${filter === f ? 'text-white/70' : 'text-slate-500'}`}>
                          {counts[f]}
                        </span>
                      </button>
                    ))}
                </div>

              <div class="flex flex-wrap items-center gap-2">
                {/* Beside the category, not among the chips: both answer "which subset of the
                    catalog", while the chips answer "which of them needs me". */}
                <label class="sr-only" for="board-kind">Jenis barang</label>
                <Select
                  id="board-kind"
                  wrapClass="w-40"
                  compact
                  class="py-0 text-sm"
                  value={kind}
                  onChange={(e: Event) => onView({ kind: (e.target as HTMLSelectElement).value as BoardKind })}
                >
                  {BOARD_KINDS.map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </Select>

                <label class="sr-only" for="board-category">Kategori</label>
                <Select
                  id="board-category"
                  wrapClass="w-48"
                  compact
                  class="py-0 text-sm"
                  value={category}
                  onChange={(e: Event) => onView({ category: (e.target as HTMLSelectElement).value })}
                >
                  <option value="">Semua kategori</option>
                  {categories.filter((c) => c.active).map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                  ))}
                </Select>

                {/* Divider and icon, because three identical grey boxes read as three filters.
                    Two of them narrow the list; this one only reorders it. */}
                <span class="mx-1 hidden h-6 w-px bg-slate-300 sm:block" aria-hidden="true" />
                <ArrowUpDown class="hidden h-4 w-4 shrink-0 text-slate-500 sm:block" aria-hidden="true" />
                <label class="sr-only" for="board-sort">Urutkan</label>
                <Select
                  id="board-sort"
                  wrapClass="w-48"
                  compact
                  class="py-0 text-sm"
                  value={sort}
                  onChange={(e: Event) => onView({ sort: (e.target as HTMLSelectElement).value as BoardSort })}
                >
                  {(Object.keys(SORT_LABEL) as BoardSort[]).map((sv) => (
                    <option key={sv} value={sv}>{SORT_LABEL[sv]}</option>
                  ))}
                </Select>

                {(filter !== 'semua' || category !== '' || kind !== 'semua' || sort !== 'nama') && (
                  <button
                    type="button"
                    class="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-slate-500 underline hover:text-slate-900"
                    onClick={() => onView({ filter: 'semua', category: '', kind: 'semua', sort: 'nama' })}
                  >
                    <X class="h-4 w-4" /> Reset
                  </button>
                )}
              </div>
              </div>
            </div>

            <DataTable
              // The gudang has hundreds of rows. Rendering them all is not the cost — reading
              // them is, and a list nobody reads to the end may as well end sooner.
              pageSize={25}
              columns={columns}
              rows={rows}
              keyOf={(d) => d.item.itemId}
              onRowClick={(d) => onOpenItem(d.item.itemId)}
              rowLabel={(d) => `Buka ${d.item.name}`}
              empty={(
                <div class="px-6 py-16 text-center">
                  <Package class="mx-auto mb-3 h-10 w-10 text-slate-300" />
                  {/* Blaming the search when a filter is what emptied the list sends somebody
                      to retype a word that was never the problem. */}
                  <p class="italic text-slate-500">
                    {q !== ''
                      ? `Tidak ada yang cocok dengan "${search}".`
                      : `Tidak ada barang yang ${FILTER_LABEL[filter].toLowerCase()}.`}
                  </p>
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
      <p class="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p>
    </div>
  );
}
