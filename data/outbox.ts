// Movements recorded but not yet sent.
//
// The gudang has bad wifi at exactly the moments the register is used most, and a withdrawal
// that fails to send is a withdrawal that goes unrecorded — the marbot has already walked off
// with the soap. So it is kept.
//
// IT HOLDS NO CREDENTIAL. Not the PIN, not the session token, not the device secret. A queue is
// storage at rest on a shared tablet, and the whole point of a per-visit PIN (§58.5) is that
// there is nothing left lying around to act on somebody's behalf afterwards. Persisting a token
// "just for the retry" would undo that quietly, and §65.4 says the same thing about Clerk's.
//
// What that costs, stated rather than hidden: an entry sent later is attributed to whoever
// gives the PIN then. Within one visit that is the same person and nothing is lost. Across
// visits it may not be, so the UI has to say so before it flushes — a queue that silently
// re-attributes somebody's withdrawal is worse than one that asks.
//
// IndexedDB rather than localStorage, for the same reason the photos use it: this is durable
// data that must survive a refresh, and localStorage is a synchronous string store the whole
// page waits on.

import type { AppendEntry } from './gateway';

const DB_NAME = 'brt-inventaris-outbox';
const DB_VERSION = 1;
const STORE = 'pending';

export interface Pending {
  /** The gateway de-duplicates on this, so re-sending the same entry can never double-count. */
  clientTxnId: string;
  entry: AppendEntry;
  /** When it was recorded — NOT when it is sent. The gateway stamps the real time on append. */
  recordedTs: number;
  /** Who recorded it, for the warning before a later flush. A name, never a credential. */
  recordedBy: string;
  /** How many times sending has been attempted, so a poisoned entry can be spotted. */
  attempts: number;
}

export class OutboxError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'OutboxError';
  }
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new OutboxError('Perangkat ini tidak mendukung penyimpanan offline.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientTxnId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new OutboxError('Penyimpanan offline tidak bisa dibuka.', req.error));
  });
}

/**
 * Keep an entry that could not be sent.
 *
 * Keyed by `clientTxnId`, so enqueuing the same entry twice — a double tap, a retry that half
 * succeeded — replaces rather than duplicates. The id is the same one the gateway de-duplicates
 * on, which is what makes the whole retry path safe.
 */
export async function enqueue(entry: AppendEntry, recordedBy: string): Promise<void> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const existing = await wrap<Pending | undefined>(tx.objectStore(STORE).get(entry.clientTxnId));
    await wrap(tx.objectStore(STORE).put({
      clientTxnId: entry.clientTxnId,
      entry,
      recordedTs: existing?.recordedTs ?? Date.now(),
      recordedBy: existing?.recordedBy ?? recordedBy,
      attempts: (existing?.attempts ?? 0) + 1,
    } satisfies Pending));
  } finally {
    db.close();
  }
}

/** Oldest first: the log is a sequence, and sending it out of order invents a different one. */
export async function pending(): Promise<Pending[]> {
  const db = await open();
  try {
    const rows = await wrap<Pending[]>(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    return rows.sort((a, b) => a.recordedTs - b.recordedTs);
  } finally {
    db.close();
  }
}

/** Drop entries the gateway has accepted — including ones it reported as already recorded. */
export async function settle(clientTxnIds: readonly string[]): Promise<void> {
  if (clientTxnIds.length === 0) return;
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await Promise.all(clientTxnIds.map((id) => wrap(tx.objectStore(STORE).delete(id))));
  } finally {
    db.close();
  }
}

/** How many are waiting. Cheap enough to poll for a badge. */
export async function pendingCount(): Promise<number> {
  const db = await open();
  try {
    return await wrap<number>(db.transaction(STORE, 'readonly').objectStore(STORE).count());
  } finally {
    db.close();
  }
}
