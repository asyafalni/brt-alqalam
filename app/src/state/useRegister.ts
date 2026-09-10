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
import { cacheRegister, cachedRegister, forgetRegister } from './registerCache';

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
  /*
   * Seeded from the LAST READ, so opening the app is not two seconds of blank screen.
   *
   * Apps Script's floor is its own start-up — `?op=ping`, which touches no sheet, measures
   * 1.3–2.5s on the live deployment — so the read cannot be made faster. What can change is
   * whether anybody has to watch it. The fresh copy is already in flight, the progress bar says
   * so, and it lands about a second and a half later.
   */
  /* An ADMIN is seeded too, and that took a correction to get right.
   *
   * Only the public tier is ever cached (§39 — the detailed one names people), so an admin's
   * seed is necessarily the public copy. Withholding it altogether made the person with the
   * most to do wait the longest, measured at up to forty seconds on a cold Apps Script. So the
   * seed is painted for them as well, and the two screens that can tell the difference say
   * which they are looking at: `withheld` is only true with nobody signed in, and Pengajuan
   * shows "still arriving" rather than "none" while an admin's detailed read is in flight. */
  const seed = connection ? cachedRegister(connection.url) : null;
  const [state, setState] = useState<GatewayState | null>(seed?.state ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedTs, setFetchedTs] = useState(seed?.fetchedTs ?? 0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!connection) {
      setState(null);
      setError('');
      /* Disconnecting must forget it too, or reconnecting to a DIFFERENT sheet would paint the
         old masjid's register for a second and a half. */
      forgetRegister();
      return;
    }

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
        /*
         * ONLY THE PUBLIC TIER is ever written to disk.
         *
         * The detailed one carries `Requests`, and every row of that names who asked and who
         * decided (§39). Caching it would leave those names in localStorage after the admin
         * signs out — and the seed would then paint them for whoever picks the tablet up next.
         * The public tier is what an unauthenticated reader could fetch anyway, so keeping a
         * copy of it costs nothing that is not already given away.
         */
        if (next.tier === 'public') cacheRegister(connection.url, next);
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

  /*
   * Polling stops while the tab is hidden, and re-reads the moment it is shown.
   *
   * Two reasons, and the second matters more. Apps Script quotas are finite (§17) and a
   * forgotten tab was spending one read a minute, all night, for nobody. And a person coming
   * back to the tablet used to see whatever was on it when they walked away, for up to a minute,
   * with nothing saying so — on a register that another device may have moved in the meantime.
   */
  useEffect(() => {
    if (!connection) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const start = () => {
      if (id === null) id = setInterval(() => setTick((n) => n + 1), POLL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      setTick((n) => n + 1);
      start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [connection?.url]);

  return { state, loading, error, fetchedTs, refresh: () => setTick((n) => n + 1) };
}
