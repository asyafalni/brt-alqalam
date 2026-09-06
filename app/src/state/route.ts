// Hash routing, as SmartInv does (frontend/index.tsx:13-20 uses HashRouter, and the live app
// is served at /#/login).
//
// It is also the right call for us independently: a hash route needs NO server rewrite, so a
// printed QR works on any static host with zero configuration. With path routing, a host
// missing its SPA fallback turns every sticker in the gudang into dead paper — a failure that
// shows up only after printing.

export type Route =
  | { name: 'beranda' }
  | { name: 'opname' }
  | { name: 'label' }
  | { name: 'board' }
  | { name: 'racks' }
  | { name: 'pindai' }
  | { name: 'scan'; target: 'item' | 'asset' | 'location'; id: string }
  | { name: 'scan-empty' };

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
  if (path === '/opname') return { name: 'opname' };
  if (path === '/label') return { name: 'label' };
  if (path === '/board') return { name: 'board' };
  if (path === '/racks') return { name: 'racks' };
  if (path === '/pindai') return { name: 'pindai' };
  return { name: 'beranda' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'label': return '#/label';
    case 'board': return '#/board';
    case 'racks': return '#/racks';
    case 'pindai': return '#/pindai';
    case 'opname': return '#/opname';
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
