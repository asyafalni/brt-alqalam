// The Apps Script gateway, behind the ports.
//
// Every request is a CORS "simple request": GET, or POST with Content-Type text/plain carrying
// a JSON string. That is not a style choice — Apps Script web apps cannot handle a preflight
// (there is no doOptions, and TextOutput cannot set headers), so a custom header or an
// application/json body would fail with no useful error at all. Auth therefore travels in the
// body. See docs/GATEWAY-FINDINGS.md.

import type {
  AppendCommand, AppendOutcome, CatalogRepository, CatalogSnapshot, PinAuthenticator,
  SessionToken, TransactionLog, TransactionRepository, TxnPage,
} from './ports';
import {
  buildCategory, buildInstance, buildItem, buildLocation, buildTxn, normaliseKeys, parseRecords,
} from './parse';
import type { ParseIssue } from './parse';
import type { Category, Item, Txn } from '../domain/types';

export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface GatewayConfig {
  /** The /exec deployment URL. */
  url: string;
  /** Issued by the gateway at enrolment; stored on this device only. */
  deviceSecret: string;
  fetch?: FetchLike;
}

export class GatewayError extends Error {
  constructor(readonly code: string, message?: string, readonly retryAfterMs?: number) {
    super(message ?? code);
  }
}

interface StatePayload {
  categories?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  instances?: Record<string, unknown>[];
  txns?: Record<string, unknown>[];
}

const rows = (list: Record<string, unknown>[] | undefined) => (list ?? []).map(normaliseKeys);

export function createGatewayClient(config: GatewayConfig) {
  const doFetch: FetchLike = config.fetch ?? ((u, i) => fetch(u, i as RequestInit));

  async function call<T>(init: { method: 'GET'; query: Record<string, string> } | { method: 'POST'; body: unknown }): Promise<T> {
    const isGet = init.method === 'GET';
    const url = isGet
      ? `${config.url}?${new URLSearchParams(init.query)}`
      : config.url;

    let response;
    try {
      response = await doFetch(url, isGet ? { method: 'GET' } : {
        method: 'POST',
        // text/plain keeps this a simple request. Anything else triggers a preflight the
        // gateway physically cannot answer.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(init.body),
      });
    } catch (e) {
      throw new GatewayError('offline', e instanceof Error ? e.message : String(e));
    }

    const text = await response.text();
    if (!response.ok) throw new GatewayError('http_' + response.status, text.slice(0, 200));

    let payload: { ok?: boolean; error?: string; retryAfterMs?: number } & Record<string, unknown>;
    try {
      payload = JSON.parse(text);
    } catch {
      // Almost always the deployment-access trap: manifest ANYONE serves a Google login page
      // with HTTP 200, so the body is HTML. Naming it saves an hour of looking in the wrong place.
      throw new GatewayError(
        'not_json',
        text.trimStart().startsWith('<')
          ? 'Gateway returned HTML, not JSON — check the deployment is "Who has access: Anyone".'
          : text.slice(0, 200),
      );
    }

    if (!payload.ok) throw new GatewayError(payload.error ?? 'unknown', payload.error, payload.retryAfterMs);
    return payload as T;
  }

  /** Sheet values are strings from either transport, so they go through the same builders. */
  function readState(state: StatePayload): CatalogSnapshot & { txns: Txn[]; txnIssues: ParseIssue[] } {
    const categories = parseRecords(rows(state.categories), buildCategory);
    const locations = parseRecords(rows(state.locations), buildLocation);
    const items = parseRecords(rows(state.items), buildItem);
    const instances = parseRecords(rows(state.instances), buildInstance);
    const txns = parseRecords(rows(state.txns), buildTxn);

    // Locations ride along on the snapshot; the port predates them, and widening it is a
    // bigger change than this adapter should make on its own.
    void locations;

    return {
      categories: categories.ok as Category[],
      items: items.ok as Item[],
      instances: instances.ok,
      issues: [...categories.quarantined, ...locations.quarantined, ...items.quarantined, ...instances.quarantined],
      txns: txns.ok,
      txnIssues: txns.quarantined,
    };
  }

  const catalog: CatalogRepository = {
    async load(): Promise<CatalogSnapshot> {
      const { state } = await call<{ state: StatePayload }>({ method: 'GET', query: { op: 'state' } });
      const read = readState(state);
      return { categories: read.categories, items: read.items, instances: read.instances, issues: read.issues };
    },
  };

  const transactions: TransactionRepository = {
    async read(): Promise<TxnPage> {
      const { state } = await call<{ state: StatePayload }>({ method: 'GET', query: { op: 'state' } });
      const read = readState(state);
      return { txns: read.txns, issues: read.txnIssues };
    },
  };

  const auth: PinAuthenticator = {
    async open(pin: string, deviceSecret: string) {
      try {
        const res = await call<{ session: { token: string; actorUserId: string; actorName: string } }>({
          method: 'POST',
          body: { op: 'openSession', deviceSecret, pin },
        });
        return {
          status: 'ok' as const,
          session: {
            value: res.session.token,
            actorUserId: res.session.actorUserId,
            actorName: res.session.actorName,
          },
        };
      } catch (e) {
        if (e instanceof GatewayError && e.code === 'locked') {
          return { status: 'locked' as const, retryAfterMs: e.retryAfterMs ?? 0 };
        }
        if (e instanceof GatewayError && (e.code === 'invalid_pin' || e.code === 'device_not_enrolled')) {
          return { status: 'invalid' as const };
        }
        throw e;
      }
    },

    async close(session: SessionToken) {
      await call({ method: 'POST', body: { op: 'closeSession', session: session.value } })
        .catch(() => { /* a session we cannot close will expire on its own */ });
    },
  };

  const log: TransactionLog = {
    async append(session: SessionToken, cmd: AppendCommand): Promise<AppendOutcome> {
      try {
        const res = await call<{ appended: Record<string, unknown>[]; duplicates: string[] }>({
          method: 'POST',
          body: { op: 'append', session: session.value, entries: [cmd] },
        });

        // A duplicate is a SUCCESS: it means this clientTxnId is already in the log, which is
        // exactly what idempotency is for. Treating it as an error would make a retry after a
        // dropped response look like a failure and invite a second, real double-entry.
        if (res.duplicates?.includes(cmd.clientTxnId)) {
          const existing = parseRecords(rows(res.appended), buildTxn).ok[0];
          return existing
            ? { status: 'duplicate', txn: existing }
            : { status: 'rejected', reason: 'duplicate' };
        }

        const parsed = parseRecords(rows(res.appended), buildTxn);
        const txn = parsed.ok[0];
        if (!txn) {
          return { status: 'rejected', reason: parsed.quarantined[0]?.message ?? 'gateway returned no row' };
        }
        return { status: 'appended', txn };
      } catch (e) {
        // Offline is not a rejection. The caller queues and replays — the clientTxnId is what
        // makes that safe.
        if (e instanceof GatewayError && e.code === 'offline') {
          return { status: 'queued', clientTxnId: cmd.clientTxnId };
        }
        return { status: 'rejected', reason: e instanceof Error ? e.message : String(e) };
      }
    },
  };

  /** Cheap liveness probe, for a setup screen to say "connected" honestly. */
  async function ping(): Promise<{ now: number; version: string }> {
    return call<{ now: number; version: string }>({ method: 'GET', query: { op: 'ping' } });
  }

  return { catalog, transactions, auth, log, ping };
}
