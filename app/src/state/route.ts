// Hash routing, as SmartInv does (frontend/index.tsx:13-20 uses HashRouter, and the live app
// is served at /#/login).
//
// It is also the right call for us independently: a hash route needs NO server rewrite, so a
// printed QR works on any static host with zero configuration. With path routing, a host
// missing its SPA fallback turns every sticker in the gudang into dead paper — a failure that
// shows up only after printing.

/**
 * How the stock list is narrowed, and in what order — in the URL, so a filtered view is a
 * place you can be sent to. That is the whole reason these live here rather than in component
 * state: Beranda's "belum ditempatkan" count is only useful if tapping it lands on exactly
 * those rows, and a link somebody can send or bookmark costs nothing extra once it does.
 */
export type BoardFilter = 'semua' | 'menipis' | 'habis' | 'belum-ditempatkan' | 'minus';
export type BoardSort = 'nama' | 'stok-naik' | 'stok-turun' | 'rak';
/**
 * A different axis from `BoardFilter`, which is why it is its own parameter rather than two
 * more chips: "what needs attention" and "what kind of thing is it" combine — menipis AND bisa
 * habis is a real question, and one control cannot answer both at once.
 *
 * Spelled out rather than reusing the domain's `consumable`/`equipment`: `habis` alone already
 * means "run out" in `BoardFilter`, and two parameters using one word for two things is how a
 * URL becomes unreadable.
 */
export type BoardKind = 'semua' | 'bisa-habis' | 'barang-tetap';

export const BOARD_FILTERS: BoardFilter[] = ['semua', 'menipis', 'habis', 'belum-ditempatkan', 'minus'];
export const BOARD_SORTS: BoardSort[] = ['nama', 'stok-naik', 'stok-turun', 'rak'];
export const BOARD_KINDS: BoardKind[] = ['semua', 'bisa-habis', 'barang-tetap'];

export type Route =
  | { name: 'beranda' }
  /**
   * `edit` opens the item panel already filled in for one row.
   *
   * In the URL rather than in memory, like Pengajuan's prefill: the trip from a barang's page
   * survives a reload, and "ubah barang ini" becomes a link somebody can send. Consumed and
   * dropped from the address the moment the panel opens.
   */
  | { name: 'opname'; edit?: string }
  | { name: 'label' }
  | { name: 'board'; filter?: BoardFilter; category?: string; kind?: BoardKind; sort?: BoardSort }
  /** `id` opens straight onto one rack's panel — the stock list links to it by rack. */
  | { name: 'racks'; id?: string }
  | { name: 'pindai' }
  | { name: 'item'; id: string }
  | { name: 'laporan' }
  | { name: 'histori' }
  | { name: 'aset' }
  /**
   * `type` + `assetId` open the form already filled in for one unit — the link a broken or
   * lost asset offers. Carried in the URL rather than in memory so the trip through Aset
   * survives a reload, and so the link can be sent to somebody.
   */
  | { name: 'pengajuan'; type?: 'beli' | 'perbaikan'; assetId?: string }
  | { name: 'scan'; target: 'item' | 'asset' | 'location'; id: string }
  | { name: 'scan-empty' }
  /**
   * The one route that loads Clerk. Everything else on a kiosk runs without it, which is why
   * it is a route at all rather than a modal: reaching it is a deliberate act, and until
   * somebody performs it the tablet has never fetched a byte of Clerk (§64.2).
   */
  | { name: 'admin' }
  /**
   * Enrolling this device, from a QR an admin is holding up.
   *
   * The gateway address travels with it so a phone that has never opened this app needs nothing
   * typed at all — which is the whole point: a marbot standing in the gudang scans once and is
   * done. Both values are consumed and dropped from the URL immediately.
   */
  | { name: 'daftar'; gateway: string; secret: string }
  /** People, PINs and devices. A screen, because it outgrew the panel it started in. */
  | { name: 'kelola' };

/** Accepts a raw `location.hash` ("#/scan?i=X"), with or without the leading "#". */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [rawPath, rawQuery = ''] = raw.split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(rawQuery);

  if (path === '/scan') {
    // Most specific first: a unit is one physical thing, a rack is a place, an item is a kind.
    const asset = params.get('a');
    if (asset) return { name: 'scan', target: 'asset', id: asset };
    const location = params.get('l');
    if (location) return { name: 'scan', target: 'location', id: location };
    const item = params.get('i');
    if (item) return { name: 'scan', target: 'item', id: item };
    return { name: 'scan-empty' };
  }
  if (path === '/opname') {
    const edit = params.get('e');
    return edit ? { name: 'opname', edit } : { name: 'opname' };
  }
  if (path === '/barang') {
    const id = params.get('i');
    if (id) return { name: 'item', id };
  }
  if (path === '/label') return { name: 'label' };
  if (path === '/laporan') return { name: 'laporan' };
  if (path === '/histori') return { name: 'histori' };
  if (path === '/aset') return { name: 'aset' };
  if (path === '/pengajuan') {
    const asset = params.get('a');
    const type = params.get('t');
    if (asset && (type === 'beli' || type === 'perbaikan')) {
      return { name: 'pengajuan', type, assetId: asset };
    }
    return { name: 'pengajuan' };
  }
  if (path === '/board') {
    // Anything unrecognised is dropped rather than rejected: a stale or hand-typed link should
    // land on the unfiltered list, not on an error page about a query string.
    const filter = params.get('f') as BoardFilter | null;
    const sort = params.get('s') as BoardSort | null;
    const kind = params.get('k') as BoardKind | null;
    const category = params.get('c');
    return {
      name: 'board',
      ...(filter && filter !== 'semua' && BOARD_FILTERS.includes(filter) ? { filter } : {}),
      ...(sort && sort !== 'nama' && BOARD_SORTS.includes(sort) ? { sort } : {}),
      ...(kind && kind !== 'semua' && BOARD_KINDS.includes(kind) ? { kind } : {}),
      ...(category ? { category } : {}),
    };
  }
  if (path === '/racks') {
    const id = params.get('r');
    return id ? { name: 'racks', id } : { name: 'racks' };
  }
  if (path === '/pindai') return { name: 'pindai' };
  if (path === '/admin') return { name: 'admin' };
  if (path === '/kelola') return { name: 'kelola' };
  if (path === '/daftar') {
    const gateway = params.get('g');
    const secret = params.get('s');
    if (gateway && secret) return { name: 'daftar', gateway, secret };
  }
  return { name: 'beranda' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'label': return '#/label';
    case 'laporan': return '#/laporan';
    case 'histori': return '#/histori';
    case 'aset': return '#/aset';
    case 'pengajuan': return route.assetId && route.type
      ? `#/pengajuan?t=${route.type}&a=${encodeURIComponent(route.assetId)}`
      : '#/pengajuan';
    case 'board': {
      // Defaults are left out, so the plain list has a plain URL and the params that ARE there
      // all mean something.
      const q = new URLSearchParams();
      if (route.filter && route.filter !== 'semua') q.set('f', route.filter);
      if (route.category) q.set('c', route.category);
      if (route.kind && route.kind !== 'semua') q.set('k', route.kind);
      if (route.sort && route.sort !== 'nama') q.set('s', route.sort);
      const query = q.toString();
      return query === '' ? '#/board' : `#/board?${query}`;
    }
    case 'racks': return route.id ? `#/racks?r=${encodeURIComponent(route.id)}` : '#/racks';
    case 'pindai': return '#/pindai';
    case 'admin': return '#/admin';
    case 'kelola': return '#/kelola';
    case 'daftar':
      return `#/daftar?g=${encodeURIComponent(route.gateway)}&s=${encodeURIComponent(route.secret)}`;
    case 'opname':
      return route.edit ? `#/opname?e=${encodeURIComponent(route.edit)}` : '#/opname';
    case 'item': return `#/barang?i=${encodeURIComponent(route.id)}`;
    case 'scan': {
      const key = route.target === 'asset' ? 'a' : route.target === 'location' ? 'l' : 'i';
      return `#/scan?${key}=${encodeURIComponent(route.id)}`;
    }
    case 'scan-empty': return '#/scan';
    default: return '#/';
  }
}

/**
 * Turn whatever a camera decoded into a destination, or `null` if it means nothing to us.
 *
 * Accepts three shapes, because a gudang accumulates labels from more than one source:
 *  1. Our own deep links — the full URL a printed label encodes.
 *  2. A bare id, for a label printed before deep links, or hand-written, or read off a
 *     different system. An id we recognise is still useful even without a URL around it.
 *  3. Anything else → null, so the UI can say "label ini bukan milik sistem ini" rather
 *     than silently doing nothing, which reads as a broken camera.
 */
export function routeFromScan(text: string): Route | null {
  const raw = text.trim();
  if (raw === '') return null;

  // 1. A URL of ours. Only the hash matters; the host may be a phone's saved shortcut,
  //    a different deployment, or plain http on the LAN.
  const hashAt = raw.indexOf('#/');
  if (hashAt !== -1) {
    const route = parseRoute(raw.slice(hashAt));
    return route.name === 'scan' ? route : null;
  }

  // 2. A bare id. Order matters: an assetId contains its item's barcode as a prefix, so
  //    the most specific pattern has to be tested first.
  if (/^ALQ-ITM-\d+-\d+$/i.test(raw)) return { name: 'scan', target: 'asset', id: raw.toUpperCase() };
  if (/^LOC-[A-Z0-9_-]+$/i.test(raw)) return { name: 'scan', target: 'location', id: raw.toUpperCase() };
  if (/^(ALQ-)?ITM-\d+$/i.test(raw)) return { name: 'scan', target: 'item', id: raw.toUpperCase() };

  return null;
}
