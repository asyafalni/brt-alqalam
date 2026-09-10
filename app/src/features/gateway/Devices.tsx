// The phones and tablets allowed to record anything.
//
// WHY A DEVICE AT ALL, since this is the question everybody asks first: `doPost` in Apps Script
// sees no headers, no cookies and no client IP (§65.2), so per-IP rate limiting is impossible,
// not merely awkward. An enrolled device is the only thing a PIN lockout can attach to. Without
// one, anybody holding the `/exec` URL could walk the whole 10^4 keyspace unopposed.
//
// ENROLMENT IS A QR, because the alternative was the reason this never got used: a 72-character
// secret read out of an Apps Script log and sent to somebody over WhatsApp — fifteen times, by
// the one person who knows how. An admin holds up a code, the marbot scans it with their own
// phone, and that phone is enrolled. Ten seconds, standing next to each other, and the secret
// never travels through a message anybody can forward.

import { useEffect, useState } from 'octane';
import {
  GatewayError, enrollDevice, listDevices, renameDevice, setDeviceRevoked,
} from '../../../../data/gateway';
import type { GatewayDevice } from '../../../../data/gateway';
import { Ban, Pencil, Plus, RotateCcw, Smartphone } from '@octanejs/lucide';
import { Button, ERROR_TEXT, FIELD, LABEL } from '../../components/ui';
import { EnrolQr } from './EnrolQr';

const REASON: Record<string, string> = {
  label_required: 'Beri nama perangkatnya — daftar tanpa nama tidak bisa dipakai mencabut.',
  no_such_device: 'Perangkat itu sudah tidak ada.',
  'not-admin': 'Hanya admin yang bisa mengelola perangkat.',
  offline: 'Tidak bisa menghubungi gateway.',
};
const explain = (e: unknown) => {
  if (!(e instanceof GatewayError)) return REASON.offline;
  return REASON[e.code] ?? (e.hint ? `${e.code} — ${e.hint}` : `Gateway menolak: ${e.code}`);
};

export function Devices(
  { url, getToken }: { url: string; getToken: () => Promise<string> },
) {
  const [devices, setDevices] = useState<GatewayDevice[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [renaming, setRenaming] = useState<GatewayDevice | null>(null);
  /* The secret, held only for as long as the QR is on screen. Never stored, never re-fetchable
     — the gateway keeps it to compare against, not to hand back. */
  const [issued, setIssued] = useState<{ secret: string; label: string } | null>(null);

  const run = async (fn: (t: string) => Promise<GatewayDevice[]>) => {
    setBusy(true);
    setError('');
    try {
      setDevices(await fn(await getToken()));
      return true;
    } catch (err) {
      setError(explain(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void run((t) => listDevices(url, t)); }, [url]);

  async function enrol(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await enrollDevice(url, await getToken(), label.trim());
      setDevices(result.devices);
      setIssued({ secret: result.secret, label: label.trim() });
      setAdding(false);
      setLabel('');
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <EnrolQr
        gateway={url}
        secret={issued.secret}
        label={issued.label}
        onDone={() => setIssued(null)}
      />
    );
  }

  return (
    <div class="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
      <div class="flex items-center gap-2">
        <Smartphone class="h-4 w-4 shrink-0 text-slate-500" />
        <h2 class="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">Perangkat</h2>
        {!adding && (
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-slate-50 hover:bg-slate-700"
            aria-label="Daftarkan perangkat baru"
            title="Daftarkan perangkat baru"
            onClick={() => { setAdding(true); setError(''); }}
          >
            <Plus class="h-4 w-4" />
          </button>
        )}
      </div>

      {adding && (
        <form class="mt-3 space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={enrol}>
          <div>
            <label class={LABEL} for="dev-label">Nama perangkat</label>
            <input
              id="dev-label"
              class={FIELD}
              placeholder="HP Budi"
              value={label}
              onInput={(e: Event) => setLabel((e.target as HTMLInputElement).value)}
            />
            {/* Named for the PERSON, because that is what a revoke decision is about: nobody
                revokes "DEV-3", they revoke the phone Budi lost. */}
            <p class="mt-1 text-xs text-slate-500">Nama orangnya, bukan merek HP-nya.</p>
          </div>

          {error && <p class={ERROR_TEXT} role="alert">{error}</p>}

          <div class="flex items-center gap-2">
            <Button type="submit" size="panel" disabled={busy || !label.trim()}>
              {busy ? 'Membuat…' : 'Buat QR'}
            </Button>
            <button
              type="button"
              class="text-sm font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => { setAdding(false); setError(''); }}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {renaming && (
        <form
          class="mt-3 space-y-3 rounded-lg border border-slate-200 p-3"
          onSubmit={(e: Event) => {
            e.preventDefault();
            const target = renaming;
            void run((t) => renameDevice(url, t, target.deviceId, label.trim()))
              .then((ok) => { if (ok) { setRenaming(null); setLabel(''); } });
          }}
        >
          <label class={LABEL} for="dev-rename">Ganti nama</label>
          <input
            id="dev-rename"
            class={FIELD}
            value={label}
            onInput={(e: Event) => setLabel((e.target as HTMLInputElement).value)}
          />
          <div class="flex items-center gap-2">
            <Button type="submit" size="panel" disabled={busy || !label.trim()}>Simpan</Button>
            <button
              type="button"
              class="text-sm font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => { setRenaming(null); setLabel(''); }}
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {!adding && !renaming && error && <p class={`${ERROR_TEXT} mt-2`} role="alert">{error}</p>}

      {devices === null ? (
        <p class="mt-3 text-sm text-slate-500">Memuat…</p>
      ) : devices.length === 0 ? (
        <p class="mt-3 text-xs leading-relaxed text-slate-500">
          Belum ada perangkat terdaftar, dan itu tidak apa-apa: orang bisa mencatat dari HP
          sendiri dengan nomor HP dan PIN. Daftarkan perangkat hanya untuk <b>tablet gudang
          bersama</b>, supaya siapa pun bisa mencatat di situ tanpa mengetik nomor.
        </p>
      ) : (
        <ul class="mt-3 divide-y divide-slate-200">
          {devices.map((d) => (
            <li key={d.deviceId} class="flex items-center gap-2 py-2">
              <Smartphone class={`h-4 w-4 shrink-0 ${d.revoked ? 'text-slate-300' : 'text-slate-400'}`} />
              <div class="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span class={`truncate text-sm font-semibold ${d.revoked ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                  {d.label}
                </span>
                {d.revoked && <span class="shrink-0 text-[11px] text-slate-500">dicabut</span>}
              </div>

              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                aria-label={`Ganti nama ${d.label}`}
                title="Ganti nama"
                onClick={() => { setRenaming(d); setLabel(d.label); setAdding(false); }}
              >
                <Pencil class="h-4 w-4" />
              </button>

              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                aria-label={d.revoked ? `Aktifkan ${d.label}` : `Cabut ${d.label}`}
                title={d.revoked ? 'Aktifkan lagi' : 'Cabut akses'}
                onClick={() => void run((t) => setDeviceRevoked(url, t, d.deviceId, !d.revoked))}
              >
                {d.revoked ? <RotateCcw class="h-4 w-4" /> : <Ban class="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
