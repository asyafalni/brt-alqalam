// Draft persistence for the stock-take.
//
// localStorage, not IndexedDB: a stock-take draft is a few hundred small rows, and the real
// safety net is the CSV export, not the storage engine. IndexedDB is reserved for the Phase-3
// offline transaction queue, where durability under replay actually matters.
//
// Every read is defensive. A half-written or hand-edited value must not white-screen a tablet
// in a gudang — we would rather start empty and say so than crash.

const KEY = 'brt.stocktake.draft.v1';

export function loadDraft<T>(isValid: (v: unknown) => v is T[]): T[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDraft<T>(items: readonly T[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Quota or private mode. The draft stays in memory and the export still works.
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
