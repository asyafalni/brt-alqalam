// The code an admin holds up for one person to scan.
//
// This is the only screen in the app that displays a credential, so everything about it is
// shaped by that: it appears once, right after enrolment, and there is no way back to it. The
// gateway stores the secret to compare against, never to hand out again — a phone that misses
// its chance is enrolled a second time, which costs ten seconds.
//
// IT CARRIES THE GATEWAY ADDRESS TOO. A marbot's phone has never opened this app, so a QR with
// only the secret would still leave them typing a 120-character Apps Script URL. With both, the
// scan is the entire setup.

import { useState } from 'octane';
import { CircleCheck, TriangleAlert } from '@octanejs/lucide';
import { qrSvg } from '../labels/qr';
import { Button } from '../../components/ui';
import { routeToHash } from '../../state/route';

export function EnrolQr(
  { gateway, secret, label, onDone }:
  { gateway: string; secret: string; label: string; onDone: () => void },
) {
  const [done, setDone] = useState(false);

  /* Absolute, because the phone scanning this is not on the page — it is in a camera app, and a
     relative hash means nothing there. `location.origin` rather than a constant so a preview
     build enrols against the preview and production against production. */
  const link = `${location.origin}/${routeToHash({ name: 'daftar', gateway, secret })}`;
  /* `M`, not the `H` a printed label uses: this is a clean backlit screen held for ten seconds,
     so the extra correction only makes the code denser and harder to scan. 81 modules -> 61. */
  const qr = qrSvg(link, 'M');
  const box = qr.modules + qr.quietZone * 2;

  if (done) {
    return (
      <div class="py-6 text-center">
        <CircleCheck class="mx-auto mb-3 h-9 w-9 text-green-600" />
        <h2 class="text-base font-bold text-slate-900">{label} terdaftar</h2>
        <p class="mx-auto mt-1.5 max-w-xs text-sm text-slate-600">
          Kalau ternyata belum sempat dipindai, daftarkan lagi — kodenya tidak bisa ditampilkan
          ulang.
        </p>
        <Button class="mt-5" size="panel" onClick={onDone}>Selesai</Button>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      <div>
        <h2 class="text-sm font-bold text-slate-900">Pindai dengan HP {label}</h2>
        <p class="mt-1 text-xs leading-relaxed text-slate-600">
          Buka kamera HP-nya dan arahkan ke kode ini. Setelah itu HP tersebut bisa mencatat
          dengan PIN.
        </p>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${box} ${box}`}
          class="mx-auto block h-auto w-full max-w-[240px]"
          role="img"
          aria-label={`Kode pendaftaran untuk ${label}`}
        >
          <rect width={box} height={box} fill="#ffffff" />
          <path d={qr.d} fill="#0f172a" />
        </svg>
      </div>

      {/* Said plainly, because this is the one screen where a habit that is harmless everywhere
          else — screenshot it, send it later — hands somebody the ability to record as anyone
          who knows a PIN. */}
      <div class="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p class="text-xs leading-relaxed text-slate-700">
          Jangan difoto atau dikirim lewat chat. Kode ini adalah kunci perangkat — tunjukkan
          langsung ke orangnya, lalu tutup.
        </p>
      </div>

      <Button size="panel" class="w-full" onClick={() => setDone(true)}>Sudah dipindai</Button>
    </div>
  );
}
