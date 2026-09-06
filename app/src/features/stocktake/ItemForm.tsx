import { useRef, useState } from 'octane';
import type { Category } from '../../../../domain/types';
import { COMMON_UNITS } from '../../data/seedCategories';
import type { DraftInput, DraftProblem } from './draft';
import { CARD, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';


interface Props {
  input: DraftInput;
  categories: Category[];
  problems: DraftProblem[];
  showProblems: boolean;
  editing: boolean;
  onChange: <K extends keyof DraftInput>(key: K, value: DraftInput[K]) => void;
  onAddCategory: (name: string) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
}

export function ItemForm(p: Props) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  // Inline, not `prompt()`. A native dialog on a gudang tablet is a small unstyled box that
  // some browsers suppress outright — the opposite of the 56px targets everything else uses.
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const problemFor = (field: keyof DraftInput) =>
    p.showProblems ? p.problems.find((x) => x.field === field) : undefined;

  function commitCategory() {
    const name = (newCategory ?? '').trim();
    if (name !== '') p.onAddCategory(name);
    setNewCategory(null);
  }

  return (
    <section class={`${CARD} mb-6 p-5 ${p.editing ? 'border-primary' : ''}`}>
      {p.editing && (
        <p class="mb-4 flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3 font-semibold">
          <span>Mengubah barang</span>
          <button type="button" class="font-semibold text-primary underline" onClick={p.onCancelEdit}>
            Batal
          </button>
        </p>
      )}

      <div class="mb-4">
        <label class={LABEL} for="nama">Nama barang</label>
        <input
          id="nama"
          ref={nameRef}
          class={FIELD}
          value={p.input.name}
          placeholder="Sabun cuci tangan"
          autocomplete="off"
          /* Octane uses NATIVE events: onChange fires on blur. Text must use onInput. */
          onInput={(e: Event) => p.onChange('name', (e.target as HTMLInputElement).value)}
        />
        <Problem problem={problemFor('name')} />
      </div>

      <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class={LABEL} for="kategori">Kategori</label>
          <div class="flex gap-2">
            <select
              id="kategori"
              class={FIELD}
              value={p.input.categoryId}
              onChange={(e: Event) => p.onChange('categoryId', (e.target as HTMLSelectElement).value)}
            >
              {p.categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
            {/* Categories are free-form (Part XI). Hitting a thing that fits nowhere must not
                stop the walk — that is exactly when a stock-take gets abandoned. */}
            <button
              type="button"
              class="min-h-touch w-touch shrink-0 rounded-xl border-2 border-border text-2xl font-bold"
              onClick={() => setNewCategory('')}
              aria-label="Tambah kategori baru"
              title="Tambah kategori baru"
            >
              +
            </button>
          </div>
          {newCategory != null && (
            <div class="mt-2 flex gap-2">
              <input
                class={FIELD}
                value={newCategory}
                placeholder="Nama kategori baru"
                aria-label="Nama kategori baru"
                autocomplete="off"
                onInput={(e: Event) => setNewCategory((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
                onClick={commitCategory}
              >
                Simpan
              </button>
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-xl border-2 border-border px-4 font-semibold"
                onClick={() => setNewCategory(null)}
              >
                Batal
              </button>
            </div>
          )}
        </div>
        <div>
          <label class={LABEL} for="satuan">Satuan</label>
          <input
            id="satuan"
            class={FIELD}
            list="satuan-umum"
            value={p.input.unit}
            placeholder="galon"
            onInput={(e: Event) => p.onChange('unit', (e.target as HTMLInputElement).value)}
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
          <Choice
            active={p.input.kind === 'consumable'}
            title="Bisa habis"
            hint="Dihitung, bisa habis — sabun, plastik"
            onPick={() => { p.onChange('kind', 'consumable'); p.onChange('trackBy', undefined); }}
          />
          <Choice
            active={p.input.kind === 'equipment'}
            title="Barang tetap"
            hint="Tetap ada, bisa rusak / hilang — pisau, bor"
            onPick={() => { p.onChange('kind', 'equipment'); p.onChange('trackBy', undefined); }}
          />
        </div>
      </div>

      {/* Only durables face this question, and it must be asked out loud: defaulting silently
          to per-unit labelling would generate 200 QR labels for 200 knives without anyone
          choosing that. Labelling every blade is a real operational project. */}
      {p.input.kind === 'equipment' && (
        <div class="mb-4">
          <span class={LABEL}>Cara mencatat</span>
          <div class="grid grid-cols-2 gap-3">
            <Choice
              active={(p.input.trackBy ?? 'instance') === 'instance'}
              title="Label satu-satu"
              hint="Tiap unit dapat QR sendiri — tahu siapa pegang yang mana"
              onPick={() => p.onChange('trackBy', 'instance')}
            />
            <Choice
              active={p.input.trackBy === 'quantity'}
              title="Hitung jumlahnya"
              hint="Cukup tahu ada berapa — tanpa label per unit"
              onPick={() => p.onChange('trackBy', 'quantity')}
            />
          </div>
        </div>
      )}

      <div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class={LABEL} for="jumlah">Jumlah dihitung</label>
          <Stepper id="jumlah" value={p.input.initialStock} onChange={(v) => p.onChange('initialStock', v)} />
          <Problem problem={problemFor('initialStock')} />
        </div>
        <div>
          <label class={LABEL} for="minimum">Minimum (alarm stok)</label>
          {p.input.minStock == null ? (
            <button
              type="button"
              class={`${FIELD} flex items-center justify-between text-left text-muted-foreground`}
              onClick={() => p.onChange('minStock', 0)}
            >
              <span>Tidak ada minimum ( - )</span>
              <span class="text-sm font-semibold text-primary">Atur</span>
            </button>
          ) : (
            <div class="flex gap-2">
              <Stepper id="minimum" value={p.input.minStock} onChange={(v) => p.onChange('minStock', v)} />
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-xl border-2 border-border px-4 font-semibold"
                onClick={() => p.onChange('minStock', null)}
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
        onClick={p.onSubmit}
      >
        {p.editing ? 'Simpan perubahan' : 'Tambah barang'}
      </button>
    </section>
  );
}

function Problem({ problem }: { problem?: { message: string } }) {
  if (!problem) return null;
  return <p class="mt-1.5 text-sm font-medium text-destructive">{problem.message}</p>;
}

function Choice(
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

export function Stepper({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
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
