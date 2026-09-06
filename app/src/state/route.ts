// Hash routing, as SmartInv does (frontend/index.tsx:13-20 uses HashRouter, and the live app
// is served at /#/login).
//
// It is also the right call for us independently: a hash route needs NO server rewrite, so a
// printed QR works on any static host with zero configuration. With path routing, a host
// missing its SPA fallback turns every sticker in the gudang into dead paper — a failure that
// shows up only after printing.

export type Route =
  | { name: 'opname' }
  | { name: 'label' }
  | { name: 'board' }
  | { name: 'racks' }
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
  if (path === '/label') return { name: 'label' };
  if (path === '/board') return { name: 'board' };
  if (path === '/racks') return { name: 'racks' };
  return { name: 'opname' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'label': return '#/label';
    case 'board': return '#/board';
    case 'racks': return '#/racks';
    case 'scan': {
      const key = route.target === 'asset' ? 'a' : route.target === 'location' ? 'l' : 'i';
      return `#/scan?${key}=${encodeURIComponent(route.id)}`;
    }
    case 'scan-empty': return '#/scan';
    default: return '#/';
  }
}
