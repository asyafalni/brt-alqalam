import { describe, it, expect } from 'vitest';
import { qrSvg, qrViewBox } from './qr';
import {
  labelsFor, scanUrl, isUnprintableBaseUrl, SHEET_FORMATS, perSheet, sheetCount,
} from './labels';
import { createEntry } from '../stocktake/draft';
import type { DraftInput } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import type { Item, Location, StockLine } from '../../../../domain/types';

const rak: Location = {
  locationId: 'LOC-B3', code: 'B3', name: 'Rak sabun', zone: 'Gudang Utama', order: 1, active: true,
};

const input = (p: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Sabun', categoryId: 'CAT-KEBERSIHAN', unit: 'galon',
  kind: 'consumable', initialStock: 10, minStock: 5, ...p,
});

/** Items and their stock lines together — quantity and placement live on the lines now. */
let lines: StockLine[] = [];
const catalog = (...inputs: DraftInput[]): Item[] => {
  lines = [];
  return inputs.reduce<Item[]>((acc, i) => {
    const built = createEntry(i, acc, lines);
    lines = built.stock;
    return [...acc, built.item];
  }, []);
};
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
    const sabun = catalog(input({ initialStock: 40 }))[0];
    const labels = labelsFor([sabun], SEED_CATEGORIES, [], base, TS0, lines);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      code: 'ALQ-ITM-0001',
      title: 'Sabun',
      subtitle: 'Kebersihan · galon',
      url: 'https://x.test/#/scan?i=ITM-0001',
    });
  });

  it('gives an instance-tracked durable one label per physical unit', () => {
    const pisau = catalog(input({ name: 'Pisau', kind: 'equipment', initialStock: 3 }))[0];
    const labels = labelsFor([pisau], SEED_CATEGORIES, [], base, TS0, lines);
    expect(labels.map((l) => l.title)).toEqual(['Pisau #1', 'Pisau #2', 'Pisau #3']);
    expect(labels[2].url).toBe('https://x.test/#/scan?a=ALQ-ITM-0001-003');
  });

  it('a counted durable gets a rack label, not one per unit', () => {
    const terpal = catalog(input({ name: 'Terpal', kind: 'equipment', trackBy: 'quantity', initialStock: 12 }))[0];
    expect(labelsFor([terpal], SEED_CATEGORIES, [], base, TS0, lines)).toHaveLength(1);
  });

  it('falls back to the raw id when a category was deleted', () => {
    const orphan = catalog(input({ categoryId: 'CAT-GONE' }))[0];
    expect(labelsFor([orphan], SEED_CATEGORIES, [], base, TS0, lines)[0].subtitle).toBe('CAT-GONE · galon');
  });
});

describe('racks get their own label — what §14.2 actually asked for', () => {
  const base = 'https://x.test';

  it('one label per rack, pointing at the rack', () => {
    const labels = labelsFor([], SEED_CATEGORIES, [rak], base, TS0, lines);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      code: 'LOC-B3',
      title: 'Rak B3',
      subtitle: 'Rak sabun',
      url: 'https://x.test/#/scan?l=LOC-B3',
    });
  });

  it('racks print first — they go on the shelves', () => {
    const sabun = catalog(input())[0];
    const labels = labelsFor([sabun], SEED_CATEGORIES, [rak], base, TS0, lines);
    expect(labels.map((l) => l.title)).toEqual(['Rak B3', 'Sabun']);
  });

  it('skips retired racks', () => {
    expect(labelsFor([], SEED_CATEGORIES, [{ ...rak, active: false }], base, TS0, lines)).toHaveLength(0);
  });

  it('falls back to the zone when a rack has no descriptive name', () => {
    const labels = labelsFor([], SEED_CATEGORIES, [{ ...rak, name: '' }], base, TS0, lines);
    expect(labels[0].subtitle).toBe('Gudang Utama');
  });
});

describe('sheet arithmetic', () => {
  const besar = SHEET_FORMATS.find((f) => f.id === 'rak')!;

  it('knows how many fit on a page', () => {
    // 21, not 24: `Label rak` is Avery L7160 (63.5 × 38.1, 3 × 7) now. The old 3 × 8 of 70 × 37
    // needed 210 × 296mm of a 194 × 281mm page and simply did not fit.
    expect(perSheet(besar)).toBe(21);
    expect(perSheet(SHEET_FORMATS.find((f) => f.id === 'tag')!)).toBe(40);
  });

  it('rounds up — a part-full page is still a page of stickers', () => {
    expect(sheetCount(0, besar)).toBe(0);
    expect(sheetCount(1, besar)).toBe(1);
    expect(sheetCount(21, besar)).toBe(1);
    expect(sheetCount(22, besar)).toBe(2);
  });
});

describe('every format actually fits on A4', () => {
  // The defect this pins: `Label rak` claimed 3 columns of 70mm and 8 rows of 37mm — 210 × 296mm
  // on a page with 194 × 281mm of printable area. The preview flowed happily; the printer would
  // have dropped a column and a row, and "24 per lembar A4" was a promise it could not keep.
  // Caught by arithmetic, which is the only way to catch it without wasting a sheet of stickers.
  const PAGE_W = 210 - 8 * 2;   // @page { size: A4; margin: 8mm }
  const PAGE_H = 297 - 8 * 2;

  for (const f of SHEET_FORMATS) {
    it(`${f.name} fits the printable area`, () => {
      expect(f.width * f.columns).toBeLessThanOrEqual(PAGE_W);
      expect(f.height * f.rows).toBeLessThanOrEqual(PAGE_H);
    });
  }

  it('says how many fit, and means it', () => {
    // `perSheet` is what the sheet counter and the slicing both use, so a format that lies
    // about its grid lies about how much paper somebody is about to use.
    for (const f of SHEET_FORMATS) expect(perSheet(f)).toBe(f.columns * f.rows);
  });
});
