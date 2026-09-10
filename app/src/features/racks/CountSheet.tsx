// Cek Rak — a cycle count for one shelf.
//
// The point (design doc §0.0): a single opname is true for one day, and re-counting the whole
// gudang never actually happens. Re-counting ONE rack takes two minutes, so it does happen —
// and that is what keeps the register honest without anyone giving up their evening.
//
// Everything is pre-filled with what the system believes. The fast path is "yes, that's right"
// for every line; you only type where reality disagrees.

import { useMemo, useState } from 'octane';
import { CircleCheck } from '@octanejs/lucide';
import { differences, summariseCount } from '../../../../domain/cycleCount';
import type { CountLine } from '../../../../domain/cycleCount';
import type { Item, Location } from '../../../../domain/types';
import type { Inventory } from '../../state/useInventory';
import { Button, CODE, FIELD } from '../../components/ui';

interface Props {
  rack: Location;
  contents: Item[];
  inventory: Inventory;
  onApply: (counted: Map<string, number>) => void;
  onCancel: () => void;
}

export function CountSheet(p: Props) {
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  const lines: CountLine[] = useMemo(
    () => p.contents.map((item) => ({
      item,
      // What we believe is ON THIS RACK — not the item's total, which is the number a count
      // of one shelf must never be compared against.
      expected: p.inventory.derived.items[item.itemId]?.byLocation[p.rack.locationId] ?? 0,
      counted: counts[item.itemId] ?? null,
    })),
    [p.contents, p.inventory.derived, counts],
  );

  const summary = summariseCount(lines);
  const diffs = differences(lines);

  const set = (itemId: string, value: number | null) =>
    setCounts((prev) => ({ ...prev, [itemId]: value }));

  /** "Everything is as the system says" — the common case, in one tap. */
  const confirmAll = () =>
    setCounts(Object.fromEntries(lines.map((l) => [l.item.itemId, l.expected])));

  function apply() {
    const counted = new Map<string, number>();
    for (const line of lines) if (line.counted != null) counted.set(line.item.itemId, line.counted);
    p.onApply(counted);
  }

  // No card and no rack name of its own: this renders inside the rack panel, which already
  // says which shelf this is. Repeating it turned the top of a phone screen into two headings
  // and a stray "Batal" link before the first number.
  return (
    <section>
      <div class="mb-4 flex items-baseline justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-500">Cek rak</h3>
          <p class="mt-0.5 text-sm text-slate-500">
            Hitung fisik yang ada di rak. Yang cocok cukup dikonfirmasi.
          </p>
        </div>
      </div>

      {p.contents.length === 0 ? (
        <p class="py-8 text-center italic text-slate-500">Rak ini kosong — tidak ada yang dihitung.</p>
      ) : (
        <>
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={confirmAll}>
              Semua sesuai
            </Button>
            <p role="status" class="text-sm text-slate-500">
              {`${summary.counted}/${summary.lines} dihitung · ${summary.differing} selisih`}
              {summary.netDelta !== 0 && ` · net ${summary.netDelta > 0 ? '+' : ''}${summary.netDelta}`}
            </p>
          </div>

          <ul class="divide-y divide-slate-100">
            {lines.map((line) => {
              const delta = line.counted == null ? null : line.counted - line.expected;
              return (
                <li key={line.item.itemId} class="flex flex-wrap items-center gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-slate-900">{line.item.name}</p>
                    <p class={CODE}>sistem: {line.expected} {line.item.unit}</p>
                  </div>

                  <input
                    class={`${FIELD} w-24 shrink-0 text-center font-bold tabular-nums`}
                    inputmode="numeric"
                    value={line.counted == null ? '' : String(line.counted)}
                    placeholder="—"
                    aria-label={`Hitungan fisik ${line.item.name}`}
                    onInput={(e: Event) => {
                      const raw = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                      set(line.item.itemId, raw === '' ? null : Number(raw));
                    }}
                  />

                  <span class="w-20 shrink-0 text-right text-sm font-bold tabular-nums">
                    {delta == null ? (
                      <span class="text-slate-300">—</span>
                    ) : delta === 0 ? (
                      <CircleCheck class="ml-auto h-5 w-5 text-green-500" />
                    ) : (
                      <span class={delta < 0 ? 'text-red-600' : 'text-green-600'}>
                        {delta > 0 ? '+' : ''}{delta}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {diffs.length > 0 && (
            <p class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {diffs.length} barang berbeda dari catatan. Menyimpan akan memperbaiki angkanya.
            </p>
          )}

          <div class="mt-4 flex flex-wrap gap-2">
            <Button size="touch" disabled={summary.counted === 0} onClick={apply}>
              Simpan hasil hitung
            </Button>
            <Button variant="secondary" size="touch" onClick={p.onCancel}>
              Batal
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
