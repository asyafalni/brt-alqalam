import { describe, it, expect } from 'vitest';
import { parseCsv, toRecords } from './csv';
import { parseItems, parseTxns, parseInstances, describeIssues } from './parse';

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

const ITEM_HEADER = 'itemId,barcode,name,categoryId,kind,unit,trackBy,minStock,initialStock,active\n';

describe('parseItems', () => {
  it('reads a well-formed row', () => {
    const r = parseItems(ITEM_HEADER + 'ITM-S,b1,Sabun,CAT-K,consumable,galon,quantity,5,10,TRUE');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toMatchObject({ itemId: 'ITM-S', kind: 'consumable', minStock: 5, initialStock: 10, active: true });
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
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,consumable,galon,quantity,5,"10,5",');
    expect(r.ok[0].initialStock).toBe(10.5);
  });

  it('quarantines a bad number instead of coercing it to NaN', () => {
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,consumable,galon,quantity,5,sepuluh,');
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

  it('rejects a movement type that is no longer in the model', () => {
    const r = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,digunakan,ITM-S,,-2,,u1,,,,');
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

describe('describeIssues', () => {
  it('renders issues for the admin banner with sheet row numbers', () => {
    const r = parseItems(ITEM_HEADER + 'A,,Sabun,C,consumable,galon,quantity,5,sepuluh,');
    expect(describeIssues(r.quarantined)).toBe('Baris 2 (initialstock): "sepuluh" bukan angka');
  });
});
