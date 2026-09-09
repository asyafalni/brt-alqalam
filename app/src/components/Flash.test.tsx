import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@octanejs/testing-library';
import { useState } from 'octane';
import { Flash } from './Flash';
import type { FlashMessage } from './Flash';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Harness({ message }: { message: FlashMessage }) {
  const [m, setM] = useState<FlashMessage | null>(message);
  return <Flash message={m} onDone={() => setM(null)} />;
}

const ok = (over: Partial<FlashMessage> = {}): FlashMessage =>
  ({ kind: 'ok', text: 'Tercatat: Sabun cuci tangan -2', at: 1, ...over });

describe('saying what happened to a record', () => {
  it('names what was recorded', () => {
    const r = render(<Harness message={ok()} />);
    expect(r.getByText('Tercatat: Sabun cuci tangan -2')).toBeTruthy();
  });

  it('is announced, not merely drawn', () => {
    // A marbot's eyes are on the shelf, not the screen. `role=status` is what makes this reach
    // somebody using the tablet with a screen reader at all.
    const r = render(<Harness message={ok()} />);
    expect(r.container.querySelector('[role="status"]')).toBeTruthy();
  });

  it('says plainly when a record did NOT reach the register', () => {
    // The bug it exists for: a write that went nowhere looked exactly like one that landed.
    const r = render(<Harness message={ok({ kind: 'problem', text: 'Gagal terhubung — catatan tidak tersimpan.' })} />);
    expect(r.getByText(/tidak tersimpan/)).toBeTruthy();
  });

  it('goes away by itself', () => {
    vi.useFakeTimers();
    const r = render(<Harness message={ok()} />);
    act(() => { vi.advanceTimersByTime(3300); });
    expect(r.queryByText(/Tercatat/)).toBeNull();
  });

  it('stays longer when the record did not land', () => {
    vi.useFakeTimers();
    const r = render(<Harness message={ok({ kind: 'problem', text: 'Belum terkirim.' })} />);
    act(() => { vi.advanceTimersByTime(3300); });
    expect(r.getByText('Belum terkirim.')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(r.queryByText('Belum terkirim.')).toBeNull();
  });

  it('can be dismissed before then', () => {
    const r = render(<Harness message={ok()} />);
    fireEvent.click(r.getByText('Tutup'));
    expect(r.queryByText(/Tercatat/)).toBeNull();
  });
});
