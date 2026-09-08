import { describe, it, expect, beforeEach } from 'vitest';
import { clearConnection, loadConnection, saveConnection, urlProblem } from './connection';

const EXEC = 'https://script.google.com/macros/s/AKfycb123/exec';

beforeEach(() => localStorage.clear());

describe('remembering how this device reaches the gateway', () => {
  it('keeps the url and the secret together, and reads them back', () => {
    saveConnection(EXEC, 'device-secret');
    expect(loadConnection()).toMatchObject({ url: EXEC, deviceSecret: 'device-secret' });
  });

  it('is not connected until BOTH halves are there', () => {
    // A URL with no secret cannot open a session, so treating it as connected would put the
    // kiosk into a state where every PIN attempt fails for a reason nobody could see.
    localStorage.setItem('brt.gateway.connection', JSON.stringify({ url: EXEC }));
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
