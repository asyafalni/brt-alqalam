// Pinning every column list to the sheet template that Google actually receives.
//
// The failure this prevents is silent and slow: a column added to `sheets/Items.csv` but not
// here means the admin write path posts an object missing that key, `writeTab` writes it blank,
// and the register loses a field nobody notices until somebody looks for it on a shelf.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_COLUMNS, ITEM_COLUMNS, LOCATION_COLUMNS, REQUEST_COLUMNS, STOCK_COLUMNS,
  categoryRow, itemRow, locationRow, requestRow, stockRow,
} from './rows';
import type { Item } from '../domain/types';
import type { PurchaseRequest } from '../domain/requests';

const header = (tab: string) =>
  readFileSync(new URL(`../sheets/${tab}.csv`, import.meta.url), 'utf8')
    .split('\n')[0].trim().split(',');

describe('column lists match the sheet templates', () => {
  const cases: [string, readonly string[]][] = [
    ['Categories', CATEGORY_COLUMNS],
    ['Locations', LOCATION_COLUMNS],
    ['Items', ITEM_COLUMNS],
    ['Stock', STOCK_COLUMNS],
    ['Requests', REQUEST_COLUMNS],
  ];
  it.each(cases)('%s', (tab, columns) => {
    expect([...columns]).toEqual(header(tab));
  });
});

describe('a row carries every column and no others', () => {
  const item: Item = {
    itemId: 'itm-1', barcode: '', name: 'Sabun', categoryId: 'cat-1', kind: 'consumable',
    unit: 'botol', trackBy: 'quantity', minStock: 2, active: true,
  };

  it.each([
    ['Items', ITEM_COLUMNS, itemRow(item)],
    ['Stock', STOCK_COLUMNS, stockRow({ itemId: 'itm-1', locationId: '', initialStock: 4 })],
    ['Categories', CATEGORY_COLUMNS,
      categoryRow({ categoryId: 'c', name: 'Kebersihan', order: 1, active: true })],
    ['Locations', LOCATION_COLUMNS,
      locationRow({ locationId: 'l', code: 'A1', name: 'Rak A1', zone: 'Gudang', order: 1, active: true })],
  ])('%s', (_tab, columns, row) => {
    expect(Object.keys(row).sort()).toEqual([...columns].sort());
  });

  it('Requests', () => {
    const r: PurchaseRequest = {
      requestId: 'req-1', type: 'beli', name: 'Pisau', qty: 2, unit: 'buah',
      reason: 'habis', status: 'diajukan', requestedBy: 'usr-1', requestedTs: 0,
    };
    expect(Object.keys(requestRow(r)).sort()).toEqual([...REQUEST_COLUMNS].sort());
  });
});

describe('the cells that are easy to get subtly wrong', () => {
  const item: Item = {
    itemId: 'i', barcode: '', name: 'x', categoryId: 'c', kind: 'consumable',
    unit: 'buah', trackBy: 'quantity', minStock: null, active: false,
  };

  it('writes a null minimum as (-), which is not the same as zero', () => {
    expect(itemRow(item).minStock).toBe('(-)');
    expect(itemRow({ ...item, minStock: 0 }).minStock).toBe('0');
  });

  it('writes booleans as the sheet spells them', () => {
    expect(itemRow(item).active).toBe('FALSE');
    expect(itemRow({ ...item, active: true }).active).toBe('TRUE');
  });

  it('leaves an unpriced request blank rather than making it free', () => {
    const base: PurchaseRequest = {
      requestId: 'r', type: 'beli', name: 'x', qty: 1, unit: 'buah', reason: 'y',
      status: 'diajukan', requestedBy: 'u', requestedTs: 0,
    };
    expect(requestRow(base).price).toBe('');
    expect(requestRow({ ...base, price: 0 }).price).toBe('0');
  });

  it('writes timestamps as strict ISO, which is what the parser demands back', () => {
    const r = requestRow({
      requestId: 'r', type: 'beli', name: 'x', qty: 1, unit: 'buah', reason: 'y',
      status: 'diajukan', requestedBy: 'u', requestedTs: Date.UTC(2026, 8, 8, 1, 2, 3),
    });
    expect(r.requestedTs).toBe('2026-09-08T01:02:03.000Z');
    expect(r.decidedTs).toBe('');
  });
});
