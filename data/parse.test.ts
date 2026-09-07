import { describe, it, expect } from 'vitest';
import { parseCsv, toRecords } from './csv';
import { parseItems, parseStock, parseRequests, parseTxns, parseInstances, parseLocations, describeIssues } from './parse';

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

const REQ2_HEADER = 'requestId,type,name,itemId,assetId,qty,unit,price,reason,url,status,requestedBy,requestedTs,decidedBy,decidedTs,note\n';
/** Deliberately the header from before repairs existed — those rows are still in the sheet. */
const REQ_HEADER = 'requestId,name,itemId,qty,unit,price,reason,url,status,requestedBy,requestedTs,decidedBy,decidedTs,note\n';

describe('parseRequests', () => {
  it('reads a request with everything filled in', () => {
    const r = parseRequests(REQ_HEADER
      + 'REQ-0001,Sapu ijuk,,2,buah,25000,Yang lama patah,https://toko.example/sapu,diajukan,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toMatchObject({
      requestId: 'REQ-0001', name: 'Sapu ijuk', qty: 2, price: 25000,
      reason: 'Yang lama patah', status: 'diajukan',
    });
    expect(r.ok[0].requestedTs).toBe(Date.parse('2026-09-06T10:00:00Z'));
  });

  it('leaves price and link absent rather than zero when they were not known', () => {
    // "Berapa harganya" and "beli di mana" are usually the questions being asked, not answers.
    const r = parseRequests(REQ_HEADER
      + 'REQ-0002,Kanebo,,3,buah,,Habis,,diajukan,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.ok[0].price).toBeUndefined();
    expect(r.ok[0].url).toBeUndefined();
  });

  it('rejects a status that is not in the model', () => {
    const r = parseRequests(REQ_HEADER
      + 'REQ-0003,Sapu,,1,buah,,Alasan,,menunggu,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined[0].field).toBe('status');
  });

  it('quarantines a request with no reason — nobody can act on it', () => {
    const r = parseRequests(REQ_HEADER
      + 'REQ-0004,Sapu,,1,buah,,,,diajukan,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined[0].field).toBe('reason');
  });

  // The four tests above all use the pre-repair header, which is the point: those rows are
  // still in the sheet and must keep reading.
  it('calls a row from before repairs existed a purchase, because that is what it was', () => {
    const r = parseRequests(REQ_HEADER
      + 'REQ-0005,Sapu,,1,buah,,Habis,,diajukan,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.ok[0].type).toBe('beli');
  });

  it('still reads the old statuses, which we renamed and the sheet did not', () => {
    // Quarantining real rows over words we changed ourselves would be our bug reported as
    // their data problem.
    const r = parseRequests(REQ_HEADER
      + 'REQ-0008,Sapu,,1,buah,,Habis,,ditolak,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].status).toBe('dibatalkan');
  });

  it('still reads the old "dibeli" status, which we renamed and it did not', () => {
    // Renaming a value does not travel back and rewrite history. Quarantining real rows over a
    // word we changed ourselves would be our bug reported as their data problem.
    const r = parseRequests(REQ_HEADER
      + 'REQ-0006,Sapu,,1,buah,,Habis,,dibeli,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].status).toBe('selesai');
  });

  it('reads a repair and the unit it is about', () => {
    const r = parseRequests(REQ2_HEADER
      + 'REQ-0007,perbaikan,Mesin potong rumput,ITM-9,AST-9-2,1,,185000,Tali starter putus,,diajukan,USR-1,2026-09-06T10:00:00Z,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0]).toMatchObject({ type: 'perbaikan', assetId: 'AST-9-2', unit: '' });
  });
});

describe('a movement remembers which shelf it came off', () => {
  // The column was missing from `sheets/Transactions.csv` and from the gateway's own column
  // list — and `checkSpreadsheet()` reported "header matches" because both were wrong the same
  // way. Every withdrawal would have folded onto the unplaced pile, and the register would have
  // said nothing was ever taken from any rack.
  const HEADER = 'txnId,clientTxnId,ts,type,itemId,assetId,locationId,qtyDelta,recipient,'
    + 'actorUserId,condition,note,toStatus,reversesTxnId\n';

  it('reads the rack a quantity came from', () => {
    const r = parseTxns(HEADER
      + 'T1,c1,2026-09-06T13:45:00Z,pemakaian,ITM-S,,LOC-A1,-2,,u1,,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].locationId).toBe('LOC-A1');
  });

  it('still reads a log written before the column existed', () => {
    // Those rows fold onto the unplaced pile, which is visibly wrong rather than quietly wrong
    // (§87) — and quarantining them over a column we added ourselves would be worse.
    const r = parseTxns(TXN_HEADER + 'T1,c1,2026-09-06T13:45:00Z,pemakaian,ITM-S,,-2,,u1,,,,');
    expect(r.quarantined).toEqual([]);
    expect(r.ok[0].locationId).toBeUndefined();
  });
});
