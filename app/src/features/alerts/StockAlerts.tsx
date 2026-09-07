// Notifikasi Stok — the one low-stock list, rendered wherever it is asked for.
//
// It used to exist twice, hand-written on two screens from the same selector. Two lists of one
// thing mostly raise the question of which is current, and someone eventually acts on the
// staler-looking one. So there is now exactly one implementation, shown in two places for two
// different reasons: on Beranda, because that is the screen people open first and a reorder
// list is the point of opening it; and behind the navbar bell, because a bell that cannot show
// you what it is ringing about is decoration.
//
// It carries every column the spec's NOTIFIKASI STOK screen asks for — NAMA BARANG, STOK
// AKHIR, SET MIN, KETERANGAN and the HARI/TGL/JAM it breached — without being a table, because
// six of those columns on a phone is a horizontal scroll and this is a shopping list.

import type { StockNotification } from '../../../../domain/notifications';
import type { DerivedState } from '../../../../domain/types';
import { itemStatusBadge, PILL } from '../scan/resolve';
import { artFor, ItemArt } from '../items/ItemArt';

/** Since when it has been short. Coarse on purpose — "3 hari" is what makes a row feel overdue. */
export function breachedWhen(ts: number, now: number): string {
  const days = Math.max(0, Math.floor((now - ts) / 86_400_000));
  if (days === 0) return 'menipis hari ini';
  if (days === 1) return 'menipis kemarin';
  return `menipis ${days} hari lalu`;
}

export function StockAlerts(
  { notifications, derived, categoryNameOf, now, onOpenItem }:
  {
    notifications: readonly StockNotification[];
    derived: DerivedState;
    categoryNameOf: (categoryId: string) => string;
    now: number;
    /** Optional: rows become buttons into the item when there is somewhere to go. */
    onOpenItem?: (itemId: string) => void;
  },
) {
  return (
    // Bleeds out to the card's edge and pads each row back in, so a hover fills the row rather
    // than stopping short of the card on both sides. `--card-pad` is published by `CARD`.
    <ul class="-mx-[var(--card-pad)] divide-y divide-slate-100">
      {notifications.map((n) => {
        const d = derived.items[n.itemId];
        const badge = itemStatusBadge(d?.status ?? 'low');
        const art = d ? artFor(d.item, categoryNameOf(d.item.categoryId)) : ('default' as const);

        // Stacked on a phone so the name gets the full width: truncating "Kantong daging" to
        // "Kantong dagi…" to protect a pill is the wrong trade — the name is the only part
        // that tells you what to go and buy.
        const row = (
          <div class="flex w-full flex-col gap-1.5 text-left sm:flex-row sm:items-center sm:gap-3">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <ItemArt art={art} size={30} />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-slate-900">{n.name}</p>
                {/* KETERANGAN and the breach time — the two facts a bare name leaves out:
                    what this thing normally moves under, and how long it has been short. */}
                <p class="truncate text-xs text-slate-400">
                  {n.keterangan && <span class="capitalize">{n.keterangan}</span>}
                  {n.keterangan && ' · '}
                  {breachedWhen(n.ts, now)}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3 pl-[42px] sm:pl-0">
              <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
              <span class="shrink-0 text-sm tabular-nums text-slate-500 sm:w-28 sm:text-right">
                sisa <span class="font-bold text-slate-900">{n.stokAkhir}</span>
                <span class="text-slate-400"> · min {n.setMin}</span>
              </span>
            </div>
          </div>
        );

        return (
          <li key={n.itemId}>
            {onOpenItem ? (
              <button
                type="button"
                class="w-full px-[var(--card-pad)] py-3 hover:bg-slate-50"
                aria-label={`Buka ${n.name}`}
                onClick={() => onOpenItem(n.itemId)}
              >
                {row}
              </button>
            ) : (
              <div class="px-[var(--card-pad)] py-3">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
