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
