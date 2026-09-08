// "Working on it", in the two shapes that answer two different questions.
//
// A REFRESH and a FIRST LOAD are not the same event and must not look the same. During a
// refresh the register is on screen and correct; the only news is that a newer copy is coming,
// so a thin bar at the top is enough and blocking anything would be rude. During a first load
// there is nothing on screen at all — and the screens, given an empty draft, said "Belum ada
// data" and offered to load demo rows. That is a screen telling somebody their masjid owns
// nothing while the answer is still in flight.

import { Link2, RefreshCw, TriangleAlert, Unlink } from '@octanejs/lucide';
import { Button } from './ui';

/** A hairline at the very top of the window. Non-blocking on purpose. */
export function TopProgress({ label }: { label: string }) {
  return (
    <div
      class="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-slate-900/10 no-print"
      role="status"
      aria-label={label}
    >
      <div class="progress-indeterminate h-full w-full bg-slate-900" />
    </div>
  );
}

/**
 * The whole content area, while the register is still arriving.
 *
 * Replaces the route rather than sitting above it, because every screen underneath would
 * otherwise be rendering an empty catalog — zeroes, "belum ada data", and a button offering
 * demo rows.
 */
export function RegisterLoading(
  { error, onRetry, onOpenConnection }:
  { error: string; onRetry: () => void; onOpenConnection: () => void },
) {
  if (error) {
    return (
      <div class="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="alert">
        <TriangleAlert class="mb-3 h-8 w-8 text-amber-500" />
        <h2 class="text-lg font-bold text-slate-900">Tidak bisa memuat register</h2>
        {/* The two causes an operator can actually act on, named. Anything else and the code is
            more use to them than a paraphrase of it. */}
        <p class="mt-1.5 max-w-sm text-sm text-slate-600">
          {error === 'offline'
            ? 'Tidak ada koneksi ke gateway. Periksa wifi, lalu coba lagi.'
            : error === 'not-json'
              ? 'Gateway menjawab halaman login, bukan data. Setelan "Who has access" harus '
                + '"Anyone".'
              : `Gateway menjawab: ${error}`}
        </p>
        <div class="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onRetry}><RefreshCw class="h-4 w-4" /> Coba lagi</Button>
          <button
            type="button"
            class="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
            onClick={onOpenConnection}
          >
            Periksa sambungan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="status">
      <div
        class="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-900"
        aria-hidden="true"
      />
      <p class="mt-4 text-sm font-semibold text-slate-700">Memuat register…</p>
      <p class="mt-1 text-sm text-slate-500">Membaca katalog dan stok dari spreadsheet.</p>
    </div>
  );
}


/**
 * What a device shows after its connection went missing.
 *
 * NOT a silent fallback to the local draft, which is what it used to do: every screen renders
 * from `draft`, and with no connection that is this device's own stock-take copy — full-looking,
 * plausible, months old, under exactly the same headings. Somebody would act on it.
 *
 * It replaces the content rather than warning above it, for the same reason the loading state
 * does: leaving the wrong numbers legible underneath a banner is leaving the wrong numbers
 * legible.
 */
export function ConnectionLost(
  { onReconnect }: { onReconnect: () => void },
) {
  return (
    <div class="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="alert">
      <Unlink class="mb-3 h-8 w-8 text-amber-500" />
      <h2 class="text-lg font-bold text-slate-900">Sambungan ke spreadsheet hilang</h2>
      <p class="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600">
        Perangkat ini pernah tersambung, dan sekarang tidak. Angka yang tersimpan di perangkat ini
        bukan isi spreadsheet — jadi tidak ditampilkan, supaya tidak ada yang mengambil keputusan
        dari data lama.
      </p>
      <p class="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
        Biasanya karena data situs terhapus dari browser. Sambungkan lagi dengan alamat gateway;
        catatan yang belum terkirim tetap aman.
      </p>
      <Button class="mt-5" onClick={onReconnect}>
        <Link2 class="h-4 w-4" /> Sambungkan lagi
      </Button>
    </div>
  );
}
