import { useEffect, useState } from 'octane';
import type { Category, Item } from '../../../domain/types';
import { SEED_CATEGORIES } from '../data/seedCategories';
import { clearDraft, loadDraft, saveDraft } from './persist';

export interface Draft {
  items: Item[];
  categories: Category[];
  setItems: (update: (prev: Item[]) => Item[]) => void;
  setCategories: (update: (prev: Category[]) => Category[]) => void;
  reset: () => void;
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
    setItems: (update) => setState((prev) => ({ ...prev, items: update(prev.items) })),
    setCategories: (update) => setState((prev) => ({ ...prev, categories: update(prev.categories) })),
    reset: () => { clearDraft(); setState({ items: [], categories: SEED_CATEGORIES }); },
  };
}
