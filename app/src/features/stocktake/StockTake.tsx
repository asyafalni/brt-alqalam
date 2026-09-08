// Layout ported from SmartInv's Inventory page: page header + primary action
// (Inventory.tsx:90-98), stat tiles (Dashboard.tsx:140-152), and the table-in-a-flush-Card
// with right-aligned row actions (Inventory.tsx:100-205). Reuse map §5.
//
// The list is a <DataTable>: on a phone the old <table> pushed the Aksi column past the right
// edge, so Ubah and Hapus existed only for whoever thought to scroll sideways. DataTable keeps
// a real table on a desk and stacks the same rows as cards below `sm`, actions included.

import { useMemo, useState } from 'octane';
import { Download, Package, Pencil, Trash2 } from '@octanejs/lucide';
import type { Category, Item, Location, StockLine } from '../../../../domain/types';
import type { PurchaseRequest } from '../../../../domain/requests';
import type { Draft } from '../../state/useDraft';
import { Button, CARD, CARD_FLUSH, CODE, PageHeader, Stat } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import {
  createCategory, createEntry, createLocation, filterItems, instancesFor, isBlocking, summarise,
  toCategoriesCsv, toInput, toInstancesCsv, toItemsCsv, toLocationsCsv, toRequestsCsv, toStockCsv,
  updateEntry,
  validate,
} from './draft';
import { removeItem as removeStockFor, removeLine, totalFor } from '../../../../domain/stock';
import type { DraftInput } from './draft';
import { ImportPanel } from './ImportPanel';
import { ItemForm } from './ItemForm';
import { artFor, ItemArt } from '../items/ItemArt';

const emptyInput = (categories: Category[]): DraftInput => ({
  name: '', categoryId: categories[0]?.categoryId ?? '', unit: 'buah',
  kind: 'consumable', initialStock: 0, minStock: null,
});

export function StockTake(
  { draft, search, onSearch }: { draft: Draft; search: string; onSearch: (v: string) => void },
) {
  const { items, categories, locations, stock, setItems, setCategories, setLocations, setCatalog } = draft;
  const [input, setInput] = useState<DraftInput>(() => emptyInput(categories));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  /** Which shelf of the row is being edited — a thing can be kept on more than one. */
  const [editingAt, setEditingAt] = useState('');
  const [exporting, setExporting] = useState(false);

  const problems = useMemo(
    () => validate(input, items, editingId ?? undefined),
    [input, items, editingId],
  );
  const totals = useMemo(() => summarise(items, stock), [items, stock]);
  /**
   * ONE ROW PER SHELF, not per item. A stock-take walks the room and writes down "four of
   * these, here" — so the same thing found on two racks is two entries, and both have to be
   * visible and separately editable while the walk is happening.
   */
  const visible = useMemo(() => {
    const matching = new Set(filterItems(items, search).map((i) => i.itemId));
    const byId = new Map(items.map((i) => [i.itemId, i]));
    return stock
      .filter((l) => matching.has(l.itemId))
      .map((l) => ({ line: l, item: byId.get(l.itemId)! }));
  }, [items, stock, search]);
  const labelCount = useMemo(
    () => items.reduce((n, i) => n + instancesFor(i, 0, totalFor(stock, i.itemId)).length, 0),
    [items, stock],
  );

  const change = <K extends keyof DraftInput>(k: K, v: DraftInput[K]) =>
    setInput((prev) => ({ ...prev, [k]: v }));

  function submit() {
    setShowProblems(true);
    if (problems.filter(isBlocking).length > 0) return;

    if (editingId) {
      // One write, so the item and its shelf cannot land as two renders with a half-updated
      // catalog in between.
      setCatalog((prev) => updateEntry(prev.items, prev.stock, editingId, input, editingAt));
      setEditingId(null);
      setEditingAt('');
      setInput(emptyInput(categories));
    } else {
      setCatalog((prev) => {
        const { item, stock: next } = createEntry(input, prev.items, prev.stock);
        return { items: [...prev.items, item], stock: next };
      });
      // Sticky context: walking one shelf means many items sharing a category, unit and kind —
      // and, now, the same rack. Only the name and the count reset; that is the difference
      // between 6 taps and 2, and shelving is exactly the field that repeats down a shelf.
      setInput((prev) => ({ ...prev, name: '', initialStock: 0, minStock: null }));
    }
    setShowProblems(false);
  }

  function startEdit(item: Item, at = '') {
    setEditingId(item.itemId);
    setEditingAt(at);
    setInput(toInput(item, stock, at));
    setShowProblems(false);
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingAt('');
    setInput(emptyInput(categories));
    setShowProblems(false);
  }

  function addCategory(name: string) {
    const category = createCategory(name, categories);
    setCategories((prev) => [...prev, category]);
    change('categoryId', category.categoryId);
  }

  function addLocation(code: string, zone: string) {
    const location = createLocation(code, zone, '', locations);
    setLocations((prev) => [...prev, location]);
    change('locationId', location.locationId);
  }

  /**
   * Deleting a row deletes ONE SHELF of it — the entry the walk actually made. The item itself
   * goes only when its last shelf does; otherwise removing a duplicate entry would silently
   * take the other rack's count with it.
   */
  function remove(item: Item, at: string) {
    if (editingId === item.itemId && editingAt === at) cancelEdit();
    setCatalog((prev) => {
      const nextStock = removeLine(prev.stock, item.itemId, at);
      const orphaned = !nextStock.some((l) => l.itemId === item.itemId);
      return {
        items: orphaned ? prev.items.filter((i) => i.itemId !== item.itemId) : prev.items,
        stock: orphaned ? removeStockFor(nextStock, item.itemId) : nextStock,
      };
    });
    setPendingDelete(null);
  }

  /** A row is an item ON a shelf, so its identity needs both. */
  const rowKey = (item: Item, line: { locationId: string }) =>
    `${item.itemId}@${line.locationId}`;

  function reset() {
    draft.reset();
    cancelEdit();
    setConfirmReset(false);
    onSearch('');
  }

  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;
  const rackCode = (id?: string) =>
    (id ? locations.find((l) => l.locationId === id)?.code ?? id : null);

  // Newest first: the thing just counted is the thing most likely to need a correction.
  const rows = useMemo(() => [...visible].reverse(), [visible]);

  type Row = typeof visible[number];

  // Only Barang may grow; every other cell is `whitespace-nowrap`, so an auto-layout table
  // hands its slack to the one column that can use it instead of spreading four columns
  // across a 1440px screen.
  const columns: Column<Row>[] = [
    {
      key: 'barang',
      header: 'Barang',
      mobile: 'title',
      cell: ({ item: i }) => {
        return (
          <div class="flex min-w-0 items-center gap-3">
            <ItemArt art={artFor(i, categoryName(i.categoryId))} size={36} />
            <div class="min-w-0 max-w-[24rem]">
              <p class="truncate text-sm font-bold text-slate-900">{i.name}</p>
              <p class={`${CODE} truncate`}>{i.barcode}</p>
            </div>
            {/* A row cannot carry its own background through DataTable, so the row being
                edited says so in words — which reads better anyway than a faint tint. */}
            {editingId === i.itemId && (
              <span class="shrink-0 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                sedang diubah
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'kategori',
      header: 'Kategori',
      mobile: 'meta',
      cell: ({ item: i, line }) => (
        <span class="flex items-baseline gap-2 whitespace-nowrap">
          <span class="max-w-[12rem] truncate text-sm text-slate-500">{categoryName(i.categoryId)}</span>
          <span class="text-[10px] uppercase tracking-wider text-slate-400">
            {i.kind === 'consumable' ? 'bisa habis' : 'barang tetap'}
          </span>
        </span>
      ),
    },
    {
      key: 'rak',
      header: 'Rak',
      mobile: 'meta',
      cell: ({ line }) => {
        const code = rackCode(line.locationId);
        return code
          ? <span class="whitespace-nowrap text-sm font-medium text-slate-600">{code}</span>
          : <span class="whitespace-nowrap text-sm italic text-slate-400">belum ditempatkan</span>;
      },
    },
    {
      key: 'jumlah',
      header: 'Jumlah',
      align: 'right',
      mobile: 'trailing',
      cell: ({ item: i, line }) => (
        <div class="whitespace-nowrap text-right">
          <span class="text-sm font-bold tabular-nums text-slate-900">{line.initialStock}</span>{' '}
          <span class="text-xs text-slate-400">{i.unit}</span>
          {i.minStock != null && <p class="text-[10px] text-slate-500">min {i.minStock}</p>}
        </div>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      // Trailing, not a meta line: on a phone these sit beside the name where a thumb already
      // is. 44px targets, and the delete still costs two deliberate taps.
      mobile: 'trailing',
      cell: ({ item: i, line }) => (pendingDelete === rowKey(i, line) ? (
        <div class="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end">
          <Button
            size="sm"
            variant="danger"
            class="min-h-[44px] whitespace-nowrap"
            onClick={() => remove(i, line.locationId)}
            aria-label={`Ya, hapus ${i.name}`}
          >
            Ya, hapus
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="min-h-[44px]"
            onClick={() => setPendingDelete(null)}
          >
            Batal
          </Button>
        </div>
      ) : (
        <div class="flex items-center justify-end gap-1">
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100"
            onClick={() => startEdit(i, line.locationId)}
            aria-label={`Ubah ${i.name}`}
            title="Ubah"
          >
            <Pencil class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100"
            onClick={() => setPendingDelete(rowKey(i, line))}
            aria-label={`Hapus ${i.name}`}
            title="Hapus"
          >
            <Trash2 class="h-5 w-5" />
          </button>
        </div>
      )),
    },
  ];

  /* Newest first: the satuan somebody used a moment ago is far likelier to be the next one
     than one they used at the start of the walk. */
  const usedUnits = useMemo(
    () => [...new Set(items.map((i) => i.unit).reverse())].filter((u) => u.trim() !== ''),
    [items],
  );

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Opname Gudang"
        subtitle="Keliling gudang, catat setiap barang yang ditemukan. Tersimpan otomatis di perangkat ini."
        action={
          confirmReset ? (
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-slate-700">Hapus semua {items.length} barang?</span>
              <Button variant="danger" class="min-h-[44px]" onClick={reset}>Ya, hapus</Button>
              {/* Offered HERE and nowhere else: loading the demo throws away everything, which
                  is the same act this panel already exists to confirm. Until now it was only
                  reachable from the empty state, so anybody with a draft — including one loaded
                  from an older demo — had no way back to a fresh sample. */}
              <Button
                variant="secondary"
                class="min-h-[44px]"
                onClick={() => { draft.loadDemo(); setConfirmReset(false); }}
              >
                Ganti dengan contoh data
              </Button>
              <Button variant="secondary" class="min-h-[44px]" onClick={() => setConfirmReset(false)}>
                Batal
              </Button>
            </div>
          ) : (
            <div class="flex items-center gap-2">
              <Button
                variant="secondary"
                class="min-h-[44px]"
                disabled={items.length === 0}
                onClick={() => setExporting(true)}
              >
                <Download class="h-4 w-4" />
                <span class="hidden sm:inline">Ekspor</span>
              </Button>
              <Button
                variant="secondary"
                class="min-h-[44px]"
                disabled={items.length === 0}
                aria-label="Kosongkan semua barang"
                onClick={() => setConfirmReset(true)}
              >
                <Trash2 class="h-4 w-4" />
                <span class="hidden sm:inline">Kosongkan</span>
              </Button>
            </div>
          )
        }
      />

      <div class="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat value={totals.count} label="Barang dicatat" />
        <Stat value={totals.categories} label="Kategori" tint="bg-slate-100 text-slate-600" />
        <Stat value={totals.units} label="Unit dihitung" tint="bg-green-50 text-green-600" />
      </div>

      {/* The form card carries its own trailing margin, which doubles up against this page's
          vertical rhythm. Neutralised here rather than in the shared component. */}
      <div class="[&>section]:mb-0">
        <ItemForm
          input={input}
          categories={categories}
          locations={locations}
          units={usedUnits}
          problems={problems}
          showProblems={showProblems}
          editing={editingId != null}
          onChange={change}
          onAddCategory={addCategory}
          onAddLocation={addLocation}
          onSubmit={submit}
          onCancelEdit={cancelEdit}
        />
      </div>

      <Sheet
        open={exporting}
        title="Ekspor & impor"
        description="Satu berkas per tab. Impor lewat File → Import → Upload."
        onClose={() => setExporting(false)}
      >
        <ExportPanel
          items={items}
          categories={categories}
          locations={locations}
          stock={stock}
          requests={draft.requests}
          labelCount={labelCount}
        />

        {/* Under the export, in the same panel, because they are two halves of one thing: the
            export was a one-way door until this existed. */}
        <div class="mt-6 border-t border-slate-200 pt-5">
          <h3 class="mb-1 text-sm font-bold text-slate-900">Muat dari CSV</h3>
          <ImportPanel onApply={draft.loadFrom} />
        </div>
      </Sheet>

      <div class={CARD_FLUSH}>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-6">
          <h2 class="text-sm font-bold text-slate-900">
            Sudah dicatat
            {search.trim() !== '' && (
              <span class="ml-2 font-normal text-slate-500">· hasil cari "{search}"</span>
            )}
          </h2>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {visible.length} baris
          </span>
        </div>

        <DataTable
          // A walk adds rows all day; past a screenful the list stops being something you read and
          // becomes something you scroll past on the way to the form.
          pageSize={25}
          columns={columns}
          rows={rows}
          keyOf={(r) => rowKey(r.item, r.line)}
          empty={(
            <div class="px-6 py-16 text-center">
              <Package class="mx-auto mb-4 h-10 w-10 text-slate-300" />
              {items.length === 0 ? (
                <>
                  <p class="text-base font-bold text-slate-600">Belum ada barang</p>
                  <p class="mx-auto mt-1 max-w-sm text-sm text-slate-400">
                    Mulai dari rak paling dekat pintu.
                  </p>
                  <div class="mt-5">
                    <Button variant="secondary" size="touch" onClick={draft.loadDemo}>Muat contoh data</Button>
                    <p class="mt-2 text-xs text-slate-400">
                      Untuk mencoba tampilan. Kosongkan lagi sebelum opname sungguhan.
                    </p>
                  </div>
                </>
              ) : (
                <p class="italic text-slate-400">Tidak ada yang cocok dengan "{search}".</p>
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}

/**
 * One file per spreadsheet tab, downloaded individually.
 * Firing three downloads from one tap gets blocked by browsers, and silently — so the
 * files are listed with their row counts and taken one at a time.
 */
function ExportPanel(
  { items, categories, locations, stock, requests, labelCount }:
  { items: Item[]; categories: Category[]; locations: Location[]; stock: StockLine[];
    requests: PurchaseRequest[]; labelCount: number },
) {
  if (items.length === 0) return null;
  const acquiredTs = Date.now();
  const stamp = new Date().toISOString().slice(0, 10);

  const files = [
    { tab: 'Items', rows: items.length, note: 'katalog barang', csv: () => toItemsCsv(items) },
    { tab: 'Categories', rows: categories.length, note: 'daftar kategori', csv: () => toCategoriesCsv(categories) },
    // Its own tab, because quantity is per (barang × rak) now — see sheets/README.md.
    { tab: 'Stock', rows: stock.length, note: 'jumlah per rak', csv: () => toStockCsv(stock) },
    ...(requests.length > 0
      ? [{ tab: 'Requests', rows: requests.length, note: 'pengajuan pembelian', csv: () => toRequestsCsv(requests) }]
      : []),
    ...(locations.length > 0
      ? [{ tab: 'Locations', rows: locations.length, note: 'rak & tempat', csv: () => toLocationsCsv(locations) }]
      : []),
    ...(labelCount > 0
      ? [{ tab: 'AssetInstances', rows: labelCount, note: 'unit yang dilabeli satu-satu', csv: () => toInstancesCsv(items, acquiredTs, stock) }]
      : []),
  ];

  function download(tab: string, csv: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <ul class="space-y-2">
        {files.map((f) => (
          <li key={f.tab} class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold text-slate-900">{f.tab}</p>
              <p class="text-xs text-slate-500">{f.rows} baris · {f.note}</p>
            </div>
            <Button size="touch" class="shrink-0" onClick={() => download(f.tab, f.csv())}>Unduh</Button>
          </li>
        ))}
      </ul>
      <p class="mt-4 text-xs leading-relaxed text-slate-400">
        Diunduh satu per satu, bukan sekaligus — browser memblokir beberapa unduhan yang
        dipicu dari satu ketukan, dan memblokirnya tanpa pemberitahuan.
      </p>
    </div>
  );
}
