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

import { useState } from 'octane';
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
  const [atRev, setAtRev] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /* The overlay outlives the reply and dies at the next READ, because the gap between "the
     gateway has it" and "the poll shows it" is the whole reason the overlay exists. Once the
     revision has moved past the one we wrote at, the register itself is carrying the change. */
  const visible = atRev !== null && rev > atRev ? null : pending;

  function write(patch: CatalogPatch) {
    if (!url || !getToken) { setError('Belum masuk sebagai admin.'); return; }

    // Shown first, sent second. The rollback below is what keeps that honest.
    setPending((prev) => ({ ...(prev ?? {}), ...patch }));
    setSaving(true);
    setError('');

    getToken()
      .then((token) => putCatalog(url, token, rev, toTabs(patch)))
      .then(() => {
        // NOT cleared here — see `visible` above.
        setAtRev(rev);
        onSaved();
      })
      .catch((err: unknown) => {
        setPending(null);
        setAtRev(null);
        setError(explain(err instanceof GatewayError ? err.code : 'offline'));
      })
      .finally(() => setSaving(false));
  }

  return { write, pending: visible, saving, error, clearError: () => setError('') };
}
