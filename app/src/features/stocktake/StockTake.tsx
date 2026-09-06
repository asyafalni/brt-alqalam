// Layout ported from SmartInv's Inventory page: page header + primary action
// (Inventory.tsx:90-98), stat tiles (Dashboard.tsx:140-152), and the table-in-a-flush-Card
// with right-aligned row actions (Inventory.tsx:100-205). Reuse map §5.

import { useMemo, useState } from 'octane';
import { Package, Pencil, Trash2 } from '@octanejs/lucide';
import type { Category, Item, Location } from '../../../../domain/types';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import type { Draft } from '../../state/useDraft';
import { Button, CARD, CARD_FLUSH, CODE, PageHeader, Stat, TD, TH } from '../../components/ui';
import {
  createCategory, createItem, createLocation, filterItems, instancesFor, isBlocking, summarise,
  toCategoriesCsv, toInput, toInstancesCsv, toItemsCsv, toLocationsCsv, updateItem, validate,
} from './draft';
import type { DraftInput } from './draft';
import { ItemForm } from './ItemForm';
import { itemIcon } from '../items/itemIcon';

const emptyInput = (categories: Category[]): DraftInput => ({
  name: '', categoryId: categories[0]?.categoryId ?? '', unit: 'buah',
  kind: 'consumable', initialStock: 0, minStock: null,
});

export function StockTake(
  { draft, search, onSearch }: { draft: Draft; search: string; onSearch: (v: string) => void },
) {
  const { items, categories, locations, setItems, setCategories, setLocations } = draft;
  const [input, setInput] = useState<DraftInput>(() => emptyInput(categories));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const problems = useMemo(
    () => validate(input, items, editingId ?? undefined),
    [input, items, editingId],
  );
  const totals = useMemo(() => summarise(items), [items]);
  const visible = useMemo(() => filterItems(items, search), [items, search]);
  const labelCount = useMemo(() => items.reduce((n, i) => n + instancesFor(i, 0).length, 0), [items]);

  const change = <K extends keyof DraftInput>(k: K, v: DraftInput[K]) =>
    setInput((prev) => ({ ...prev, [k]: v }));

  function submit() {
    setShowProblems(true);
    if (problems.filter(isBlocking).length > 0) return;

    if (editingId) {
      setItems((prev) => updateItem(prev, editingId, input));
      setEditingId(null);
      setInput(emptyInput(categories));
    } else {
      setItems((prev) => [...prev, createItem(input, prev)]);
      // Sticky context: walking one shelf means many items sharing a category, unit and kind.
      // Only the name and the count reset — the difference between 6 taps and 2.
      setInput((prev) => ({ ...prev, name: '', initialStock: 0, minStock: null }));
    }
    setShowProblems(false);
  }

  function startEdit(item: Item) {
    setEditingId(item.itemId);
    setInput(toInput(item));
    setShowProblems(false);
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
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

  function remove(item: Item) {
    if (editingId === item.itemId) cancelEdit();
    setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));
    setPendingDelete(null);
  }

  function reset() {
    draft.reset();
    cancelEdit();
    setConfirmReset(false);
    onSearch('');
  }

  const categoryName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? id;

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Opname Gudang"
        subtitle="Keliling gudang, catat setiap barang yang ditemukan. Tersimpan otomatis di perangkat ini."
        action={
          confirmReset ? (
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-slate-700">Hapus semua {items.length} barang?</span>
              <Button variant="danger" onClick={reset}>Ya, hapus</Button>
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>Batal</Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={items.length === 0}
              onClick={() => setConfirmReset(true)}
            >
              Kosongkan
            </Button>
          )
        }
      />

      <div class="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat value={totals.count} label="Barang dicatat" />
        <Stat value={totals.categories} label="Kategori" tint="bg-slate-100 text-slate-600" />
        <Stat value={totals.units} label="Unit dihitung" tint="bg-green-50 text-green-600" />
      </div>

      <ItemForm
        input={input}
        categories={categories}
        locations={locations}
        problems={problems}
        showProblems={showProblems}
        editing={editingId != null}
        onChange={change}
        onAddCategory={addCategory}
        onAddLocation={addLocation}
        onSubmit={submit}
        onCancelEdit={cancelEdit}
      />

      <ExportPanel items={items} categories={categories} locations={locations} labelCount={labelCount} />

      <div class={CARD_FLUSH}>
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-4">
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

        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="border-b border-slate-100 bg-slate-50">
              <tr>
                <th class={TH}>Barang</th>
                <th class={TH}>Kategori</th>
                <th class={`${TH} text-right`}>Jumlah</th>
                <th class={`${TH} text-right`}>Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              {items.length === 0 || visible.length === 0 ? (
                <tr>
                  <td colspan={4} class="px-6 py-20 text-center">
                    <Package class="mx-auto mb-3 h-10 w-10 text-slate-300 opacity-40" />
                    <p class="italic text-slate-400">
                      {items.length === 0
                        ? 'Belum ada barang. Mulai dari rak paling dekat pintu.'
                        : `Tidak ada yang cocok dengan "${search}".`}
                    </p>
                    {items.length === 0 && (
                      <div class="mt-4">
                        <Button variant="secondary" size="sm" onClick={draft.loadDemo}>
                          Muat contoh data
                        </Button>
                        <p class="mt-2 text-xs text-slate-400">
                          Untuk mencoba tampilan. Kosongkan lagi sebelum opname sungguhan.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                [...visible].reverse().map((i) => (
                  <tr
                    key={i.itemId}
                    class={`transition-colors hover:bg-slate-50/50 ${editingId === i.itemId ? 'bg-sky-50/50' : ''}`}
                  >
                    <td class={TD}>
                      <div class="flex items-center gap-3">
                        {(() => {
                          const Icon = itemIcon(i, categoryName(i.categoryId));
                          return <Icon class="h-5 w-5 shrink-0 text-slate-400" />;
                        })()}
                        <div class="min-w-0">
                          <p class="truncate text-sm font-bold text-slate-900">{i.name}</p>
                          <p class={CODE}>{i.barcode}</p>
                        </div>
                      </div>
                    </td>
                    <td class={`${TD} text-sm text-slate-500`}>
                      {categoryName(i.categoryId)}
                      <span class="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                        {i.kind === 'consumable' ? 'bisa habis' : 'barang tetap'}
                      </span>
                      <p class="mt-0.5 text-[11px] text-slate-400">
                        {i.locationId
                          ? locations.find((l) => l.locationId === i.locationId)?.code ?? i.locationId
                          : 'belum ditempatkan'}
                      </p>
                    </td>
                    <td class={`${TD} text-right`}>
                      <span class="text-sm font-bold tabular-nums text-slate-900">{i.initialStock}</span>{' '}
                      <span class="text-xs text-slate-400">{i.unit}</span>
                      {i.minStock != null && (
                        <p class="text-[10px] text-slate-400">min {i.minStock}</p>
                      )}
                    </td>
                    <td class={`${TD} text-right`}>
                      {pendingDelete === i.itemId ? (
                        <div class="flex items-center justify-end gap-2">
                          <Button size="sm" variant="danger" onClick={() => remove(i)}
                            aria-label={`Ya, hapus ${i.name}`}>
                            Ya, hapus
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                            Batal
                          </Button>
                        </div>
                      ) : (
                        <div class="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-500"
                            onClick={() => startEdit(i)}
                            aria-label={`Ubah ${i.name}`}
                            title="Ubah"
                          >
                            <Pencil class="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            onClick={() => setPendingDelete(i.itemId)}
                            aria-label={`Hapus ${i.name}`}
                            title="Hapus"
                          >
                            <Trash2 class="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
  { items, categories, locations, labelCount }:
  { items: Item[]; categories: Category[]; locations: Location[]; labelCount: number },
) {
  if (items.length === 0) return null;
  const acquiredTs = Date.now();
  const stamp = new Date().toISOString().slice(0, 10);

  const files = [
    { tab: 'Items', rows: items.length, note: 'katalog barang', csv: () => toItemsCsv(items) },
    { tab: 'Categories', rows: categories.length, note: 'daftar kategori', csv: () => toCategoriesCsv(categories) },
    ...(locations.length > 0
      ? [{ tab: 'Locations', rows: locations.length, note: 'rak & tempat', csv: () => toLocationsCsv(locations) }]
      : []),
    ...(labelCount > 0
      ? [{ tab: 'AssetInstances', rows: labelCount, note: 'unit yang dilabeli satu-satu', csv: () => toInstancesCsv(items, acquiredTs) }]
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
    <div class={CARD}>
      <h2 class="font-bold text-slate-900">Ekspor ke Google Sheet</h2>
      <p class="mb-4 text-sm text-slate-500">
        Satu berkas per tab. Impor lewat <strong>File → Import → Upload</strong>.
      </p>
      <ul class="space-y-2">
        {files.map((f) => (
          <li key={f.tab} class="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold text-slate-900">{f.tab}</p>
              <p class="text-xs text-slate-500">{f.rows} baris · {f.note}</p>
            </div>
            <Button size="md" onClick={() => download(f.tab, f.csv())}>Unduh</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
