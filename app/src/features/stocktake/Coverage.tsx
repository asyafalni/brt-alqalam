// The stock-take's finish line.
//
// §59 stage 1 is a PROJECT — walk the room once, come out with a register — and a project needs
// an end. Opname had none. It measured itself in "Barang dicatat", "Kategori", "Unit dihitung":
// three numbers that only ever go up, past no target, toward nothing. So the one job in this app
// that genuinely finishes was the one that read as never finishing, and that fails §0.0's test
// on its own terms — a permanent chore is admin burden, however good the feature is.
//
// What is finite here is the RACKS. There is a fixed number of them, each has either been walked
// or has not, and the number left goes DOWN. That is the same walk, counted in the unit that has
// a last one.

import { CircleCheck, MapPin } from '@octanejs/lucide';
import type { Location, StockLine } from '../../../../domain/types';
import type { Coverage as CoverageState } from '../../../../domain/cycleCount';
import { CARD } from '../../components/ui';

export function Coverage(
  { coverage, stock, onWalked, onOpenRack }:
  {
    coverage: CoverageState;
    stock: readonly StockLine[];
    /** Marks a rack walked. The same stamp Cek rak writes — one fact, one field. */
    onWalked?: (locationId: string) => void;
    onOpenRack: (locationId: string) => void;
  },
) {
  /* Nothing to finish yet. Saying "0 dari 0" or drawing an empty bar would announce a target
     that does not exist; the racks come from the walk itself. */
  if (coverage.total === 0) return null;

  if (coverage.done) {
    return (
      <div class={`${CARD} flex items-start gap-3 border-green-200 bg-green-50/60`}>
        <CircleCheck class="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
        <div class="min-w-0">
          <p class="font-bold text-slate-900">
            Semua {coverage.total} rak sudah didata.
          </p>
          {/* What happens NEXT, because "done" invites exactly that question — and the honest
              answer is that this screen steps back rather than that the work is over. */}
          <p class="mt-1 text-sm leading-relaxed text-slate-700">
            Opname selesai. Dari sini yang menjaga angkanya tetap benar adalah <b>Cek rak</b>
            {' '}— satu rak, dua menit, bergiliran. Barang yang baru dibeli masuk sendiri lewat
            {' '}<b>Pengajuan</b>; halaman ini tinggal dipakai kalau ada yang kelewat atau ada
            {' '}sumbangan.
          </p>
        </div>
      </div>
    );
  }

  const pct = Math.round((coverage.walked / coverage.total) * 100);
  const counted = (locationId: string) =>
    stock.filter((l) => l.locationId === locationId).length;

  return (
    <div class={CARD}>
      <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 class="font-bold text-slate-900">Rak yang sudah didata</h2>
        <p class="text-sm tabular-nums text-slate-600">
          <span class="text-lg font-bold text-slate-900">{coverage.walked}</span>
          {' '}dari {coverage.total} rak
        </p>
      </div>

      {/* A bar, because the question is "how far along", and a fraction answers that only after
          being read twice. */}
      <div
        class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${pct} persen rak sudah didata`}
      >
        <div
          class="h-full rounded-full bg-slate-900 transition-[width] duration-500"
          style={`width:${pct}%;print-color-adjust:exact`}
        />
      </div>

      <p class="mt-3 text-sm leading-relaxed text-slate-600">
        Datangi tiap rak sekali, catat apa yang ada di situ, lalu tandai selesai. Kalau raknya
        memang kosong, tandai selesai saja — kosong itu jawaban, bukan pekerjaan yang tertinggal.
      </p>

      <ul class="mt-3 space-y-1.5">
        {coverage.pending.map((l) => {
          const n = counted(l.locationId);
          return (
            <li
              key={l.locationId}
              class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 p-2.5"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={() => onOpenRack(l.locationId)}
              >
                <MapPin class="h-4 w-4 shrink-0 text-slate-500" />
                <span class="min-w-0">
                  <span class="block truncate font-semibold text-slate-900">{l.code}</span>
                  <span class="block truncate text-xs text-slate-600">
                    {/* What is already recorded here, so somebody can tell a rack they have
                        walked from one they have not even opened. */}
                    {n === 0 ? 'belum ada barang tercatat' : `${n} barang tercatat`}
                  </span>
                </span>
              </button>
              {onWalked && (
                <button
                  type="button"
                  class="min-h-[44px] shrink-0 rounded-lg border border-slate-500 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900"
                  onClick={() => onWalked(l.locationId)}
                >
                  Selesai didata
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
