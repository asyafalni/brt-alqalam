// Recording what actually happened to the stock — the daily job the register exists for.
//
// Until now nothing in the app could append a movement: the catalog could be built, labelled
// and reported on, but "saya ambil dua galon sabun" had nowhere to go, so every number on
// Laporan was frozen at the moment of the stock-take. This is that hole closed.
//
// THE WHOLE DESIGN IS THE TAP COUNT (§58: ~10 seconds, ≤6 taps). What that buys is the right
// to exist at all — a marbot who has to walk to a tablet and work a form to take a bar of soap
// will simply take the soap, and no amount of correctness downstream survives that. So:
//
//   * the keterangan is INFERRED, never chosen (`planMovement`) — the operator supplies a
//     direction and a number, and the word falls out;
//   * the rack is asked about ONLY when the thing is kept on more than one, because otherwise
//     the answer is already known;
//   * the quantity opens at 1, which is the commonest answer, on steppers big enough for wet
//     hands rather than a keyboard.
//
// There is deliberately NO PIN here. It cannot be verified without the gateway, so a keypad
// today would be four taps of theatre — it would fail the test above while buying nothing.
// `actorUserId` is the one field that changes when the gateway lands.

import { useMemo, useState } from 'octane';
import { Check, Minus, Plus, TriangleAlert } from '@octanejs/lucide';
import { planMovement } from '../../../../domain/keterangan';
import { UNPLACED } from '../../../../domain/stock';
import type { DerivedItem, Item, Location, Txn } from '../../../../domain/types';
import { Button, CODE, LABEL, Select } from '../../components/ui';
import { Sheet } from '../../components/Sheet';

/** Until the gateway can verify a person, every movement is attributed to the device. */
export const LOCAL_ACTOR = 'USR-LOCAL';

/** Unique enough for a log that is appended from one device at human speed. */
const newId = (prefix: string): string => {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`.slice(2);
  return `${prefix}-${rand.slice(0, 8).toUpperCase()}`;
};

export interface MovementTarget {
  item: Item;
  direction: 'keluar' | 'masuk';
  /** Which shelf it is being taken off, when the caller already knows (a scanned rack). */
  locationId?: string;
}

export function MovementSheet(
  { target, derived, locations, onCommit, onClose }:
  {
    target: MovementTarget | null;
    derived?: DerivedItem;
    locations: Location[];
    onCommit: (txn: Txn) => void;
    onClose: () => void;
  },
) {
  return (
    <Sheet
      open={target !== null}
      title={target?.direction === 'masuk' ? 'Kembalikan barang' : 'Ambil barang'}
      description={target?.item.name}
      onClose={onClose}
    >
      {target && (
        <MovementForm
          /* Keyed by what is being recorded, so opening this for a second item starts fresh
             instead of inheriting the last one's quantity. */
          key={`${target.item.itemId}-${target.direction}-${target.locationId ?? ''}`}
          target={target}
          derived={derived}
          locations={locations}
          onCommit={onCommit}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function MovementForm(
  { target, derived, locations, onCommit, onClose }:
  {
    target: MovementTarget;
    derived?: DerivedItem;
    locations: Location[];
    onCommit: (txn: Txn) => void;
    onClose: () => void;
  },
) {
  const { item, direction } = target;
  const masuk = direction === 'masuk';

  /** Every shelf this thing is kept on, unplaced pile included — it is a shelf like any other. */
  const shelves = useMemo(() => Object.entries(derived?.byLocation ?? {}).map(([id, qty]) => ({
    locationId: id,
    qty,
    label: id === UNPLACED
      ? 'Belum ditempatkan'
      : `Rak ${locations.find((l) => l.locationId === id)?.code ?? id}`,
  })), [derived, locations]);

  const [locationId, setLocationId] = useState(
    target.locationId ?? shelves[0]?.locationId ?? UNPLACED,
  );
  const [qty, setQty] = useState(1);
  const [returnable, setReturnable] = useState(false);
  const [note, setNote] = useState('');

  const here = derived?.byLocation[locationId] ?? 0;
  const plan = planMovement(item, { direction, qty, returnable });
  const after = here + plan.qtyDelta;

  function save() {
    onCommit({
      txnId: newId('TXN'),
      clientTxnId: newId('C'),
      ts: Date.now(),
      type: plan.type,
      itemId: item.itemId,
      locationId,
      qtyDelta: plan.qtyDelta,
      actorUserId: LOCAL_ACTOR,
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    });
  }

  return (
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <p class={CODE}>{item.barcode}</p>
        <p class="text-sm tabular-nums text-slate-500">
          Sekarang <span class="font-bold text-slate-900">{here}</span> {item.unit}
        </p>
      </div>

      {/* Asked only when there is a real choice. On a single shelf the answer is already known,
          and a dropdown with one option is a tap that teaches nothing. */}
      {shelves.length > 1 ? (
        <div class="mt-4">
          <label class={LABEL} for="move-rack">{masuk ? 'Dikembalikan ke' : 'Diambil dari'}</label>
          <Select
            id="move-rack"
            value={locationId}
            onChange={(e: Event) => setLocationId((e.target as HTMLSelectElement).value)}
          >
            {shelves.map((s) => (
              <option key={s.locationId} value={s.locationId}>
                {s.label} — {s.qty} {item.unit}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p class="mt-4 text-sm text-slate-500">
          {masuk ? 'Dikembalikan ke' : 'Diambil dari'}{' '}
          <span class="font-semibold text-slate-900">{shelves[0]?.label ?? 'Belum ditempatkan'}</span>
        </p>
      )}

      <div class="mt-4">
        <label class={LABEL} for="move-qty">Berapa {item.unit}?</label>
        {/* Steppers, not a keyboard: this is done one-handed, often with wet hands, and the
            answer is almost always a small number. 56px targets per §66. */}
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-700 hover:border-slate-900 disabled:opacity-40"
            aria-label="Kurangi"
            disabled={qty <= 1}
            onClick={() => setQty((n) => Math.max(1, n - 1))}
          >
            <Minus class="h-5 w-5" />
          </button>
          <input
            id="move-qty"
            class="h-touch min-w-0 flex-1 rounded-lg border border-slate-400 bg-white text-center text-2xl font-bold tabular-nums text-slate-900"
            type="number"
            min="1"
            inputmode="numeric"
            value={String(qty)}
            onInput={(e: Event) => setQty(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
          />
          <button
            type="button"
            class="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg border border-slate-400 text-slate-700 hover:border-slate-900"
            aria-label="Tambah"
            onClick={() => setQty((n) => n + 1)}
          >
            <Plus class="h-5 w-5" />
          </button>
        </div>
      </div>

      <p class="mt-3 text-sm text-slate-600">
        Sisa setelah ini:{' '}
        <span class={`font-bold tabular-nums ${after < 0 ? 'text-red-700' : 'text-slate-900'}`}>
          {after}
        </span>{' '}
        {item.unit}
      </p>

      {/* A warning, never a block. The shelf is the authority, not the record — if somebody is
          holding four and we think there are three, refusing the entry only guarantees the
          fourth goes unrecorded, and the gap gets wider. Part XXI: a recount fixes it. */}
      {after < 0 && (
        <div class="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3" role="alert">
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p class="text-xs leading-relaxed text-slate-700">
            Catatan kita jadi minus. Boleh tetap disimpan — nanti diperbaiki lewat Cek rak,
            karena yang benar adalah isi raknya, bukan angkanya.
          </p>
        </div>
      )}

      {/* The one exception the design keeps explicit (§58): taken, but coming back. Off by
          default, so the everyday path costs nothing. */}
      {!masuk && item.kind === 'consumable' && (
        <label class="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            class="mt-0.5 h-5 w-5 shrink-0"
            checked={returnable}
            onChange={(e: Event) => setReturnable((e.target as HTMLInputElement).checked)}
          />
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-slate-900">Dipinjam, akan dikembalikan</span>
            <span class="block text-xs leading-relaxed text-slate-500">
              Dicatat sebagai pengambilan, bukan pemakaian.
            </span>
          </span>
        </label>
      )}

      <div class="mt-4">
        <label class={LABEL} for="move-note">Catatan (opsional)</label>
        <input
          id="move-note"
          class="min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 text-slate-900"
          value={note}
          placeholder={masuk ? 'Sisa dari acara' : 'Untuk bersih-bersih Jumat'}
          autocomplete="off"
          onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button size="touch" onClick={save}>
          <Check class="h-5 w-5" /> Simpan
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
