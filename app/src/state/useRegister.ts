// Where the register comes from: this device, or the shared sheet.
//
// The app has two modes, and the difference is not cosmetic:
//
//   * NOT CONNECTED — everything is the local stock-take draft. That is the walk round the
//     gudang, and it works with no account, no network and no gateway (§59 stage 1).
//   * CONNECTED — the catalog is READ from the spreadsheet and is read-only here. Only
//     movements can be written, and only through the gateway, because the gateway is the only
//     thing allowed to touch `Transactions` and it has no endpoint for anything else. That is
//     not a limitation to route around: an append-only log with one writer is what makes the
//     derived numbers trustworthy.
//
// Failing to reach the gateway does NOT fall back to the local draft. Quietly showing yesterday's
// device-local numbers under the same headings, while the sheet says something else, is the
// failure this whole design exists to prevent — so it says it is stale and shows what it has.

import { useEffect, useState } from 'octane';
import { fetchState, fetchStateAsAdmin, GatewayError } from '../../../data/gateway';
import type { GatewayState } from '../../../data/gateway';
import type { Connection } from './connection';

export interface Register {
  state: GatewayState | null;
  /** Set while the first read is in flight; screens show what they have rather than blanking. */
  loading: boolean;
  /** A gateway error code, or `''`. Present WITH data means the data is stale, not missing. */
  error: string;
  /** When the shown data was fetched, so a screen can say how old it is. */
  fetchedTs: number;
  refresh: () => void;
}

/** How often a connected kiosk re-reads. Long, because Apps Script quotas are finite (§17). */
const POLL_MS = 60_000;

export function useRegister(
  connection: Connection | null,
  /**
   * Present when an admin is signed in, and it changes WHICH TIER this reads.
   *
   * Without it the app reads the public tier, which omits `Requests` entirely because those rows
   * name people (§39) — so a signed-in admin saw an empty Pengajuan screen and no reason for it.
   * The read function existed and simply was not wired to anything; this is that wire.
   */
  getAdminToken?: () => Promise<string>,
): Register {
  const [state, setState] = useState<GatewayState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedTs, setFetchedTs] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!connection) { setState(null); setError(''); return; }

    let alive = true;
    setLoading(true);
    const read = getAdminToken
      ? getAdminToken().then((token) => fetchStateAsAdmin(connection.url, token))
      : fetchState(connection.url);
    read
      .then((next) => {
        if (!alive) return;
        setState(next);
        setError('');
        setFetchedTs(Date.now());
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // The previous state is deliberately KEPT. Blanking the screen on a dropped connection
        // would turn a gudang with bad wifi into a gudang with no register.
        setError(err instanceof GatewayError ? err.code : 'offline');
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [connection?.url, tick, !!getAdminToken]);

  useEffect(() => {
    if (!connection) return;
    const id = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, [connection?.url]);

  return { state, loading, error, fetchedTs, refresh: () => setTick((n) => n + 1) };
}
