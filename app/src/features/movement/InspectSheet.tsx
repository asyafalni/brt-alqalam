// Looking at a unit that has been sitting in the gudang, and saying what you found.
//
// `available` on a durable is a claim about its CONDITION, and nothing was ever checking it. A
// rack has `lastCountedTs` and a rotation; the report even says out loud that "rak yang belum
// pernah dicek bukan berarti aman". A unit had no equivalent, so a katrol bought for one Qurban
// reads as ready for the eleven months nobody touches it — and its actual condition is
// discovered on the morning it is needed.
//
// TWO OUTCOMES, and the second one closes a second hole: until now a unit could only be marked
// broken by lending it out and bringing it back damaged. A thing that rusted on the shelf never
// went anywhere, so there was no return to record it on.

import { useState } from 'octane';
import { CircleCheck, TriangleAlert } from '@octanejs/lucide';
import type { Item, Txn } from '../../../../domain/types';
import { Button, LABEL } from '../../components/ui';
import { Sheet } from '../../components/Sheet';

export interface InspectTarget {
  assetId: string;
  label: string;
  item: Item;
  /** When it was last confirmed good, for the sentence at the top. */
  lastTs: number | null;
}

const newId = (prefix: string): string => {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`.slice(2);
  return `${prefix}-${rand.slice(0, 8).toUpperCase()}`;
};

export function InspectSheet(
  { target, onCommit, onClose }:
  { target: InspectTarget | null; onCommit: (txn: Txn) => void; onClose: () => void },
) {
  return (
    <Sheet
      open={target !== null}
      title="Periksa unit"
      description={target?.label}
      onClose={onClose}
    >
      {target && <InspectForm key={target.assetId} target={target} onCommit={onCommit} />}
    </Sheet>
  );
}

function InspectForm({ target, onCommit }: { target: InspectTarget; onCommit: (txn: Txn) => void }) {
  const [broken, setBroken] = useState(false);
  const [note, setNote] = useState('');

  const commit = () => onCommit({
    txnId: newId('TXN'),
    clientTxnId: newId('C'),
    ts: Date.now(),
    /* Two different KINDS of record, not one with a flag. "I looked and it is fine" changes
       nothing and is worth only its date; "I looked and it is broken" moves the unit into the
       repair queue. Writing both as one type would make the log unable to tell them apart. */
    type: broken ? 'status_change' : 'pemeriksaan',
    assetId: target.assetId,
    qtyDelta: 0,
    ...(broken ? { toStatus: 'broken' as const } : {}),
    ...(note.trim() !== '' ? { note: note.trim() } : {}),
  } as Txn);

  return (
    <div>
      <p class="mb-4 text-sm leading-relaxed text-slate-600">
        {target.lastTs == null
          ? 'Unit ini belum pernah diperiksa sejak dicatat.'
          : `Terakhir diperiksa ${new Date(target.lastTs).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      </p>

      <span class={LABEL}>Kondisinya bagaimana?</span>
      <div class="space-y-2">
        <Choice
          active={!broken}
          icon={<CircleCheck class="h-5 w-5 shrink-0 text-green-700" />}
          title="Masih baik"
          hint="Tidak mengubah apa pun — cuma dicatat tanggalnya, supaya tahu kapan terakhir dilihat."
          onPick={() => setBroken(false)}
        />
        <Choice
          active={broken}
          icon={<TriangleAlert class="h-5 w-5 shrink-0 text-orange-700" />}
          title="Rusak"
          hint="Masuk antrean perbaikan. Sebelum ini, barang yang rusak di gudang cuma bisa dicatat kalau sempat dipinjam dulu."
          onPick={() => setBroken(true)}
        />
      </div>

      <div class="mt-4">
        <label class={LABEL} for="inspect-note">
          {broken ? 'Rusaknya di mana?' : 'Catatan (opsional)'}
        </label>
        <input
          id="inspect-note"
          class="min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 text-slate-900"
          value={note}
          placeholder={broken ? 'Gagangnya retak' : 'Sudah diasah'}
          autocomplete="off"
          onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
        />
      </div>

      <Button size="touch" class="mt-5 w-full" onClick={commit}>
        <CircleCheck class="h-5 w-5" /> Simpan hasil periksa
      </Button>
    </div>
  );
}

function Choice(
  { active, icon, title, hint, onPick }:
  { active: boolean; icon: unknown; title: string; hint: string; onPick: () => void },
) {
  return (
    <button
      type="button"
      aria-pressed={active}
      class={
        'flex min-h-touch w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors '
        + (active ? 'border-slate-900 bg-slate-900/5' : 'border-slate-400 bg-white hover:bg-slate-50')
      }
      onClick={onPick}
    >
      {icon}
      <span class="min-w-0">
        <span class="block text-sm font-bold text-slate-900">{title}</span>
        <span class="block text-xs leading-relaxed text-slate-600">{hint}</span>
      </span>
    </button>
  );
}
