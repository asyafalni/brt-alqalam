// The phone number a device remembers.
//
// It replaces the enrolled device secret as the thing that says who is at the keyboard, and the
// difference between the two is the whole reason storing it is acceptable: a secret is a
// credential and this is not. Losing a phone leaks a number its owner hands out anyway; losing
// an enrolled tablet meant revoking a row.

import { describe, it, expect, beforeEach } from 'vitest';
import { forgetPhone, loadPhone, looksLikePhone, normalisePhone, savePhone } from './member';

beforeEach(() => localStorage.clear());

describe('reading a number the way people write it', () => {
  it.each([
    ['0812 3456 7890', '081234567890'],
    ['0812-3456-7890', '081234567890'],
    ['+62 812 3456 7890', '081234567890'],
    ['6281234567890', '081234567890'],
    ['(0812) 3456 7890', '081234567890'],
  ])('%s becomes %s', (written, expected) => {
    expect(normalisePhone(written)).toBe(expected);
  });

  it('matches the gateway, so the same person is not two people', () => {
    // The gateway normalises identically. If these drifted, somebody would be registered under
    // one spelling and refused under another — with no message that could explain it.
    expect(normalisePhone('+62 812 3456 7890')).toBe(normalisePhone('0812-3456-7890'));
  });
});

describe('remembering it', () => {
  it('stores the normalised form, not what was typed', () => {
    savePhone('+62 812 3456 7890');
    expect(loadPhone()).toBe('081234567890');
  });

  it('is empty on a device nobody has claimed', () => {
    expect(loadPhone()).toBe('');
  });

  it('can be forgotten, for the colleague who borrowed the phone', () => {
    savePhone('081234567890');
    forgetPhone();
    expect(loadPhone()).toBe('');
  });
});

describe('what counts as a number at all', () => {
  it('accepts something long enough to be one', () => {
    expect(looksLikePhone('0812 3456 7890')).toBe(true);
  });

  it.each(['', '0812', 'budi', '62'])('rejects %s', (bad) => {
    expect(looksLikePhone(bad)).toBe(false);
  });

  it('leaves the real decision to the gateway', () => {
    // A well-formed number that belongs to nobody must be refused there, and identically to a
    // wrong PIN — this only stops an obviously incomplete one costing a round trip.
    expect(looksLikePhone('089999999999')).toBe(true);
  });
});
