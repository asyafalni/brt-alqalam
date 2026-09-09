// Keeping a visit open, and knowing when not to.
//
// The PIN used to be asked for on every single record. §58.5 chose that deliberately — a session
// was one visit, so a shared gudang tablet could never hand the last person's identity to whoever
// walked up next. On a phone one person carries, the same rule is a toll rather than a lock.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { endSession, keepSession, liveSession, SESSION_TTL_MS, touchSession } from './session';
import type { Session } from '../../../data/gateway';

const session = (over: Partial<Session> = {}): Session => ({
  token: 'tok-1', actorUserId: 'USR-1', actorName: 'Budi', role: 'anggota', ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('which sessions are worth keeping', () => {
  it('keeps a phone session', () => {
    keepSession(session({ kind: 'phone' }), 'phone', SESSION_TTL_MS);
    expect(liveSession()).toBe('tok-1');
  });

  it('keeps NOTHING for a shared tablet', () => {
    // Storing it would hand the next person to walk up the last one's identity — the exact
    // misattribution §58.5 set out to make structurally impossible.
    keepSession(session({ kind: 'device' }), 'device', 15 * 60 * 1000);
    expect(liveSession()).toBeNull();
  });

  it('keeps nothing when the gateway did not say — the safe end of an unknown', () => {
    keepSession(session(), undefined, undefined);
    expect(liveSession()).toBeNull();
  });
});

describe('the hour', () => {
  it('is still open just before it runs out', () => {
    vi.useFakeTimers();
    keepSession(session({ kind: 'phone' }), 'phone', SESSION_TTL_MS);
    vi.advanceTimersByTime(SESSION_TTL_MS - 1000);
    expect(liveSession()).toBe('tok-1');
  });

  it('is over after it, and the token is dropped rather than sent and refused', () => {
    vi.useFakeTimers();
    keepSession(session({ kind: 'phone' }), 'phone', SESSION_TTL_MS);
    vi.advanceTimersByTime(SESSION_TTL_MS + 1000);
    expect(liveSession()).toBeNull();
    expect(localStorage.getItem('brt.session')).toBeNull();
  });

  it('SLIDES on use, so a rack worked through steadily is never interrupted', () => {
    vi.useFakeTimers();
    keepSession(session({ kind: 'phone' }), 'phone', SESSION_TTL_MS);
    vi.advanceTimersByTime(SESSION_TTL_MS - 60_000);
    touchSession(SESSION_TTL_MS);
    vi.advanceTimersByTime(SESSION_TTL_MS - 60_000);
    expect(liveSession()).toBe('tok-1');
  });

  it('matches the gateway, which is the number that actually decides', () => {
    // Duplicated on both sides; if they drifted, the app would send a token the gateway had
    // already dropped and the person would see a refusal with no explanation.
    expect(SESSION_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe('ending it', () => {
  it('forgets the token', () => {
    keepSession(session({ kind: 'phone' }), 'phone', SESSION_TTL_MS);
    endSession();
    expect(liveSession()).toBeNull();
  });

  it('survives storage being unavailable rather than throwing', () => {
    // A private window, or a browser with site data blocked. Losing the convenience is fine;
    // taking the app down with it is not.
    const original = localStorage.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('nope'); });
    expect(liveSession()).toBeNull();
    vi.restoreAllMocks();
    expect(typeof original).toBe('function');
  });
});
