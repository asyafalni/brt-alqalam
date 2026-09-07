// Stock lines — how much of an item sits on which rack.
//
// Pure. No I/O, no framework. Everything here returns a new array: the lines are folded into
// derived state by `deriveState`, and a helper that mutated them in place would be a second,
// quieter way for the register to change.
//
// The `''` locationId is the unplaced pile and is treated as an ordinary rack throughout, not
// as an absence. That is deliberate — §0's second problem is that things go missing, and stock
// nobody has placed is the stock most likely to. Modelling it as "no line" would make the one
// state we most want visible the one state with nothing to render.

import type { Item, StockLine } from './types';

export const UNPLACED = '';

export const linesFor = (stock: readonly StockLine[], itemId: string): StockLine[] =>
  stock.filter((l) => l.itemId === itemId);

export const linesAt = (stock: readonly StockLine[], locationId: string): StockLine[] =>
  stock.filter((l) => l.locationId === locationId);

export const lineAt = (
  stock: readonly StockLine[], itemId: string, locationId: string,
): StockLine | undefined => stock.find((l) => l.itemId === itemId && l.locationId === locationId);

/**
 * Opening total across every rack. This is the number the minimum is compared against — a
 * thing that is running out is running out wherever it happens to be shelved.
 *
 * Opening, not current: movements are folded on top of these lines by `deriveState`, never
 * into them. Anything wanting the live figure asks the derivation.
 */
export const totalFor = (stock: readonly StockLine[], itemId: string): number =>
  linesFor(stock, itemId).reduce((n, l) => n + l.initialStock, 0);

/** Where this item is kept, unplaced included. Order follows the array, which follows entry. */
export const racksFor = (stock: readonly StockLine[], itemId: string): string[] =>
  linesFor(stock, itemId).map((l) => l.locationId);

/**
 * Set the opening quantity for one item on one rack, creating the line if it is new.
 *
 * A zero is KEPT rather than deleted. "We keep sabun on A1 and it has run out" and "sabun was
 * never kept on A1" are different facts, and only the first earns a walk to the shelf or a
 * place on a shopping list. Removing the line is `removeLine`, and it means the second thing.
 */
export function setLine(
  stock: readonly StockLine[], itemId: string, locationId: string, initialStock: number,
): StockLine[] {
  const existing = stock.some((l) => l.itemId === itemId && l.locationId === locationId);
  return existing
    ? stock.map((l) => (l.itemId === itemId && l.locationId === locationId
      ? { ...l, initialStock }
      : l))
    : [...stock, { itemId, locationId, initialStock }];
}

/** This item is no longer kept here at all. */
export const removeLine = (
  stock: readonly StockLine[], itemId: string, locationId: string,
): StockLine[] => stock.filter((l) => !(l.itemId === itemId && l.locationId === locationId));

/** Every line for an item that has been deleted from the catalog goes with it. */
export const removeItem = (stock: readonly StockLine[], itemId: string): StockLine[] =>
  stock.filter((l) => l.itemId !== itemId);

/**
 * Move an item's stock from one rack to another, merging if it is already kept at the
 * destination. Used when a shelf is cleared out, and when a rack is archived: its contents
 * have to land somewhere, and the unplaced pile is the honest destination.
 */
export function moveLine(
  stock: readonly StockLine[], itemId: string, from: string, to: string,
): StockLine[] {
  if (from === to) return [...stock];
  const source = lineAt(stock, itemId, from);
  if (!source) return [...stock];
  const merged = (lineAt(stock, itemId, to)?.initialStock ?? 0) + source.initialStock;
  return setLine(removeLine(stock, itemId, from), itemId, to, merged);
}

/** Everything a rack holds, with its opening quantity — what a cycle count walks through. */
export function contentsOf(
  stock: readonly StockLine[], items: readonly Item[], locationId: string,
): { item: Item; initialStock: number }[] {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const out: { item: Item; initialStock: number }[] = [];
  for (const line of linesAt(stock, locationId)) {
    const item = byId.get(line.itemId);
    // A line pointing at an item that no longer exists is dropped rather than rendered as a
    // blank row. The catalog is the authority on what exists.
    if (item) out.push({ item, initialStock: line.initialStock });
  }
  return out;
}

/**
 * Seed one line per item, for a catalog that predates stock lines.
 *
 * Not a nicety: every draft already saved on somebody's tablet has items carrying an
 * `initialStock` and a single `locationId`, and losing those counts would mean walking the
 * gudang again. Reading them into lines is the whole migration.
 */
export function linesFromLegacy(
  legacy: readonly { itemId: string; initialStock?: number; locationId?: string }[],
): StockLine[] {
  return legacy.map((i) => ({
    itemId: i.itemId,
    locationId: i.locationId ?? UNPLACED,
    initialStock: i.initialStock ?? 0,
  }));
}
