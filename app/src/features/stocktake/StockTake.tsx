import { useEffect, useMemo, useRef, useState } from 'octane';
import type { Item, Kind } from '../../../../domain/types';
import { SEED_CATEGORIES, COMMON_UNITS } from '../../data/seedCategories';
import { loadDraft, saveDraft, clearDraft } from '../../state/persist';
import { createItem, isBlocking, summarise, toItemsCsv, validate } from './draft';
import type { DraftInput } from './draft';

/** A draft row is an `Item` — nothing new is invented, so the export round-trips exactly. */
const looksLikeItems = (v: unknown): v is Item[] =>
  Array.isArray(v) && v.every((i) => i && typeof i === 'object' && typeof (i as Item).itemId === 'string');

const EMPTY: DraftInput = {
  name: '', categoryId: SEED_CATEGORIES[0].categoryId, unit: 'buah',
  kind: 'consumable', initialStock: 0, minStock: null,
};

const CARD = 'rounded-2xl border border-border bg-card text-card-foreground';
const LABEL = 'block text-sm font-semibold text-muted-foreground mb-1.5';
const FIELD =
  'w-full min-h-touch rounded-xl border-2 border-input bg-background px-4 text-lg ' +
  'outline-none focus:border-primary';

export function StockTake() {
  const [items, setItems] = useState<Item[]>(() => loadDraft(looksLikeItems));
  const [input, setInput] = useState<DraftInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { saveDraft(items); }, [items]);

  const problems = useMemo(() => validate(input, items), [input, items]);
  const blockers = problems.filter(isBlocking);
  const totals = useMemo(() => summarise(items), [items]);

  const set = <K extends keyof DraftInput>(k: K, v: DraftInput[K]) =>
    setInput((p) => ({ ...p, [k]: v }));

  function add() {
    setTouched(true);
    if (blockers.length > 0) return;
    setItems((prev) => [...prev, createItem(input, prev)]);
    // Sticky context: walking one shelf means many items sharing a category, unit and kind.
    // Only the name and the count reset — that is the difference between 6 taps and 2.
    setInput((p) => ({ ...p, name: '', initialStock: 0, minStock: null }));
    setTouched(false);
    nameRef.current?.focus();
  }

  function remove(itemId: string) {
    setItems((prev) => prev.filter((i) => i.itemId !== itemId));
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toItemsCsv(items)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Items-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    if (!confirm(`Hapus semua ${items.length} barang dari daftar ini?`)) return;
    setItems([]);
    clearDraft();
  }

  const problemFor = (field: keyof DraftInput) =>
    touched ? problems.find((p) => p.field === field) : undefined;

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
        <div class="ml-auto flex gap-2">
          <button
            type="button"
            class="min-h-touch rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-40"
            disabled={items.length === 0}
            onClick={exportCsv}
          >
            Ekspor CSV
          </button>
          <button
            type="button"
            class="min-h-touch rounded-xl border-2 border-border px-4 font-semibold disabled:opacity-40"
            disabled={items.length === 0}
            onClick={reset}
          >
            Kosongkan
          </button>
        </div>
      </section>

      <section class={`${CARD} mb-6 p-5`}>
        <div class="mb-4">
          <label class={LABEL} for="nama">Nama barang</label>
          <input
            id="nama"
            ref={nameRef}
            class={FIELD}
            value={input.name}
            placeholder="Sabun cuci tangan"
            autocomplete="off"
            /* Octane uses NATIVE events: onChange fires on blur. Text must use onInput. */
            onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)}
          />
          <Problem problem={problemFor('name')} />
        </div>

        <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class={LABEL} for="kategori">Kategori</label>
            <select
              id="kategori"
              class={FIELD}
              value={input.categoryId}
              onChange={(e: Event) => set('categoryId', (e.target as HTMLSelectElement).value)}
            >
              {SEED_CATEGORIES.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label class={LABEL} for="satuan">Satuan</label>
            <input
              id="satuan"
              class={FIELD}
              list="satuan-umum"
              value={input.unit}
              placeholder="galon"
              onInput={(e: Event) => set('unit', (e.target as HTMLInputElement).value)}
            />
            <datalist id="satuan-umum">
              {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
            </datalist>
            <Problem problem={problemFor('unit')} />
          </div>
        </div>

        <div class="mb-4">
          <span class={LABEL}>Jenis barang</span>
          <div class="grid grid-cols-2 gap-3">
            <KindChoice
              active={input.kind === 'consumable'}
              title="Bisa habis"
              hint="Dihitung, bisa habis — sabun, plastik"
              onPick={() => set('kind', 'consumable')}
            />
            <KindChoice
              active={input.kind === 'equipment'}
              title="Barang tetap"
              hint="Tetap ada, bisa rusak / hilang — pisau, bor"
              onPick={() => set('kind', 'equipment')}
            />
          </div>
        </div>

        <div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class={LABEL} for="jumlah">Jumlah dihitung</label>
            <Stepper
              id="jumlah"
              value={input.initialStock}
              onChange={(v) => set('initialStock', v)}
            />
            <Problem problem={problemFor('initialStock')} />
          </div>
          <div>
            <label class={LABEL} for="minimum">Minimum (alarm stok)</label>
            {input.minStock == null ? (
              <button
                type="button"
                class={`${FIELD} flex items-center justify-between text-left text-muted-foreground`}
                onClick={() => set('minStock', 0)}
              >
                <span>Tidak ada minimum ( - )</span>
                <span class="text-sm font-semibold text-primary">Atur</span>
              </button>
            ) : (
              <div class="flex gap-2">
                <Stepper id="minimum" value={input.minStock} onChange={(v) => set('minStock', v)} />
                <button
                  type="button"
                  class="min-h-touch shrink-0 rounded-xl border-2 border-border px-4 font-semibold"
                  onClick={() => set('minStock', null)}
                  title="Tanpa minimum"
                >
                  ( - )
                </button>
              </div>
            )}
            <Problem problem={problemFor('minStock')} />
          </div>
        </div>

        <button
          type="button"
          class="min-h-touch w-full rounded-xl bg-primary text-xl font-bold text-primary-foreground"
          onClick={add}
        >
          Tambah barang
        </button>
      </section>

      <h2 class="mb-3 text-xl font-bold">
        Sudah dicatat {items.length > 0 && <span class="text-muted-foreground">({items.length})</span>}
      </h2>

      {items.length === 0 ? (
        <p class={`${CARD} px-5 py-8 text-center text-muted-foreground`}>
          Belum ada barang. Mulai dari rak paling dekat pintu.
        </p>
      ) : (
        <ul class="flex flex-col gap-2">
          {[...items].reverse().map((i) => (
            <li key={i.itemId} class={`${CARD} flex items-center gap-4 px-4 py-3`}>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">{i.name}</p>
                <p class="text-sm text-muted-foreground">
                  {categoryName(i.categoryId)} · {i.kind === 'consumable' ? 'Bisa habis' : 'Barang tetap'}
                  {i.minStock != null && ` · min ${i.minStock}`}
                </p>
              </div>
              <span class="shrink-0 text-lg font-bold tabular-nums">
                {i.initialStock} <span class="text-sm font-normal text-muted-foreground">{i.unit}</span>
              </span>
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-lg px-3 font-semibold text-destructive"
                onClick={() => remove(i.itemId)}
                aria-label={`Hapus ${i.name}`}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function categoryName(categoryId: string): string {
  return SEED_CATEGORIES.find((c) => c.categoryId === categoryId)?.name ?? categoryId;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span class="text-2xl font-bold tabular-nums">{value}</span>{' '}
      <span class="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function Problem({ problem }: { problem?: { message: string } }) {
  if (!problem) return null;
  return <p class="mt-1.5 text-sm font-medium text-destructive">{problem.message}</p>;
}

function KindChoice(
  { active, title, hint, onPick }: { active: boolean; title: string; hint: string; onPick: () => void },
) {
  return (
    <button
      type="button"
      aria-pressed={active}
      class={
        'min-h-touch rounded-xl border-2 px-4 py-3 text-left ' +
        (active ? 'border-primary bg-primary/10' : 'border-border')
      }
      onClick={onPick}
    >
      <span class="block font-bold">{title}</span>
      <span class="block text-sm text-muted-foreground">{hint}</span>
    </button>
  );
}

function Stepper({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const step = (d: number) => onChange(Math.max(0, value + d));
  return (
    <div class="flex items-stretch gap-2">
      <button
        type="button"
        class="min-h-touch w-touch shrink-0 rounded-xl border-2 border-border text-2xl font-bold"
        onClick={() => step(-1)}
        aria-label="Kurangi"
      >
        −
      </button>
      <input
        id={id}
        class={`${FIELD} text-center text-xl font-bold tabular-nums`}
        inputmode="numeric"
        value={String(value)}
        onInput={(e: Event) => {
          const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
          onChange(raw === '' ? 0 : Number(raw));
        }}
      />
      <button
        type="button"
        class="min-h-touch w-touch shrink-0 rounded-xl border-2 border-border text-2xl font-bold"
        onClick={() => step(1)}
        aria-label="Tambah"
      >
        +
      </button>
    </div>
  );
}
