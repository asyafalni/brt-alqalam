// Ports — the hexagonal boundary. `domain/` is the core; everything here is an edge.
//
// These interfaces are what the app depends on. The Apps Script gateway, a published-CSV
// reader, an IndexedDB offline queue and (one day) a Zig service are all just implementations.
// Nothing in this file imports a framework or performs I/O; it only declares the shape of it.
//
// CQRS, named honestly: the system already is one. Writes go to an append-only log
// (`TransactionLog`), reads come from a projection derived by folding that log
// (`domain/deriveState`). There is no update path anywhere, by design.

import type { AssetInstance, Category, Condition, Direction, Item, StockLine, Txn } from '../domain/types';
import type { ParseIssue } from './parse';

// ---------------------------------------------------------------------------
// Read side
// ---------------------------------------------------------------------------

/**
 * Catalog: what we own. Rebuildable projections of the `CatalogLog`, but read as tables.
 * `issues` carries rows the parse boundary quarantined — surfaced to admins, never dropped.
 */
export interface CatalogSnapshot {
  categories: Category[];
  items: Item[];
  /** How much of each item sits on which rack. Separate from the item since one thing can be
   *  kept on several racks, and a cycle count has to reconcile one shelf at a time. */
  stock: StockLine[];
  instances: AssetInstance[];
  issues: ParseIssue[];
}

export interface CatalogRepository {
  load(): Promise<CatalogSnapshot>;
}

export interface TxnPage {
  txns: Txn[];
  issues: ParseIssue[];
  /** Opaque continuation token; absent means this is the end of the log. */
  cursor?: string;
}

export interface TransactionRepository {
  /** Read the log forward. `cursor` omitted = from the beginning (or the latest snapshot). */
  read(cursor?: string): Promise<TxnPage>;
}

// ---------------------------------------------------------------------------
// Write side — append-only. There is deliberately no update() or delete().
// ---------------------------------------------------------------------------

/**
 * What the UI knows at the moment of a scan. The keterangan is NOT here: it is inferred
 * downstream by `domain/keterangan.planMovement` from the item's kind and the direction.
 */
export interface AppendCommand {
  clientTxnId: string;   // idempotency key — a retry or a double-tap cannot double-append
  itemId?: string;
  assetId?: string;
  direction: Direction;
  qty: number;           // positive, as typed; sign is applied by planMovement
  condition?: Condition; // masuk only
  recipient?: string;    // who is walking away with it — required for a loan
  note?: string;
  returnable?: boolean;  // exception path: a consumable that is coming back
}

export type AppendOutcome =
  | { status: 'appended'; txn: Txn }
  | { status: 'duplicate'; txn: Txn }              // clientTxnId already in the log — safe to ignore
  | { status: 'queued'; clientTxnId: string }      // offline: held locally, will replay
  | { status: 'rejected'; reason: string };        // gateway said no (bad PIN, unknown item, ...)

export interface TransactionLog {
  /**
   * Append one immutable row. The SESSION is what authorises it (PIN verified once per visit),
   * and the server — not the client clock — stamps the authoritative time.
   */
  append(session: SessionToken, cmd: AppendCommand): Promise<AppendOutcome>;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * A session is ONE VISIT, not a time window: PIN → log everything you are taking → Simpan
 * commits the batch and ends it. That is what makes shared-kiosk misattribution structurally
 * impossible rather than merely unlikely (design doc Part XVI §58.5).
 */
export interface SessionToken {
  readonly value: string;
  readonly actorUserId: string;
  readonly actorName: string;
}

export interface PinAuthenticator {
  /**
   * Verify a PIN and open a session. Rate-limiting happens at the gateway, never here.
   *
   * `deviceSecret` is ENROLLED, not invented: an admin registers this kiosk once (signed in
   * with Clerk) and the gateway issues a long random secret the device stores. It is NOT a
   * client-generated UUID — Apps Script cannot see request headers, cookies or the client IP
   * (GATEWAY-FINDINGS.md), so a self-declared device id would let an attacker rotate it and
   * walk the whole 10^4 PIN keyspace. The enrolled secret is what makes per-device lockout
   * real, and what lets a lost kiosk be revoked.
   */
  open(pin: string, deviceSecret: string): Promise<
    | { status: 'ok'; session: SessionToken }
    | { status: 'invalid' }
    | { status: 'locked'; retryAfterMs: number }
  >;
  close(session: SessionToken): Promise<void>;
}
