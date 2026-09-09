// Lending a labelled unit out, and closing that loan.
//
// THIS WAS THE HOLE. The whole equipment lifecycle was modelled, folded, colour-coded, reported
// on, given a repair queue and a loss log — and nothing in the app could put a unit into any of
// those states. Every `dipinjam`, `rusak` and `hilang` on screen came from `demo.ts`, which
// says so itself: "without it the borrowed / broken / lost states are unreachable". So "can we
// mark something lost?" had the answer: no, and not the borrowing either.
//
// §60 deferred this deliberately, and the reason it comes back now is §73: knives go missing
// after Qurban. A loan nobody can close is a loan that cannot be recorded as lost, and a thing
// that cannot be recorded as lost is exactly the boss's second complaint.
//
// THREE OUTCOMES, from Part IV, and the split is load-bearing: rusak is ours and costs a
// repair, hilang is gone and costs a replacement. Collapsing them into "masalah" hides which.

import { useState } from 'octane';
import { ArrowDownLeft, CircleCheck, TriangleAlert, XCircle } from '@octanejs/lucide';
import type { Condition, InstanceStatus, Item, Txn } from '../../../../domain/types';
import { Button, LABEL } from '../../components/ui';
import { Sheet } from '../../components/Sheet';

export interface LoanTarget {
  assetId: string;
  label: string;
  item: Item;
  status: InstanceStatus;
  /** Who has it, when it is already out — so closing the loan can name them. */
  holder?: string;
}

const newId = (prefix: string): string => {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`.slice(2);
  return `${prefix}-${rand.slice(0, 8).toUpperCase()}`;
};

export function LoanSheet(
  { target, onCommit, onClose, destination = 'gateway' }:
  {
    target: LoanTarget | null;
    onCommit: (txn: Txn) => void;
    onClose: () => void;
    destination?: 'gateway' | 'local';
  },
) {
  const lending = target?.status === 'available';
  return (
    <Sheet
      open={target !== null}
      title={lending ? 'Pinjamkan unit' : 'Selesaikan pinjaman'}
      description={target?.label}
      onClose={onClose}
    >
      {target && destination === 'local' && (
        <p class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-slate-700">
          <strong class="font-semibold text-slate-900">Perangkat ini belum tersambung.</strong>
          {' '}Catatan ini hanya tersimpan di HP ini.
        </p>
      )}
      {target && (
        <LoanForm key={`${target.assetId}-${target.status}`} target={target} onCommit={onCommit} />
      )}
    </Sheet>
  );
}

function LoanForm({ target, onCommit }: { target: LoanTarget; onCommit: (txn: Txn) => void }) {
  const lending = target.status === 'available';
  const [holder, setHolder] = useState('');
  const [outcome, setOutcome] = useState<Condition>('normal');
  const [note, setNote] = useState('');

  const commit = () => onCommit({
    txnId: newId('TXN'),
    clientTxnId: newId('C'),
    ts: Date.now(),
    type: lending ? 'peminjaman' : 'pengembalian',
    assetId: target.assetId,
    /* Zero, always. A labelled unit's movement is a STATUS change, not a quantity one — it is
       still one of the things we own on the day it is borrowed. Only `hilang` removes it from
       the active base, and the reducer does that from the condition, not from a number. */
    qtyDelta: 0,
    ...(lending ? { recipient: holder.trim() } : { condition: outcome }),
    ...(note.trim() !== '' ? { note: note.trim() } : {}),
  } as Txn);

  if (lending) {
    return (
      <div>
        <div>
          <label class={LABEL} for="loan-holder">Dipinjam siapa?</label>
          {/* Free text, not a picker. §60: borrowers are often outsiders — jamaah, panitia, a
              contractor — who have no account and never will, and a registry is Phase 3. What
              matters today is that the name exists at all, because chasing happens over
              WhatsApp and a blank field is what makes that impossible. */}
          <input
            id="loan-holder"
            class="min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 text-slate-900"
            value={holder}
            placeholder="Pak Yusuf (renovasi)"
            autocomplete="off"
            onInput={(e: Event) => setHolder((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="mt-4">
          <label class={LABEL} for="loan-note">Catatan (opsional)</label>
          <input
            id="loan-note"
            class="min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 text-slate-900"
            value={note}
            placeholder="Untuk perbaikan pagar"
            autocomplete="off"
            onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
          />
        </div>

        <Button size="touch" class="mt-5 w-full" disabled={holder.trim() === ''} onClick={commit}>
          <ArrowDownLeft class="h-5 w-5" /> Catat peminjaman
        </Button>
        {holder.trim() === '' && (
          /* The one required field, and the only one this record exists for: a loan with no
             borrower answers none of the questions a loan is recorded to answer. */
          <p class="mt-2 text-center text-xs text-slate-500">Nama peminjam belum diisi.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {target.holder && (
        <p class="mb-4 text-sm text-slate-600">
          Dipegang <strong class="font-semibold text-slate-900">{target.holder}</strong>
        </p>
      )}

      <span class={LABEL}>Bagaimana akhirnya?</span>
      <div class="space-y-2">
        <Outcome
          active={outcome === 'normal'}
          icon={<CircleCheck class="h-5 w-5 shrink-0 text-green-700" />}
          title="Kembali, tidak apa-apa"
          hint="Masuk lagi ke daftar siap pakai."
          onPick={() => setOutcome('normal')}
        />
        <Outcome
          active={outcome === 'rusak'}
          icon={<TriangleAlert class="h-5 w-5 shrink-0 text-orange-700" />}
          title="Kembali, tapi rusak"
          hint="Masuk antrean perbaikan — masih milik kita, tinggal diperbaiki."
          onPick={() => setOutcome('rusak')}
        />
        <Outcome
          active={outcome === 'hilang'}
          icon={<XCircle class="h-5 w-5 shrink-0 text-rose-700" />}
          title="Hilang"
          hint="Keluar dari daftar aset dan masuk catatan kehilangan, untuk dibelikan pengganti."
          onPick={() => setOutcome('hilang')}
        />
      </div>

      <div class="mt-4">
        <label class={LABEL} for="loan-close-note">
          {outcome === 'normal' ? 'Catatan (opsional)' : 'Keterangan'}
        </label>
        <input
          id="loan-close-note"
          class="min-h-touch w-full rounded-lg border border-slate-400 bg-white px-4 text-slate-900"
          value={note}
          placeholder={outcome === 'hilang' ? 'Terakhir dipakai saat Qurban' : 'Gagangnya patah'}
          autocomplete="off"
          onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
        />
        {outcome !== 'normal' && (
          /* Not blocking, but asked for out loud. A write-off with no why gets re-asked in six
             months by somebody deciding whether to buy another one — the same reasoning §95
             uses to require a reason on a request. */
          <p class="mt-1.5 text-xs text-slate-500">
            {outcome === 'hilang'
              ? 'Tulis apa yang diketahui — nanti ini yang dibaca waktu memutuskan beli pengganti.'
              : 'Rusaknya di bagian mana, supaya yang memperbaiki tidak perlu menebak.'}
          </p>
        )}
      </div>

      <Button size="touch" class="mt-5 w-full" onClick={commit}>
        <CircleCheck class="h-5 w-5" /> Simpan
      </Button>
    </div>
  );
}

function Outcome(
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
