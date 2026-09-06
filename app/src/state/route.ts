// A 60-line router. Pure parsing here; the hook lives in useRoute.ts.
//
// Why not @octanejs/tanstack-router yet: three routes, no nesting, no loaders, no code
// splitting. A router earns its place when there is something to route — until then it is a
// pre-1.0 binding surface between us and the one thing a printed label depends on.
//
// Paths, not hashes: a QR encoding `#/scan?a=X` is uglier and some scanner apps mangle the
// fragment. Paths need SPA fallback on the host, which is one line of config (see SETUP.md).

export type Route =
  | { name: 'opname' }
  | { name: 'label' }
  | { name: 'board' }
  | { name: 'scan'; target: 'item' | 'asset'; id: string }
  | { name: 'scan-empty' };

export function parseRoute(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);

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

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'label': return '/label';
    case 'board': return '/board';
    case 'scan': return `/scan?${route.target === 'asset' ? 'a' : 'i'}=${encodeURIComponent(route.id)}`;
    case 'scan-empty': return '/scan';
    default: return '/';
  }
}
