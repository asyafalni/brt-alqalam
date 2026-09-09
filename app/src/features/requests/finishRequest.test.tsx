// Closing a request when the register is the spreadsheet's.
//
// This is the bug that prompted the work: `setRepair` writes to `Transactions`, only `append`
// may, so connected it was a NOOP — and the Pengajuan screen can ONLY be opened while
// connected. "Tandai selesai" was a button that silently did nothing, every time, in
// production.

import { describe, it, expect, vi } from 'vitest';
import { gatewayDraft } from '../../state/useDraft';
import type { CatalogWriter } from '../../state/useCatalogWriter';
import type { GatewayState } from '../../../../data/gateway';

const state = (): GatewayState => ({
  categories: [], locations: [], items: [], stock: [], instances: [], requests: [], txns: [],
  serverTs: 0, requestedItemIds: [], tier: 'detailed', rev: 1, quarantined: [],
});

const writer = (): CatalogWriter => ({
  write: vi.fn(), pending: null, saving: false, error: '',
  clearError: () => {}, reportError: () => {},
});

describe('with no admin', () => {
  it('offers no finish action at all, rather than one that does nothing', () => {
    expect(gatewayDraft(state(), [], true).finishRequest).toBeUndefined();
  });

  it('still leaves setRepair inert — the log has one writer', () => {
    const d = gatewayDraft(state(), [], true);
    const before = d.txns.length;
    d.setRepair((prev) => prev);
    expect(d.txns).toHaveLength(before);
  });
});

describe('with an admin', () => {
  it('exposes a finish action the screen can actually use', () => {
    const finish = vi.fn();
    const d = gatewayDraft(state(), [], true, writer(), finish);
    expect(d.finishRequest).toBeDefined();
    d.finishRequest?.({ requestId: 'REQ-1', status: 'selesai' });
    expect(finish).toHaveBeenCalledWith({ requestId: 'REQ-1', status: 'selesai' });
  });

  it('carries the unit and its new status, so the tool goes back on its hook', () => {
    const finish = vi.fn();
    gatewayDraft(state(), [], true, writer(), finish).finishRequest?.({
      requestId: 'REQ-1', status: 'selesai', assetId: 'ALQ-1-001', toStatus: 'available',
    });
    expect(finish.mock.calls[0][0]).toMatchObject({
      assetId: 'ALQ-1-001', toStatus: 'available',
    });
  });

  it('setRepair stays a noop even so — one path, not two that can disagree', () => {
    const finish = vi.fn();
    const d = gatewayDraft(state(), [], true, writer(), finish);
    d.setRepair((prev) => prev);
    expect(finish).not.toHaveBeenCalled();
  });
});
