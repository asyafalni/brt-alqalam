import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, within } from '@octanejs/testing-library';
import { DataTable } from './DataTable';
import type { Column } from './DataTable';

interface Row { id: string; name: string; qty: number; status: string; note: string }

const rows: Row[] = [
  { id: 'a', name: 'Sabun', qty: 12, status: 'Tersedia', note: 'rak A1' },
  { id: 'b', name: 'Pisau', qty: 0, status: 'Habis', note: 'rak P1' },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Barang', cell: (r) => <span>{r.name}</span>, mobile: 'title' },
  { key: 'note', header: 'Letak', cell: (r) => <span>{r.note}</span> },
  { key: 'status', header: 'Status', cell: (r) => <span>{r.status}</span>, mobile: 'trailing' },
  { key: 'qty', header: 'Stok', cell: (r) => <span>{r.qty}</span>, align: 'right', mobile: 'hidden' },
];

const harness = (props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) => {
  const H = () => (
    <DataTable columns={columns} rows={rows} keyOf={(r) => r.id} {...props} />
  );
  return render(H);
};

afterEach(() => cleanup());

describe('DataTable', () => {
  it('renders both shapes, so CSS decides which one a device sees', () => {
    const r = harness();
    expect(r.container.querySelector('table')).toBeTruthy();
    expect(r.container.querySelector('ul')).toBeTruthy();
  });

  it('shows every column in the table, headers included', () => {
    const table = harness().container.querySelector('table')!;
    for (const header of ['Barang', 'Letak', 'Status', 'Stok']) {
      expect(within(table).getByText(header)).toBeTruthy();
    }
    expect(within(table).getAllByText('Sabun')).toHaveLength(1);
  });

  it('drops hidden columns from the phone card — a phone has no room for everything', () => {
    const list = harness().container.querySelector('ul')!;
    expect(within(list).queryByText('Stok')).toBeNull();   // the header
    expect(within(list).queryByText('12')).toBeNull();     // and its value
    expect(within(list).getByText('Sabun')).toBeTruthy();
  });

  it('labels meta values on the phone, where there is no header row to explain them', () => {
    const list = harness().container.querySelector('ul')!;
    // Once per card: the label travels with its value, since there is no header row above.
    expect(within(list).getAllByText('Letak')).toHaveLength(rows.length);
    expect(within(list).getByText('rak A1')).toBeTruthy();
  });

  it('renders the empty state instead of an empty table', () => {
    const H = () => (
      <DataTable columns={columns} rows={[]} keyOf={(r: Row) => r.id} empty={<p>Belum ada apa-apa.</p>} />
    );
    const r = render(H);
    expect(r.getByText('Belum ada apa-apa.')).toBeTruthy();
    expect(r.container.querySelector('table')).toBeNull();
  });

  it('activates a row by click, in both shapes', () => {
    const onRowClick = vi.fn();
    const r = harness({ onRowClick, rowLabel: (row: Row) => `Buka ${row.name}` });

    fireEvent.click(within(r.container.querySelector('table')!).getByLabelText('Buka Pisau'));
    fireEvent.click(within(r.container.querySelector('ul')!).getByLabelText('Buka Sabun'));

    expect(onRowClick.mock.calls.map(([row]) => (row as Row).name)).toEqual(['Pisau', 'Sabun']);
  });

  it('activates a row by keyboard — a clickable row that ignores Enter is invisible', () => {
    const onRowClick = vi.fn();
    const r = harness({ onRowClick, rowLabel: (row: Row) => `Buka ${row.name}` });
    const row = within(r.container.querySelector('table')!).getByLabelText('Buka Sabun');

    expect(row.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });        // anything else must not activate

    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('is inert when no handler is given — no fake affordance', () => {
    const table = harness().container.querySelector('table')!;
    expect(table.querySelector('tr[role="link"]')).toBeNull();
    expect(table.querySelector('tr[tabindex]')).toBeNull();
  });
});

describe('pagination', () => {
  interface Short { id: string; name: string }
  const many: Short[] = Array.from({ length: 60 }, (_, n) => ({ id: `R${n + 1}`, name: `Barang ${n + 1}` }));
  const paged = () => render(() => (
    <DataTable
      pageSize={25}
      columns={[{ key: 'name', header: 'Barang', mobile: 'title', cell: (r: Short) => r.name }]}
      rows={many}
      keyOf={(r) => r.id}
    />
  ));

  it('shows one page at a time and says where you are', () => {
    const r = paged();
    // Both shapes render, so each row appears twice — desk table and phone card.
    expect(r.getAllByText('Barang 1')).toHaveLength(2);
    expect(r.queryByText('Barang 26')).toBeNull();
    expect(r.getByText('1–25 dari 60')).toBeTruthy();
  });

  it('walks forward and back without losing the count', () => {
    const r = paged();
    fireEvent.click(r.getByText('Berikutnya'));
    expect(r.getAllByText('Barang 26')).toHaveLength(2);
    expect(r.getByText('26–50 dari 60')).toBeTruthy();

    fireEvent.click(r.getByText('Sebelumnya'));
    expect(r.getAllByText('Barang 1')).toHaveLength(2);
  });

  it('stops at both ends rather than paging into nothing', () => {
    const r = paged();
    expect((r.getByText('Sebelumnya') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(r.getByText('Berikutnya'));
    fireEvent.click(r.getByText('Berikutnya'));
    expect(r.getByText('51–60 dari 60')).toBeTruthy();
    expect((r.getByText('Berikutnya') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not draw a pager for a list that fits', () => {
    const r = render(() => (
      <DataTable
        pageSize={25}
        columns={[{ key: 'name', header: 'Barang', mobile: 'title', cell: (r2: Short) => r2.name }]}
        rows={many.slice(0, 5)}
        keyOf={(r2) => r2.id}
      />
    ));
    expect(r.queryByText('Berikutnya')).toBeNull();
  });
});
