// Managing WHAT IS KEPT on a rack, from the rack.
//
// Until now this only existed from the item's side — the stock-take form has a "Rak / tempat"
// field, and an unplaced item can be given a shelf from its own page. Neither helps the person
// actually standing at A1 with something in their hand, which is the whole situation the rack
// panel exists for. Cek rak could correct the NUMBERS on a shelf but never its MEMBERSHIP: an
// item that was never recorded here could not be counted here.
//
// It is a sheet rather than controls on the panel because it is an occasional errand. The
// panel's daily job is "what is here, and take one"; deciding that soap now lives on A3 is a
// once-a-year act, and a row of edit controls beside every item would tax the daily reading to
// pay for it.
//
// Three verbs, and the difference between the last two is the point:
//   Tambah    — this item is kept here (a new line, opening at whatever is on the shelf)
//   Pindahkan — it is kept on THAT rack now; the quantity walks over intact
//   Hapus     — it is not kept here at all any more
//
// Removing is NOT the same as counting zero. "We keep sabun here and it has run out" and "sabun
// was never kept here" are different facts (§87), and only the first belongs on a shopping
// list — so a shelf drawn down to zero keeps its line, and this is the one way to end it.

import { useMemo, useState } from 'octane';
import { ArrowRightLeft, Plus, Trash2 } from '@octanejs/lucide';
import { contentsOf, lineAt, moveLine, removeLine, setLine } from '../../../../domain/stock';
import type { DerivedState, Item, Location, StockLine } from '../../../../domain/types';
import { Button, CODE, FIELD, LABEL, Select } from '../../components/ui';
import { artFor, ItemArt } from '../items/ItemArt';

export function RackContents(
  { rack, racks, items, stock, derived, categoryName, onChange, onDone }:
  {
    rack: Location;
    racks: Location[];
    items: Item[];
    stock: StockLine[];
    /** For the CURRENT quantity on this shelf. The lines hold the opening figure, and showing
        that here would put 12 beside the panel's 8 — a number to reconcile, not to read. */
    derived: DerivedState;
    categoryName: (categoryId: string) => string;
    onChange: (update: (prev: StockLine[]) => StockLine[]) => void;
    onDone: () => void;
  },
) {
  const [adding, setAdding] = useState('');
  const [addQty, setAddQty] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);

  const here = useMemo(
    () => contentsOf(stock, items, rack.locationId),
    [stock, items, rack.locationId],
  );

  /* Only what is not already kept here, so the picker cannot offer a duplicate line — and
     `active` only, because a retired item is not something to start storing. */
  const elsewhere = useMemo(
    () => items
      .filter((i) => i.active && !here.some((r) => r.item.itemId === i.itemId))
      .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [items, here],
  );

  const others = racks.filter((l) => l.active && l.locationId !== rack.locationId);

  function add() {
    if (!adding) return;
    onChange((prev) => setLine(prev, adding, rack.locationId, Math.max(0, addQty)));
    setAdding('');
    setAddQty(0);
  }

  return (
    <div>
      <ul class="-mx-[var(--card-pad)] divide-y divide-slate-100">
        {here.length === 0 && (
          <li class="px-[var(--card-pad)] py-6 text-center italic text-slate-500">
            Belum ada barang yang disimpan di rak ini.
          </li>
        )}
        {here.map(({ item }) => (
          <li key={item.itemId} class="px-[var(--card-pad)] py-3">
            <div class="flex items-center gap-3">
              <ItemArt art={artFor(item, categoryName(item.categoryId))} size={30} />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-slate-900">{item.name}</p>
                <p class={CODE}>
                  {derived.items[item.itemId]?.byLocation[rack.locationId] ?? 0} {item.unit}
                </p>
              </div>
              <button
                type="button"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-600 hover:border-slate-900 hover:bg-slate-100"
                aria-label={`Pindahkan ${item.name}`}
                title="Pindahkan ke rak lain"
                disabled={others.length === 0}
                onClick={() => setMoving(moving === item.itemId ? null : item.itemId)}
              >
                <ArrowRightLeft class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-600 hover:border-red-600 hover:bg-red-50 hover:text-red-700"
                aria-label={`Hapus ${item.name} dari rak ini`}
                title="Tidak disimpan di sini lagi"
                onClick={() => onChange((prev) => removeLine(prev, item.itemId, rack.locationId))}
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>

            {moving === item.itemId && (
              <div class="mt-2">
                <label class="sr-only" for={`move-${item.itemId}`}>Pindahkan ke</label>
                <Select
                  id={`move-${item.itemId}`}
                  value=""
                  onChange={(e: Event) => {
                    const to = (e.target as HTMLSelectElement).value;
                    if (!to) return;
                    onChange((prev) => moveLine(prev, item.itemId, rack.locationId, to));
                    setMoving(null);
                  }}
                >
                  <option value="">Pindahkan ke rak…</option>
                  {others.map((l) => (
                    <option key={l.locationId} value={l.locationId}>
                      {l.code}{l.name ? ` — ${l.name}` : ''}
                      {/* Says when it will MERGE, because a destination that already keeps this
                          item adds to its line rather than making a second one. */}
                      {lineAt(stock, item.itemId, l.locationId)
                        ? ` (sudah ada ${derived.items[item.itemId]?.byLocation[l.locationId] ?? 0})`
                        : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div class="mt-5 border-t border-slate-200 pt-4">
        <label class={LABEL} for="rack-add">Simpan barang lain di rak ini</label>
        {elsewhere.length === 0 ? (
          <p class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Semua barang di katalog sudah tercatat di rak ini.
          </p>
        ) : (
          <>
            <Select
              id="rack-add"
              value={adding}
              onChange={(e: Event) => setAdding((e.target as HTMLSelectElement).value)}
            >
              <option value="">Pilih barangnya…</option>
              {elsewhere.map((i) => (
                <option key={i.itemId} value={i.itemId}>{i.name}</option>
              ))}
            </Select>

            {adding && (
              <div class="mt-3">
                <label class={LABEL} for="rack-add-qty">Ada berapa di rak ini sekarang?</label>
                <input
                  id="rack-add-qty"
                  class={`${FIELD} min-h-touch`}
                  type="number"
                  min="0"
                  value={String(addQty)}
                  onInput={(e: Event) => setAddQty(Number((e.target as HTMLInputElement).value) || 0)}
                />
                {/* Zero is a real answer, not an empty field: "we keep it here and there is
                    none left" is exactly the state a shopping list is made from. */}
                <p class="mt-1 text-xs text-slate-500">
                  Boleh 0 — artinya barang ini memang disimpan di sini, tapi sedang habis.
                </p>
              </div>
            )}
          </>
        )}

        {adding && (
          <Button size="touch" class="mt-3" onClick={add}>
            <Plus class="h-5 w-5" /> Simpan di rak ini
          </Button>
        )}
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        <Button size="touch" variant="secondary" onClick={onDone}>Selesai</Button>
      </div>

      <p class="mt-4 text-xs leading-relaxed text-slate-500">
        Menghapus dari rak tidak menghapus barangnya dari katalog — hanya mencatat bahwa
        barang itu tidak disimpan di sini lagi.
      </p>
    </div>
  );
}
