import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@octanejs/testing-library';
import { useState } from 'octane';
import { useCatalogWriter } from './useCatalogWriter';
import type { CatalogWriter } from './useCatalogWriter';
import * as gateway from '../../../data/gateway';
import type { Item } from '../../../domain/types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const item = (name: string): Item => ({
  itemId: 'ITM-0001', barcode: 'ALQ-ITM-0001', name, categoryId: 'CAT-KEBERSIHAN',
  kind: 'consumable', unit: 'galon', trackBy: 'quantity', minStock: null, active: true,
});

/** The revisions `putCatalog` was actually called with, in order. */
function spyPut(startRev = 5) {
  let next = startRev;
  const sent: number[] = [];
  vi.spyOn(gateway, 'putCatalog').mockImplementation(async (_u, _t, rev) => {
    sent.push(rev as number);
    if ((rev as number) !== next) throw new gateway.GatewayError('stale_rev', {});
    next += 1;
    return { rev: next, wrote: ['Items'] };
  });
  return sent;
}

let api: CatalogWriter | null = null;

/** `rev` stays where it is unless the test moves it — that IS the poll window. */
function Harness({ rev }: { rev: number }) {
  const [, force] = useState(0);
  api = useCatalogWriter('https://x/exec', rev, async () => 'tok', () => force((n) => n + 1));
  return <p>{api.error}</p>;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('saving the catalog twice before the next read', () => {
  it('sends the revision its OWN last save produced, not the stale one from the poll', async () => {
    // The bug: every accepted save bumps the sheet's revision, but `rev` here is what the last
    // READ said — up to a minute old. A second edit was refused as somebody else's change.
    const sent = spyPut(5);
    const r = render(<Harness rev={5} />);

    act(() => { api!.write({ items: [item('Sabun')] }); });
    await flush();
    act(() => { api!.write({ items: [item('Sabun cuci')] }); });
    await flush();

    expect(sent).toEqual([5, 6]);
    expect(r.container.textContent).toBe('');
  });

  it('does not blame a colleague for the admin\'s own edit', async () => {
    spyPut(5);
    const r = render(<Harness rev={5} />);

    act(() => { api!.write({ items: [item('A')] }); });
    await flush();
    act(() => { api!.write({ items: [item('B')] }); });
    await flush();

    expect(r.container.textContent).not.toMatch(/orang lain/);
  });

  it('still refuses when the sheet really did move under it', async () => {
    // The guard is not being weakened — a save built on a revision nobody here produced is
    // exactly what `stale_rev` is for, and merging is deliberately never attempted.
    vi.spyOn(gateway, 'putCatalog').mockRejectedValue(new gateway.GatewayError('stale_rev', {}));
    const r = render(<Harness rev={5} />);

    act(() => { api!.write({ items: [item('A')] }); });
    await flush();

    expect(r.container.textContent).toMatch(/orang lain/);
    expect(api!.pending).toBeNull();
  });
});

describe('what is on screen while the sheet catches up', () => {
  it('shows the edit at once, and keeps showing it until a read carries it', async () => {
    spyPut(5);
    const r = render(<Harness rev={5} />);

    act(() => { api!.write({ items: [item('Sabun baru')] }); });
    expect(api!.pending?.items?.[0].name).toBe('Sabun baru');

    await flush();
    // Saved, but the register still reports rev 5 — the overlay is the only thing showing it.
    expect(api!.pending?.items?.[0].name).toBe('Sabun baru');

    r.rerender(<Harness rev={6} />);
    expect(api!.pending).toBeNull();
  });
});
