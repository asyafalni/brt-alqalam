// Pengajuan Pembelian — asking for something the masjid does not have yet.
//
// The screen exists because of §0's third problem: the takmir cannot see that BRT's assets are
// being managed. A list of what is needed, with a reason and a price beside each line, is the
// most direct answer to that anybody asked for — and unlike the stock screens it is written to
// be read by somebody who does not use this app day to day.
//
// A request is NOT stock. It becomes stock at exactly one moment, when somebody marks it
// bought, and that moment is a form rather than a toggle: buying decides where it goes and, for
// something new, what it is. Everything before that moment lives only here.

import { useMemo, useState } from 'octane';
import { Check, ExternalLink, Plus, ShoppingCart, X } from '@octanejs/lucide';
import {
  addToStock, openRequests, openTotal, purchaseIntoStock, requestTotal, sortRequests,
  validateRequest,
} from '../../../../domain/requests';
import type { PurchaseRequest, RequestStatus } from '../../../../domain/requests';
import type { Item } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import { Button, CARD, ERROR_TEXT, FIELD, LABEL, PageHeader, Select, Stat } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { createItem } from '../stocktake/draft';
import { RequestForm } from './RequestForm';
import { RequestPhotos } from './RequestPhotos';

/** Rupiah, grouped the way the country writes it. */
export const rupiah = (n: number): string => `Rp${n.toLocaleString('id-ID')}`;

const STATUS: Record<RequestStatus, { label: string; chip: string; rail: string }> = {
  diajukan: {
    label: 'Diajukan',
    chip: 'bg-amber-50 text-amber-700 border border-amber-200',
    rail: 'bg-amber-500',
  },
  dibeli: {
    label: 'Sudah dibeli',
    chip: 'bg-green-50 text-green-700 border border-green-200',
    rail: 'bg-green-500',
  },
  ditolak: {
    label: 'Tidak jadi',
    chip: 'bg-slate-100 text-slate-600 border border-slate-300',
    rail: 'bg-slate-400',
  },
};

const when = (ts: number) =>
  new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export function RequestBoard(
  { draft, now, actor = 'USR-DEMO' }: { draft: Draft; now: number; actor?: string },
) {
  const { requests, setRequests, setPurchase } = draft;

  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState<PurchaseRequest | null>(null);
  const [rejecting, setRejecting] = useState<PurchaseRequest | null>(null);

  const rows = useMemo(() => sortRequests(requests), [requests]);
  const open = useMemo(() => openRequests(requests), [requests]);
  const money = useMemo(() => openTotal(requests), [requests]);

  function submit(input: Parameters<typeof validateRequest>[0] & { itemId?: string }) {
    const id = `REQ-${String(requests.length + 1).padStart(4, '0')}`;
    setRequests((prev) => [...prev, {
      requestId: id,
      name: input.name.trim(),
      qty: input.qty,
      unit: input.unit.trim(),
      reason: input.reason.trim(),
      status: 'diajukan',
      requestedBy: actor,
      requestedTs: Date.now(),
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.price != null ? { price: input.price } : {}),
      ...(input.url && input.url.trim() !== '' ? { url: input.url.trim() } : {}),
    }]);
    setAdding(false);
  }

  /**
   * The one moment a request turns into stock.
   *
   * Written as a single update across items, stock and requests, because a half-applied
   * purchase — an item created but its quantity missing, or a request marked bought with
   * nothing added — is a register that lies in a way nobody would think to check.
   */
  function markBought(
    request: PurchaseRequest,
    locationId: string,
    fallback: { categoryId: string; kind: Item['kind']; minStock: number | null },
    note: string,
  ) {
    const plan = purchaseIntoStock(request, locationId, fallback);
    setPurchase((prev) => {
      let items = prev.items;
      let itemId = plan.add.itemId;

      if (plan.newItem) {
        // Built through `createItem` so the id and barcode are formed exactly as the stock-take
        // forms them — a second way of minting an id is a second way of getting it wrong.
        const created = createItem({
          name: plan.newItem.name,
          categoryId: plan.newItem.categoryId,
          unit: plan.newItem.unit,
          kind: plan.newItem.kind,
          initialStock: 0,
          minStock: plan.newItem.minStock,
        }, prev.items);
        items = [...prev.items, created];
        itemId = created.itemId;
      }

      return {
        items,
        stock: itemId ? addToStock(prev.stock, itemId, locationId, plan.add.qty) : prev.stock,
        requests: prev.requests.map((r) => (r.requestId === request.requestId
          ? {
            ...r,
            status: 'dibeli' as const,
            decidedBy: actor,
            decidedTs: Date.now(),
            ...(itemId ? { itemId } : {}),
            ...(note.trim() !== '' ? { note: note.trim() } : {}),
          }
          : r)),
      };
    });
    setBuying(null);
  }

  function reject(request: PurchaseRequest, note: string) {
    setRequests((prev) => prev.map((r) => (r.requestId === request.requestId
      ? {
        ...r,
        status: 'ditolak' as const,
        decidedBy: actor,
        decidedTs: Date.now(),
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      }
      : r)));
    setRejecting(null);
  }

  return (
    <div class="space-y-4 pb-8 pt-4 sm:space-y-6 sm:pt-6">
      <PageHeader
        title="Pengajuan Pembelian"
        subtitle="Barang yang diminta untuk dibeli — beserta alasan, perkiraan harga dan tautannya."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus class="h-4 w-4" /> Ajukan barang
          </Button>
        }
      />

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <Stat value={open.length} label="Menunggu diputuskan" tint={open.length > 0 ? 'bg-amber-50 text-amber-600' : undefined} />
        <Stat
          value={requests.filter((r) => r.status === 'dibeli').length}
          label="Sudah dibeli"
          tint="bg-green-50 text-green-600"
        />
        {/* The number a takmir meeting actually asks for, with its own honesty note attached:
            requests with no price are counted separately rather than folded in as zero. */}
        <div class={`${CARD} col-span-2 sm:col-span-1`}>
          <p class="text-xl font-bold tabular-nums text-slate-900">{rupiah(money.total)}</p>
          <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Perkiraan biaya
          </p>
          {money.unpriced > 0 && (
            <p class="mt-1 text-xs text-slate-400">
              {money.unpriced} pengajuan belum ada harganya
            </p>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <ShoppingCart class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada pengajuan.</p>
          <p class="mx-auto mb-5 max-w-md text-sm text-slate-500">
            Kalau ada barang yang perlu dibeli — habis, rusak, atau memang belum punya —
            ajukan di sini supaya pengurus tahu dan bisa memutuskan.
          </p>
          <Button size="touch" onClick={() => setAdding(true)}>
            <Plus class="h-5 w-5" /> Ajukan barang
          </Button>
        </div>
      ) : (
        <ul class="space-y-3">
          {rows.map((r) => {
            const skin = STATUS[r.status];
            const total = requestTotal(r);
            return (
              <li key={r.requestId} class={`${CARD} flex gap-3 p-0`}>
                <span class={`w-1.5 shrink-0 rounded-l-lg ${skin.rail}`} aria-hidden="true" />
                <div class="min-w-0 flex-1 py-4 pr-4 sm:pr-5">
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 class="text-base font-bold text-slate-900">{r.name}</h2>
                    <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${skin.chip}`}>
                      {skin.label}
                    </span>
                    <span class="ml-auto text-xs text-slate-400 tabular-nums">
                      {when(r.requestedTs)}
                    </span>
                  </div>

                  <p class="mt-0.5 text-sm tabular-nums text-slate-500">
                    {r.qty} {r.unit}
                    {r.price != null && (
                      <>
                        {' · '}{rupiah(r.price)}/{r.unit}
                        {total != null && <span class="font-semibold text-slate-900"> · {rupiah(total)}</span>}
                      </>
                    )}
                    {r.itemId && <span class="text-slate-400"> · tambah stok yang sudah ada</span>}
                  </p>

                  {/* The reason gets its own line and its own weight. A price without a reason
                      is a number nobody can judge, which is the whole failure this screen is
                      meant to prevent. */}
                  <p class="mt-2 text-sm leading-relaxed text-slate-700">{r.reason}</p>

                  <RequestPhotos requestId={r.requestId} name={r.name} />

                  {r.note && (
                    <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span class="font-semibold">Catatan:</span> {r.note}
                    </p>
                  )}

                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-400 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <ExternalLink class="h-4 w-4" /> Lihat tautan
                      </a>
                    )}
                    {r.status === 'diajukan' && (
                      <>
                        <Button size="sm" class="min-h-11" onClick={() => setBuying(r)}>
                          <Check class="h-4 w-4" /> Sudah dibeli
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          class="min-h-11"
                          onClick={() => setRejecting(r)}
                        >
                          <X class="h-4 w-4" /> Tidak jadi
                        </Button>
                      </>
                    )}
                    {r.status !== 'diajukan' && r.decidedTs && (
                      <span class="text-xs text-slate-400">
                        Diputuskan {when(r.decidedTs)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={adding}
        title="Ajukan barang"
        description="Pengurus akan melihat ini di Beranda."
        onClose={() => setAdding(false)}
      >
        <RequestForm items={draft.items} onSubmit={submit} onCancel={() => setAdding(false)} />
      </Sheet>

      <Sheet
        open={buying !== null}
        title="Tandai sudah dibeli"
        description={buying?.name}
        onClose={() => setBuying(null)}
      >
        {buying && (
          <BoughtForm
            request={buying}
            draft={draft}
            onConfirm={(locationId, fallback, note) => markBought(buying, locationId, fallback, note)}
            onCancel={() => setBuying(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={rejecting !== null}
        title="Tidak jadi dibeli"
        description={rejecting?.name}
        onClose={() => setRejecting(null)}
      >
        {rejecting && <RejectForm onConfirm={(note) => reject(rejecting, note)} onCancel={() => setRejecting(null)} />}
      </Sheet>
    </div>
  );
}

/**
 * What buying decides.
 *
 * A restock only needs a rack. Something new also needs what the stock-take would have asked:
 * a category, whether it can run out, and a minimum. Those are asked HERE rather than left for
 * somebody to fix later, because an item created with no category is an item that will sit in
 * "Lain-lain" forever.
 */
function BoughtForm(
  { request, draft, onConfirm, onCancel }:
  {
    request: PurchaseRequest;
    draft: Draft;
    onConfirm: (
      locationId: string,
      fallback: { categoryId: string; kind: Item['kind']; minStock: number | null },
      note: string,
    ) => void;
    onCancel: () => void;
  },
) {
  const isNew = !request.itemId;
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState(draft.categories[0]?.categoryId ?? '');
  const [kind, setKind] = useState<Item['kind']>('consumable');
  const [note, setNote] = useState('');

  const existing = draft.items.find((i) => i.itemId === request.itemId);

  return (
    <div>
      <p class="mb-4 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2.5 text-sm text-green-800">
        {request.qty} {request.unit} <strong>{request.name}</strong>{' '}
        {existing ? 'akan ditambahkan ke stok yang sudah ada.' : 'akan dicatat sebagai barang baru.'}
      </p>

      <label class={LABEL} for="bought-rak">Ditaruh di rak</label>
      <Select
        id="bought-rak"
        value={locationId}
        onChange={(e: Event) => setLocationId((e.target as HTMLSelectElement).value)}
      >
        <option value="">Belum ditempatkan</option>
        {draft.locations.filter((l) => l.active).map((l) => (
          <option key={l.locationId} value={l.locationId}>
            {l.code}{l.name ? ` — ${l.name}` : ''} · {l.zone}
          </option>
        ))}
      </Select>

      {isNew && (
        <>
          <div class="mt-4">
            <label class={LABEL} for="bought-kategori">Kategori</label>
            <Select
              id="bought-kategori"
              value={categoryId}
              onChange={(e: Event) => setCategoryId((e.target as HTMLSelectElement).value)}
            >
              {draft.categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </Select>
          </div>

          <div class="mt-4">
            <span class={LABEL}>Jenis barang</span>
            <div class="grid gap-2 sm:grid-cols-2">
              {([
                ['consumable', 'Bisa habis', 'Dihitung, bisa habis'],
                ['equipment', 'Barang tetap', 'Tetap ada, bisa rusak / hilang'],
              ] as const).map(([value, title, note2]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  class={`min-h-touch rounded-lg border px-4 py-2 text-left ${
                    kind === value ? 'border-slate-900 bg-slate-900/5' : 'border-slate-400 bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => setKind(value)}
                >
                  <span class="block font-bold text-slate-900">{title}</span>
                  <span class="block text-xs text-slate-500">{note2}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div class="mt-4">
        <label class={LABEL} for="bought-note">Catatan (opsional)</label>
        <input
          id="bought-note"
          class={`${FIELD} min-h-touch`}
          value={note}
          placeholder="Dibeli di toko depan masjid"
          onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button
          size="touch"
          onClick={() => onConfirm(locationId, { categoryId, kind, minStock: null }, note)}
        >
          <Check class="h-5 w-5" /> Catat sebagai stok
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>

      <p class="mt-4 text-xs leading-relaxed text-slate-400">
        Setelah ini barangnya masuk ke daftar stok dan pengajuan ini ditandai sudah dibeli.
      </p>
    </div>
  );
}

/** Turning one down. The note is the whole point — "tidak jadi" without a why gets re-asked. */
function RejectForm(
  { onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void },
) {
  const [note, setNote] = useState('');
  return (
    <div>
      <label class={LABEL} for="reject-note">Alasannya</label>
      <input
        id="reject-note"
        class={`${FIELD} min-h-touch`}
        value={note}
        placeholder="Belum masuk anggaran tahun ini"
        onInput={(e: Event) => setNote((e.target as HTMLInputElement).value)}
      />
      <p class={ERROR_TEXT} hidden={note.trim() !== ''}>
        Tanpa alasan, pengajuan yang sama akan diajukan lagi bulan depan.
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button size="touch" variant="danger" disabled={note.trim() === ''} onClick={() => onConfirm(note)}>
          Tandai tidak jadi
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  );
}
