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
  | { name: 'scan'; target: 'item' | 'asset'; id: string }
  | { name: 'scan-empty' };

/** Accepts a raw `location.hash` ("#/scan?i=X"), with or without the leading "#". */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [rawPath, rawQuery = ''] = raw.split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(rawQuery);

  if (path === '/scan') {
    const asset = params.get('a');
    if (asset) return { name: 'scan', target: 'asset', id: asset };
    const item = params.get('i');
    if (item) return { name: 'scan', target: 'item', id: item };
    return { name: 'scan-empty' };
  }
  if (path === '/label') return { name: 'label' };
  if (path === '/board') return { name: 'board' };
  return { name: 'opname' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'label': return '#/label';
    case 'board': return '#/board';
    case 'scan': return `#/scan?${route.target === 'asset' ? 'a' : 'i'}=${encodeURIComponent(route.id)}`;
    case 'scan-empty': return '#/scan';
    default: return '#/';
  }
}
