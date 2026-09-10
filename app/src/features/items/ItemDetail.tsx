// One item, everything known about it.
//
// Reached by tapping a row anywhere, or by scanning its label — the same screen either way,
// because "what is this and what has happened to it" is one question however you arrived at it.

import { lazy, Suspense, useMemo, useState } from 'octane';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Eye, History, MapPin, Package, Pencil, QrCode,
  ShoppingCart,
} from '@octanejs/lucide';
import { keteranganLabel } from '../../../../domain/keterangan';
import type { Location, Txn } from '../../../../domain/types';
import type { Route } from '../../state/route';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, CARD_FLUSH, CODE, LABEL, PageHeader, Select } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { instancesFor } from '../stocktake/draft';
import { moveLine, setLine, totalFor, UNPLACED } from '../../../../domain/stock';
import { instanceStatusBadge, itemStatusBadge, PILL } from '../scan/resolve';
import type { MovementTarget } from '../movement/MovementSheet';
import type { LoanTarget } from '../movement/LoanSheet';
import { scanUrl } from '../labels/labels';
/* Lazy, so the ~43kB QR encoder stays out of the file a marbot downloads to record a
   withdrawal. Its fallback is a box the same size, so nothing on the card jumps. */
const ScanQr = lazy(() => import('./ScanQr').then((m) => ({ default: m.ScanQr })));
import type { InspectTarget } from '../movement/InspectSheet';
import { inspection, lastInspected } from '../../../../domain/inspect';
import { artFor, ItemArt } from './ItemArt';
import { ItemPhotos } from './ItemPhotos';
import { createIndexedDbPhotoStore } from '../../../../data/indexedDbPhotos';
import type { PhotoStore } from '../../../../data/photoStore';

/* One store for the whole app, created once. Building it per render would open a fresh
   IndexedDB connection every time somebody opened an item. */
/**
 * This device's own disk. Still the store when there is no gateway — the stock-take walk is
 * exactly where the wifi is worst, and a photo that needs the network is a photo that is lost.
 */
const localPhotos = createIndexedDbPhotoStore();

const when = (ts: number) =>
  new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

// The history table's four columns, in desk order. `mobile` decides what each becomes on a
// phone: the keterangan is what happened, so it is the headline; the quantity delta is the
// number being looked for, so it is pinned to the right of it; when and by whom are context.
const HISTORY: Column<Txn>[] = [
  {
    key: 'ts',
    header: 'Waktu',
    mobile: 'meta',
    cell: (t) => <span class="whitespace-nowrap text-sm text-slate-500">{when(t.ts)}</span>,
  },
  {
    key: 'keterangan',
    header: 'Keterangan',
    mobile: 'title',
    cell: (t) => (
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-slate-900">
          {keteranganLabel(t.type, t.condition)}
        </p>
        {t.recipient && <p class="truncate text-xs text-slate-500">→ {t.recipient}</p>}
      </div>
    ),
  },
  {
    key: 'qty',
    header: 'Jumlah',
    align: 'right',
    mobile: 'trailing',
    cell: (t) => (
      <span
        class={`text-sm font-bold tabular-nums ${
          t.qtyDelta < 0 ? 'text-red-600' : t.qtyDelta > 0 ? 'text-green-600' : 'text-slate-500'
        }`}
      >
        {t.qtyDelta > 0 ? '+' : ''}{t.qtyDelta || '—'}
      </span>
    ),
  },
  {
    key: 'actor',
    header: 'Oleh',
    mobile: 'meta',
    cell: (t) => <span class="text-sm text-slate-500">{t.actorUserId || '—'}</span>,
  },
];

export function ItemDetail(
  { id, draft, inventory, now, onNavigate, onMove, onLoan, onInspect, onRestock, photos }:
  {
    id: string; draft: Draft; inventory: Inventory; now: number;
    onNavigate: (r: Route) => void;
    /** The tap path to recording a movement, for when scanning is not to hand. */
    onMove: (target: MovementTarget) => void;
    /** Lends a labelled unit out, or closes its loan. Absent on a device that may only read. */
    onLoan?: (target: LoanTarget) => void;
    /** Records that a unit was looked at and found still good — or found broken. */
    onInspect?: (target: InspectTarget) => void;
    /**
     * Files a purchase for THIS item, prefilled.
     *
     * Here rather than on Beranda's low-stock rows, where it first landed: seven buttons down a
     * column turned a glance-and-go list into a form. Asking for something to be bought is a
     * decision about one thing, made after looking at it — so it belongs on the page that shows
     * you the thing.
     */
    onRestock?: (itemId: string) => void;
    /**
     * The SHARED photo store, when this device has a gateway to share through.
     *
     * Absent means the local disk, which is the honest answer for a phone walking the gudang
     * with no connection — and the screen already says the photos are device-only in that case.
     */
    photos?: PhotoStore;
  },
) {
  const item = draft.items.find((i) => i.itemId === id || i.barcode === id);

  if (!item) {
    return (
      <div class="space-y-4 pt-4 sm:pt-6">
        <div class={`${CARD} border-red-100 py-16 text-center`} role="alert">
          <h1 class="mb-2 text-2xl font-bold text-slate-900">Barang tidak ditemukan</h1>
          <p class="mb-1 text-slate-500">Tidak ada barang dengan kode ini di katalog.</p>
          <p class="mb-5 font-mono text-sm text-slate-500">{id}</p>
          <Button size="touch" onClick={() => onNavigate({ name: 'board' })}>Lihat semua stok</Button>
        </div>
      </div>
    );
  }

  /* Pulled out of `item` once: TypeScript drops the narrowing from the guard above inside the
     callbacks below, and a non-null assertion in each of them would be the same claim made
     three times without saying why. */
  const { itemId } = item;

  const derived = inventory.derived.items[item.itemId];
  const badge = itemStatusBadge(derived?.status ?? 'available');
  const categoryName = draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '';
  const art = artFor(item, categoryName);
  /** Every shelf this thing is kept on, with what is on each — the unplaced pile included. */
  const shelves = useMemo(() => {
    const rows = derived?.byLocation ?? {};
    return Object.entries(rows).map(([locationId, qty]) => ({
      locationId,
      qty,
      location: draft.locations.find((l) => l.locationId === locationId),
    }));
  }, [derived, draft.locations]);

  const [placing, setPlacing] = useState(false);

  /* Racks that can still be put onto. An archived shelf is one that has been dismantled — it
     keeps its history and its printed labels, but nothing new belongs on it. */
  const racks = useMemo(
    () => draft.locations.filter((l) => l.active),
    [draft.locations],
  );

  /**
   * Give this item a shelf, from the screen that just said it has none.
   *
   * The unplaced pile is a stock line like any other (§87), so this is a move rather than a
   * creation whenever there is already a quantity sitting in it — the number walks over intact.
   * With no line at all there is nothing to move, and the new shelf opens at zero, which says
   * "we keep it here" without inventing stock nobody counted.
   */
  function place(locationId: string) {
    draft.setStock((prev) => (
      prev.some((l) => l.itemId === itemId && l.locationId === UNPLACED)
        ? moveLine(prev, itemId, UNPLACED, locationId)
        : setLine(prev, itemId, locationId, 0)));
    setPlacing(false);
  }

  /* One pass over the log for every unit, rather than one pass per unit. */
  const checks = useMemo(() => lastInspected(inventory.txns), [inventory.txns]);

  const instances = useMemo(
    () => (item.trackBy === 'instance'
      ? instancesFor(item, now, totalFor(draft.stock, item.itemId))
      : []),
    [item, now, draft.stock],
  );

  // Newest first: what happened last is what someone came here to find out.
  const history = useMemo(
    () => inventory.txns
      .filter((t) => t.itemId === item.itemId || instances.some((a) => a.assetId === t.assetId))
      .sort((a, b) => b.ts - a.ts),
    [inventory.txns, item.itemId, instances],
  );

  // A count per status, so a shelf of twenty knives reads at a glance instead of one pill
  // at a time. Ordered by the status list itself, not by frequency, so it never reshuffles.
  const instanceTally = useMemo(() => {
    const acc = new Map<string, number>();
    for (const a of instances) {
      const status = inventory.derived.instances[a.assetId]?.status ?? 'available';
      acc.set(status, (acc.get(status) ?? 0) + 1);
    }
    return [...acc.entries()];
  }, [instances, inventory.derived]);

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <button
        type="button"
        class="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        onClick={() => onNavigate({ name: 'board' })}
      >
        <ArrowLeft class="h-4 w-4" /> Semua stok
      </button>

      <PageHeader
        title={item.name}
        subtitle={categoryName || item.categoryId}
        action={
          <div class="flex gap-2">
            {/* Ahead of Ubah and Label, because this is the thing that happens fifty times a
                week while those happen once. Quantity items only — a loan needs a borrower,
                and that flow is deliberately not built yet (§60). */}
            {/* Hidden, not disabled, for a device that may only look: a greyed-out Ambil is a
                promise the register cannot keep, and it invites the tap that explains nothing. */}
            {item.trackBy === 'quantity' && draft.canRecord !== false && (
              <>
                <Button onClick={() => onMove({ item, direction: 'keluar' })}>
                  <ArrowUpRight class="h-4 w-4" /> Ambil
                </Button>
                <Button variant="secondary" onClick={() => onMove({ item, direction: 'masuk' })}>
                  <ArrowDownLeft class="h-4 w-4" /> Kembalikan
                </Button>
              </>
            )}
            {/* Carries WHICH item. It used to navigate to a bare `#/opname`, so "Ubah" on
                Sabun cuci tangan landed you on a list of fifty rows with nothing selected and
                the thing you had just been looking at to find again. */}
            <Button
              variant="secondary"
              onClick={() => onNavigate({ name: 'opname', edit: item.itemId })}
            >
              <Pencil class="h-4 w-4" /> Ubah
            </Button>
            {/* Not gated on `canRecord`: filing a request is not recording a movement, and
                §93 keeps the FORM open to everybody even though the list is admin-only. */}
            {onRestock && item.trackBy === 'quantity' && (
              <Button variant="secondary" onClick={() => onRestock(item.itemId)}>
                <ShoppingCart class="h-4 w-4" /> Ajukan
              </Button>
            )}
          </div>
        }
      />

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class={`${CARD} sm:col-span-2`}>
          <div class="flex items-start gap-4">
            {/* Big here on purpose. This is the one screen with room for it, and the
                illustration is what makes an item recognisable before it is read — the same
                asset as the 36px row, drawn as filled shapes so it holds up at this size
                instead of becoming a large thin outline. */}
            <ItemArt art={art} size={96} class="hidden sm:block" />
            <ItemArt art={art} size={64} class="sm:hidden" />
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex flex-wrap items-center gap-3">
                <span class={`${PILL} ${badge.chip}`}>{badge.label}</span>
                <span class="text-2xl font-bold tabular-nums text-slate-900">
                  {derived?.qty ?? 0}{' '}
                  <span class="text-base font-normal text-slate-500">{item.unit}</span>
                </span>
                {/* The headline is what can be picked up now. A labelled item with units out
                    or broken owns more than that, and hiding the difference is what made the
                    stock list say four senter while three were on the hook. */}
                {derived && derived.ownedQty > derived.qty && (
                  <span class="text-sm text-slate-500">
                    tersedia · dari {derived.ownedQty} yang dimiliki
                  </span>
                )}
              </div>
              <p class={`${CODE} truncate`}>{item.barcode}</p>
            </div>

            {/* Top-right, where the Label shortcut used to send people. That button led to a
                sheet for PRINTING stickers, which is a desk job; what somebody standing here
                actually wants is to point another phone at this one and land on this item —
                the trip §96 proved works. Printing a sheet is still in the menu. */}
            <Suspense fallback={<div class="hidden h-[76px] w-[76px] shrink-0 sm:block" />}>
              <ScanQr
                url={scanUrl(location.origin + location.pathname, 'item', item.itemId)}
                caption={item.name}
              />
            </Suspense>
          </div>

          <dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <Fact label="Jenis" value={item.kind === 'consumable' ? 'Bisa habis' : 'Barang tetap'} />
            <Fact label="Cara catat" value={item.trackBy === 'instance' ? 'Label satu-satu' : 'Dihitung'} />
            <Fact label="Minimum" value={item.minStock == null ? 'Tidak diatur ( - )' : String(item.minStock)} />
            {/* The spec's per-item PENGAMBILAN counter: everything ever taken, never netted off. */}
            <Fact label="Total diambil" value={String(derived?.takenTotal ?? 0)} />
          </dl>
        </div>

        {/* Racks, plural. A thing kept on two shelves has two answers to "where is it", and
            showing only the first would send somebody to whichever one happens to be empty.
            Each row carries its own quantity, because that is the number they will be
            standing in front of. */}
        <div class={`${CARD} flex flex-col`}>
          <div class="mb-2 flex items-center gap-2">
            <MapPin class="h-4 w-4 shrink-0 text-slate-400" />
            <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Letak</span>
            {shelves.length > 1 && (
              <span class="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {shelves.length} rak
              </span>
            )}
          </div>
          {shelves.length === 0 ? (
            <>
              <p class="text-xl font-bold text-slate-900">Belum ditempatkan</p>
              <p class="text-sm text-slate-500">Barang tanpa rak paling sering hilang.</p>
              <div class="mt-3">
                <Button size="sm" onClick={() => setPlacing(true)}>
                  <MapPin class="h-4 w-4" /> Tempatkan di rak
                </Button>
              </div>
            </>
          ) : (
            <ul class="-mx-[var(--card-pad)] divide-y divide-slate-100">
              {shelves.map((shelf) => (
                <li key={shelf.locationId || 'unplaced'}>
                  {/* The pile with no rack is the one row here that is a PROBLEM rather than an
                      answer, and it used to be the only one you could do nothing about — a dead
                      button saying the thing most likely to go missing has nowhere to be. */}
                  {!shelf.location ? (
                    <div class="px-[var(--card-pad)] py-2">
                      {/* Stacked, not side by side: this card is a third of the page, and both
                          the label and the button were truncated trying to share one line. */}
                      <p class="font-bold text-slate-900">Belum ditempatkan</p>
                      <p class="text-xs text-slate-500">
                        {shelf.qty} {item.unit} belum punya rak
                      </p>
                      <Button size="sm" class="mt-2" onClick={() => setPlacing(true)}>
                        <MapPin class="h-4 w-4" /> Tempatkan
                      </Button>
                    </div>
                  ) : (
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-[var(--card-pad)] py-2 text-left hover:bg-slate-50"
                    aria-label={`Buka Rak ${shelf.location.code}`}
                    onClick={() => onNavigate({ name: 'racks', id: shelf.location!.locationId })}
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-bold text-slate-900">
                        Rak {shelf.location.code}
                      </p>
                      <p class="truncate text-xs text-slate-500">
                        {shelf.location.name || shelf.location.zone}
                      </p>
                    </div>
                    {/* Only when it is split. On a single shelf this is the headline figure
                        said twice, and a number repeated is a number to reconcile. */}
                    {shelves.length > 1 && (
                      <span class="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                        {shelf.qty}
                        <span class="ml-1 text-xs font-normal text-slate-500">{item.unit}</span>
                      </span>
                    )}
                    {/* PER ROW, not one for the card. An item kept on two racks has two shelf
                        codes, and a single QR would have to pick one — sending whoever scanned
                        it to whichever happens to be listed first. */}
                    <Suspense fallback={<div class="h-14 w-14 shrink-0" />}>
                      <ScanQr
                        url={scanUrl(location.origin + location.pathname, 'location', shelf.location.locationId)}
                        caption={`Rak ${shelf.location.code}`}
                        size={56}
                      />
                    </Suspense>
                  </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {instances.length > 0 && (
        <section class={CARD}>
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 class="font-bold text-slate-900">
              Unit berlabel <span class="font-normal text-slate-500">({instances.length})</span>
            </h2>
            <ul class="flex flex-wrap items-center gap-x-3 gap-y-1">
              {instanceTally.map(([status, n]) => {
                const chip = instanceStatusBadge(status);
                return (
                  <li key={status} class="flex items-center gap-1.5">
                    <span class={`h-2 w-2 shrink-0 rounded-full ${chip.rail}`} aria-hidden="true" />
                    <span class="text-xs text-slate-500">
                      {n} {chip.label.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Two across on a phone, then as many as fit. A fixed auto-fill alone left a lone
              card stretched the full width of a tablet, which reads as a mistake. */}
          <ul class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-3">
            {instances.map((a) => {
              const d = inventory.derived.instances[a.assetId];
              const status = d?.status ?? 'available';
              const chip = instanceStatusBadge(status);
              const seen = inspection(checks.get(a.assetId), now);
              /* Lending out and closing a loan are the two things this card is FOR, and until
                 now it was decoration: the borrowed / broken / lost states existed and nothing
                 could reach them (§60). Only these two states have a next step — a broken unit
                 goes through Pengajuan perbaikan, a lost one through a replacement purchase. */
              const actionable = onLoan && draft.canRecord !== false
                && (status === 'available' || status === 'out');
              const Row = (
                <>
                  {/* The status is the first thing read, before any word of it. */}
                  <span class={`w-1 shrink-0 rounded-full ${chip.rail}`} aria-hidden="true" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-slate-900">{a.label}</p>
                    <p class={`${CODE} truncate`}>{a.assetId}</p>
                    <span class={`${PILL} ${chip.chip} mt-2 inline-block`}>{chip.label}</span>
                    {/* WHEN it was last confirmed good, on every available unit. This is the
                        claim `available` has always been making, finally dated. */}
                    {status === 'available' && (
                      <span class={`mt-1.5 block text-[11px] ${seen.level === 'baru' ? 'text-slate-500' : 'text-amber-700'}`}>
                        {seen.level === 'belum-pernah'
                          ? 'belum pernah diperiksa'
                          : `diperiksa ${seen.days} hari lalu`}
                      </span>
                    )}
                    {actionable && (
                      <span class="mt-2 block text-xs font-semibold text-slate-700 underline underline-offset-2">
                        {status === 'available' ? 'Pinjamkan' : 'Selesaikan pinjaman'}
                      </span>
                    )}
                  </div>
                </>
              );
              const shell = 'flex items-stretch gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 text-left sm:gap-3 sm:p-3';
              return (
                <li key={a.assetId}>
                  {actionable ? (
                    <button
                      type="button"
                      class={`${shell} w-full hover:border-slate-400`}
                      onClick={() => onLoan!({
                        assetId: a.assetId,
                        label: a.label,
                        item,
                        status,
                        holder: d?.holder,
                      })}
                    >
                      {Row}
                    </button>
                  ) : (
                    <div class={shell}>{Row}</div>
                  )}
                  {/* Its OWN button, not a second meaning for the card. Lending a thing out and
                      checking it are different acts, and a card that did both depending on
                      where you tapped would be a card nobody taps confidently. */}
                  {onInspect && draft.canRecord !== false && status === 'available' && (
                    <button
                      type="button"
                      class="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900"
                      onClick={() => onInspect({
                        assetId: a.assetId, label: a.label, item, lastTs: checks.get(a.assetId) ?? null,
                      })}
                    >
                      <Eye class="h-3.5 w-3.5" /> Periksa
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Above the history, below the identity: a photo answers "is this the one?", which is a
          question asked before "what happened to it?" and after "what is it?". */}
      <ItemPhotos itemId={item.itemId} itemName={item.name} store={photos ?? localPhotos} />

      <section class={CARD_FLUSH}>
        <div class="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 p-4">
          <History class="h-4 w-4 shrink-0 text-slate-400" />
          <h2 class="text-sm font-bold text-slate-900">Riwayat</h2>
          {history.length > 0 && (
            <span class="ml-auto shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {history.length} catatan
            </span>
          )}
        </div>

        <DataTable
          columns={HISTORY}
          rows={history}
          keyOf={(t) => t.txnId}
          empty={
            <div class="px-6 py-12 text-center">
              <Package class="mx-auto mb-3 h-8 w-8 text-slate-300 opacity-40" />
              <p class="mx-auto max-w-sm text-sm italic text-slate-500">
                {inventory.offline
                  ? 'Riwayat transaksi tersimpan di gateway, yang belum terpasang.'
                  : 'Belum ada transaksi untuk barang ini.'}
              </p>
            </div>
          }
        />
      </section>

      <Sheet
        open={placing}
        title="Tempatkan di rak"
        description={item.name}
        onClose={() => setPlacing(false)}
      >
        <PlaceForm
          racks={racks}
          onPick={place}
          onCancel={() => setPlacing(false)}
          onOpenRacks={() => { setPlacing(false); onNavigate({ name: 'racks' }); }}
        />
      </Sheet>
    </div>
  );
}

/**
 * Choosing the shelf, and nothing else.
 *
 * No quantity field: whatever is in the unplaced pile moves across whole. Splitting a thing
 * between two shelves is real (§87) but it is the stock-take's job, done standing in front of
 * the racks — asking for it here, from a screen nobody opened to count anything, would put a
 * number in front of somebody who has not looked.
 */
function PlaceForm(
  { racks, onPick, onCancel, onOpenRacks }:
  {
    racks: Location[];
    onPick: (locationId: string) => void;
    onCancel: () => void;
    onOpenRacks: () => void;
  },
) {
  const [picked, setPicked] = useState('');

  // An empty dropdown reads as broken software. This is a gudang with no racks recorded yet,
  // which is a different problem and has a different next step.
  if (racks.length === 0) {
    return (
      <div>
        <p class="text-sm leading-relaxed text-slate-600">
          Belum ada rak yang terdaftar. Buat raknya dulu di Peta Rak, baru barang ini bisa
          ditempatkan.
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <Button size="touch" onClick={onOpenRacks}>Buka Peta Rak</Button>
          <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label class={LABEL} for="place-rack">Rak</label>
      <Select
        id="place-rack"
        value={picked}
        onChange={(e: Event) => setPicked((e.target as HTMLSelectElement).value)}
      >
        <option value="">Pilih raknya…</option>
        {racks.map((l) => (
          <option key={l.locationId} value={l.locationId}>
            {l.code}{l.name ? ` — ${l.name}` : ''}{l.zone ? ` (${l.zone})` : ''}
          </option>
        ))}
      </Select>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button size="touch" disabled={picked === ''} onClick={() => onPick(picked)}>
          <MapPin class="h-5 w-5" /> Tempatkan
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>

      <p class="mt-4 text-xs leading-relaxed text-slate-500">
        Jumlah yang sudah tercatat ikut pindah ke rak ini. Kalau ternyata tersebar di beberapa
        rak, sesuaikan lewat Cek rak.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div class="min-w-0">
      <dt class="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd class="truncate text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
