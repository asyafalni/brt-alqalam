// A fresh browser should already be looking at the register.
//
// The address is the same for every device in the masjid and is not a credential, so asking each
// phone to paste a 120-character Apps Script URL bought nothing and cost the one thing §0.0
// protects: it is the difference between "open the app" and "open the app, find the message with
// the link in it, and copy it correctly".
//
// Baked into the BUILD, not the repository. That is a separate question from secrecy — the repo
// is public, and putting the address there hands it to crawlers rather than to people who have
// the app.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BUILT_IN = 'https://script.google.com/macros/s/BUILT/exec';

/** Re-imports the module so the build-time constant is read afresh. */
async function withBuiltIn(url: string) {
  vi.resetModules();
  vi.stubEnv('VITE_GATEWAY_URL', url);
  return import('./connection');
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllEnvs());

describe('a device nobody has set up', () => {
  it('is already connected to the address this build was made with', async () => {
    const { loadConnection } = await withBuiltIn(BUILT_IN);
    expect(loadConnection()).toMatchObject({ url: BUILT_IN });
  });

  it('holds no device secret — it identifies by phone number', async () => {
    const { loadConnection } = await withBuiltIn(BUILT_IN);
    expect(loadConnection()?.deviceSecret).toBeUndefined();
  });

  it('still asks when the build has no address, rather than inventing one', async () => {
    const { loadConnection } = await withBuiltIn('');
    expect(loadConnection()).toBeNull();
  });
});

describe('a deliberate disconnect', () => {
  it('sticks across reloads instead of the built-in address returning', async () => {
    // Otherwise admin_utama's "Putuskan" would undo itself on the next page load, which is a
    // control that appears to work and does not.
    const { loadConnection, clearConnection } = await withBuiltIn(BUILT_IN);
    expect(loadConnection()).not.toBeNull();
    clearConnection();
    expect(loadConnection()).toBeNull();
  });

  it('is undone by connecting again on purpose', async () => {
    const { loadConnection, clearConnection, saveConnection } = await withBuiltIn(BUILT_IN);
    clearConnection();
    saveConnection('https://script.google.com/macros/s/LAIN/exec');
    expect(loadConnection()).toMatchObject({ url: 'https://script.google.com/macros/s/LAIN/exec' });
  });

  it('does not make a never-connected device look like a lost one', async () => {
    const { clearConnection, connectionLost } = await withBuiltIn(BUILT_IN);
    clearConnection();
    expect(connectionLost(null)).toBe(false);
  });
});

describe('a stored address wins over the built-in one', () => {
  it('so a device pointed somewhere else stays pointed there', async () => {
    const { saveConnection, loadConnection } = await withBuiltIn(BUILT_IN);
    saveConnection('https://script.google.com/macros/s/MANUAL/exec', 'rahasia');
    expect(loadConnection()).toMatchObject({
      url: 'https://script.google.com/macros/s/MANUAL/exec',
      deviceSecret: 'rahasia',
    });
  });
});
