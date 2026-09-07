import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@octanejs/testing-library';
import { LazyList, useLazyCount } from './LazyList';

/* The test environment ships an IntersectionObserver that never fires, so leaving it in place
   would test nothing. Removed here to exercise the scroll fallback — which is the half that
   has to work on anything old enough to be in a masjid store room anyway. */
const realIO = globalThis.IntersectionObserver;
beforeEach(() => { delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver; });
afterEach(() => {
  cleanup();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = realIO;
});

/* jsdom has no IntersectionObserver, so this exercises the scroll fallback — which is the
   point of having one: the list still grows where the observer does not exist. */
const List = ({ total, page = 6 }: { total: number; page?: number }) => {
  const lazy = useLazyCount(total, page);
  return (
    <LazyList sentinel={lazy.sentinel} done={lazy.done}>
      <ul>
        {Array.from({ length: lazy.count }, (_, i) => <li key={i}>Baris {i + 1}</li>)}
      </ul>
    </LazyList>
  );
};

const scroll = (r: { container: HTMLElement }) =>
  fireEvent.scroll(r.container.querySelector('.custom-scrollbar')!);

describe('a list that grows as it is scrolled', () => {
  it('starts with one page, not the whole gudang', () => {
    // Every row draws an SVG; rendering hundreds on a screen that shows six is work the tablet
    // does before anybody has read the first one.
    expect(render(() => <List total={40} />).getAllByText(/^Baris /)).toHaveLength(6);
  });

  it('loads another page when the bottom comes into view', () => {
    const r = render(() => <List total={40} />);
    scroll(r);
    expect(r.getAllByText(/^Baris /)).toHaveLength(12);
  });

  it('stops at the end instead of running past it', () => {
    const r = render(() => <List total={8} />);
    scroll(r);
    scroll(r);
    expect(r.getAllByText(/^Baris /)).toHaveLength(8);
  });

  it('says there is more while there is', () => {
    // Otherwise a column that has ended looks identical to one still loading.
    expect(render(() => <List total={40} />).getByRole('status')).toBeTruthy();
  });

  it('stops saying so once there is not', () => {
    expect(render(() => <List total={3} />).queryByRole('status')).toBeNull();
  });

  it('shows everything at once when there is less than a page of it', () => {
    expect(render(() => <List total={3} />).getAllByText(/^Baris /)).toHaveLength(3);
  });
});
