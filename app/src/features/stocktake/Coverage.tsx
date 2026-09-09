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

import { CircleCheck } from '@octanejs/lucide';
import type { Coverage as CoverageState } from '../../../../domain/cycleCount';
import { CARD } from '../../components/ui';

export function Coverage(
  { coverage, onOpenRack }:
  {
    coverage: CoverageState;
    /** Opens a rack on Peta Rak, where the counting — and the marking — actually happens. */
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

      {/*
        * A COUNT and a way there — never a second list of racks with buttons on it.
        *
        * This panel first shipped with every un-walked rack listed and a "Selesai didata"
        * button per row, which was the same act Peta Rak already offers as "Cek rak → Semua
        * sesuai", writing the same `lastCountedTs`. Two places to press one button is §82's
        * own complaint: it invites the question of which is current, and somebody eventually
        * uses the one that does less — this one, which stamped a rack without ever showing
        * what was on it. Counting belongs where the counting screen is.
        */}
      <p class="mt-3 text-sm leading-relaxed text-slate-600">
        Datangi tiap rak sekali, catat apa yang ada di situ, lalu tandai lewat{' '}
        <button
          type="button"
          class="font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-700"
          onClick={() => onOpenRack(coverage.pending[0]?.locationId ?? '')}
        >
          Cek rak
        </button>{' '}
        di Peta Rak. Sisa {coverage.pending.length} rak:{' '}
        <span class="font-semibold text-slate-900">
          {coverage.pending.slice(0, NAMED).map((l) => l.code).join(', ')}
          {coverage.pending.length > NAMED && `, dan ${coverage.pending.length - NAMED} lagi`}
        </span>.
      </p>
    </div>
  );
}

/** Enough to know where to walk next, never enough to become a list of its own. */
const NAMED = 8;
