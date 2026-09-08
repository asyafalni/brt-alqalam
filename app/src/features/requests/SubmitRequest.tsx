// Filing a request, for anybody — not just the people who can read the list.
//
// The Requests list is admin-only because it names who asked, who decided and why (§39). Filing
// one names only yourself, so it stays open: the person who notices the mop is finished is
// rarely the person with a Clerk password, and making an admin type it in on their behalf is
// exactly the added bookkeeping §0.0 exists to refuse.
//
// So this is a FORM AND A RECEIPT, never a list. After sending, it says the request was filed
// and stops — it cannot show it in context, because the person who just filed it is not allowed
// to see the tab it went into. Pretending otherwise would leak the thing the split protects.

import { useState } from 'octane';
import { CircleCheck, ShoppingCart, Wrench } from '@octanejs/lucide';
import { GatewayError, closeSession, openSession, submitRequest } from '../../../../data/gateway';
import type { RequestDraft } from '../../../../data/gateway';
import { Button, ERROR_TEXT, FIELD, LABEL, Select } from '../../components/ui';
import { PinPad } from '../gateway/PinPad';

const REASON: Record<string, string> = {
  reason_required: 'Alasannya wajib diisi — tanpa itu pengurus harus menanyakannya lagi.',
  name_required: 'Nama barang tidak boleh kosong.',
  bad_qty: 'Jumlah harus lebih dari nol.',
  no_session: 'Sesi sudah berakhir. Masukkan PIN lagi.',
  session_expired: 'Sesi sudah berakhir. Masukkan PIN lagi.',
  'not-admin': 'Akun ini tidak boleh mengajukan.',
  offline: 'Tidak bisa menghubungi gateway. Pengajuan belum terkirim.',
};
const explain = (e: unknown) => {
  if (!(e instanceof GatewayError)) return REASON.offline;
  return REASON[e.code] ?? (e.hint ? `${e.code} — ${e.hint}` : `Gateway menolak: ${e.code}`);
};

export function SubmitRequest(
  { url, deviceSecret, getToken, units, onDone }:
  {
    url: string;
    /** Set on an enrolled kiosk: lets somebody file with a PIN and no account. */
    deviceSecret?: string;
    /** Set when an admin is signed in: no PIN step at all. */
    getToken?: () => Promise<string>;
    /** Units already in use, so the common ones are one tap rather than typing. */
    units: readonly string[];
    onDone: () => void;
  },
) {
  const [type, setType] = useState<'beli' | 'perbaikan'>('beli');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState(units[0] ?? 'buah');
  const [reason, setReason] = useState('');
  const [price, setPrice] = useState('');
  const [url_, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState('');
  /* The PIN step, and only for the people who need it. An admin already holds a credential; a
     marbot holds a PIN. It appears after the form is filled, never before — asking who somebody
     is before they have said what they want is the tax §0.0 exists to remove. */
  const [askPin, setAskPin] = useState(false);

  const draft = (): RequestDraft => ({
    type,
    name: name.trim(),
    qty: Number(qty) || 0,
    unit,
    reason: reason.trim(),
    ...(price.trim() ? { price: Number(price) } : {}),
    ...(url_.trim() ? { url: url_.trim() } : {}),
  });

  async function send(e: Event) {
    e.preventDefault();
    if (getToken) {
      setBusy(true);
      setError('');
      try {
        setSentId(await submitRequest(url, { token: await getToken() }, draft()));
      } catch (err) {
        setError(explain(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!deviceSecret) { setError('Perangkat ini belum didaftarkan, jadi belum bisa mengirim.'); return; }
    setAskPin(true);
  }

  async function sendWithPin(pin: string) {
    setBusy(true);
    setError('');
    let token = '';
    try {
      const session = await openSession(url, deviceSecret as string, pin);
      token = session.token;
      setSentId(await submitRequest(url, { session: token }, draft()));
      setAskPin(false);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
      /* One visit, one session (§58.5). Closing it here means a request filed at the kiosk does
         not leave a session open behind whoever walks away next. */
      if (token) void closeSession(url, token).catch(() => {});
    }
  }

  if (sentId) {
    return (
      <div class="py-4 text-center">
        <CircleCheck class="mx-auto mb-3 h-9 w-9 text-green-600" />
        <h2 class="text-base font-bold text-slate-900">Pengajuan terkirim</h2>
        {/* No link to the list, and no summary of the row. The person who just filed this
            cannot read that tab, and showing it here would be the hole in the split. */}
        <p class="mx-auto mt-1.5 max-w-xs text-sm text-slate-600">
          Pengurus akan melihatnya dan memutuskan. Kamu tidak bisa membuka daftarnya di sini
          karena daftar itu menyebut nama orang.
        </p>
        <p class="mt-2 font-mono text-[11px] uppercase tracking-tight text-slate-400">{sentId}</p>
        <Button class="mt-5" size="panel" onClick={onDone}>Selesai</Button>
      </div>
    );
  }

  if (askPin) {
    return (
      <PinPad
        busy={busy}
        error={error}
        onCancel={() => { setAskPin(false); setError(''); }}
        onSubmit={(pin) => void sendWithPin(pin)}
      />
    );
  }

  return (
    <form class="space-y-4" onSubmit={send}>
      {/* Two buttons, not a dropdown: there are exactly two kinds and the choice changes what
          the rest of the form means. */}
      <div class="grid grid-cols-2 gap-2">
        {([['beli', 'Beli baru', ShoppingCart], ['perbaikan', 'Perbaikan', Wrench]] as const)
          .map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              class={`flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${
                type === value
                  ? 'border-slate-900 bg-slate-900 text-slate-50'
                  : 'border-slate-400 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setType(value)}
            >
              <Icon class="h-4 w-4" /> {label}
            </button>
          ))}
      </div>

      <div>
        <label class={LABEL} for="req-name">Barang apa?</label>
        <input
          id="req-name"
          class={FIELD}
          value={name}
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL} for="req-qty">Jumlah</label>
          <input
            id="req-qty"
            class={FIELD}
            type="number"
            min="1"
            value={qty}
            onInput={(e: Event) => setQty((e.target as HTMLInputElement).value)}
          />
        </div>
        <div>
          <label class={LABEL} for="req-unit">Satuan</label>
          <Select
            id="req-unit"
            value={unit}
            onChange={(e: Event) => setUnit((e.target as HTMLSelectElement).value)}
          >
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <label class={LABEL} for="req-reason">Kenapa perlu?</label>
        <textarea
          id="req-reason"
          class={`${FIELD} min-h-20 py-3`}
          rows={2}
          value={reason}
          onInput={(e: Event) => setReason((e.target as HTMLTextAreaElement).value)}
        />
        {/* Said before it is refused, not after. It is the only required field that is not
            needed to place an order, so it looks optional until somebody explains it. */}
        <p class="mt-1 text-xs text-slate-500">
          Wajib — supaya pengurus bisa memutuskan tanpa bertanya lagi.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL} for="req-price">Perkiraan harga</label>
          <input
            id="req-price"
            class={FIELD}
            type="number"
            inputmode="numeric"
            placeholder="opsional"
            value={price}
            onInput={(e: Event) => setPrice((e.target as HTMLInputElement).value)}
          />
        </div>
        <div>
          <label class={LABEL} for="req-url">Tautan toko</label>
          <input
            id="req-url"
            class={FIELD}
            type="url"
            placeholder="opsional"
            value={url_}
            onInput={(e: Event) => setUrl((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {error && <p class={ERROR_TEXT} role="alert">{error}</p>}

      <Button
        type="submit"
        size="touch"
        class="w-full"
        disabled={busy || !name.trim() || !reason.trim() || !(Number(qty) > 0)}
      >
        {busy ? 'Mengirim…' : 'Kirim pengajuan'}
      </Button>
    </form>
  );
}
