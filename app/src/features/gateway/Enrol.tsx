// What a marbot's phone shows the moment it scans the admin's QR.
//
// The whole setup, in one screen, on a phone that has never opened this app: it already has the
// gateway address and the device secret from the link, so there is nothing to type. It checks
// both against the gateway before saving — a code that was revoked, or a URL that answers a
// Google login page, must fail HERE rather than at a shelf.
//
// The credential is stripped from the URL as soon as it is used. A secret sitting in the address
// bar is a secret in the browser history, in a shared screenshot, and in whatever the next
// person taps.

import { useEffect, useState } from 'octane';
import { CircleCheck, TriangleAlert } from '@octanejs/lucide';
import { fetchState, GatewayError, openSession } from '../../../../data/gateway';
import { saveConnection, urlProblem } from '../../state/connection';
import type { Connection } from '../../state/connection';
import { Button } from '../../components/ui';
import { Logo } from '../../components/Logo';

const REASON: Record<string, string> = {
  device_not_enrolled: 'Kode ini sudah tidak berlaku. Minta admin membuat QR baru.',
  device_revoked: 'Perangkat ini sudah dicabut aksesnya.',
  'not-json': 'Alamat gateway menjawab halaman login, bukan data. Minta admin memeriksanya.',
  offline: 'Tidak bisa menghubungi gateway. Periksa koneksi, lalu coba lagi.',
};

export function Enrol(
  { gateway, secret, onConnected, onCancel }:
  {
    gateway: string;
    secret: string;
    onConnected: (c: Connection) => void;
    onCancel: () => void;
  },
) {
  const [phase, setPhase] = useState<'checking' | 'done' | 'error'>('checking');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const bad = urlProblem(gateway);
      if (bad) { if (alive) { setError(bad); setPhase('error'); } return; }

      try {
        const state = await fetchState(gateway);

        /* Proves the SECRET, not just the address. A deliberately impossible PIN is used, so
           `invalid_pin` is the success case: the gateway got past the device check without
           anybody typing a real PIN into a setup screen. */
        const probe = await openSession(gateway, secret, '000000000')
          .then(() => 'ok')
          .catch((err: unknown) => (err instanceof GatewayError ? err.code : 'offline'));
        if (probe !== 'invalid_pin' && probe !== 'locked' && probe !== 'ok') {
          throw new GatewayError(probe);
        }

        if (!alive) return;
        setSummary(`${state.items.length} barang · ${state.locations.length} rak`);
        onConnected(saveConnection(gateway, secret));
        setPhase('done');
      } catch (err) {
        if (!alive) return;
        const code = err instanceof GatewayError ? err.code : 'offline';
        setError(REASON[code] ?? `Gateway menolak: ${code}`);
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [gateway, secret]);

  return (
    <div class="flex min-h-screen items-center justify-center bg-[#faf7f2] px-5 py-10">
      <div class="w-full max-w-sm text-center">
        <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
          <Logo size={40} />
        </div>

        {phase === 'checking' && (
          <>
            <div
              class="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-900"
              aria-hidden="true"
            />
            <p class="mt-4 text-sm font-semibold text-slate-700">Mendaftarkan perangkat ini…</p>
          </>
        )}

        {phase === 'done' && (
          <>
            <CircleCheck class="mx-auto mb-3 h-10 w-10 text-green-600" />
            <h1 class="text-lg font-bold text-slate-900">Perangkat ini siap</h1>
            <p class="mt-1.5 text-sm text-slate-600">
              Sekarang bisa mencatat pengambilan dengan PIN. {summary}
            </p>
            <Button class="mt-6" size="touch" onClick={onCancel}>Mulai</Button>
          </>
        )}

        {phase === 'error' && (
          <>
            <TriangleAlert class="mx-auto mb-3 h-10 w-10 text-amber-500" />
            <h1 class="text-lg font-bold text-slate-900">Tidak bisa mendaftar</h1>
            <p class="mt-1.5 text-sm text-slate-600">{error}</p>
            <Button class="mt-6" size="panel" variant="secondary" onClick={onCancel}>
              Kembali
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
