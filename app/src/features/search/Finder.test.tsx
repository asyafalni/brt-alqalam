import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen, within } from '@octanejs/testing-library';
import { Finder } from './Finder';
import { useDraft } from '../../state/useDraft';
import { useInventory } from '../../state/useInventory';
import { createEntry, createLocation } from '../stocktake/draft';
import { SEED_CATEGORIES } from '../../data/seedCategories';
import type { Item, Location, StockLine } from '../../../../domain/types';
import type { PurchaseRequest } from '../../../../domain/requests';

const NOW = Date.now();

const build = () => {
  let items: Item[] = [];
  let stock: StockLine[] = [];
  const locations: Location[] = [];

  locations.push(createLocation('A1', 'Gudang Utama', 'Rak sabun', locations));
  locations.push(createLocation('B2', 'Gudang Utama', 'Lemari alat', locations));

  const add = (name: string, unit: string, locationId: string, qty: number) => {
    const e = createEntry(
      { name, categoryId: 'CAT-KEBERSIHAN', unit, kind: 'consumable', initialStock: qty, minStock: null, locationId },
      items,
      stock,
    );
    items = [...items, e.item];
    stock = e.stock;
  };

  add('Sabun cuci tangan', 'botol', locations[0].locationId, 12);
  add('Pisau potong', 'buah', locations[1].locationId, 4);
  add('Kantong sampah', 'pak', '', 3);
  return { items, stock, locations };
};

function Harness(
  { query, onOpenItem = () => {}, onOpenRack = () => {}, requests = [], onOpenRequests = () => {} }:
  {
    query: string;
    onOpenItem?: (id: string) => void;
    onOpenRack?: (id: string) => void;
    requests?: PurchaseRequest[];
    onOpenRequests?: () => void;
  },
) {
  const draft = useDraft();
  const { items, stock, locations } = build();
  draft.items = items;
  draft.stock = stock;
  draft.locations = locations;
  draft.categories = SEED_CATEGORIES;
  return (
    <Finder
      query={query}
      items={items}
      categories={SEED_CATEGORIES}
      locations={locations}
      inventory={useInventory(draft, NOW)}
      requests={requests}
      onOpenItem={onOpenItem}
      onOpenRack={onOpenRack}
      onOpenRequests={onOpenRequests}
      onClear={() => {}}
    />
  );
}

afterEach(cleanup);

/* Scoped to a section, because the heading echoes the query back — searching "A1" puts the
   string on screen three times over, and an unscoped match would pass on the wrong one. */
const barang = () => within(screen.getByRole('region', { name: 'Barang' }));
const pengajuan = () => within(screen.getByRole('region', { name: 'Pengajuan' }));
const rak = () => within(screen.getByRole('region', { name: 'Rak' }));

describe('the navbar search, on screens that are not lists', () => {
  it('finds a barang by part of its name', () => {
    render(<Harness query="sabun" />);
    expect(screen.getByText('Sabun cuci tangan')).toBeTruthy();
    expect(screen.queryByText('Pisau potong')).toBeNull();
  });

  it('finds a RAK too — "what is on A1" is the same question from the other end', () => {
    // The owner asked for this by name: searching only barang leaves the code painted on the
    // shelf, the thing people actually say out loud, unsearchable.
    render(<Harness query="A1" />);
    expect(rak().getByText('A1')).toBeTruthy();
    expect(rak().getByText('Rak sabun')).toBeTruthy();
  });

  it('says WHERE the barang is, because that is the question being asked', () => {
    // §84: "we own twelve" does not help somebody standing in the gudang.
    render(<Harness query="sabun" />);
    expect(barang().getByText('A1')).toBeTruthy();
  });

  it('names an unplaced barang rather than leaving the line blank', () => {
    render(<Harness query="kantong" />);
    expect(screen.getByText('Belum ditempatkan')).toBeTruthy();
  });

  it('matches a rack by its zone, so "gudang utama" lists the racks in it', () => {
    render(<Harness query="gudang utama" />);
    expect(rak().getByText('A1')).toBeTruthy();
    expect(rak().getByText('B2')).toBeTruthy();
  });

  it('opens the barang that was picked', () => {
    let opened = '';
    render(<Harness query="pisau" onOpenItem={(id) => { opened = id; }} />);
    fireEvent.click(screen.getByText('Pisau potong'));
    expect(opened).not.toBe('');
  });

  it('opens the rack that was picked', () => {
    let opened = '';
    render(<Harness query="B2" onOpenRack={(id) => { opened = id; }} />);
    fireEvent.click(screen.getByText('Lemari alat'));
    expect(opened).toBe('LOC-B2');
  });

  it('says nothing matched, instead of showing an empty page', () => {
    render(<Harness query="helikopter" />);
    expect(screen.getByText('Tidak ada yang cocok.')).toBeTruthy();
  });

  it('refuses to answer one letter — that is the catalog, not a search', () => {
    render(<Harness query="s" />);
    expect(screen.getByText('Ketik minimal dua huruf.')).toBeTruthy();
    expect(screen.queryByText('Sabun cuci tangan')).toBeNull();
  });
});

const request = (over: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  requestId: 'REQ-0001', type: 'beli', name: 'Sapu ijuk', qty: 2, unit: 'buah',
  reason: 'Yang lama patah gagangnya', status: 'diajukan',
  requestedBy: 'USR-1', requestedTs: 1, ...over,
});

describe('pengajuan, for the people allowed to read it', () => {
  it('finds a request by name', () => {
    render(<Harness query="sapu" requests={[request()]} />);
    expect(pengajuan().getByText('Sapu ijuk')).toBeTruthy();
  });

  it('finds it by its REASON, which is the field the screen exists for', () => {
    // §95: a request is judged on why, so "kenapa kita beli itu" is asked as often as what it
    // was called — and the reason is the only place that answer lives.
    render(<Harness query="patah" requests={[request()]} />);
    expect(pengajuan().getByText('Sapu ijuk')).toBeTruthy();
  });

  it('is absent entirely for somebody not allowed to see it', () => {
    // Every row names people — who asked, who decided — so the public tier omits the tab (§39).
    // An empty list here is the gateway's decision, not a check invented in the browser.
    render(<Harness query="sapu" requests={[]} />);
    expect(screen.queryByRole('region', { name: 'Pengajuan' })).toBeNull();
    expect(screen.getByText('Tidak ada yang cocok.')).toBeTruthy();
  });

  it('opens the Pengajuan screen when one is picked', () => {
    let opened = false;
    render(<Harness query="sapu" requests={[request()]} onOpenRequests={() => { opened = true; }} />);
    fireEvent.click(pengajuan().getByText('Sapu ijuk'));
    expect(opened).toBe(true);
  });
});
