import { describe, it, expect } from 'vitest';
import { readCsv } from './ImportPanel';

describe('working out which tab a file is', () => {
  // By HEADER, not by name: a downloaded file is routinely "Items (1).csv", or renamed, or
  // re-exported from Sheets under a different name. The columns cannot be wrong.
  it('reads a catalog', () => {
    const read = readCsv(
      'itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,active,artId\n'
      + 'ITM-0001,ALQ-ITM-0001,Sabun,CAT-K,consumable,galon,quantity,5,true,',
    );
    expect(read).toMatchObject({ tab: 'Items', count: 1 });
    expect(read?.items?.[0].name).toBe('Sabun');
  });

  it('tells Stock from Items, which share a column', () => {
    // Both carry `itemId`; only one carries `initialStock`, so the more specific test runs
    // first. Getting this backwards would silently import shelves as a catalog.
    const read = readCsv('itemId,locationId,initialStock\nITM-0001,LOC-A1,12');
    expect(read?.tab).toBe('Stock');
    expect(read?.stock?.[0]).toEqual({ itemId: 'ITM-0001', locationId: 'LOC-A1', initialStock: 12 });
  });

  it('reads racks and requests', () => {
    expect(readCsv('locationId,code,name,zone,order,active\nLOC-A1,A1,Rak sabun,Gudang,0,true')?.tab)
      .toBe('Locations');
    expect(readCsv('requestId,type,name,itemId,assetId,qty,unit,price,reason,url,status,requestedBy,requestedTs,decidedBy,decidedTs,note\n'
      + 'REQ-1,beli,Sapu,,,1,buah,,Habis,,diajukan,USR-1,2026-09-06T10:00:00Z,,,')?.tab)
      .toBe('Requests');
  });

  it('says no rather than guessing at a file it does not know', () => {
    // A wrong guess imports somebody's shopping list as their catalog.
    expect(readCsv('nama,jumlah\nSabun,12')).toBeNull();
  });

  it('surfaces a bad row instead of dropping it', () => {
    // A silent skip is how somebody finds out three months later that a shelf was never
    // restored. A hand-edited spreadsheet is a hostile data source (§58 decision 8).
    const read = readCsv(
      'itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,active\n'
      + 'ITM-0001,ALQ-ITM-0001,Sabun,CAT-K,consumable,galon,quantity,5,true\n'
      + 'ITM-0002,ALQ-ITM-0002,,CAT-K,consumable,galon,quantity,5,true',
    );
    expect(read?.count).toBe(1);
    expect(read?.issues[0]).toMatchObject({ field: 'name' });
  });
});
