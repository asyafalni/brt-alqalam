import { describe, it, expect } from 'vitest';
import { qrSvg, qrViewBox } from './qr';
import {
  labelsFor, scanUrl, isUnprintableBaseUrl, SHEET_FORMATS, perSheet, sheetCount,
} from './labels';
import { createItem } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});
const TS0 = Date.parse('2026-09-06T00:00:00Z');

describe('qrSvg', () => {
  it('produces a drawable path with a standards-compliant quiet zone', () => {
    const qr = qrSvg('https://inventaris.example/scan?i=ITM-0001');
    expect(qr.modules).toBeGreaterThan(20);
    expect(qr.quietZone).toBe(4);                       // below 4, scanners start failing
    expect(qrViewBox(qr)).toBe(qr.modules + 8);
    expect(qr.d.startsWith('M')).toBe(true);
  });

  it('is deterministic — the same payload prints the same label every time', () => {
    expect(qrSvg('ALQ-ITM-0001').d).toBe(qrSvg('ALQ-ITM-0001').d);
  });

  it('different payloads produce different codes', () => {
    expect(qrSvg('ALQ-ITM-0001').d).not.toBe(qrSvg('ALQ-ITM-0002').d);
  });

  it('merges horizontal runs rather than emitting one rect per module', () => {
    const qr = qrSvg('https://inventaris.example/scan?a=ALQ-ITM-0004-001');
    const subpaths = (qr.d.match(/M/g) ?? []).length;
    // Each `h<n>` is a run of n dark modules, so their sum is the dark-module count.
    const darkModules = [...qr.d.matchAll(/h(\d+)v/g)].reduce((n, m) => n + Number(m[1]), 0);

    expect(darkModules).toBeGreaterThan(0);
    expect(subpaths).toBeLessThan(darkModules);         // merging strictly reduces the path
    expect(darkModules / subpaths).toBeGreaterThan(1.5); // and meaningfully, not marginally
  });

  it('grows with the payload but still fits a long deep link', () => {
    const short = qrSvg('https://a.co/scan?i=ITM-0001');
    const long = qrSvg('https://inventaris-brt-alqalam.example.com/scan?a=ALQ-ITM-0004-137');
    expect(long.modules).toBeGreaterThanOrEqual(short.modules);
    expect(long.modules).toBeLessThanOrEqual(57);       // still scannable at 37mm
  });
});

describe('scanUrl', () => {
  it('uses ?i= for a stock location and ?a= for one physical unit', () => {
    expect(scanUrl('https://x.test', 'item', 'ITM-0001')).toBe('https://x.test/#/scan?i=ITM-0001');
    expect(scanUrl('https://x.test', 'asset', 'ALQ-ITM-0004-001'))
      .toBe('https://x.test/#/scan?a=ALQ-ITM-0004-001');
  });

  it('tolerates a trailing slash or hash rather than producing a double one', () => {
    expect(scanUrl('https://x.test/', 'item', 'ITM-1')).toBe('https://x.test/#/scan?i=ITM-1');
    expect(scanUrl('https://x.test/#', 'item', 'ITM-1')).toBe('https://x.test/#/scan?i=ITM-1');
  });

  it('escapes ids so a stray character cannot break the link', () => {
    expect(scanUrl('https://x.test', 'item', 'ITM 1&x')).toBe('https://x.test/#/scan?i=ITM%201%26x');
  });
});

describe('isUnprintableBaseUrl — a sticker outlives the laptop that printed it', () => {
  it('rejects dev-server and file addresses', () => {
    for (const url of ['http://localhost:5173', 'localhost', 'http://127.0.0.1:8080', 'file:///tmp/x', '   ']) {
      expect(isUnprintableBaseUrl(url)).toBe(true);
    }
  });

  it('accepts a real deployed address', () => {
    expect(isUnprintableBaseUrl('https://inventaris.example.com')).toBe(false);
  });
});

describe('labelsFor', () => {
  const base = 'https://x.test';

  it('gives a quantity-tracked item ONE label — the rack, not each bar of soap', () => {
    const sabun = createItem(input({ initialStock: 40 }), []);
    const labels = labelsFor([sabun], SEED_CATEGORIES, base, TS0);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      code: 'ALQ-ITM-0001',
      title: 'Sabun',
      subtitle: 'Kebersihan · galon',
      url: 'https://x.test/#/scan?i=ITM-0001',
    });
  });

  it('gives an instance-tracked durable one label per physical unit', () => {
    const pisau = createItem(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }), []);
    const labels = labelsFor([pisau], SEED_CATEGORIES, base, TS0);
    expect(labels.map((l) => l.title)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
    expect(labels[2].url).toBe('https://x.test/#/scan?a=ALQ-ITM-0001-003');
  });

  it('a counted durable gets a rack label, not one per unit', () => {
    const terpal = createItem(input({ name: 'Terpal', kind: 'equipment', trackBy: 'quantity', initialStock: 12 }), []);
    expect(labelsFor([terpal], SEED_CATEGORIES, base, TS0)).toHaveLength(1);
  });

  it('falls back to the raw id when a category was deleted', () => {
    const orphan = createItem(input({ categoryId: 'CAT-GONE' }), []);
    expect(labelsFor([orphan], SEED_CATEGORIES, base, TS0)[0].subtitle).toBe('CAT-GONE · galon');
  });
});

describe('sheet arithmetic', () => {
  const besar = SHEET_FORMATS[0];

  it('knows how many fit on a page', () => {
    expect(perSheet(besar)).toBe(24);
    expect(perSheet(SHEET_FORMATS[1])).toBe(40);
  });

  it('rounds up — a part-full page is still a page of stickers', () => {
    expect(sheetCount(0, besar)).toBe(0);
    expect(sheetCount(1, besar)).toBe(1);
    expect(sheetCount(24, besar)).toBe(1);
    expect(sheetCount(25, besar)).toBe(2);
  });
});
