import { useEffect, useMemo, useState } from 'octane';
import type { Category, Item } from '../../../../domain/types';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import { clearDraft, loadDraft, saveDraft } from '../../state/persist';
import {
  createCategory, createItem, filterItems, instancesFor, isBlocking, summarise,
  toCategoriesCsv, toInput, toInstancesCsv, toItemsCsv, updateItem, validate,
} from './draft';
import type { DraftInput } from './draft';
import { CARD, FIELD, ItemForm } from './ItemForm';

const emptyInput = (categories: Category[]): DraftInput => ({
  name: '', categoryId: categories[0]?.categoryId ?? '', unit: 'buah',
  kind: 'consumable', initialStock: 0, minStock: null,
});

export function StockTake() {
  const initial = useMemo(() => loadDraft(SEED_CATEGORIES), []);
  const [items, setItems] = useState<Item[]>(initial.items);
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [input, setInput] = useState<DraftInput>(() => emptyInput(initial.categories));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [query, setQuery] = useState('');
  // Two-step confirmation, inline. `confirm()` is a native dialog — wrong control for a
  // tablet held with wet hands, and suppressible by the browser.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { saveDraft({ items, categories }); }, [items, categories]);

  const problems = useMemo(
    () => validate(input, items, editingId ?? undefined),
    [input, items, editingId],
  );
  const totals = useMemo(() => summarise(items), [items]);
  const visible = useMemo(() => filterItems(items, query), [items, query]);
  const labelCount = useMemo(
    () => items.reduce((n, i) => n + instancesFor(i, 0).length, 0),
    [items],
  );

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
      // Only the name and the count reset — that is the difference between 6 taps and 2.
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

  function remove(item: Item) {
    if (editingId === item.itemId) cancelEdit();
    setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));
    setPendingDelete(null);
  }

  function reset() {
    setItems([]);
    setCategories(SEED_CATEGORIES);
    cancelEdit();
    clearDraft();
    setConfirmReset(false);
  }

  const categoryName = (categoryId: string) =>
    categories.find((c) => c.categoryId === categoryId)?.name ?? categoryId;

  return (
    <main class="mx-auto max-w-3xl p-4 pb-24">
      <header class="mb-5">
        <h1 class="text-3xl font-bold tracking-tight">Opname Gudang</h1>
        <p class="mt-1 text-muted-foreground">
          Keliling gudang, catat setiap barang yang ditemukan. Tersimpan otomatis di perangkat ini.
        </p>
      </header>

      <section class={`${CARD} mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4`}>
        <Stat value={totals.count} label="barang" />
        <Stat value={totals.categories} label="kategori" />
        <Stat value={totals.units} label="unit dihitung" />
        {confirmReset ? (
          <div class="ml-auto flex items-center gap-2">
            <span class="text-sm font-semibold">Hapus semua {items.length} barang?</span>
            <button
              type="button"
              class="min-h-touch rounded-xl bg-destructive px-4 font-semibold text-destructive-foreground"
              onClick={reset}
            >
              Ya, hapus
            </button>
            <button
              type="button"
              class="min-h-touch rounded-xl border-2 border-border px-4 font-semibold"
              onClick={() => setConfirmReset(false)}
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            type="button"
            class="ml-auto min-h-touch rounded-xl border-2 border-border px-4 font-semibold disabled:opacity-40"
            disabled={items.length === 0}
            onClick={() => setConfirmReset(true)}
          >
            Kosongkan
          </button>
        )}
      </section>

      <ItemForm
        input={input}
        categories={categories}
        problems={problems}
        showProblems={showProblems}
        editing={editingId != null}
        onChange={change}
        onAddCategory={addCategory}
        onSubmit={submit}
        onCancelEdit={cancelEdit}
      />

      <ExportPanel items={items} categories={categories} labelCount={labelCount} />

      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-bold">
          Sudah dicatat{' '}
          {items.length > 0 && <span class="text-muted-foreground">({items.length})</span>}
        </h2>
        {items.length > 5 && (
          <input
            class={`${FIELD} ml-auto max-w-xs`}
            type="search"
            value={query}
            placeholder="Cari barang…"
            aria-label="Cari barang"
            onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
          />
        )}
      </div>

      {items.length === 0 ? (
        <p class={`${CARD} px-5 py-8 text-center text-muted-foreground`}>
          Belum ada barang. Mulai dari rak paling dekat pintu.
        </p>
      ) : visible.length === 0 ? (
        <p class={`${CARD} px-5 py-8 text-center text-muted-foreground`}>
          Tidak ada yang cocok dengan "{query}".
        </p>
      ) : (
        <ul class="flex flex-col gap-2">
          {[...visible].reverse().map((i) => (
            <li
              key={i.itemId}
              class={`${CARD} flex items-center gap-3 px-4 py-3 ${editingId === i.itemId ? 'border-primary' : ''}`}
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{i.name}</p>
                <p class="text-sm text-muted-foreground">
                  {categoryName(i.categoryId)} · {i.kind === 'consumable' ? 'Bisa habis' : 'Barang tetap'}
                  {i.trackBy === 'instance' && ' · label satu-satu'}
                  {i.minStock != null && ` · min ${i.minStock}`}
                </p>
              </div>
              <span class="shrink-0 text-lg font-bold tabular-nums">
                {i.initialStock}{' '}
                <span class="text-sm font-normal text-muted-foreground">{i.unit}</span>
              </span>
              {pendingDelete === i.itemId ? (
                <>
                  <button
                    type="button"
                    class="min-h-touch shrink-0 rounded-lg bg-destructive px-3 font-semibold text-destructive-foreground"
                    onClick={() => remove(i)}
                    aria-label={`Ya, hapus ${i.name}`}
                  >
                    Ya, hapus
                  </button>
                  <button
                    type="button"
                    class="min-h-touch shrink-0 rounded-lg px-3 font-semibold"
                    onClick={() => setPendingDelete(null)}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    class="min-h-touch shrink-0 rounded-lg px-3 font-semibold text-primary"
                    onClick={() => startEdit(i)}
                    aria-label={`Ubah ${i.name}`}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    class="min-h-touch shrink-0 rounded-lg px-3 font-semibold text-destructive"
                    onClick={() => setPendingDelete(i.itemId)}
                    aria-label={`Hapus ${i.name}`}
                  >
                    Hapus
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One file per spreadsheet tab, downloaded individually.
 * Firing three downloads from one tap gets blocked by browsers, and silently — so the
 * files are listed with their row counts and taken one at a time.
 */
function ExportPanel({ items, categories, labelCount }: { items: Item[]; categories: Category[]; labelCount: number }) {
  if (items.length === 0) return null;
  const acquiredTs = Date.now();
  const stamp = new Date().toISOString().slice(0, 10);

  const files = [
    { tab: 'Items', rows: items.length, note: 'katalog barang', csv: () => toItemsCsv(items) },
    { tab: 'Categories', rows: categories.length, note: 'daftar kategori', csv: () => toCategoriesCsv(categories) },
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
    <section class={`${CARD} mb-6 p-5`}>
      <h2 class="mb-1 text-xl font-bold">Ekspor ke Google Sheet</h2>
      <p class="mb-4 text-sm text-muted-foreground">
        Satu berkas per tab. Impor lewat <strong>File → Import → Upload</strong>.
      </p>
      <ul class="flex flex-col gap-2">
        {files.map((f) => (
          <li key={f.tab} class="flex items-center gap-3 rounded-xl border-2 border-border px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{f.tab}</p>
              <p class="text-sm text-muted-foreground">{f.rows} baris · {f.note}</p>
            </div>
            <button
              type="button"
              class="min-h-touch shrink-0 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
              onClick={() => download(f.tab, f.csv())}
            >
              Unduh
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span class="text-2xl font-bold tabular-nums">{value}</span>{' '}
      <span class="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
