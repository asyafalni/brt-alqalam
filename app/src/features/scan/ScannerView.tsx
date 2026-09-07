import { useRef, useState } from 'octane';
import { Keyboard, X } from '@octanejs/lucide';
import { routeFromScan } from '../../state/route';
import type { Route } from '../../state/route';
import { Button } from '../../components/ui';
import { useScanner } from './useScanner';

const HELP: Record<string, { title: string; body: string }> = {
  insecure: {
    title: 'Kamera butuh HTTPS',
    body: 'Browser hanya mengizinkan kamera lewat https atau localhost. Buka aplikasi dari alamat https-nya.',
  },
  denied: {
    title: 'Izin kamera ditolak',
    body: 'Aktifkan izin kamera untuk situs ini di pengaturan browser, lalu buka lagi layar ini.',
  },
  'no-camera': { title: 'Kamera tidak ditemukan', body: 'Perangkat ini tidak punya kamera yang bisa dipakai.' },
  error: { title: 'Kamera gagal dibuka', body: 'Coba tutup aplikasi lain yang sedang memakai kamera.' },
};

export function ScannerView({ onFound, onClose }: { onFound: (route: Route) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const accept = (text: string) => {
    const route = routeFromScan(text);
    // An unrecognised code must say so. Silently ignoring it is indistinguishable from a
    // broken camera, and people respond by scanning harder.
    if (route) onFound(route);
    else setRejected(text);
  };

  const scanner = useScanner(videoRef, accept);

  const help = HELP[scanner.status];

  /* Opened by hand, or forced open when the camera cannot start. A camera that fails is not a
     reason to walk away from the shelf: every label carries its code in print underneath the
     QR precisely so it can be read out, and this is where it goes. It also makes the whole scan
     path testable on a laptop with no camera at all. */
  const manual = typing || help != null;

  return (
    <div class="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} class="absolute inset-0 h-full w-full object-cover" muted playsinline />

      <div class="relative flex items-center justify-between p-4">
        <button
          type="button"
          class="flex h-touch w-touch items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          onClick={onClose}
          aria-label="Tutup pemindai"
        >
          <X class="h-6 w-6" />
        </button>
        <span class="rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
          Arahkan ke QR
        </span>
        <span class="h-touch w-touch" aria-hidden="true" />
      </div>

      {/* The frame is the whole instruction — nobody reads a caption while aiming a camera. */}
      {!help && !rejected && (
        <div class="pointer-events-none relative flex flex-1 items-center justify-center">
          <div class="h-64 w-64 max-w-[70vw] rounded-3xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
        </div>
      )}

      {rejected && (
        <div class="relative m-4 mt-auto rounded-2xl bg-white p-5" role="alert">
          <h2 class="font-bold text-slate-900">Label tidak dikenal</h2>
          <p class="mt-1 text-sm text-slate-500">
            QR ini bukan label dari sistem ini.
          </p>
          <p class="mt-2 break-all font-mono text-xs text-slate-400">{rejected}</p>
          <Button class="mt-4 w-full" size="touch" onClick={onClose}>Tutup</Button>
        </div>
      )}

      {/* Offered even while the camera is working: a scuffed or wet label beats a good camera
          more often than the camera fails. */}
      {!help && !rejected && !typing && (
        <div class="relative mt-auto p-4">
          <button
            type="button"
            class="mx-auto flex min-h-touch items-center gap-2 rounded-full bg-black/50 px-5 font-semibold text-white backdrop-blur"
            onClick={() => setTyping(true)}
          >
            <Keyboard class="h-5 w-5" /> Ketik kodenya
          </button>
        </div>
      )}

      {manual && (
        <div class="relative m-4 mt-auto rounded-2xl bg-white p-5">
          {help && (
            <>
              <h2 class="font-bold text-slate-900" role="alert">{help.title}</h2>
              <p class="mt-1 text-sm text-slate-500">{help.body}</p>
              {/* The browser's own words, for the case the help text does not cover. Carried
                  but never shown would make the field write-only, and diagnosing a camera on
                  somebody else's phone is exactly when you want it. */}
              {scanner.message && (
                <p class="mt-2 break-all font-mono text-[11px] text-slate-400">{scanner.message}</p>
              )}
              <p class="mt-4 text-sm font-semibold text-slate-900">Ketik saja kodenya:</p>
            </>
          )}
          <label class="sr-only" for="scan-manual">Kode label</label>
          <input
            id="scan-manual"
            class="mt-2 min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 font-mono text-slate-900"
            value={typed}
            placeholder="ALQ-ITM-0001"
            autocomplete="off"
            autocapitalize="characters"
            onInput={(e: Event) => setTyped((e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => {
              // A USB barcode gun is a keyboard that types the code and presses Enter, so this
              // input doubles as the hardware-scanner path at a fixed counter.
              if (e.key === 'Enter' && typed.trim() !== '') accept(typed.trim());
            }}
          />
          <p class="mt-1.5 text-xs text-slate-400">
            Kode ini tercetak kecil di bawah QR pada stikernya.
          </p>
          <div class="mt-4 flex gap-2">
            <Button class="flex-1" size="touch" disabled={typed.trim() === ''} onClick={() => accept(typed.trim())}>
              Buka
            </Button>
            <Button variant="secondary" size="touch" onClick={onClose}>Tutup</Button>
          </div>
        </div>
      )}

    </div>
  );
}
