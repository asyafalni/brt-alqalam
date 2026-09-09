// Editing the shared catalog, as an admin.
//
// THE PROBLEM THIS SOLVES. Connected, the register is the spreadsheet's, so every screen renders
// what the last poll returned. A save that only reaches the sheet would therefore appear to do
// nothing for up to a minute — and the thing people do when a save appears to do nothing is save
// again. So a write is held here as an overlay the moment it is made, and dropped only once a
// re-read comes back carrying it.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never merges. `putCatalog` refuses a save built on a
// revision somebody else has already moved, and the answer to that refusal is to re-read and
// show the admin what is actually there — not to retry the same body, which is overwriting a
// colleague's work on purpose. Two admins tidying the catalog at once is the normal case during
// a stock-take, not an edge one.

import { useRef, useState } from 'octane';
import { putCatalog, GatewayError } from '../../../data/gateway';
import type { CatalogTabs } from '../../../data/gateway';
import {
  categoryRow, itemRow, locationRow, requestRow, stockRow,
} from '../../../data/rows';
import type { Category, Item, Location, StockLine } from '../../../domain/types';
import type { PurchaseRequest } from '../../../domain/requests';

/** The shape every setter produces: whichever tabs that edit touched. */
export interface CatalogPatch {
  items?: Item[];
  categories?: Category[];
  locations?: Location[];
  stock?: StockLine[];
  requests?: PurchaseRequest[];
}

export interface CatalogWriter {
  /** Applied on screen at once, then sent. Rolled back if the gateway refuses. */
  write: (patch: CatalogPatch) => void;
  /** What has been written but not yet seen coming back from a read. */
  pending: CatalogPatch | null;
  saving: boolean;
  /** A message worth showing an admin, or `''`. */
  error: string;
  clearError: () => void;
  /** For the writes that do not go through `write` — closing a request, for one. */
  reportError: (err: unknown) => void;
}

const REASON: Record<string, string> = {
  stale_rev: 'Katalog sudah diubah orang lain sejak halaman ini dimuat. Perubahanmu TIDAK '
    + 'disimpan. Muat ulang dulu, lalu ulangi suntinganmu di atas data terbaru.',
  'not-admin': 'Akunmu bukan admin, jadi gateway menolak perubahan ini.',
  'no-token': 'Sesi admin sudah berakhir. Masuk lagi lewat menu Admin.',
  expired: 'Sesi admin sudah kedaluwarsa. Masuk lagi lewat menu Admin.',
  offline: 'Tidak bisa menghubungi gateway. Perubahan tidak tersimpan — periksa koneksi.',
  tab_not_writable: 'Tab itu tidak boleh ditulis lewat aplikasi.',
  busy: 'Gateway sedang menulis sesuatu yang lain. Coba lagi sebentar.',
};
const explain = (code: string) => REASON[code] ?? `Gateway menolak: ${code}`;

/** Only the tabs the patch touched are sent, so an edit to one cannot blank another. */
function toTabs(patch: CatalogPatch): CatalogTabs {
  const tabs: CatalogTabs = {};
  if (patch.items) tabs.Items = patch.items.map(itemRow);
  if (patch.categories) tabs.Categories = patch.categories.map(categoryRow);
  if (patch.locations) tabs.Locations = patch.locations.map(locationRow);
  if (patch.stock) tabs.Stock = patch.stock.map(stockRow);
  if (patch.requests) tabs.Requests = patch.requests.map(requestRow);
  return tabs;
}

export function useCatalogWriter(
  url: string | undefined,
  rev: number,
  getToken: (() => Promise<string>) | undefined,
  onSaved: () => void,
): CatalogWriter {
  const [pending, setPending] = useState<CatalogPatch | null>(null);
  const [ackRev, setAckRev] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
   * THE REVISION THIS DEVICE HAS ALREADY MOVED THE CATALOG TO.
   *
   * `rev` is what the last READ said, and a read is up to a poll behind. Every accepted save
   * bumps the sheet's revision, so a second save built on `rev` was being sent against a
   * revision this very device had already superseded — and the gateway, correctly, refused it
   * as stale. The admin then read "sudah diubah orang lain" about their own edit of four
   * seconds ago, and lost it. An admin tidying names makes edits faster than a 1.5s round trip,
   * so this was the normal case, not an edge one.
   */
  const wrote = useRef<number | null>(null);
  /* Serialised, for the same reason: two saves in flight at once would both carry the revision
     from before either of them, and the second would be refused however this is counted. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /* The overlay outlives the reply and dies at the next READ, because the gap between "the
     gateway has it" and "the poll shows it" is the whole reason the overlay exists. Once the
     read reports the revision our write produced, the register itself is carrying the change. */
  const visible = ackRev !== null && rev >= ackRev ? null : pending;

  function write(patch: CatalogPatch) {
    if (!url || !getToken) { setError('Belum masuk sebagai admin.'); return; }

    // Shown first, sent second. The rollback below is what keeps that honest.
    setPending((prev) => ({ ...(prev ?? {}), ...patch }));
    setSaving(true);
    setError('');

    queue.current = queue.current
      .then(() => getToken())
      /* The later of what we last read and what we last wrote. A read that has caught up (or
         overtaken us, because somebody else saved too) wins; otherwise our own last write does. */
      .then((token) => putCatalog(url, token, Math.max(rev, wrote.current ?? rev), toTabs(patch)))
      .then((result) => {
        wrote.current = result.rev;
        // NOT cleared here — see `visible` above.
        setAckRev(result.rev);
        onSaved();
      })
      .catch((err: unknown) => {
        setPending(null);
        setAckRev(null);
        /* Forget our position on a refusal. A `stale_rev` means the sheet is somewhere we did
           not put it, and the only honest next move is to trust the next read. */
        wrote.current = null;
        setError(explain(err instanceof GatewayError ? err.code : 'offline'));
      })
      .finally(() => setSaving(false));
  }

  return {
    write,
    pending: visible,
    saving,
    error,
    clearError: () => setError(''),
    reportError: (err) => setError(explain(err instanceof GatewayError ? err.code : 'offline')),
  };
}
