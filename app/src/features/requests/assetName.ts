// The name to put in a request filed against one physical unit.
//
// A repair that says only "Pisau potong" leaves somebody to work out which of the six, so the
// unit's own label goes in the name as well as in `assetId`. Kept out of the component because
// it is a fact about the register, not about a form.

import type { Draft } from '../../state/useDraft';
import type { Inventory } from '../../state/useInventory';

export function nameOfAsset(draft: Draft, inventory: Inventory, assetId: string): string {
  const unit = inventory.derived.instances[assetId];
  if (!unit) return '';
  /* The label ALREADY carries the item's name — `instancesFor` builds it as "<nama> #n" — so
     prefixing the name again produced "Pisau potong (Pisau potong #1)". Prefer the label and
     only reach for the item when a hand-edited sheet left one blank. */
  if (unit.instance.label) return unit.instance.label;
  const item = draft.items.find((i) => i.itemId === unit.instance.itemId);
  return item ? `${item.name} (${assetId})` : assetId;
}
