import { useEffect, useState } from 'octane';
import type { Category, Item, Location, StockLine, Txn } from '../../../domain/types';
import type { PurchaseRequest } from '../../../domain/requests';
import { SEED_CATEGORIES } from '../data/seedCategories';
import type { StoredDraft } from './persist';
import { clearDraft, loadDraft, saveDraft } from './persist';
import type { CatalogPatch, CatalogWriter } from './useCatalogWriter';
import type { GatewayState } from '../../../data/gateway';

export interface Draft {
  /** True when the catalog is the spreadsheet's, and this device may only append movements. */
  readOnly?: boolean;
  /**
   * Whether this device may record a movement at all.
   *
   * Separate from `readOnly` because they are different permissions: a kiosk cannot edit the
   * catalog but can record; a viewer can do neither. A phone belonging to the takmir reads the
   * register without anybody enrolling it, which is the whole reason the public tier exists.
   */
  canRecord?: boolean;
  items: Item[];
  categories: Category[];
  locations: Location[];
  /** How much of each item sits on which rack — quantity lives here, not on the item. */
  stock: StockLine[];
  txns: Txn[];
  /** Things somebody wants bought or repaired. A purchase is not stock until it is finished. */
  requests: PurchaseRequest[];
  setItems: (update: (prev: Item[]) => Item[]) => void;
  setCategories: (update: (prev: Category[]) => Category[]) => void;
  setLocations: (update: (prev: Location[]) => Location[]) => void;
  setStock: (update: (prev: StockLine[]) => StockLine[]) => void;
  setRequests: (update: (prev: PurchaseRequest[]) => PurchaseRequest[]) => void;
  /** Append-only in practice: every caller adds to the log, none rewrites it. */
  setTxns: (update: (prev: Txn[]) => Txn[]) => void;
  /**
   * The log and the requests in one write.
   *
   * Finishing a repair does both: the request closes AND the unit goes back on the shelf as an
   * appended `status_change`. Split into two setters, a render could land between them showing
   * a repair that is done on a thing that is still broken.
   */
  setRepair: (
    update: (prev: { txns: Txn[]; requests: PurchaseRequest[] }) =>
    { txns: Txn[]; requests: PurchaseRequest[] },
  ) => void;
  /**
   * Connected mode only: close a request, and for a repair put the unit back on its hook.
   *
   * `setRepair` cannot do this when connected. It writes to `Transactions`, and only `append`
   * may — so it was a NOOP, and "tandai selesai" was a button that silently did nothing on a
   * screen that can only be opened while connected. The boundary was right; a dead control was
   * not. Present here means "the gateway can do this properly"; absent means the local draft
   * handles it with `setRepair`.
   */
  finishRequest?: (
    input: {
      requestId: string;
      status?: 'selesai' | 'dibatalkan';
      note?: string;
      assetId?: string;
      itemId?: string;
      toStatus?: string;
    },
  ) => void;
  /**
   * Items, stock and requests in one write. Buying a request touches all three, and three
   * separate setters would land as three renders with a half-updated catalog in between.
   */
  setPurchase: (
    update: (prev: { items: Item[]; stock: StockLine[]; requests: PurchaseRequest[] }) =>
    { items: Item[]; stock: StockLine[]; requests: PurchaseRequest[] },
  ) => void;
  /** Both at once, so adding an item and shelving it cannot land as two renders. */
  setCatalog: (update: (prev: { items: Item[]; stock: StockLine[] }) =>
    { items: Item[]; stock: StockLine[] }) => void;
  reset: () => void;
  loadDemo: () => void;
  /**
   * Replace whole tabs from an import, leaving the ones that were not supplied alone.
   *
   * One write, because a restore that lands as five renders would show a catalog without its
   * stock lines in between — briefly, but long enough for the autosave to persist it.
   */
  loadFrom: (parts: Partial<Pick<
    StoredDraft, 'items' | 'categories' | 'locations' | 'stock' | 'requests'
  >>) => void;
}

/**
 * The stock-take draft, owned once and shared by every screen that reads it.
 *
 * Lifted out of the stock-take screen when label printing arrived: two screens each loading
 * from storage would be two sources of truth, and the label sheet would quietly print a
 * stale count.
 */
export function useDraft(): Draft {
  const [state, setState] = useState(() => loadDraft(SEED_CATEGORIES));

  useEffect(() => { saveDraft(state); }, [state]);

  return {
    items: state.items,
    categories: state.categories,
    locations: state.locations,
    stock: state.stock,
    txns: state.txns,
    requests: state.requests,
    /*
     * Not connected: this device holds the whole draft, so it may do everything to it — the
     * stock-take (§59 stage 1) has to work on a phone with no gateway at all.
     *
     * ⚠️ But the DESTINATION must be visible. This once recorded withdrawals with no PIN into a
     * draft nobody else reads, behind the same button and the same confirmation as a real one:
     * two destinations, one control. Blocking it was the wrong fix — it would break the mode the
     * roadmap starts with. `MovementSheet` says where the record is going instead.
     */
    canRecord: true,
    setItems: (update) => setState((prev) => ({ ...prev, items: update(prev.items) })),
    setCategories: (update) => setState((prev) => ({ ...prev, categories: update(prev.categories) })),
    setLocations: (update) => setState((prev) => ({ ...prev, locations: update(prev.locations) })),
    setStock: (update) => setState((prev) => ({ ...prev, stock: update(prev.stock) })),
    setRequests: (update) => setState((prev) => ({ ...prev, requests: update(prev.requests) })),
    setTxns: (update) => setState((prev) => ({ ...prev, txns: update(prev.txns) })),
    setRepair: (update) => setState((prev) => ({
      ...prev,
      ...update({ txns: prev.txns, requests: prev.requests }),
    })),
    setPurchase: (update) => setState((prev) => ({
      ...prev,
      ...update({ items: prev.items, stock: prev.stock, requests: prev.requests }),
    })),
    setCatalog: (update) => setState((prev) => ({ ...prev, ...update({ items: prev.items, stock: prev.stock }) })),
    reset: () => {
      clearDraft();
      setState({
        items: [], categories: SEED_CATEGORIES, locations: [], stock: [], txns: [], requests: [],
      });
    },
    /*
     * Fetched on demand, and it is the only thing in the app that is.
     *
     * The demo rows are ~16kB of a gudang that does not exist — three racks of invented sabun,
     * so every derived state (dipinjam, rusak, hilang) is reachable before a single real item
     * is entered. They earn their place for whoever is being shown the app. They do not earn a
     * place in the file a marbot downloads to write down how much sabun is on a shelf, and a
     * CONNECTED device can never reach the button at all.
     */
    loadDemo: () => {
      void import('../data/demo').then((m) => setState(m.demoDraft()));
    },
    loadFrom: (parts) => setState((prev) => ({ ...prev, ...parts })),
  };
}

/**
 * The same `Draft` shape, but backed by the spreadsheet instead of this device.
 *
 * Every screen already reads `draft.items`, `draft.stock`, `draft.locations`. Making the SOURCE
 * swappable here means none of them has to know which mode the app is in — which is the same
 * reason `domain/` never learned where its data comes from.
 *
 * The setters do nothing on purpose, and `readOnly` says so out loud rather than leaving them
 * to fail quietly: when connected, the catalog belongs to the sheet. The gateway is the only
 * writer of `Transactions` and it has no endpoint for anything else, and that is not an
 * omission — one writer over an append-only log is what makes every derived number trustworthy.
 */
export function gatewayDraft(
  state: GatewayState,
  txns: Txn[],
  canRecord: boolean,
  /** Present only when an admin is signed in; without it every catalog setter is a noop. */
  writer?: CatalogWriter,
  /** Closes a request through the gateway. Only an admin has the credential for it. */
  onFinish?: Draft['finishRequest'],
): Draft {
  const noop = () => {};

  /* What is on screen: the register, with any not-yet-visible admin write laid over it. The
     overlay is dropped by the writer itself once a read comes back carrying the change. */
  const p = writer?.pending;
  const items = p?.items ?? state.items;
  const categories = p?.categories ?? state.categories;
  const locations = p?.locations ?? state.locations;
  const stock = p?.stock ?? state.stock;
  const requests = p?.requests ?? state.requests;

  const edit = <T>(get: () => T, put: (next: T) => CatalogPatch) =>
    (writer ? (u: (prev: T) => T) => writer.write(put(u(get()))) : noop);

  return {
    items,
    categories,
    locations,
    stock,
    /* Rows appended in this session are shown immediately, ahead of the next poll: a marbot
       who records a withdrawal must see the number move now, not in a minute. */
    txns,
    requests,
    /* An admin edits the shared catalog; everybody else reads it. Not the same permission as
       `canRecord`, which is about movements and is earned by a device rather than a person. */
    readOnly: !writer,
    canRecord,
    setItems: edit(() => items, (next) => ({ items: next })),
    setCategories: edit(() => categories, (next) => ({ categories: next })),
    setLocations: edit(() => locations, (next) => ({ locations: next })),
    setStock: edit(() => stock, (next) => ({ stock: next })),
    setRequests: edit(() => requests, (next) => ({ requests: next })),
    setCatalog: edit(
      () => ({ items, stock }),
      (next) => ({ items: next.items, stock: next.stock }),
    ),
    setPurchase: edit(
      () => ({ items, stock, requests }),
      (next) => ({ items: next.items, stock: next.stock, requests: next.requests }),
    ),
    /*
     * These two stay noops even for an admin, and the boundary is deliberate rather than
     * unfinished: both write to `Transactions`, and the log has exactly ONE writer — `append`,
     * behind a PIN session. `putCatalog` cannot touch that tab and never will (§58.4), so
     * finishing a repair from a connected admin screen needs the movement path, not this one.
     */
    setTxns: noop,
    /* Still a noop, and now it has a replacement rather than a silence: `finishRequest` below
       does the same job through the one op allowed to touch both the log and a request row. */
    setRepair: noop,
    finishRequest: writer && onFinish ? onFinish : undefined,
    /* Local-draft-only. There is nothing to reset or seed when the catalog is the masjid's
       actual spreadsheet, and an import belongs in the sheet where it can be reviewed first. */
    reset: noop,
    loadDemo: noop,
    loadFrom: noop,
  };
}

