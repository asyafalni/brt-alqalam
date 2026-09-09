// PIN in, session out — including the rare moment when the PIN belongs to two people.
//
// ONE COMPONENT, because there are two places that need a session: recording a movement, and
// filing a request from the kiosk. The last time the same job was written twice in this app the
// second copy quietly lost its photo picker, so the disambiguation step lives here rather than
// being remembered in two flows.
//
// The picker only appears when the gateway says the PIN is ambiguous, which at 10–15 people is
// about a one-percent event. Putting a name list in front of every sign-in would add a tap to
// every visit to save one — the trade §0.0 exists to refuse.

import { useState } from 'octane';
import { UserRound } from '@octanejs/lucide';
import { GatewayError, openSession, openSessionByPhone } from '../../../../data/gateway';
import type { PinChoice, Session } from '../../../../data/gateway';
import { PinPad } from './PinPad';
import { loadPhone, looksLikePhone, savePhone } from '../../state/member';
import { Button, FIELD, LABEL } from '../../components/ui';

export function PinFlow(
  { url, deviceSecret, busy, error, onSession, onCancel, onError }:
  {
    url: string;
    /**
     * An enrolled device secret, or `''` when this device identifies by phone number instead.
     *
     * Both models are live: a shared gudang tablet is enrolled once and takes anybody's PIN; a
     * marbot on their own phone types their number once and their PIN from then on.
     */
    deviceSecret: string;
    /** The CALLER's work — appending, submitting — not the sign-in itself. */
    busy?: boolean;
    error?: string;
    onSession: (session: Session) => void;
    onCancel: () => void;
    onError: (code: string) => void;
  },
) {
  const [choices, setChoices] = useState<PinChoice[] | null>(null);
  const [pin, setPin] = useState('');
  const [opening, setOpening] = useState(false);
  /* Typed once and remembered. Asking for it at every visit would be the tax §0.0 exists to
     refuse — and it is not a secret, so there is nothing gained by making them re-enter it. */
  const [phone, setPhone] = useState(() => loadPhone());
  const [askPhone, setAskPhone] = useState(() => !deviceSecret && !loadPhone());

  async function open(entered: string, userId?: string) {
    setOpening(true);
    onError('');
    try {
      const result = deviceSecret
        ? await openSession(url, deviceSecret, entered, userId)
        : await openSessionByPhone(url, phone, entered);
      if (result.choose) {
        // Held so the second call does not ask for the PIN again — the person already typed it,
        // and typing it twice to answer a question the system asked is not their mistake.
        setPin(entered);
        setChoices(result.choose);
        return;
      }
      onSession(result.session);
    } catch (err) {
      onError(err instanceof GatewayError ? err.code : 'offline');
    } finally {
      setOpening(false);
    }
  }

  if (askPhone) {
    return (
      <form
        class="space-y-4"
        onSubmit={(e: Event) => {
          e.preventDefault();
          setPhone(savePhone(phone));
          setAskPhone(false);
          onError('');
        }}
      >
        <div>
          <h2 class="text-base font-bold text-slate-900">Nomor HP kamu</h2>
          <p class="mt-1 text-sm text-slate-600">
            Sekali saja — HP ini akan mengingatnya. Yang dicatat nanti adalah namamu di daftar
            anggota.
          </p>
        </div>

        <div>
          <label class={LABEL} for="member-phone">Nomor HP</label>
          <input
            id="member-phone"
            class={FIELD}
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="0812…"
            value={phone}
            onInput={(e: Event) => setPhone((e.target as HTMLInputElement).value)}
          />
          {/* Said plainly, because being asked for a phone number usually means something else. */}
          <p class="mt-1 text-xs leading-relaxed text-slate-500">
            Hanya untuk mengenali kamu. Tidak dikirim ke siapa pun, dan bukan kata sandi — PIN-mu
            yang menjaga.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <Button type="submit" size="touch" disabled={!looksLikePhone(phone)}>Lanjut</Button>
          <button
            type="button"
            class="text-sm font-semibold text-slate-500 hover:text-slate-900"
            onClick={onCancel}
          >
            Batal
          </button>
        </div>
      </form>
    );
  }

  if (choices) {
    return (
      <div class="space-y-4">
        <div>
          <h2 class="text-base font-bold text-slate-900">Siapa yang mencatat?</h2>
          <p class="mt-1 text-sm text-slate-600">
            PIN itu dipakai lebih dari satu orang. Pilih namamu.
          </p>
        </div>

        <ul class="space-y-2">
          {choices.map((c) => (
            <li key={c.userId}>
              <button
                type="button"
                class="flex min-h-touch w-full items-center gap-3 rounded-lg border border-slate-400 bg-white px-4 text-left text-base font-semibold text-slate-900 hover:bg-slate-50"
                disabled={opening || busy}
                onClick={() => void open(pin, c.userId)}
              >
                <UserRound class="h-5 w-5 shrink-0 text-slate-500" />
                {c.name}
              </button>
            </li>
          ))}
        </ul>

        {error && <p class="text-sm font-medium text-red-500" role="alert">{error}</p>}

        <button
          type="button"
          class="text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
          onClick={() => { setChoices(null); setPin(''); onError(''); }}
        >
          Kembali
        </button>
      </div>
    );
  }

  return (
    <>
      <PinPad
        busy={opening || busy === true}
        error={error ?? ''}
        onCancel={onCancel}
        onSubmit={(entered) => void open(entered)}
      />
      {!deviceSecret && phone && (
        /* Shown so somebody using a colleague's phone notices before recording under their name
           — the one misattribution this model can produce. */
        <p class="mt-3 text-center text-xs text-slate-500">
          Masuk sebagai nomor <span class="font-mono">{phone}</span>{' · '}
          <button
            type="button"
            class="font-semibold text-slate-700 underline underline-offset-2"
            onClick={() => { setAskPhone(true); onError(''); }}
          >
            bukan kamu?
          </button>
        </p>
      )}
    </>
  );
}
