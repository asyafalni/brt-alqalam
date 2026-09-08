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
import { GatewayError, openSession } from '../../../../data/gateway';
import type { PinChoice, Session } from '../../../../data/gateway';
import { PinPad } from './PinPad';

export function PinFlow(
  { url, deviceSecret, busy, error, onSession, onCancel, onError }:
  {
    url: string;
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

  async function open(entered: string, userId?: string) {
    setOpening(true);
    onError('');
    try {
      const result = await openSession(url, deviceSecret, entered, userId);
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
    <PinPad
      busy={opening || busy === true}
      error={error ?? ''}
      onCancel={onCancel}
      onSubmit={(entered) => void open(entered)}
    />
  );
}
