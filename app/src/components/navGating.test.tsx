// Which destinations exist, and for whom.
//
// Pengajuan and Histori Data are the two screens that name people — who asked, who decided, who
// took it. On the shared register the gateway withholds that data from anybody without an admin
// token (§39), so advertising the menu items would offer two destinations that can only ever be
// empty, which reads as the register having lost something rather than as a rule.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@octanejs/testing-library';
import { Sidebar } from './Sidebar';

const base = {
  route: { name: 'beranda' } as const,
  collapsed: false,
  isMobile: false,
  itemCount: 0,
  alertCount: 0,
  rackCount: 0,
  assetIssues: 0,
  requestCount: 0,
  onNavigate: () => {},
  onClose: () => {},
  onToggle: () => {},
  onOpenConnection: () => {},
  onOpenAdmin: () => {},
};

const names = (r: ReturnType<typeof render>) =>
  [...r.container.querySelectorAll('nav button')].map((b) => b.textContent?.trim() ?? '');

afterEach(cleanup);

describe('the two screens that name people', () => {
  it('are hidden on the shared register when nobody is signed in', () => {
    const r = render(() => <Sidebar {...base} connected admin={null} />);
    expect(names(r)).not.toContain('Pengajuan');
    expect(names(r)).not.toContain('Histori Data');
    // Everything else is still there — this is a rule about two screens, not a lockout.
    expect(names(r)).toContain('Stok');
    expect(names(r)).toContain('Peta Rak');
  });

  it('appear for an admin', () => {
    const r = render(() => (
      <Sidebar {...base} connected admin={{ name: 'Alfin', role: 'admin' }} />
    ));
    expect(names(r)).toContain('Pengajuan');
    expect(names(r)).toContain('Histori Data');
  });

  it('appear for admin_utama', () => {
    const r = render(() => (
      <Sidebar {...base} connected admin={{ name: 'Alfin', role: 'admin_utama' }} />
    ));
    expect(names(r)).toContain('Histori Data');
  });

  it('stay hidden for a token whose role is anggota', () => {
    const r = render(() => (
      <Sidebar {...base} connected admin={{ name: 'Budi', role: 'anggota' }} />
    ));
    expect(names(r)).not.toContain('Pengajuan');
  });

  it('are visible OFFLINE, where the register is this device\'s own draft', () => {
    // The stock-take walk (§59 stage 1) has no accounts at all. Hiding them here would take
    // function away from the one mode that never had a role to check.
    const r = render(() => <Sidebar {...base} connected={false} admin={null} />);
    expect(names(r)).toContain('Pengajuan');
    expect(names(r)).toContain('Histori Data');
  });
});

describe('Cetak Label is an admin destination too', () => {
  // Not because it names anybody — it prints QR stickers. Because sticking a code onto a shelf
  // fixes it there for years (§78), and a sheet of blanks costs label stock. Deciding what gets
  // printed is the admin's job; the marbot's is to record what moves.
  it('is hidden on the shared register when nobody is signed in', () => {
    const r = render(() => <Sidebar {...base} connected admin={null} />);
    expect(names(r)).not.toContain('Cetak Label');
    expect(names(r)).toContain('Opname Gudang');
  });

  it('appears for an admin', () => {
    const r = render(() => (
      <Sidebar {...base} connected admin={{ name: 'Alfin', role: 'admin' }} />
    ));
    expect(names(r)).toContain('Cetak Label');
  });

  it('stays visible OFFLINE, where labelling IS the work', () => {
    // Stage 1 is walking the gudang adding items and sticking tags on racks. That mode has no
    // roster to check, and it is the mode the printing screen exists for.
    const r = render(() => <Sidebar {...base} connected={false} admin={null} />);
    expect(names(r)).toContain('Cetak Label');
  });
});

describe('the rail no longer advertises Admin as a destination', () => {
  it('has no Admin nav item — it lives in the footer beside the connection', () => {
    const r = render(() => <Sidebar {...base} connected admin={null} />);
    expect(names(r)).not.toContain('Admin');
  });
});
