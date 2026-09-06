import { describe, it, expect } from 'vitest';
import { parseRoute, routeToHash } from './route';

describe('parseRoute — printed labels must land somewhere real', () => {
  it('reads the two deep-link shapes the labels encode', () => {
    expect(parseRoute('#/scan?i=ITM-0001')).toEqual({ name: 'scan', target: 'item', id: 'ITM-0001' });
    expect(parseRoute('#/scan?a=ALQ-ITM-0004-001'))
      .toEqual({ name: 'scan', target: 'asset', id: 'ALQ-ITM-0004-001' });
  });

  it('prefers the asset when a link somehow carries both', () => {
    expect(parseRoute('#/scan?i=ITM-1&a=ALQ-1')).toMatchObject({ target: 'asset', id: 'ALQ-1' });
  });

  it('decodes escaped ids', () => {
    expect(parseRoute('#/scan?i=ITM%201')).toMatchObject({ id: 'ITM 1' });
  });

  it('handles a bare #/scan — a damaged label still reaches a screen that can explain', () => {
    expect(parseRoute('#/scan')).toEqual({ name: 'scan-empty' });
    expect(parseRoute('#/scan?i=')).toEqual({ name: 'scan-empty' });
  });

  it('tolerates a trailing slash', () => {
    expect(parseRoute('#/label/')).toEqual({ name: 'label' });
  });

  it('falls back to the stock-take rather than a dead end', () => {
    expect(parseRoute('#/')).toEqual({ name: 'opname' });
    expect(parseRoute('#/sesuatu')).toEqual({ name: 'opname' });
  });
});

describe('routeToHash round-trips', () => {
  it('re-parses to the same route', () => {
    for (const route of [
      { name: 'opname' as const },
      { name: 'label' as const },
      { name: 'board' as const },
      { name: 'scan' as const, target: 'asset' as const, id: 'ALQ-ITM-0004-001' },
      { name: 'scan' as const, target: 'item' as const, id: 'ITM-0001' },
    ]) {
      expect(parseRoute(routeToHash(route))).toEqual(route);
    }
  });
});
