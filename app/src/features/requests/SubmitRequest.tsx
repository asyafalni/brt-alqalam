// Filing a request, for anybody — not just the people who can read the list.
//
// The Requests list is admin-only because it names who asked, who decided and why (§39). Filing
// one names only yourself, so it stays open: the person who notices the mop is finished is
// rarely the person with a Clerk password, and making an admin type it in on their behalf is
// exactly the added bookkeeping §0.0 exists to refuse.
//
// IT WRAPS `RequestForm` RATHER THAN ASKING THE SAME QUESTIONS AGAIN. The first version of this
// screen had its own fields, and within a day it had already drifted — no photo attachments, no
// "something we already own" picker. Two forms for one thing is the §82 problem in another
// costume, and the second copy is always the one that stops getting the fix. What belongs here
// is only what is different: how it is SENT, and what happens afterwards.
//
// AFTERWARDS IS A RECEIPT, NEVER A LIST. The person who just filed it cannot read the tab it
// went into, so this says it was filed and stops. Showing the row back would be the one hole in
// the split it exists to keep.

import { useState } from 'octane';
import { CircleCheck } from '@octanejs/lucide';
import { GatewayError, closeSession, openSession, submitRequest } from '../../../../data/gateway';
import type { Item } from '../../../../domain/types';
import type { DerivedInstance } from '../../../../domain/types';
import { Button } from '../../components/ui';
import { PinPad } from '../gateway/PinPad';
import { RequestForm } from './RequestForm';
import type { RequestInput } from './RequestForm';

const REASON: Record<string, string> = {
  reason_required: 'Alasannya wajib diisi — tanpa itu pengurus harus menanyakannya lagi.',
  name_required: 'Nama barang tidak boleh kosong.',
  bad_qty: 'Jumlah harus lebih dari nol.',
  no_session: 'Sesi sudah berakhir. Masukkan PIN lagi.',
  session_expired: 'Sesi sudah berakhir. Masukkan PIN lagi.',
  invalid_pin: 'PIN salah.',
  device_not_enrolled: 'Perangkat ini belum didaftarkan, jadi belum bisa mengirim.',
  'not-admin': 'Akun ini tidak boleh mengajukan.',
  offline: 'Tidak bisa menghubungi gateway. Pengajuan belum terkirim.',
};
const explain = (e: unknown) => {
  if (!(e instanceof GatewayError)) return REASON.offline;
  return REASON[e.code] ?? (e.hint ? `${e.code} — ${e.hint}` : `Gateway menolak: ${e.code}`);
};

export function SubmitRequest(
  { url, deviceSecret, getToken, items, instances, requestId, prefill, onDone }:
  {
    url: string;
    /** Set on an enrolled kiosk: lets somebody file with a PIN and no account. */
    deviceSecret?: string;
    /** Set when an admin is signed in: no PIN step at all. */
    getToken?: () => Promise<string>;
    items: Item[];
    instances: DerivedInstance[];
    /** Minted by the caller before opening, so photos have somewhere to go. */
    requestId: string;
    /** `assetId` is required when there is a prefill at all: the whole point is naming a unit. */
    prefill?: { type: 'beli' | 'perbaikan'; assetId: string; note?: string };
    onDone: () => void;
  },
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState('');
  /* Held while the PIN is asked for, so the answers are not retyped after it. */
  const [held, setHeld] = useState<RequestInput | null>(null);

  async function send(input: RequestInput, credential: { session: string } | { token: string }) {
    setBusy(true);
    setError('');
    try {
      setSentId(await submitRequest(url, credential, { requestId, ...input }));
      setHeld(null);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(input: RequestInput) {
    if (getToken) { await send(input, { token: await getToken() }); return; }
    if (!deviceSecret) { setError(REASON.device_not_enrolled); return; }
    // The PIN comes AFTER the form, never before: asking who somebody is before they have said
    // what they want is the tap §0.0 exists to remove.
    setHeld(input);
  }

  async function sendWithPin(pin: string) {
    if (!held) return;
    setBusy(true);
    setError('');
    let token = '';
    try {
      token = (await openSession(url, deviceSecret as string, pin)).token;
      await send(held, { session: token });
    } catch (err) {
      setError(explain(err));
      setBusy(false);
    } finally {
      /* One visit, one session (§58.5): a request filed at the kiosk must not leave a session
         open behind whoever walks away next. */
      if (token) void closeSession(url, token).catch(() => {});
    }
  }

  if (sentId) {
    return (
      <div class="py-4 text-center">
        <CircleCheck class="mx-auto mb-3 h-9 w-9 text-green-600" />
        <h2 class="text-base font-bold text-slate-900">Pengajuan terkirim</h2>
        <p class="mx-auto mt-1.5 max-w-xs text-sm text-slate-600">
          Pengurus akan melihatnya dan memutuskan. Daftarnya tidak bisa dibuka di sini karena
          menyebut nama orang.
        </p>
        <p class="mt-2 font-mono text-[11px] uppercase tracking-tight text-slate-400">{sentId}</p>
        <Button class="mt-5" size="panel" onClick={onDone}>Selesai</Button>
      </div>
    );
  }

  if (held) {
    return (
      <PinPad
        busy={busy}
        error={error}
        onCancel={() => { setHeld(null); setError(''); }}
        onSubmit={(pin) => void sendWithPin(pin)}
      />
    );
  }

  return (
    <div class="space-y-3">
      {error && (
        <p class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-slate-800" role="alert">
          {error}
        </p>
      )}
      <RequestForm
        items={items}
        instances={instances}
        requestId={requestId}
        prefill={prefill}
        onSubmit={(input) => void submit(input)}
        onCancel={onDone}
      />
    </div>
  );
}
