// The PIN, once per visit.
//
// §58.5: a session is ONE VISIT, not a time window. PIN, log everything you are carrying,
// Simpan — and the session ends. Twenty knives cost one PIN, not twenty, and a shared kiosk
// cannot silently attribute somebody's withdrawal to whoever used it last, because there is
// nothing left open to attribute it to.
//
// Big keys, not a keyboard: this is a wall-mounted tablet handled with wet hands, and the
// device's own keypad would cover half the screen at the moment somebody needs to see what
// they are recording.

import { useState } from 'octane';
import { Delete, TriangleAlert } from '@octanejs/lucide';
import { Button } from '../../components/ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad(
  { onSubmit, onCancel, error, busy, attemptsLeft }:
  {
    onSubmit: (pin: string) => void;
    onCancel: () => void;
    error?: string;
    busy?: boolean;
    attemptsLeft?: number;
  },
) {
  const [pin, setPin] = useState('');
  const press = (k: string) => setPin((p) => (p.length >= 8 ? p : p + k));

  return (
    <div>
      <p class="text-sm leading-relaxed text-slate-600">
        Masukkan PIN Anda sekali. Semua yang dicatat sesudah ini tercatat atas nama Anda, sampai
        ditutup.
      </p>

      {/* Dots, not the digits: a kiosk is by definition in a room with other people in it. */}
      <div class="mt-5 flex justify-center gap-3" aria-hidden="true">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            class={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-slate-900' : 'border-2 border-slate-400'}`}
          />
        ))}
      </div>
      <label class="sr-only" for="pin-value">PIN</label>
      <input id="pin-value" class="sr-only" type="password" value={pin} readonly />

      {error && (
        <p role="alert" class="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-700">
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <span class="leading-relaxed">
            {error}
            {/* Counted down out loud: a lockout that arrives without warning reads as the app
                being broken, and the marbot walks away with the soap unrecorded. */}
            {attemptsLeft != null && attemptsLeft > 0 && (
              <span class="block text-xs">Sisa {attemptsLeft} percobaan sebelum terkunci.</span>
            )}
          </span>
        </p>
      )}

      <div class="mt-5 grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            class="min-h-touch rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-900 hover:bg-slate-50 active:scale-95"
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          class="min-h-touch rounded-lg border border-slate-400 bg-white font-semibold text-slate-500 hover:bg-slate-50"
          onClick={onCancel}
        >
          Batal
        </button>
        <button
          type="button"
          class="min-h-touch rounded-lg border border-slate-400 bg-white text-2xl font-bold text-slate-900 hover:bg-slate-50 active:scale-95"
          onClick={() => press('0')}
        >
          0
        </button>
        <button
          type="button"
          class="flex min-h-touch items-center justify-center rounded-lg border border-slate-400 bg-white text-slate-600 hover:bg-slate-50"
          aria-label="Hapus satu angka"
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <Delete class="h-6 w-6" />
        </button>
      </div>

      <div class="mt-4">
        <Button
          size="touch"
          class="w-full"
          disabled={pin.length < 4 || busy}
          onClick={() => onSubmit(pin)}
        >
          {busy ? 'Memeriksa…' : 'Lanjut'}
        </Button>
      </div>
    </div>
  );
}
