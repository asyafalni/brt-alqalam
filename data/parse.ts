// The parse boundary: hostile CSV in, domain types out.
//
// WHY THIS EXISTS. `domain/types.ts` declares interfaces; TypeScript erases them at runtime.
// Our source of truth is a Google Sheet that humans edit by hand, so every value arriving here
// is a string of unknown shape. Without this layer the domain's types are a promise the
// compiler cannot keep, and a typo in one cell becomes NaN propagating silently through the
// reducer into a stock figure someone trusts.
//
// RULE: a bad row is QUARANTINED and reported, never silently dropped and never coerced into
// a plausible-looking lie. Losing a row quietly is worse than showing an error, because the
// whole point of the system is that the numbers can be believed.

import type { AssetInstance, Category, Item, Kind, Location, MovementType, TrackBy, Txn, Condition, InstanceStatus } from '../domain/types';
import { parseCsv, toRecords } from './csv';

export interface ParseIssue {
  /** 1-based row number in the sheet, counting the header — so it matches what the user sees. */
  row: number;
  field?: string;
  message: string;
  raw: Record<string, string>;
}

export interface ParseResult<T> {
  ok: T[];
  quarantined: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Field readers. Each returns a value or throws a FieldError naming the field,
// which the row loop turns into a quarantine entry.
// ---------------------------------------------------------------------------

class FieldError extends Error {
  constructor(readonly field: string, message: string) { super(message); }
}

const req = (r: Record<string, string>, f: string): string => {
  const v = r[f];
  if (v === undefined || v === '') throw new FieldError(f, `kolom "${f}" kosong`);
  return v;
};

/** Numbers as typed by a human: "10", "10.5", "10,5". Anything else is quarantined, not guessed. */
function num(r: Record<string, string>, f: string, fallback?: number): number {
  const v = (r[f] ?? '').replace(/\s/g, '');
  if (v === '') {
    if (fallback !== undefined) return fallback;
    throw new FieldError(f, `kolom "${f}" kosong`);
  }
  const normalised = /^-?\d+,\d+$/.test(v) ? v.replace(',', '.') : v;
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) {
    throw new FieldError(f, `"${r[f]}" bukan angka`);
  }
  return Number(normalised);
}

/** Setting Minimum: the spec allows "(-)" meaning *no minimum, never notify*. Blank means the same. */
function minStock(r: Record<string, string>): number | null {
  const v = (r['minstock'] ?? '').trim();
  if (v === '' || v === '-' || v === '(-)') return null;
  return num(r, 'minstock');
}

const TRUEISH = new Set(['true', 'ya', 'y', '1', 'aktif', 'yes']);
const FALSEISH = new Set(['false', 'tidak', 'n', '0', 'nonaktif', 'no']);
function bool(r: Record<string, string>, f: string, fallback: boolean): boolean {
  const v = (r[f] ?? '').trim().toLowerCase();
  if (v === '') return fallback;
  if (TRUEISH.has(v)) return true;
  if (FALSEISH.has(v)) return false;
  throw new FieldError(f, `"${r[f]}" bukan ya/tidak`);
}

// Plain-language kind labels, per design doc Part XI — admins type Indonesian, not enum values.
const KINDS: Record<string, Kind> = {
  consumable: 'consumable', 'bisa habis': 'consumable', habis: 'consumable', perlengkapan: 'consumable',
  equipment: 'equipment', 'barang tetap': 'equipment', tetap: 'equipment', peralatan: 'equipment',
};
function kind(r: Record<string, string>): Kind {
  const v = req(r, 'kind').toLowerCase();
  const k = KINDS[v];
  if (!k) throw new FieldError('kind', `"${r['kind']}" bukan jenis barang yang dikenal`);
  return k;
}

const TRACKS: Record<string, TrackBy> = {
  quantity: 'quantity', jumlah: 'quantity', qty: 'quantity',
  instance: 'instance', unit: 'instance', satuan: 'instance',
};
/** Defaults from `kind` (design doc §50): consumable→quantity, equipment→instance. Overridable. */
function trackBy(r: Record<string, string>, k: Kind): TrackBy {
  const v = (r['trackby'] ?? '').trim().toLowerCase();
  if (v === '') return k === 'consumable' ? 'quantity' : 'instance';
  const t = TRACKS[v];
  if (!t) throw new FieldError('trackby', `"${r['trackby']}" bukan cara hitung yang dikenal`);
  return t;
}

/**
 * Timestamps. The gateway writes ISO-8601 UTC; we also accept an epoch in ms.
 * A locale-formatted Sheets date ("9/6/2026 20:45:00") is AMBIGUOUS — 9 June or 6 September? —
 * so it is quarantined rather than guessed. Guessing here silently corrupts the 24-jam rule.
 */
const ISO = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/;

function ts(r: Record<string, string>, f = 'ts'): number {
  const v = req(r, f);
  if (/^\d{10,}$/.test(v)) return Number(v);

  // Strict ISO only. `Date.parse` would happily accept "9/6/2026" and silently pick a month
  // — 9 June or 6 September? — which would corrupt the 24-jam rule with no error anywhere.
  const m = ISO.exec(v);
  if (!m) throw new FieldError(f, `"${v}" bukan waktu ISO-8601 atau epoch ms`);

  // A zone-less ISO string is LOCAL time in JS, so the same row would parse differently in the
  // browser and in Apps Script. Pin it to UTC so client and gateway always agree.
  const [, date, time, zone] = m;
  const t = Date.parse(`${date}T${time ?? '00:00:00'}${zone ?? 'Z'}`);
  if (Number.isNaN(t)) throw new FieldError(f, `"${v}" bukan waktu yang sah`);
  return t;
}

function oneOf<T extends string>(r: Record<string, string>, f: string, allowed: readonly T[], optional: true): T | undefined;
function oneOf<T extends string>(r: Record<string, string>, f: string, allowed: readonly T[], optional?: false): T;
function oneOf<T extends string>(r: Record<string, string>, f: string, allowed: readonly T[], optional = false): T | undefined {
  const v = (r[f] ?? '').trim().toLowerCase();
  if (v === '') {
    if (optional) return undefined;
    throw new FieldError(f, `kolom "${f}" kosong`);
  }
  if (!(allowed as readonly string[]).includes(v)) {
    throw new FieldError(f, `"${r[f]}" bukan salah satu dari: ${allowed.join(', ')}`);
  }
  return v as T;
}

const MOVEMENTS = ['pemakaian', 'pengambilan', 'peminjaman', 'pengembalian', 'adjust', 'status_change', 'reversal'] as const;
const CONDITIONS = ['normal', 'rusak', 'hilang'] as const;
const STATUSES = ['available', 'out', 'broken', 'lost', 'retired'] as const;

// ---------------------------------------------------------------------------
// Row loop — shared by every parser so quarantine behaviour is identical.
// ---------------------------------------------------------------------------

function parseRows<T>(csv: string, build: (r: Record<string, string>) => T): ParseResult<T> {
  const records = toRecords(parseCsv(csv));
  const ok: T[] = [];
  const quarantined: ParseIssue[] = [];

  records.forEach((raw, i) => {
    const row = i + 2; // +1 for the header, +1 because sheets are 1-based
    try {
      ok.push(build(raw));
    } catch (e) {
      quarantined.push({
        row,
        field: e instanceof FieldError ? e.field : undefined,
        message: e instanceof Error ? e.message : String(e),
        raw,
      });
    }
  });

  return { ok, quarantined };
}

export const parseCategories = (csv: string): ParseResult<Category> =>
  parseRows(csv, (r) => ({
    categoryId: req(r, 'categoryid'),
    name: req(r, 'name'),
    order: num(r, 'order', 0),
    active: bool(r, 'active', true),
  }));

export const parseLocations = (csv: string): ParseResult<Location> =>
  parseRows(csv, (r) => ({
    locationId: req(r, 'locationid'),
    code: req(r, 'code'),
    // A rack can be known only by what is painted on it; the descriptive name is optional.
    name: r['name'] ?? '',
    zone: r['zone'] || 'Gudang',
    order: num(r, 'order', 0),
    active: bool(r, 'active', true),
  }));

export const parseItems = (csv: string): ParseResult<Item> =>
  parseRows(csv, (r) => {
    const k = kind(r);
    return {
      itemId: req(r, 'itemid'),
      barcode: r['barcode'] ?? '',
      name: req(r, 'name'),
      categoryId: req(r, 'categoryid'),
      kind: k,
      unit: req(r, 'unit'),
      trackBy: trackBy(r, k),
      minStock: minStock(r),
      initialStock: num(r, 'initialstock', 0),
      active: bool(r, 'active', true),
      // Blank is a real state, not an error: a catalog built before locations existed has
      // none, and "belum ditempatkan" is exactly the mess we want visible.
      ...(r['locationid'] ? { locationId: r['locationid'] } : {}),
    };
  });

export const parseInstances = (csv: string): ParseResult<AssetInstance> =>
  parseRows(csv, (r) => ({
    assetId: req(r, 'assetid'),
    itemId: req(r, 'itemid'),
    label: req(r, 'label'),
    acquiredTs: ts(r, 'acquiredts'),
    active: bool(r, 'active', true),
  }));

export const parseTxns = (csv: string): ParseResult<Txn> =>
  parseRows(csv, (r) => {
    const t: Txn = {
      txnId: req(r, 'txnid'),
      clientTxnId: req(r, 'clienttxnid'),
      ts: ts(r),
      type: oneOf<MovementType>(r, 'type', MOVEMENTS),
      qtyDelta: num(r, 'qtydelta', 0),
      actorUserId: req(r, 'actoruserid'),
    };
    // Optional columns: absent is fine, present-but-wrong is not.
    if (r['itemid']) t.itemId = r['itemid'];
    if (r['assetid']) t.assetId = r['assetid'];
    if (r['recipient']) t.recipient = r['recipient'];
    if (r['note']) t.note = r['note'];
    if (r['reversestxnid']) t.reversesTxnId = r['reversestxnid'];
    const cond = oneOf<Condition>(r, 'condition', CONDITIONS, true);
    if (cond) t.condition = cond;
    const to = oneOf<InstanceStatus>(r, 'tostatus', STATUSES, true);
    if (to) t.toStatus = to;

    if (!t.itemId && !t.assetId) {
      throw new FieldError('itemid', 'transaksi tanpa itemId maupun assetId');
    }
    return t;
  });

/** One-line summary for the admin "data bermasalah" banner. */
export const describeIssues = (issues: ParseIssue[]): string =>
  issues.map((i) => `Baris ${i.row}${i.field ? ` (${i.field})` : ''}: ${i.message}`).join('\n');
