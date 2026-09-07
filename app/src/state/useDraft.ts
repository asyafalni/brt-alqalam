import { useEffect, useState } from 'octane';
import type { Category, Item, Location, StockLine, Txn } from '../../../domain/types';
import type { PurchaseRequest } from '../../../domain/requests';
import { SEED_CATEGORIES } from '../data/seedCategories';
import { clearDraft, loadDraft, saveDraft } from './persist';
import { demoDraft } from '../data/demo';

export interface Draft {
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
    setItems: (update) => setState((prev) => ({ ...prev, items: update(prev.items) })),
    setCategories: (update) => setState((prev) => ({ ...prev, categories: update(prev.categories) })),
    setLocations: (update) => setState((prev) => ({ ...prev, locations: update(prev.locations) })),
    setStock: (update) => setState((prev) => ({ ...prev, stock: update(prev.stock) })),
    setRequests: (update) => setState((prev) => ({ ...prev, requests: update(prev.requests) })),
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
    loadDemo: () => setState(demoDraft()),
  };
}
