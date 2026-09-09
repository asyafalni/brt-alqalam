import { describe, it, expect, beforeEach } from 'vitest';
import { canRecord, clearConnection, loadConnection, saveConnection, urlProblem } from './connection';

const EXEC = 'https://script.google.com/macros/s/AKfycb123/exec';

beforeEach(() => localStorage.clear());

describe('remembering how this device reaches the gateway', () => {
  it('keeps the url and the secret together, and reads them back', () => {
    saveConnection(EXEC, 'device-secret');
    expect(loadConnection()).toMatchObject({ url: EXEC, deviceSecret: 'device-secret' });
  });

  it('connects with the URL alone — reading needs no credential', () => {
    // The two tiers exist precisely so the boss can open the register on his own phone without
    // anybody enrolling his device, handing him write access he never asked for, and leaving
    // one more secret to revoke.
    saveConnection(EXEC);
    const c = loadConnection();
    expect(c).toMatchObject({ url: EXEC });
    expect(c?.deviceSecret).toBeUndefined();

    /* `canRecord` no longer means "holds a device secret". A registered phone number is the
       other way in, so a connected device with no secret is not a viewer — it is somebody who
       has not said who they are yet. What still separates looking from recording is the ROSTER:
       a PIN belonging to a registered member, decided by the gateway and by nothing here. */
    expect(canRecord(c)).toBe(true);
  });

  it('records with an enrolled secret too — both models stay live', () => {
    // A shared gudang tablet is enrolled once and takes anybody's PIN; a phone identifies its
    // owner by number. Neither was retired to make room for the other.
    saveConnection(EXEC, 'device-secret');
    expect(canRecord(loadConnection())).toBe(true);
    expect(loadConnection()?.deviceSecret).toBe('device-secret');
  });

  it('is not connected at all without a URL', () => {
    localStorage.setItem('brt.gateway.connection', JSON.stringify({ deviceSecret: 's' }));
    expect(loadConnection()).toBeNull();
  });

  it('survives junk in storage rather than white-screening a tablet', () => {
    localStorage.setItem('brt.gateway.connection', 'not json');
    expect(loadConnection()).toBeNull();
  });

  it('forgets on request — which is what a revoked device does next', () => {
    saveConnection(EXEC, 's');
    clearConnection();
    expect(loadConnection()).toBeNull();
  });
});

describe('catching an address that cannot work', () => {
  it('accepts a real /exec url', () => {
    expect(urlProblem(EXEC)).toBeNull();
  });

  it('names the /dev trap specifically', () => {
    // The editor offers /dev first, it looks almost identical, and it returns a Google sign-in
    // page with HTTP 200 to a kiosk where nobody is signed in.
    expect(urlProblem(EXEC.replace('/exec', '/dev'))).toContain('/exec');
  });

  it('rejects an address that is not Apps Script at all', () => {
    expect(urlProblem('https://example.com/exec')).toContain('Apps Script');
  });

  it('rejects http, and says nothing helpful is hidden behind it', () => {
    expect(urlProblem(EXEC.replace('https', 'http'))).toContain('https://');
  });

  it('asks for the address when it is empty rather than complaining about its shape', () => {
    expect(urlProblem('   ')).toContain('belum diisi');
  });
});
