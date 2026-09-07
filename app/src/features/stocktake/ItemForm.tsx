import { useMemo, useRef, useState } from 'octane';
import type { Category, Location } from '../../../../domain/types';
import { COMMON_UNITS } from '../../data/seedCategories';
import type { DraftInput, DraftProblem } from './draft';
import { CARD, ERROR_TEXT, FIELD, LABEL, Select } from '../../components/ui';
import { ART_IDS, artFor, ItemArt } from '../items/ItemArt';


interface Props {
  input: DraftInput;
  categories: Category[];
  locations: Location[];
  /** Satuan already used in this catalog — offered before the generic list. */
  units: string[];
  problems: DraftProblem[];
  showProblems: boolean;
  editing: boolean;
  onChange: <K extends keyof DraftInput>(key: K, value: DraftInput[K]) => void;
  onAddCategory: (name: string) => void;
  onAddLocation: (code: string, zone: string) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
}

/** A sentinel no real satuan can collide with. Same trick the zone picker uses (§92). */
const NEW_UNIT = '\u0000new';

export function ItemForm(p: Props) {
  const nameRef = useRef<HTMLInputElement | null>(null);
  // Inline, not `prompt()`. A native dialog on a gudang tablet is a small unstyled box that
  // some browsers suppress outright — the opposite of the 56px targets everything else uses.
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newRack, setNewRack] = useState<{ code: string; zone: string } | null>(null);
  const [pickingArt, setPickingArt] = useState(false);
  /** Starts typing when the unit is one we do not know — nothing to pick it from. */
  const [typingUnit, setTypingUnit] = useState(false);

  /* What this masjid actually counts in, first, then the generic list. A `<datalist>` used to
     carry these and it was very nearly invisible: it only opens once somebody starts typing,
     which is exactly the moment they have stopped needing suggestions. Satuan is answered fifty
     times in an afternoon of opname, so it earns a control you can see. */
  const unitOptions = useMemo(() => {
    const used = p.units.filter((u) => u.trim() !== '');
    return [...new Set([...used, ...COMMON_UNITS])];
  }, [p.units]);

  // What this item will be drawn as right now — the override if one was chosen, otherwise the
  // guess, recomputed as the operator types.
  const art = artFor(
    { name: p.input.name, unit: p.input.unit, kind: p.input.kind, artId: p.input.artId },
    p.categories.find((c) => c.categoryId === p.input.categoryId)?.name ?? '',
  );

  const problemFor = (field: keyof DraftInput) =>
    p.showProblems ? p.problems.find((x) => x.field === field) : undefined;

  function commitCategory() {
    const name = (newCategory ?? '').trim();
    if (name !== '') p.onAddCategory(name);
    setNewCategory(null);
  }

  function commitRack() {
    const code = (newRack?.code ?? '').trim();
    if (code !== '') p.onAddLocation(code, (newRack?.zone ?? '').trim());
    setNewRack(null);
  }

  return (
    <section class={`${CARD} mb-6 p-5 ${p.editing ? 'border-slate-900' : ''}`}>
      {p.editing && (
        <p class="mb-4 flex items-center justify-between rounded-xl bg-slate-900/5 px-4 py-3 font-semibold text-slate-900">
          <span>Mengubah barang</span>
          <button type="button" class="font-semibold text-slate-900 underline" onClick={p.onCancelEdit}>
            Batal
          </button>
        </p>
      )}

      <div class="mb-4">
        <label class={LABEL} for="nama">Nama barang</label>
        <div class="flex items-start gap-3">
          {/* The drawing is CHOSEN FOR YOU, from the name, the unit and the category — no
              field to fill in, which is the point (§0.0: does this remove work, or add it?).
              It is shown here so the guess is visible before saving rather than discovered on
              a list later, and it can be overridden for the times the guess is wrong. */}
          <button
            type="button"
            class="mt-0.5 flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-slate-400 bg-white hover:border-slate-900"
            aria-label={`Gambar barang: ${art}. Ketuk untuk ganti.`}
            aria-expanded={pickingArt}
            onClick={() => setPickingArt(!pickingArt)}
          >
            <ItemArt art={art} size={40} />
          </button>
          <div class="min-w-0 flex-1">
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
        </div>

        {pickingArt && (
          <div class="mt-3 rounded-lg border border-slate-400 bg-slate-50/60 p-3">
            <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p class="text-sm font-semibold text-slate-900">Pilih gambar</p>
              {p.input.artId && (
                <button
                  type="button"
                  class="text-xs font-semibold text-slate-600 underline"
                  onClick={() => { p.onChange('artId', undefined); setPickingArt(false); }}
                >
                  Kembali ke otomatis
                </button>
              )}
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
              {ART_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={id}
                  aria-pressed={p.input.artId === id}
                  class={`flex aspect-square items-center justify-center rounded-lg border-2 bg-white ${
                    p.input.artId === id ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'
                  }`}
                  onClick={() => { p.onChange('artId', id); setPickingArt(false); }}
                >
                  <ItemArt art={id} size={34} />
                </button>
              ))}
            </div>
            <p class="mt-2 text-xs text-slate-500">
              {p.input.artId
                ? 'Dipilih sendiri. Tidak akan berubah walaupun nama atau satuannya diubah.'
                : 'Sekarang otomatis — ikut nama, satuan dan kategori barang.'}
            </p>
          </div>
        )}
      </div>

      <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class={LABEL} for="kategori">Kategori</label>
          <div class="flex gap-2">
            <Select
              id="kategori"
              value={p.input.categoryId}
              onChange={(e: Event) => p.onChange('categoryId', (e.target as HTMLSelectElement).value)}
            >
              {p.categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </Select>
            {/* Categories are free-form (Part XI). Hitting a thing that fits nowhere must not
                stop the walk — that is exactly when a stock-take gets abandoned. */}
            <button
              type="button"
              class="min-h-touch w-touch shrink-0 rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-500 hover:bg-slate-50"
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
                class="min-h-touch shrink-0 rounded-lg bg-slate-900 px-4 font-semibold text-slate-50 hover:bg-slate-800"
                onClick={commitCategory}
              >
                Simpan
              </button>
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-lg border border-slate-400 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setNewCategory(null)}
              >
                Batal
              </button>
            </div>
          )}
        </div>
        <div>
          <label class={LABEL} for="satuan">Satuan</label>
          {typingUnit || (p.input.unit !== '' && !unitOptions.includes(p.input.unit)) ? (
            <div class="flex gap-2">
              <input
                id="satuan"
                class={FIELD}
                value={p.input.unit}
                placeholder="galon"
                autocomplete="off"
                onInput={(e: Event) => p.onChange('unit', (e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="shrink-0 rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-600 hover:border-slate-900 hover:bg-slate-100"
                onClick={() => { setTypingUnit(false); p.onChange('unit', unitOptions[0] ?? 'buah'); }}
              >
                Pilih
              </button>
            </div>
          ) : (
            <Select
              id="satuan"
              value={p.input.unit}
              onChange={(e: Event) => {
                const picked = (e.target as HTMLSelectElement).value;
                if (picked === NEW_UNIT) { setTypingUnit(true); p.onChange('unit', ''); }
                else p.onChange('unit', picked);
              }}
            >
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              {/* One tap away, not a hurdle: a masjid will meet a unit nobody listed, and a
                  closed list would send them to rename something instead. */}
              <option value={NEW_UNIT}>+ Satuan lain…</option>
            </Select>
          )}
          <Problem problem={problemFor('unit')} />
        </div>
      </div>

      {/* Where it physically sits. §14.2 locked one QR per rack — this is the field that
          makes that real, and the thing that makes a messy gudang findable: "we own 12 galon
          sabun" does not help a marbot; "Rak B3" does. Sticky, like category and unit. */}
      <div class="mb-4">
        <label class={LABEL} for="rak">Rak / tempat</label>
        <div class="flex gap-2">
          <Select
            id="rak"
            value={p.input.locationId ?? ''}
            onChange={(e: Event) => p.onChange('locationId', (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">Belum ditempatkan</option>
            {p.locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.code}{l.name ? ` — ${l.name}` : ''} · {l.zone}
              </option>
            ))}
          </Select>
          <button
            type="button"
            class="min-h-touch w-touch shrink-0 rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-500 hover:bg-slate-50"
            onClick={() => setNewRack({ code: '', zone: p.locations.at(-1)?.zone ?? 'Gudang Utama' })}
            aria-label="Tambah rak baru"
            title="Tambah rak baru"
          >
            +
          </button>
        </div>
        {newRack != null && (
          <div class="mt-2 flex flex-wrap gap-2">
            <input
              class={`${FIELD} w-24 shrink-0 text-center font-bold uppercase`}
              value={newRack.code}
              placeholder="B3"
              aria-label="Kode rak"
              autocomplete="off"
              onInput={(e: Event) => setNewRack({ ...newRack, code: (e.target as HTMLInputElement).value })}
            />
            <input
              class={`${FIELD} min-w-0 flex-1`}
              value={newRack.zone}
              placeholder="Gudang Utama"
              aria-label="Zona rak"
              autocomplete="off"
              onInput={(e: Event) => setNewRack({ ...newRack, zone: (e.target as HTMLInputElement).value })}
            />
            <button
              type="button"
              class="min-h-touch shrink-0 rounded-lg bg-slate-900 px-4 font-semibold text-slate-50 hover:bg-slate-800"
              onClick={commitRack}
            >
              Simpan
            </button>
            <button
              type="button"
              class="min-h-touch shrink-0 rounded-lg border border-slate-400 px-4 font-semibold text-slate-600"
              onClick={() => setNewRack(null)}
            >
              Batal
            </button>
          </div>
        )}
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
              class={`${FIELD} flex items-center justify-between text-left text-slate-400`}
              onClick={() => p.onChange('minStock', 0)}
            >
              <span>Tidak ada minimum ( - )</span>
              <span class="text-sm font-semibold text-slate-900">Atur</span>
            </button>
          ) : (
            <div class="flex gap-2">
              <Stepper id="minimum" value={p.input.minStock} onChange={(v) => p.onChange('minStock', v)} />
              <button
                type="button"
                class="min-h-touch shrink-0 rounded-lg border border-slate-400 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50"
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
        class="min-h-touch w-full rounded-lg bg-slate-900 text-xl font-bold text-slate-50 hover:bg-slate-800"
        onClick={p.onSubmit}
      >
        {p.editing ? 'Simpan perubahan' : 'Tambah barang'}
      </button>
    </section>
  );
}

function Problem({ problem }: { problem?: { message: string } }) {
  if (!problem) return null;
  return <p class="mt-1.5 text-sm font-medium text-red-600">{problem.message}</p>;
}

function Choice(
  { active, title, hint, onPick }: { active: boolean; title: string; hint: string; onPick: () => void },
) {
  return (
    <button
      type="button"
      aria-pressed={active}
      class={
        'min-h-touch rounded-lg border px-4 py-3 text-left transition-colors ' +
        (active ? 'border-slate-900 bg-slate-900/5' : 'border-slate-400 bg-white hover:bg-slate-50')
      }
      onClick={onPick}
    >
      <span class="block font-bold">{title}</span>
      <span class="block text-sm text-slate-500">{hint}</span>
    </button>
  );
}

export function Stepper({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const step = (d: number) => onChange(Math.max(0, value + d));
  return (
    <div class="flex items-stretch gap-2">
      <button
        type="button"
        class="min-h-touch w-touch shrink-0 rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-500 hover:bg-slate-50"
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
        class="min-h-touch w-touch shrink-0 rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-500 hover:bg-slate-50"
        onClick={() => step(1)}
        aria-label="Tambah"
      >
        +
      </button>
    </div>
  );
}
