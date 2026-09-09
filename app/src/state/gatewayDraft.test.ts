// What a connected device may change, and what it may not.
//
// Every case here is a permission, and permissions fail silently by nature: a setter that
// quietly does nothing looks exactly like a setter that worked until somebody checks the shelf.

import { describe, it, expect, vi } from 'vitest';
import { gatewayDraft } from './useDraft';
import type { CatalogPatch, CatalogWriter } from './useCatalogWriter';
import type { GatewayState } from '../../../data/gateway';
import type { Item } from '../../../domain/types';

const item = (id: string, name: string): Item => ({
  itemId: id, barcode: '', name, categoryId: 'cat-1', kind: 'consumable',
  unit: 'buah', trackBy: 'quantity', minStock: null, active: true,
});

const state = (over: Partial<GatewayState> = {}): GatewayState => ({
  categories: [{ categoryId: 'cat-1', name: 'Kebersihan', order: 1, active: true }],
  locations: [],
  items: [item('itm-1', 'Sabun')],
  stock: [{ itemId: 'itm-1', locationId: '', initialStock: 4 }],
  instances: [],
  requests: [],
  txns: [],
  serverTs: 0,
  requestedItemIds: [],
  tier: 'public',
  rev: 3,
  quarantined: [],
  ...over,
});

function fakeWriter(pending: CatalogPatch | null = null): CatalogWriter & { write: ReturnType<typeof vi.fn> } {
  return {
    write: vi.fn(),
    pending,
    saving: false,
    error: '',
    clearError: () => {},
  } as CatalogWriter & { write: ReturnType<typeof vi.fn> };
}

describe('without an admin', () => {
  const draft = gatewayDraft(state(), [], true);

  it('is read-only', () => {
    expect(draft.readOnly).toBe(true);
  });

  it('leaves the catalog untouched when a setter is called', () => {
    draft.setItems(() => [item('itm-9', 'Diselundupkan')]);
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].name).toBe('Sabun');
  });
});

describe('with an admin', () => {
  it('is no longer read-only', () => {
    expect(gatewayDraft(state(), [], true, fakeWriter()).readOnly).toBe(false);
  });

  it('sends the whole next array, not the change', () => {
    const w = fakeWriter();
    const draft = gatewayDraft(state(), [], true, w);
    draft.setItems((prev) => [...prev, item('itm-2', 'Pisau')]);

    expect(w.write).toHaveBeenCalledTimes(1);
    const patch = w.write.mock.calls[0][0] as CatalogPatch;
    expect(patch.items?.map((i) => i.name)).toEqual(['Sabun', 'Pisau']);
  });

  it('sends only the tab that was edited, so one edit cannot blank another', () => {
    const w = fakeWriter();
    gatewayDraft(state(), [], true, w).setCategories((prev) => prev);
    expect(Object.keys(w.write.mock.calls[0][0])).toEqual(['categories']);
  });

  it('sends items AND stock together when shelving, which is one act', () => {
    const w = fakeWriter();
    gatewayDraft(state(), [], true, w).setCatalog((prev) => prev);
    expect(Object.keys(w.write.mock.calls[0][0]).sort()).toEqual(['items', 'stock']);
  });

  it('gives a setter the CURRENT arrays, overlay included, not the stale register', () => {
    const w = fakeWriter({ items: [item('itm-5', 'Sudah disunting')] });
    const draft = gatewayDraft(state(), [], true, w);
    expect(draft.items[0].name).toBe('Sudah disunting');

    draft.setItems((prev) => prev);
    const patch = w.write.mock.calls[0][0] as CatalogPatch;
    // Building on `state.items` here would silently revert the pending edit.
    expect(patch.items?.[0].name).toBe('Sudah disunting');
  });
});

describe('the log has one writer, and it is not this', () => {
  it('refuses to append a movement even for an admin', () => {
    const w = fakeWriter();
    const draft = gatewayDraft(state(), [], true, w);
    draft.setTxns(() => [{
      txnId: 't', clientTxnId: 'c', ts: 0, type: 'pemakaian',
      itemId: 'itm-1', qtyDelta: -1, actorUserId: 'u',
    }]);
    // `putCatalog` cannot touch Transactions; movements go through `append` behind a PIN.
    expect(w.write).not.toHaveBeenCalled();
  });

  it('refuses a repair, which is a movement and a request at once', () => {
    const w = fakeWriter();
    gatewayDraft(state(), [], true, w).setRepair((prev) => prev);
    expect(w.write).not.toHaveBeenCalled();
  });
});

describe('recording is a separate permission from editing', () => {
  it('an admin on an unenrolled device may edit but not record', () => {
    const draft = gatewayDraft(state(), [], false, fakeWriter());
    expect(draft.readOnly).toBe(false);
    expect(draft.canRecord).toBe(false);
  });

  it('a kiosk with no admin may record but not edit', () => {
    const draft = gatewayDraft(state(), [], true);
    expect(draft.readOnly).toBe(true);
    expect(draft.canRecord).toBe(true);
  });
});
