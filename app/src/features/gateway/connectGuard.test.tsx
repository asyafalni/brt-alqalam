// Who may cut a kiosk off from the register.
//
// Disconnecting is how a tablet stops being able to record anything until somebody with the
// gateway URL and an enrolled device secret comes back to it — and the person most likely to
// press it is the one least able to undo it.
//
// The asymmetry with CONNECTING is deliberate and load-bearing: the admin screen needs a gateway
// to verify anybody against, so requiring an admin to connect would leave a fresh device
// unconnectable by anyone, including an admin. A device with nothing to lose may connect; one
// that is already working may only be cut off by admin_utama.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { ConnectPanel } from './ConnectPanel';
import type { Connection } from '../../state/connection';

const connected: Connection = {
  url: 'https://script.google.com/macros/s/AAA/exec',
  deviceSecret: 'rahasia',
  connectedTs: 1,
};

afterEach(cleanup);

describe('an established connection', () => {
  it('offers no way to disconnect to an ordinary admin', () => {
    const r = render(() => <ConnectPanel connection={connected} onChange={() => {}} />);
    expect(r.queryByRole('button', { name: /Putuskan/ })).toBeNull();
  });

  it('says WHO can, rather than just showing nothing', () => {
    // Somebody who came here to fix a connection problem should learn who to ask.
    const r = render(() => <ConnectPanel connection={connected} onChange={() => {}} />);
    expect(r.getByText(/Hanya Admin Utama/)).toBeTruthy();
  });

  it('offers it to admin_utama', () => {
    const r = render(() => (
      <ConnectPanel connection={connected} onChange={() => {}} canManage />
    ));
    expect(r.getByRole('button', { name: /Putuskan/ })).toBeTruthy();
    expect(r.queryByText(/Hanya Admin Utama/)).toBeNull();
  });

  it('still lets anybody send what is stranded in the queue', () => {
    // The marbot's own work, not an administrative act.
    const r = render(() => (
      <ConnectPanel connection={connected} onChange={() => {}} queued={2} onSendQueued={() => {}} />
    ));
    expect(r.getByRole('button', { name: /Kirim sekarang/ })).toBeTruthy();
  });
});

describe('a device with no connection', () => {
  it('can still be connected by anyone — otherwise nobody could ever start', () => {
    const r = render(() => <ConnectPanel connection={null} onChange={() => {}} />);
    expect(r.getByLabelText(/Alamat gateway/)).toBeTruthy();
  });
});
