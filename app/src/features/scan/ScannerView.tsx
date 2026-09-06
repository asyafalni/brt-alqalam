import { useRef, useState } from 'octane';
import { X } from '@octanejs/lucide';
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

  const scanner = useScanner(videoRef, (text) => {
    const route = routeFromScan(text);
    // An unrecognised code must say so. Silently ignoring it is indistinguishable from a
    // broken camera, and people respond by scanning harder.
    if (route) onFound(route);
    else setRejected(text);
  });

  const help = HELP[scanner.status];

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

      {help && (
        <div class="relative m-4 mt-auto rounded-2xl bg-white p-5" role="alert">
          <h2 class="font-bold text-slate-900">{help.title}</h2>
          <p class="mt-1 text-sm text-slate-500">{help.body}</p>
          <Button class="mt-4 w-full" size="touch" onClick={onClose}>Tutup</Button>
        </div>
      )}
    </div>
  );
}
