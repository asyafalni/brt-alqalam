import { describe, it, expect, beforeEach } from 'vitest';
import { cacheRegister, cachedRegister, forgetRegister } from './registerCache';
import type { GatewayState } from '../../../data/gateway';

const URL_A = 'https://script.google.com/macros/s/A/exec';
const URL_B = 'https://script.google.com/macros/s/B/exec';
const DAY = 24 * 60 * 60 * 1000;

const state = (rev = 1): GatewayState => ({
  categories: [], locations: [], items: [], stock: [], instances: [], requests: [], txns: [],
  requestedItemIds: [], serverTs: 0, tier: 'public', rev, quarantined: [],
});

beforeEach(() => localStorage.clear());

/*
 * Apps Script's floor is its own start-up: `?op=ping`, which touches no sheet at all, measures
 * 1.3–2.5s on the live deployment, and `?op=state` costs the same plus almost nothing. The read
 * cannot be made faster — so what changes is whether anybody has to sit and watch it.
 */
describe('remembering the last register', () => {
  it('gives it back, so the next visit is not a blank screen', () => {
    cacheRegister(URL_A, state(7));
    expect(cachedRegister(URL_A)?.state.rev).toBe(7);
  });

  it('never hands it to a DIFFERENT gateway', () => {
    // Reconnecting to another sheet would otherwise paint the old masjid's register for a
    // second and a half, under the same headings.
    cacheRegister(URL_A, state());
    expect(cachedRegister(URL_B)).toBeNull();
  });

  it('refuses anything older than a day', () => {
    /* A register from last night shown as today's is a genuinely different claim — which is
       the one real hazard here, and the reason there is a ceiling at all. */
    cacheRegister(URL_A, state());
    expect(cachedRegister(URL_A, Date.now() + DAY + 1000)).toBeNull();
  });

  it('still serves one from overnight, which is when a tablet is actually reopened', () => {
    cacheRegister(URL_A, state());
    expect(cachedRegister(URL_A, Date.now() + 10 * 60 * 60 * 1000)).not.toBeNull();
  });

  it('says when it was read, so a screen can say how old it is', () => {
    cacheRegister(URL_A, state());
    expect(cachedRegister(URL_A)!.fetchedTs).toBeGreaterThan(0);
  });

  it('is forgotten on request — which is what disconnecting does', () => {
    cacheRegister(URL_A, state());
    forgetRegister();
    expect(cachedRegister(URL_A)).toBeNull();
  });

  it('survives junk in storage rather than white-screening a tablet', () => {
    localStorage.setItem('brt.register.cache', 'not json');
    expect(cachedRegister(URL_A)).toBeNull();
  });
});
