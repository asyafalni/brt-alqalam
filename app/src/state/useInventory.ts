import { useMemo } from 'octane';
import { deriveState } from '../../../domain/deriveState';
import { deriveNotifications } from '../../../domain/notifications';
import { totalFor } from '../../../domain/stock';
import type { AssetInstance, DerivedState, Txn } from '../../../domain/types';
import type { StockNotification } from '../../../domain/notifications';
import { instancesFor } from '../features/stocktake/draft';
import type { Draft } from './useDraft';

export interface Inventory {
  instances: AssetInstance[];
  txns: Txn[];
  derived: DerivedState;
  notifications: StockNotification[];
  /** True while there is no gateway, so screens can say so instead of implying live data. */
  offline: boolean;
}

/**
 * Current state, folded from the catalog and the event log — never stored.
 *
 * The log is empty until the gateway exists, so today this shows starting stock. That is the
 * honest answer, and it means the whole derive path is exercised from the first screen rather
 * than being wired up blind on the day the gateway lands.
 */
export function useInventory(draft: Draft, now: number): Inventory {
  const instances = useMemo(
    // The count is the item's total across every rack: a knife is one numbered knife wherever
    // it happens to be kept, and re-shelving it must not renumber it.
    () => draft.items.flatMap((i) => instancesFor(i, now, totalFor(draft.stock, i.itemId))),
    [draft.items, draft.stock, now],
  );

  // Real use has none until the gateway lands; the demo fills it so every derived state
  // — dipinjam, rusak, hilang — is actually reachable and visible.
  const txns: Txn[] = draft.txns;

  const derived = useMemo(
    () => deriveState(draft.items, instances, txns, now, draft.stock),
    [draft.items, draft.stock, instances, txns, now],
  );

  const notifications = useMemo(
    () => deriveNotifications(draft.items, txns, now, draft.stock),
    [draft.items, draft.stock, txns, now],
  );

  return { instances, txns, derived, notifications, offline: true };
}
