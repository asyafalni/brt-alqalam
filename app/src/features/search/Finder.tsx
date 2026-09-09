// The navbar search, on every screen that is not itself a list.
//
// Where there IS a list — Opname, Stok, Peta Rak, Aset, Histori — the field narrows it in
// place, which is the right behaviour when you are already looking at the rows. On Beranda,
// Laporan, Pengajuan, Kelola and the detail screens there was nothing to narrow, so the field
// did nothing at all. A control present on every screen that works on only some of them is
// worse than one that is missing: you cannot tell which kind of screen you are on until after
// you have typed, so the honest reading is that search is broken.
//
// It finds BOTH barang and rak, because "where is the soap" and "what is on A1" are the same
// question asked from opposite ends, and §0's premise is that neither is answerable today.

import { MapPin, Package, Search, ShoppingCart, X } from '@octanejs/lucide';
import type { Category, Item, Location } from '../../../../domain/types';
import type { PurchaseRequest } from '../../../../domain/requests';
import type { Inventory } from '../../state/useInventory';
import { ItemArt, artFor } from '../items/ItemArt';
import { RackArt, rackArtFor } from '../racks/RackArt';
import { CARD, CODE } from '../../components/ui';
import { REQUEST_STATUS_LABEL } from '../../components/format';

/**
 * Below two letters this is not a search, it is the catalog in a different order. One letter
 * matches most of the gudang, and a list of everything answers nothing.
 */
export const MIN_QUERY = 2;

/** A found list is for picking from, not for reading. Past a screenful it stops helping. */
const LIMIT = 8;

const norm = (s: string) => s.toLowerCase().trim();

export interface FinderProps {
  query: string;
  items: Item[];
  categories: Category[];
  locations: Location[];
  inventory: Inventory;
  /**
   * Requests, and ONLY for somebody allowed to read them.
   *
   * Every row names a person — who asked, who decided — which is why the public tier omits the
   * tab entirely (§39). Passing an empty list for everybody else is not a permission check
   * pretending to be one: the gateway already withheld the data, and this is the screen
   * declining to invent a section for rows it does not have.
   */
  requests?: PurchaseRequest[];
  onOpenItem: (itemId: string) => void;
  onOpenRack: (locationId: string) => void;
  onOpenRequests: () => void;
  onClear: () => void;
}

export function Finder(p: FinderProps) {
  const q = norm(p.query);

  if (q.length < MIN_QUERY) {
    return (
      <Frame query={p.query} onClear={p.onClear}>
        <p class="text-sm text-slate-600">Ketik minimal dua huruf.</p>
      </Frame>
    );
  }

  /* Barcode as well as name: somebody typing a code off a sticker that will not scan is
     exactly the person who most needs to find the thing by hand. */
  const foundItems = p.items
    .filter((i) => i.active && (norm(i.name).includes(q) || norm(i.barcode).includes(q)))
    .slice(0, LIMIT);

  /* Code first, and it matters more than the name — "A1" is what is painted on the shelf and
     what a person actually says out loud. */
  const foundRacks = p.locations
    .filter((l) => l.active && (
      norm(l.code).includes(q) || norm(l.name).includes(q) || norm(l.zone).includes(q)
    ))
    .slice(0, LIMIT);

  /* Name and reason both. "Kenapa kita beli itu" is asked at least as often as "what was it
     called", and the reason is the field this screen exists for (§95). */
  const foundRequests = (p.requests ?? [])
    .filter((r) => norm(r.name).includes(q) || norm(r.reason).includes(q))
    .slice(0, LIMIT);

  const categoryName = (id: string) => p.categories.find((c) => c.categoryId === id)?.name ?? '';

  if (foundItems.length === 0 && foundRacks.length === 0 && foundRequests.length === 0) {
    return (
      <Frame query={p.query} onClear={p.onClear}>
        <div class="py-8 text-center">
          <Search class="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p class="font-semibold text-slate-900">Tidak ada yang cocok.</p>
          <p class="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            Coba sebagian namanya saja, atau kode raknya seperti{' '}
            <span class="font-mono font-semibold">A1</span>.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame query={p.query} onClear={p.onClear}>
      <div class="space-y-6">
        {/* A named region, so a screen reader can jump from the barang to the racks instead
            of walking every row of the first to reach the second. */}
        {foundItems.length > 0 && (
          <section aria-label="Barang">
            <Heading icon={<Package class="h-3.5 w-3.5" />} label="Barang" n={foundItems.length} />
            <ul class="space-y-2">
              {foundItems.map((i) => {
                const d = p.inventory.derived.items[i.itemId];
                /* Where it is, on the row. "We own twelve" does not help somebody standing in
                   the gudang; the rack is the answer they came for (§84), and making them tap
                   through to find it is the tap this screen exists to remove. */
                const racks = Object.entries(d?.byLocation ?? {})
                  .filter(([id, n]) => id !== '' && n !== 0)
                  .map(([id]) => p.locations.find((l) => l.locationId === id)?.code ?? '?');
                return (
                  <li key={i.itemId}>
                    <button
                      type="button"
                      class={`${CARD} flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-slate-400`}
                      onClick={() => p.onOpenItem(i.itemId)}
                    >
                      <ItemArt art={artFor(i, categoryName(i.categoryId))} size={36} />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-semibold text-slate-900">{i.name}</span>
                        <span class="block truncate text-xs text-slate-600">
                          {racks.length > 0 ? racks.join(', ') : 'Belum ditempatkan'}
                        </span>
                      </span>
                      <span class="shrink-0 text-right">
                        <span class="block font-bold tabular-nums text-slate-900">{d?.qty ?? 0}</span>
                        <span class={CODE}>{i.unit}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {foundRequests.length > 0 && (
          <section aria-label="Pengajuan">
            <Heading
              icon={<ShoppingCart class="h-3.5 w-3.5" />}
              label="Pengajuan"
              n={foundRequests.length}
            />
            <ul class="space-y-2">
              {foundRequests.map((r) => (
                <li key={r.requestId}>
                  <button
                    type="button"
                    class={`${CARD} flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-slate-400`}
                    onClick={p.onOpenRequests}
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-semibold text-slate-900">{r.name}</span>
                      {/* The reason, not the price: a request is judged on why, and the number
                          means nothing without it (§95). */}
                      <span class="block truncate text-xs text-slate-600">{r.reason}</span>
                    </span>
                    <span class={`${CODE} shrink-0`}>{REQUEST_STATUS_LABEL[r.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {foundRacks.length > 0 && (
          <section aria-label="Rak">
            <Heading icon={<MapPin class="h-3.5 w-3.5" />} label="Rak" n={foundRacks.length} />
            <ul class="space-y-2">
              {foundRacks.map((l) => (
                <li key={l.locationId}>
                  <button
                    type="button"
                    class={`${CARD} flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-slate-400`}
                    onClick={() => p.onOpenRack(l.locationId)}
                  >
                    <RackArt art={rackArtFor(l)} size={36} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-semibold text-slate-900">{l.code}</span>
                      <span class="block truncate text-xs text-slate-600">{l.name}</span>
                    </span>
                    <span class={`${CODE} shrink-0`}>{l.zone}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Frame>
  );
}

/**
 * The results REPLACE the screen, so it has to say so and offer the way back.
 *
 * Leaving the page underneath and floating a panel over it was the other option; this is
 * simpler and truer — you asked a question, this is the answer, and clearing the field puts
 * you back exactly where you were, since nothing navigated.
 */
function Frame(
  { query, onClear, children }: { query: string; onClear: () => void; children: unknown },
) {
  return (
    <div class="space-y-4 pt-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="min-w-0 truncate text-xl font-bold text-slate-900">
          Hasil untuk “<span class="text-slate-700">{query.trim()}</span>”
        </h1>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-500 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-900 hover:text-slate-900"
          onClick={onClear}
        >
          <X class="h-4 w-4" />
          Tutup
        </button>
      </div>
      {children}
    </div>
  );
}

function Heading({ icon, label, n }: { icon: unknown; label: string; n: number }) {
  return (
    <h2 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
      {icon} {label}
      <span class="font-mono normal-case tracking-normal text-slate-500">{n}</span>
    </h2>
  );
}
