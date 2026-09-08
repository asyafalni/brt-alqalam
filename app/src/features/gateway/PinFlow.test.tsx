// The rare moment when a PIN belongs to two people.
//
// PINs stopped being unique because refusing one cost the admin a retry every time, and at
// 10–15 people a collision is about a one-percent event. The bargain only holds if the FAST
// path stays untouched — so the first two cases here are about what does NOT happen.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@octanejs/testing-library';
import { PinFlow } from './PinFlow';

const URL_ = 'https://script.google.com/macros/s/AAA/exec';

const reply = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body)));

function mount(over: Partial<Parameters<typeof PinFlow>[0]> = {}) {
  const onSession = vi.fn();
  const onError = vi.fn();
  const r = render(() => (
    <PinFlow
      url={URL_}
      deviceSecret="rahasia"
      onSession={onSession}
      onCancel={() => {}}
      onError={onError}
      {...over}
    />
  ));
  return { r, onSession, onError };
}

/** Types a PIN into the pad and submits it. */
async function enter(r: ReturnType<typeof render>, pin: string) {
  for (const d of pin) fireEvent.click(r.getByRole('button', { name: d }));
  fireEvent.click(r.getByRole('button', { name: /Lanjut|Masuk|OK/i }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('a PIN only one person has', () => {
  it('opens the session with no extra step', async () => {
    vi.stubGlobal('fetch', reply({ ok: true, session: { token: 't', actorName: 'Budi' } }));
    const { r, onSession } = mount();
    await enter(r, '4321');
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledTimes(1));
    expect(onSession.mock.calls[0][0].token).toBe('t');
    // No picker, ever, on this path.
    expect(r.queryByText(/Siapa yang mencatat/)).toBeNull();
  });
});

describe('a PIN two people share', () => {
  it('asks which of them, by name', async () => {
    vi.stubGlobal('fetch', reply({
      ok: true, choose: [{ userId: 'U1', name: 'Budi' }, { userId: 'U2', name: 'Sari' }],
    }));
    const { r, onSession } = mount();
    await enter(r, '4321');
    await vi.waitFor(() => expect(r.getByText(/Siapa yang mencatat/)).toBeTruthy());
    expect(r.getByRole('button', { name: /Budi/ })).toBeTruthy();
    expect(r.getByRole('button', { name: /Sari/ })).toBeTruthy();
    // Not a session yet — nobody has said who they are.
    expect(onSession).not.toHaveBeenCalled();
  });

  it('does not make them type the PIN again to answer', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true, choose: [{ userId: 'U1', name: 'Budi' }, { userId: 'U2', name: 'Sari' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true, session: { token: 't2', actorName: 'Sari' },
      })));
    vi.stubGlobal('fetch', f);

    const { r, onSession } = mount();
    await enter(r, '4321');
    await vi.waitFor(() => expect(r.getByRole('button', { name: /Sari/ })).toBeTruthy());
    fireEvent.click(r.getByRole('button', { name: /Sari/ }));

    await vi.waitFor(() => expect(onSession).toHaveBeenCalledTimes(1));
    const second = JSON.parse(String(f.mock.calls[1][1].body));
    // The PIN it already had, plus the name — typing it twice would be the system's mistake
    // charged to the person.
    expect(second).toMatchObject({ pin: '4321', userId: 'U2' });
  });
});

describe('when the gateway refuses', () => {
  it('reports the code and opens no session', async () => {
    vi.stubGlobal('fetch', reply({ ok: false, error: 'invalid_pin' }));
    const { r, onSession, onError } = mount();
    await enter(r, '0000');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('invalid_pin'));
    expect(onSession).not.toHaveBeenCalled();
  });
});
