import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@octanejs/testing-library';
import { useNow } from './useNow';

afterEach(() => { cleanup(); vi.useRealTimers(); hide(false); });

/** jsdom's `document.hidden` is read-only, so the tab is faked at the property. */
function hide(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, value: hidden ? 'hidden' : 'visible',
  });
}

function Harness() {
  return <p data-testid="now">{useNow(1000)}</p>;
}

const shown = (r: { getByTestId: (id: string) => HTMLElement }) =>
  Number(r.getByTestId('now').textContent);

describe('the displayed clock', () => {
  it('advances, so a rack eventually becomes overdue on a tablet nobody reloads', () => {
    vi.useFakeTimers();
    const r = render(Harness);
    const first = shown(r);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(shown(r)).toBeGreaterThan(first);
  });

  it('freezes while the tab is hidden — nobody is reading a background tab', () => {
    vi.useFakeTimers();
    const r = render(Harness);

    hide(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    const parked = shown(r);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(shown(r)).toBe(parked);
  });

  it('catches up the moment the tab is shown again', () => {
    // The point of stopping: coming back after an hour and reading an hour-old clock would be
    // worse than the polling it saves.
    vi.useFakeTimers();
    const r = render(Harness);

    hide(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    const parked = shown(r);

    act(() => { vi.advanceTimersByTime(60_000); });
    hide(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(shown(r)).toBeGreaterThan(parked);
  });
});
