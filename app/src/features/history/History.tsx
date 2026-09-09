// HISTORI DATA — everything that has happened, in one list.
//
// The spec draws it with eight columns (§30) and this is those eight, with the same trick used
// throughout: STOK AWAL, STOK AKHIR and KETERANGAN are DERIVED at render, not stored. Nothing
// in the log holds a running balance, so nothing in the log can disagree with the stock screen.
//
// It exists now rather than later because the app can finally record movements. A flow that
// writes into something nobody can see is exactly the "confident wrong numbers" failure §0
// warns about — you find out the log is wrong months afterwards, from the shelf.
//
// NO(1) is a display index and never a key: the spec says it auto-renumbers (§72), and it does,
// because it is the row's position in what is currently on screen.

import { useMemo, useState } from 'octane';
import { History as HistoryIcon } from '@octanejs/lucide';
import { keteranganLabel } from '../../../../domain/keterangan';
import { lineAt, UNPLACED } from '../../../../domain/stock';
import type { Item, Location, StockLine, Txn } from '../../../../domain/types';
import { CARD, CARD_FLUSH, CODE, PageHeader, Select, Stat } from '../../components/ui';
import { FilterField } from '../../components/FilterField';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';

const when = (ts: number) =>
  new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** A movement with the two balances the spec's columns want, computed by replaying the log. */
export interface HistoryRow {
  txn: Txn;
  item?: Item;
  /** Stock of this item ON THIS RACK before and after — the shelf is what somebody stands at. */
  before: number;
  after: number;
  /**
   * Whether the two balances mean anything on this row.
   *
   * An instance move — a knife borrowed, returned, marked broken — carries `qtyDelta: 0` by
   * design: it changes an identity's status, not an amount. Printing 0 → 0 beside it invites
   * the reading that the stock did not change *when it should have*, which is a different and
   * alarming claim. A dash says "this column is not about this row".
   */
  quantity: boolean;
}

/**
 * Replay the log once, forwards, keeping a running balance per (item × rack).
 *
 * Forwards is not optional: STOK AWAL only means anything in the order the events happened,
 * and the newest-first list somebody reads is a reversal of the result, not a different fold.
 */
export function historyRows(
  txns: readonly Txn[], items: readonly Item[], opening: (itemId: string, locationId: string) => number,
): HistoryRow[] {
  const running = new Map<string, number>();
  const ordered = [...txns].sort((a, b) => a.ts - b.ts);

  return ordered.map((txn) => {
    const item = items.find((i) => i.itemId === txn.itemId);
    const locationId = txn.locationId ?? UNPLACED;
    const key = `${txn.itemId ?? txn.assetId ?? ''}@${locationId}`;

    const before = running.get(key)
      ?? (txn.itemId ? opening(txn.itemId, locationId) : 0);
    const after = before + txn.qtyDelta;
    running.set(key, after);

    return { txn, item, before, after, quantity: txn.itemId != null && txn.qtyDelta !== 0 };
  });
}

export function History(
  { txns, items, locations, stock }:
  { txns: readonly Txn[]; items: Item[]; locations: Location[]; stock: StockLine[] },
) {
  const [type, setType] = useState('');
  /* This screen's own. It sat in the navbar, which meant a query typed on Opname silently
     narrowed the log when you arrived here — with the only clue up in the chrome. */
  const [search, setSearch] = useState('');

  const rackOf = (id?: string) => {
    if (!id) return 'Belum ditempatkan';
    return `Rak ${locations.find((l) => l.locationId === id)?.code ?? id}`;
  };

  const rows = useMemo(() => {
    // The opening balance is whatever the shelf held before any of this ran — which is exactly
    // what a stock line is, and why the field is called `initialStock`. Passing 0 instead would
    // make STOK AWAL wrong on the first movement of every item and right afterwards, which is
    // the worst kind of wrong: it looks correct wherever anybody spot-checks it.
    const all = historyRows(txns, items, (itemId, locationId) =>
      lineAt(stock, itemId, locationId)?.initialStock ?? 0).reverse();
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => type === '' || r.txn.type === type)
      .filter((r) => q === ''
        || `${r.item?.name ?? ''} ${r.txn.note ?? ''} ${r.txn.recipient ?? ''}`.toLowerCase().includes(q));
  }, [txns, items, stock, type, search]);

  /** Only the words that actually occur, so the picker never offers an empty result. */
  const types = useMemo(
    () => [...new Set(txns.map((t) => t.type))].sort(),
    [txns],
  );

  const columns: Column<HistoryRow>[] = [
    {
      key: 'waktu',
      header: 'Hari / Tgl / Jam',
      mobile: 'meta',
      cell: (r) => <span class="whitespace-nowrap text-sm text-slate-500">{when(r.txn.ts)}</span>,
    },
    {
      key: 'barang',
      header: 'Nama barang',
      mobile: 'title',
      cell: (r) => (
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-slate-900">
            {r.item?.name ?? r.txn.assetId ?? '—'}
          </p>
          {/* A rack only under a quantity row. An instance has no shelf in the log — it has a
              holder — so labelling it "belum ditempatkan" would report a problem that is not
              one. */}
          {r.quantity && <p class={`${CODE} truncate`}>{rackOf(r.txn.locationId)}</p>}
        </div>
      ),
    },
    {
      key: 'awal',
      header: 'Stok awal',
      align: 'right',
      // Off a phone entirely: the two balances are a desk audit, and the one number somebody
      // standing at a shelf wants is what happened, not what it was before.
      mobile: 'hidden',
      cell: (r) => (
        <span class="text-sm tabular-nums text-slate-500">{r.quantity ? r.before : '—'}</span>
      ),
    },
    {
      key: 'ambil',
      header: 'Ambil',
      align: 'right',
      mobile: 'trailing',
      cell: (r) => (r.quantity ? (
        <span class={`text-sm font-bold tabular-nums ${r.txn.qtyDelta < 0 ? 'text-slate-900' : 'text-green-700'}`}>
          {r.txn.qtyDelta > 0 ? `+${r.txn.qtyDelta}` : r.txn.qtyDelta}
        </span>
      ) : (
        <span class="text-sm text-slate-500">—</span>
      )),
    },
    {
      key: 'akhir',
      header: 'Stok akhir',
      align: 'right',
      mobile: 'hidden',
      cell: (r) => (
        <span class="text-sm font-bold tabular-nums text-slate-900">{r.quantity ? r.after : '—'}</span>
      ),
    },
    {
      key: 'keterangan',
      header: 'Keterangan',
      mobile: 'meta',
      cell: (r) => (
        <div class="min-w-0">
          {/* Derived from the movement, never chosen and never stored (§58). */}
          <p class="truncate text-sm text-slate-700">
            {keteranganLabel(r.txn.type, r.txn.condition)}
          </p>
          {r.txn.note && <p class="truncate text-xs text-slate-500">{r.txn.note}</p>}
        </div>
      ),
    },
    {
      key: 'pengambil',
      header: 'Pengambil',
      mobile: 'meta',
      cell: (r) => (
        <span class="block max-w-[12rem] truncate whitespace-nowrap text-sm text-slate-500">
          {r.txn.recipient ?? r.txn.actorUserId}
        </span>
      ),
    },
  ];

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Histori Data"
        subtitle="Setiap perubahan stok, berurutan. Ini catatan aslinya — angka di layar lain dihitung dari sini."
        action={(
          <FilterField
            value={search}
            onChange={setSearch}
            label="Saring riwayat"
            placeholder="Saring riwayat…"
          />
        )}
      />

      <div class="grid grid-cols-2 gap-2 sm:gap-4">
        <Stat value={txns.length} label="Catatan tersimpan" />
        <Stat
          value={rows.length}
          label="Ditampilkan"
          tint={rows.length === txns.length ? undefined : 'bg-amber-50 text-amber-600'}
        />
      </div>

      {txns.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <HistoryIcon class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada catatan.</p>
          <p class="mx-auto max-w-md text-sm text-slate-500">
            Catatan muncul di sini begitu ada barang yang diambil atau dikembalikan — dari
            halaman barang, dari rak, atau setelah memindai QR-nya.
          </p>
        </div>
      ) : (
        <div class={CARD_FLUSH}>
          <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 class="text-sm font-bold text-slate-900">Semua catatan</h2>
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {rows.length} baris
              </span>
            </div>
            <div class="mt-3">
              <label class="sr-only" for="history-type">Keterangan</label>
              <Select
                id="history-type"
                wrapClass="w-56"
                class="min-h-10 py-0 text-sm"
                value={type}
                onChange={(e: Event) => setType((e.target as HTMLSelectElement).value)}
              >
                <option value="">Semua keterangan</option>
                {types.map((t) => (
                  <option key={t} value={t}>{keteranganLabel(t)}</option>
                ))}
              </Select>
            </div>
          </div>

          <DataTable
            pageSize={25}
            columns={columns}
            rows={rows}
            keyOf={(r) => r.txn.txnId}
            empty={(
              <div class="px-6 py-16 text-center">
                <p class="italic text-slate-500">Tidak ada catatan yang cocok.</p>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
