import { describe, it, expect } from 'vitest';
import { parseRoute, routeFromScan, routeToHash } from './route';

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

  it('falls back to the dashboard rather than a dead end', () => {
    expect(parseRoute('#/')).toEqual({ name: 'beranda' });
    expect(parseRoute('#/sesuatu')).toEqual({ name: 'beranda' });
  });

  it('the stock-take has its own address now that home is the dashboard', () => {
    expect(parseRoute('#/opname')).toEqual({ name: 'opname' });
  });
});

describe('routeToHash round-trips', () => {
  it('re-parses to the same route', () => {
    for (const route of [
      { name: 'beranda' as const },
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

describe('routeFromScan — what the camera decoded', () => {
  it('reads our own printed deep links', () => {
    expect(routeFromScan('https://inventaris.example.com/#/scan?l=LOC-A1'))
      .toEqual({ name: 'scan', target: 'location', id: 'LOC-A1' });
    expect(routeFromScan('http://192.168.1.5:5173/#/scan?a=ALQ-ITM-0004-003'))
      .toEqual({ name: 'scan', target: 'asset', id: 'ALQ-ITM-0004-003' });
  });

  it('ignores the host — a label may predate the current deployment', () => {
    expect(routeFromScan('https://old-host.test/#/scan?i=ITM-0001'))
      .toEqual({ name: 'scan', target: 'item', id: 'ITM-0001' });
  });

  it('accepts a bare id, for labels printed before deep links or written by hand', () => {
    expect(routeFromScan('LOC-A1')).toMatchObject({ target: 'location', id: 'LOC-A1' });
    expect(routeFromScan('ITM-0001')).toMatchObject({ target: 'item', id: 'ITM-0001' });
    expect(routeFromScan('ALQ-ITM-0004')).toMatchObject({ target: 'item', id: 'ALQ-ITM-0004' });
  });

  it('reads a unit id as a unit, not as the item it belongs to', () => {
    // The assetId contains the item's barcode as a prefix, so order of matching decides this.
    expect(routeFromScan('ALQ-ITM-0004-003')).toMatchObject({ target: 'asset', id: 'ALQ-ITM-0004-003' });
  });

  it('is case- and whitespace-tolerant, because label printers and people are not', () => {
    expect(routeFromScan('  loc-a1  ')).toMatchObject({ target: 'location', id: 'LOC-A1' });
  });

  it('returns null for anything else, so the UI can say so rather than look broken', () => {
    for (const junk of ['', '   ', 'https://google.com', 'hello world', '4901234567894']) {
      expect(routeFromScan(junk)).toBeNull();
    }
  });

  it('returns null for one of our URLs that names nothing', () => {
    expect(routeFromScan('https://x.test/#/scan')).toBeNull();
    expect(routeFromScan('https://x.test/#/board')).toBeNull();
  });
});
