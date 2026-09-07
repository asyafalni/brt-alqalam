import { describe, it, expect } from 'vitest';
import { parseCsv, toRecords } from './csv';
import { parseItems, parseStock, parseTxns, parseInstances, parseLocations, describeIssues } from './parse';

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines', () => {
    const rows = parseCsv('a,b\n"has, comma","has ""quote"""\n"multi\nline",x\n');
    expect(rows).toEqual([['a', 'b'], ['has, comma', 'has "quote"'], ['multi\nline', 'x']]);
  });

  it('strips the BOM Sheets exports, so the first header is usable', () => {
    expect(toRecords(parseCsv('﻿name\nSabun'))[0]).toEqual({ name: 'Sabun' });
  });

  it('drops the blank rows Sheets pads exports with', () => {
    expect(parseCsv('a\n1\n\n,\n')).toEqual([['a'], ['1']]);
  });
});

const ITEM_HEADER = 'itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,initialStock,active,locationId,keterangan\n';
const STOCK_HEADER = 'itemId,locationId,initialStock\n';

describe('parseItems', () => {
  it('reads a well-formed row', () => {
    const r = parseItems(ITEM_HEADER + 'ITM-S,b1,Sabun,CAT-K,consumable,galon,quantity,5,10,TRUE,LOC-A1,pemakaian');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toMatchObject({
      itemId: 'ITM-S', kind: 'consumable', minStock: 5, active: true, keterangan: 'pemakaian',
    });
  });

  it('ignores the legacy stock and location columns rather than choking on them', () => {
    // Quantity and placement moved to the Stock tab. An Items sheet exported before that still
    // carries both columns, and a catalog that refuses to load is a worse answer than one that
    // reads the fields it still owns.
    const r = parseItems(ITEM_HEADER + 'ITM-S,b1,Sabun,CAT-K,consumable,galon,quantity,5,10,TRUE,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].keterangan).toBeUndefined();
  });

  it('validates the item KETERANGAN when present, rather than storing any word', () => {
    const bad = parseItems(ITEM_HEADER + 'ITM-S,b1,Sabun,CAT-K,consumable,galon,quantity,5,10,TRUE,,sesuatu');
    expect(bad.ok).toHaveLength(0);
    expect(bad.quarantined[0].field).toBe('keterangan');
  });

  it('accepts the plain-language kind labels admins actually type', () => {
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,Bisa Habis,galon,,5,10,\nB,,Pisau,C,Barang Tetap,buah,,,0,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok.map((i) => i.kind)).toEqual(['consumable', 'equipment']);
  });

  it('defaults trackBy from kind when the column is blank', () => {
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,consumable,galon,,5,10,\nB,,Pisau,C,equipment,buah,,,0,');
    expect(r.ok.map((i) => i.trackBy)).toEqual(['quantity', 'instance']);
  });

  it('reads Setting Minimum "(-)" as null — no minimum, never notify', () => {
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,consumable,galon,quantity,(-),10,\nB,,Es,C,consumable,pak,quantity,-,3,\nC,,Gas,C,consumable,tabung,quantity,,3,');
    expect(r.ok.map((i) => i.minStock)).toEqual([null, null, null]);
  });

  it('accepts a comma decimal separator', () => {
    const r = parseStock(STOCK_HEADER + 'A,LOC-A1,"10,5"');
    expect(r.ok[0].initialStock).toBe(10.5);
  });

  it('quarantines a bad number instead of coercing it to NaN', () => {
    const r = parseStock(STOCK_HEADER + 'A,LOC-A1,sepuluh');
    expect(r.ok).toHaveLength(0);
    expect(r.quarantined[0]).toMatchObject({ row: 2, field: 'initialstock' });
    expect(r.quarantined[0].message).toContain('bukan angka');
  });

  it('quarantines an unknown kind, and keeps the good rows around it', () => {
    const r = parseItems(ITEM_HEADER
      + 'A,,Sabun,C,consumable,galon,quantity,5,10,\n'
      + 'B,,Aneh,C,barang ajaib,buah,,,0,\n'
      + 'C,,Pisau,C,equipment,buah,,,0,');
    expect(r.ok.map((i) => i.itemId)).toEqual(['A', 'C']);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].row).toBe(3);
  });

  it('quarantines a row missing a required column', () => {
    const r = parseItems(ITEM_HEADER + ',,Sabun,C,consumable,galon,quantity,5,10,');
    expect(r.quarantined[0]).toMatchObject({ field: 'itemid' });
  });
});

const TXN_HEADER = 'txnId,clientTxnId,ts,type,itemId,assetId,qtyDelta,recipient,actorUserId,condition,note,toStatus,reversesTxnId\n';

describe('parseTxns', () => {
  it('reads ISO-8601 and epoch-ms timestamps', () => {
    const r = parseTxns(TXN_HEADER
      + 'T1,c1,2026-09-06T13:45:00Z,pemakaian,ITM-S,,-2,,u1,,,,\n'
      + 'T2,c2,1757166300000,pemakaian,ITM-S,,-1,,u1,,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].ts).toBe(Date.parse('2026-09-06T13:45:00Z'));
    expect(r.ok[1].ts).toBe(1757166300000);
  });

  it('quarantines an ambiguous locale date rather than guessing the month', () => {
    // Date.parse() would accept this and pick a month on its own — 9 June or 6 September?
    for (const bad of ['9/6/2026 20:45:00', '06-09-2026', '6 Sep 2026']) {
      const r = parseTxns(TXN_HEADER + `T1,c1,${bad},pemakaian,ITM-S,,-2,,u1,,,,`);
      expect(r.ok).toHaveLength(0);
      expect(r.quarantined[0].field).toBe('ts');
    }
  });

  it('pins a zone-less ISO timestamp to UTC so client and gateway agree', () => {
    const r = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00,pemakaian,ITM-S,,-2,,u1,,,,');
    expect(r.ok[0].ts).toBe(Date.parse('2026-09-06T13:45:00Z'));
  });

  it('accepts all five keterangan the spec offers, digunakan included', () => {
    for (const type of ['pemakaian', 'pengambilan', 'peminjaman', 'pengembalian', 'digunakan']) {
      const r = parseTxns(TXN_HEADER + `T1,c1,2026-09-06T13:45:00Z,${type},ITM-S,,-2,,u1,,,,`);
      expect(r.quarantined).toEqual([]);
      expect(r.ok[0].type).toBe(type);
    }
  });

  it('rejects a movement type that is not in the model', () => {
    const r = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,dipakai,ITM-S,,-2,,u1,,,,');
    expect(r.quarantined[0]).toMatchObject({ field: 'type' });
  });

  it('keeps optional columns optional but validates them when present', () => {
    const ok = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,pengembalian,,A-P7,0,,u1,rusak,,,');
    expect(ok.ok[0]).toMatchObject({ assetId: 'A-P7', condition: 'rusak' });
    const bad = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,pengembalian,,A-P7,0,,u1,penyok,,,');
    expect(bad.quarantined[0].field).toBe('condition');
  });

  it('quarantines a transaction that points at nothing', () => {
    const r = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,pemakaian,,,-2,,u1,,,,');
    expect(r.quarantined[0].message).toContain('tanpa itemId');
  });
});

describe('parseInstances', () => {
  it('reads an asset instance', () => {
    const r = parseInstances('assetId,itemId,label,acquiredTs,active\nA-P7,ITM-P,Pisau #7,2026-01-01T00:00:00Z,TRUE');
    expect(r.ok[0]).toMatchObject({ assetId: 'A-P7', label: 'Pisau #7', active: true });
  });
});

describe('parseStock', () => {
  it('reads how much of one item sits on one rack', () => {
    const r = parseStock(STOCK_HEADER + 'ITM-S,LOC-A1,4\nITM-S,LOC-A3,6');
    expect(r.quarantined).toEqual([]);
    expect(r.ok).toEqual([
      { itemId: 'ITM-S', locationId: 'LOC-A1', initialStock: 4 },
      { itemId: 'ITM-S', locationId: 'LOC-A3', initialStock: 6 },
    ]);
  });

  it('reads a blank rack as the unplaced pile, not as an error', () => {
    // The stock nobody has put away is the stock most likely to go missing, so it has to be a
    // line like any other rather than something the parser refuses.
    const r = parseStock(STOCK_HEADER + 'ITM-S,,3');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].locationId).toBe('');
  });

  it('quarantines a line with no item to belong to', () => {
    expect(parseStock(STOCK_HEADER + ',LOC-A1,3').quarantined[0].field).toBe('itemid');
  });
});

describe('describeIssues', () => {
  it('renders issues for the admin banner with sheet row numbers', () => {
    const r = parseStock(STOCK_HEADER + 'A,LOC-A1,sepuluh');
    expect(describeIssues(r.quarantined)).toBe('Baris 2 (initialstock): "sepuluh" bukan angka');
  });
});

describe('parseLocations', () => {
  const HEADER = 'locationId,code,name,zone,order,active\n';

  it('reads a rack', () => {
    const r = parseLocations(HEADER + 'LOC-A1,A1,Rak sabun,Gudang Utama,1,TRUE');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toEqual({
      locationId: 'LOC-A1', code: 'A1', name: 'Rak sabun', zone: 'Gudang Utama', order: 1, active: true,
    });
  });

  it('accepts a rack known only by what is painted on it', () => {
    const r = parseLocations(HEADER + 'LOC-A1,A1,,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toMatchObject({ code: 'A1', name: '', zone: 'Gudang', order: 0, active: true });
  });

  it('quarantines a rack with no code — an unlabelled shelf helps nobody find anything', () => {
    const r = parseLocations(HEADER + 'LOC-A1,,Rak sabun,Gudang Utama,1,TRUE');
    expect(r.ok).toHaveLength(0);
    expect(r.quarantined[0]).toMatchObject({ field: 'code' });
  });
});
