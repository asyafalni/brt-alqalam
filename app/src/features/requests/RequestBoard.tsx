// Pengajuan — one list of everything somebody is asking money for.
//
// The screen exists because of §0's third problem: the takmir cannot see that BRT's assets are
// being managed. A list of what is needed, with a reason and a price beside each line, is the
// most direct answer to that anybody asked for — and unlike the stock screens it is written to
// be read by somebody who does not use this app day to day.
//
// Buying and repairing share it, and that is deliberate. To whoever signs off, "beli pisau baru
// 95rb" and "servis mesin potong rumput 185rb" are the same question asked twice; splitting them
// across two screens would mean two lists to check and a standing argument about which one a
// thing belongs on.
//
// A request is NOT stock. A purchase becomes stock at exactly one moment, when somebody marks it
// bought, and that moment is a form rather than a toggle: buying decides where it goes and, for
// something new, what it is. A repair never becomes stock at all — it hands one unit back to
// the shelf, as an appended `status_change`.

import { useMemo, useState } from 'octane';
import { Check, ExternalLink, EyeOff, Pencil, Plus, ShoppingCart, Wrench, X } from '@octanejs/lucide';
import {
  addToStock, openRequests, openTotal, purchaseIntoStock, repairDone, requestTotal, sortRequests,
} from '../../../../domain/requests';
import type { PurchaseRequest, RequestStatus, RequestType } from '../../../../domain/requests';
import type { Item } from '../../../../domain/types';
import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';
import { Button, CARD, ERROR_TEXT, FIELD, LABEL, PageHeader, Select, Stat } from '../../components/ui';
import { Sheet } from '../../components/Sheet';
import { createItem } from '../stocktake/draft';
import { RequestForm } from './RequestForm';
import type { RequestInput } from './RequestForm';
import { artFor, ItemArt } from '../items/ItemArt';
import { discardPhotos, RequestThumb } from './RequestPhotos';

/** Rupiah, grouped the way the country writes it. */
export const rupiah = (n: number): string => `Rp${n.toLocaleString('id-ID')}`;

const STATUS: Record<RequestStatus, { label: string; chip: string; rail: string }> = {
  diajukan: {
    label: 'Diajukan',
    chip: 'bg-amber-50 text-amber-700 border border-amber-200',
    rail: 'bg-amber-500',
  },
  selesai: {
    label: 'Selesai',
    chip: 'bg-green-50 text-green-700 border border-green-200',
    rail: 'bg-green-500',
  },
  dibatalkan: {
    label: 'Dibatalkan',
    chip: 'bg-slate-100 text-slate-600 border border-slate-300',
    rail: 'bg-slate-400',
  },
};

/**
 * The words that differ between the two kinds, in one place.
 *
 * They are worth getting right rather than settling on a neutral "selesai" everywhere: "sudah
 * dibeli" and "sudah diperbaiki" are what somebody would actually say, and a screen that talks
 * the way its readers do is read.
 */
const KIND: Record<RequestType, {
  label: string; chip: string; icon: (p: { class?: string }) => unknown;
  done: string; undone: string;
}> = {
  beli: {
    label: 'Beli',
    chip: 'bg-sky-50 text-sky-700 border border-sky-200',
    icon: ShoppingCart,
    done: 'Sudah dibeli',
    undone: 'Batalkan pembelian',
  },
  perbaikan: {
    label: 'Perbaikan',
    chip: 'bg-orange-50 text-orange-700 border border-orange-200',
    icon: Wrench,
    done: 'Sudah diperbaiki',
    undone: 'Batalkan perbaikan',
  },
};

const when = (ts: number) =>
  new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Row actions as icons, right-aligned.
 *
 * Four labelled buttons wrapped to their own line and made every card twice as tall as the
 * thing it was describing — on a list somebody scrolls to find one row, that is a lot of
 * furniture. The label moves to `aria-label` and `title`, so it is still there for a screen
 * reader and for a hover; the icons are conventional enough (tick, cross, pencil) to carry
 * the meaning at a glance.
 */
const ICON_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors';
const ICON_SECONDARY = `${ICON_BTN} border-slate-400 text-slate-600 hover:border-slate-900 hover:bg-slate-100 hover:text-slate-900`;
const ICON_PRIMARY = `${ICON_BTN} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`;

export function RequestBoard(
  { draft, inventory, now, actor = 'USR-DEMO', prefill, onPrefillUsed, withheld = false }:
  {
    draft: Draft; inventory: Inventory; now: number; actor?: string;
    /** Set when the screen was opened from a broken or lost unit on the Aset page. */
    prefill?: { type: RequestType; assetId: string };
    onPrefillUsed?: () => void;
    /**
     * True when this device is reading the PII-free tier, which carries no requests at all.
     * Distinguishes "nobody has asked for anything" from "you are not allowed to see this".
     */
    withheld?: boolean;
  },
) {
  const { requests, setRequests, setPurchase, setRepair, finishRequest } = draft;

  // The sheet opens by itself when arrived at from Aset: the click that got here already said
  // "ajukan", and asking for it a second time is the tap §0.0 exists to remove.
  const [adding, setAdding] = useState(prefill != null);
  const [buying, setBuying] = useState<PurchaseRequest | null>(null);
  const [rejecting, setRejecting] = useState<PurchaseRequest | null>(null);
  const [editing, setEditing] = useState<PurchaseRequest | null>(null);
  /* The row's strip and the form keep separate copies of the photo list, so closing the form
     bumps this to make the rows re-read. Cheaper than lifting IndexedDB state for a list that
     changes once in a while. */
  const [photoVersion, setPhotoVersion] = useState(0);

  const rows = useMemo(() => sortRequests(requests), [requests]);
  const open = useMemo(() => openRequests(requests), [requests]);
  const money = useMemo(() => openTotal(requests), [requests]);

  const instances = useMemo(
    () => Object.values(inventory.derived.instances),
    [inventory.derived.instances],
  );

  /* The reducer keeps status and holder, not the note that came with them, so the last
     transaction touching the unit is read back for the "why" — which is the sentence the form
     writes into the reason. Same lookup Aset does for its Catatan column. */
  const formPrefill = useMemo(() => {
    if (!prefill) return undefined;
    for (let i = inventory.txns.length - 1; i >= 0; i -= 1) {
      const t = inventory.txns[i];
      if (t.assetId === prefill.assetId && t.note) return { ...prefill, note: t.note };
    }
    return prefill;
  }, [prefill, inventory.txns]);

  /**
   * The id the next request will get, minted BEFORE the form opens.
   *
   * Highest so far plus one, not the count: turning down a request does not remove it, so a
   * count-based id starts colliding the moment anything is deleted or seeded unevenly. It is
   * needed up front because photos are attached inside the form and have to be keyed to
   * something — an abandoned draft's photos are thrown away on cancel.
   */
  const draftId = useMemo(() => {
    const highest = requests.reduce((max, r) => {
      const n = Number(/(\d+)$/.exec(r.requestId)?.[1] ?? 0);
      return n > max ? n : max;
    }, 0);
    return `REQ-${String(highest + 1).padStart(4, '0')}`;
  }, [requests]);

  /**
   * The drawing a request wears when it has no photo.
   *
   * A restock borrows its item's, so the row looks like the same thing it will become. A new
   * thing has only the words somebody typed, which is exactly what `artFor` resolves from —
   * unit first, then name — so "3 roll karpet" gets a roll without anybody choosing one.
   */
  function artOf(r: PurchaseRequest) {
    const item = r.itemId ? draft.items.find((i) => i.itemId === r.itemId) : undefined;
    if (item) {
      const category = draft.categories.find((c) => c.categoryId === item.categoryId)?.name ?? '';
      return artFor(item, category);
    }
    return artFor({
      name: r.name,
      unit: r.unit,
      kind: r.type === 'perbaikan' ? 'equipment' : 'consumable',
    });
  }

  function closeForm() {
    setAdding(false);
    onPrefillUsed?.();
  }

  /** Cancelling a NEW request means it never existed, so neither should its photos. */
  function abandonForm() {
    void discardPhotos(draftId);
    closeForm();
  }

  function closeEdit() {
    setEditing(null);
    setPhotoVersion((n) => n + 1);
  }

  /**
   * Save an edit.
   *
   * Only the description changes. `status`, `requestedBy`, `requestedTs` and the whole decision
   * — who closed it, when, with what note — are the record of what happened rather than fields
   * somebody is editing, so they carry through untouched.
   */
  function saveEdit(target: PurchaseRequest, input: RequestInput) {
    setRequests((prev) => prev.map((r) => (r.requestId === target.requestId
      ? {
        ...r,
        type: input.type,
        name: input.name.trim(),
        qty: input.qty,
        unit: input.unit.trim(),
        reason: input.reason.trim(),
        /* Assigned, not merged: clearing the price or the link has to mean "we no longer
           know", and spreading only the present keys would silently keep the old value. */
        itemId: input.itemId,
        assetId: input.assetId,
        price: input.price,
        url: input.url && input.url.trim() !== '' ? input.url.trim() : undefined,
      }
      : r)));
    closeEdit();
  }

  function submit(input: RequestInput) {
    setRequests((prev) => [...prev, {
      requestId: draftId,
      type: input.type,
      name: input.name.trim(),
      qty: input.qty,
      unit: input.unit.trim(),
      reason: input.reason.trim(),
      status: 'diajukan',
      requestedBy: actor,
      requestedTs: Date.now(),
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.assetId ? { assetId: input.assetId } : {}),
      ...(input.price != null ? { price: input.price } : {}),
      ...(input.url && input.url.trim() !== '' ? { url: input.url.trim() } : {}),
    }]);
    closeForm();
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
            status: 'selesai' as const,
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

  /**
   * Finishing a repair, which is the mirror of buying and not a smaller version of it.
   *
   * Nothing is added — the unit was always ours. What changes is its status, appended to the
   * log so the break stays in its history. Closing the request without that would leave the
   * register saying a thing is broken that is, by then, back on its hook.
   */
  function markRepaired(request: PurchaseRequest, note: string) {
    /* Connected, this is one gateway call that closes the request AND appends the status
       change — the two facts must not separate, and `setRepair` cannot write to the log at all.
       Offline, the local draft does both in one state update, which is the same guarantee by
       different means. */
    if (finishRequest) {
      const txn = repairDone(request, actor, Date.now());
      finishRequest({
        requestId: request.requestId,
        status: 'selesai',
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
        ...(txn?.assetId ? { assetId: txn.assetId, toStatus: txn.toStatus ?? 'available' } : {}),
        ...(request.itemId ? { itemId: request.itemId } : {}),
      });
      setBuying(null);
      return;
    }
    setRepair((prev) => {
      const txn = repairDone(request, actor, Date.now());
      return {
        txns: txn ? [...prev.txns, txn] : prev.txns,
        requests: prev.requests.map((r) => (r.requestId === request.requestId
          ? {
            ...r,
            status: 'selesai' as const,
            decidedBy: actor,
            decidedTs: Date.now(),
            ...(note.trim() !== '' ? { note: note.trim() } : {}),
          }
          : r)),
      };
    });
    setBuying(null);
  }

  function reject(request: PurchaseRequest, note: string) {
    if (finishRequest) {
      finishRequest({
        requestId: request.requestId,
        status: 'dibatalkan',
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      });
      setRejecting(null);
      return;
    }
    setRequests((prev) => prev.map((r) => (r.requestId === request.requestId
      ? {
        ...r,
        status: 'dibatalkan' as const,
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
        title="Pengajuan"
        subtitle="Yang diminta untuk dibeli atau diperbaiki — beserta alasan, perkiraan biaya dan tautannya."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus class="h-4 w-4" /> Ajukan
          </Button>
        }
      />

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <Stat value={open.length} label="Menunggu diputuskan" tint={open.length > 0 ? 'bg-amber-50 text-amber-600' : undefined} />
        <Stat
          value={requests.filter((r) => r.status === 'selesai').length}
          label="Sudah selesai"
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

      {rows.length === 0 && withheld ? (
        /*
         * "Empty" and "withheld" are not the same thing, and a screen that shows the first when
         * it means the second teaches people the register has lost their data. Pengajuan rows
         * name who asked, who decided and why (§39), so the public tier does not carry them at
         * all — the sheet can hold seven of them while this device is shown none.
         */
        <div class={`${CARD} py-16 text-center`}>
          <EyeOff class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Pengajuan tidak ditampilkan di sini.</p>
          <p class="mx-auto max-w-md text-sm text-slate-500">
            Isinya menyebut nama orang — siapa mengajukan dan siapa memutuskan — jadi perangkat
            yang hanya membaca tidak menerimanya. Masuk sebagai admin lewat menu
            <strong> Admin</strong>, atau buka sesi dengan PIN, untuk melihat dan mengubahnya.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div class={`${CARD} py-20 text-center`}>
          <ShoppingCart class="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p class="mb-1 font-semibold text-slate-700">Belum ada pengajuan.</p>
          <p class="mx-auto mb-5 max-w-md text-sm text-slate-500">
            Kalau ada yang perlu dibeli — habis atau memang belum punya — atau ada yang rusak
            dan masih bisa diperbaiki, ajukan di sini supaya pengurus tahu dan bisa memutuskan.
          </p>
          <Button size="touch" onClick={() => setAdding(true)}>
            <Plus class="h-5 w-5" /> Ajukan
          </Button>
        </div>
      ) : (
        <ul class="space-y-3">
          {rows.map((r) => {
            const skin = STATUS[r.status];
            const kind = KIND[r.type];
            const KindIcon = kind.icon;
            const total = requestTotal(r);
            return (
              <li key={r.requestId} class={`${CARD} flex gap-3 p-0`}>
                <span class={`w-1.5 shrink-0 rounded-l-lg ${skin.rail}`} aria-hidden="true" />
                {/* Wraps below `sm`, where a fixed action column would squeeze the text into
                    a two-word ribbon. */}
                <div class="flex min-w-0 flex-1 flex-wrap items-start gap-3 py-4 pr-4 sm:flex-nowrap sm:pr-5">
                  <RequestThumb
                    requestId={r.requestId}
                    name={r.name}
                    refreshKey={photoVersion}
                    fallback={<ItemArt art={artOf(r)} size={36} />}
                  />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 class="text-base font-bold text-slate-900">{r.name}</h2>
                    {/* Which kind comes before which state: "perbaikan" changes how every
                        other figure on the row should be read. */}
                    <span class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${kind.chip}`}>
                      <KindIcon class="h-3 w-3" /> {kind.label}
                    </span>
                    <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${skin.chip}`}>
                      {skin.label}
                    </span>
                  </div>

                  {/* The date sits here rather than hanging off the right: it is part of
                      what this request IS, and pinned opposite the title it read as a column
                      heading for the actions underneath it. */}
                  {r.type === 'perbaikan' ? (
                    <p class="mt-0.5 text-sm tabular-nums text-slate-500">
                      {r.assetId && <span class="font-mono text-xs">{r.assetId}</span>}
                      {total != null && (
                        <span class="font-semibold text-slate-900">
                          {r.assetId ? ' · ' : ''}{rupiah(total)}
                        </span>
                      )}
                      <span class="text-slate-400"> · {when(r.requestedTs)}</span>
                    </p>
                  ) : (
                    <p class="mt-0.5 text-sm tabular-nums text-slate-500">
                      {r.qty} {r.unit}
                      {r.price != null && (
                        <>
                          {' · '}{rupiah(r.price)}/{r.unit}
                          {total != null && <span class="font-semibold text-slate-900"> · {rupiah(total)}</span>}
                        </>
                      )}
                      {r.itemId && <span class="text-slate-400"> · tambah stok yang sudah ada</span>}
                      {/* A replacement says what it replaces: that is what turns the loss log
                          into a procurement list somebody can close out. */}
                      {r.assetId && <span class="text-slate-400"> · pengganti {r.assetId}</span>}
                      <span class="text-slate-400"> · {when(r.requestedTs)}</span>
                    </p>
                  )}

                  {/* The reason gets its own line and its own weight. A price without a reason
                      is a number nobody can judge, which is the whole failure this screen is
                      meant to prevent. */}
                  <p class="mt-2 text-sm leading-relaxed text-slate-700">{r.reason}</p>

                  {r.note && (
                    <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span class="font-semibold">Catatan:</span> {r.note}
                    </p>
                  )}

                  {r.status !== 'diajukan' && r.decidedTs && (
                    <p class="mt-2 text-xs text-slate-400">Diputuskan {when(r.decidedTs)}</p>
                  )}
                </div>

                {/* A ROW OF ITS OWN on a phone. `shrink-0` here against `min-w-0` on the text
                    meant the text was the only thing that could give — so the title collapsed to
                    about a hundred pixels and broke one word per line while three 40px buttons
                    sat beside it, untouched. `w-full` makes the buttons wrap instead, which is
                    the thing that should move: they are the same size at any width, and the
                    title is not. */}
                <div class="flex w-full shrink-0 items-center justify-end gap-1.5 sm:ml-auto sm:w-auto sm:justify-start">
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      class={ICON_SECONDARY}
                      aria-label="Lihat tautan"
                      title="Lihat tautan"
                    >
                      <ExternalLink class="h-4 w-4" />
                    </a>
                  )}
                  {r.status === 'diajukan' && (
                    <>
                      <button
                        type="button"
                        class={ICON_PRIMARY}
                        aria-label={kind.done}
                        title={kind.done}
                        onClick={() => setBuying(r)}
                      >
                        <Check class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class={ICON_SECONDARY}
                        aria-label="Batalkan"
                        title="Batalkan"
                        onClick={() => setRejecting(r)}
                      >
                        <X class="h-4 w-4" />
                      </button>
                      {/* Last, after the pair: the two decisions belong beside each other, and
                          an edit between them separates a yes from its no. Only while it is
                          still open — once decided, a request is the record of what was
                          decided, and editing it rewrites what was approved. */}
                      <button
                        type="button"
                        class={ICON_SECONDARY}
                        aria-label="Ubah"
                        title="Ubah"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil class="h-4 w-4" />
                      </button>
                    </>
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
        title="Ajukan"
        description="Pengurus akan melihat ini di Beranda."
        onClose={abandonForm}
      >
        <RequestForm
          key={draftId}
          items={draft.items}
          instances={instances}
          prefill={formPrefill}
          requestId={draftId}
          onSubmit={submit}
          onCancel={abandonForm}
        />
      </Sheet>

      <Sheet
        open={buying !== null}
        title={buying ? `Tandai ${KIND[buying.type].done.toLowerCase()}` : ''}
        description={buying?.name}
        onClose={() => setBuying(null)}
      >
        {buying && (buying.type === 'perbaikan' ? (
          <RepairedForm
            request={buying}
            onConfirm={(note) => markRepaired(buying, note)}
            onCancel={() => setBuying(null)}
          />
        ) : (
          <BoughtForm
            request={buying}
            draft={draft}
            onConfirm={(locationId, fallback, note) => markBought(buying, locationId, fallback, note)}
            onCancel={() => setBuying(null)}
          />
        ))}
      </Sheet>

      <Sheet
        open={editing !== null}
        title="Ubah pengajuan"
        description={editing?.name}
        onClose={closeEdit}
      >
        {editing && (
          <RequestForm
            /* Keyed by the request, so opening a second one starts from ITS values rather than
               keeping the first one's. */
            key={editing.requestId}
            items={draft.items}
            instances={instances}
            requestId={editing.requestId}
            initial={editing}
            onSubmit={(input) => saveEdit(editing, input)}
            onCancel={closeEdit}
          />
        )}
      </Sheet>

      <Sheet
        open={rejecting !== null}
        title={rejecting ? KIND[rejecting.type].undone : ''}
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
/**
 * What finishing a repair decides — which is almost nothing, and that is the point.
 *
 * Buying asks where the thing goes and, for something new, what it is. A repair asks none of
 * that: the unit already has a rack, a category and a label. Adding fields here to make the two
 * forms match would be asking questions whose answers are already recorded.
 */
function RepairedForm(
  { request, onConfirm, onCancel }:
  { request: PurchaseRequest; onConfirm: (note: string) => void; onCancel: () => void },
) {
  const [note, setNote] = useState('');
  return (
    <div>
      <p class="rounded-lg border border-green-200 bg-green-50/60 px-4 py-3 text-sm leading-relaxed text-slate-700">
        <span class="font-semibold">{request.name}</span> akan ditandai tidak rusak lagi dan
        kembali dihitung sebagai siap dipakai.
        {request.assetId && <span class="block font-mono text-xs text-slate-500">{request.assetId}</span>}
      </p>

      <div class="mt-4">
        <label class={LABEL} for="repair-note">Catatan (opsional)</label>
        <textarea
          id="repair-note"
          rows={3}
          class={`${FIELD} py-3`}
          value={note}
          placeholder="Diservis di bengkel Pak Yanto, ganti busi dan tali starter."
          onInput={(e: Event) => setNote((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        {/* Not "Sudah diperbaiki": that is the word on the row button that opened this sheet,
            and two controls with one name is how somebody clicks the wrong one. */}
        <Button size="touch" onClick={() => onConfirm(note)}>
          <Check class="h-5 w-5" /> Catat perbaikan selesai
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>

      <p class="mt-4 text-xs leading-relaxed text-slate-400">
        Riwayat kerusakannya tetap tersimpan — yang dicatat adalah perbaikannya, bukan
        penghapusan kejadiannya.
      </p>
    </div>
  );
}

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
          Batalkan pengajuan
        </Button>
        <button type="button" class="font-semibold text-slate-500 underline" onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  );
}
