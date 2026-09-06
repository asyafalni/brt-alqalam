import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@octanejs/testing-library';
import { ScannerView } from './ScannerView';
import type { Route } from '../../state/route';

// happy-dom ships no camera stack at all — `isSecureContext`, `navigator.mediaDevices` and
// `BarcodeDetector` are simply absent — so each test declares the browser it wants to be.
// `isSecureContext` is read as a BARE global, so leaving it out is a ReferenceError rather
// than a falsy value: it has to be stubbed even by tests that are about something else.

/** A stream happy-dom's `srcObject` setter accepts, whose track records that it was released. */
function fakeStream() {
  const track = { stop: vi.fn(), kind: 'video' };
  const stream = new MediaStream(); // happy-dom's is an empty shim; only its identity matters
  Object.assign(stream, { getTracks: () => [track] });
  return { stream, track };
}

// The scan loop polls on requestAnimationFrame. The test owns that queue, so "another frame"
// is something it decides rather than something a timer eventually gets around to.
let frames: FrameRequestCallback[] = [];

/** Flush the promise chain — getUserMedia, video.play(), detect() all resolve on microtasks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Run every frame that has been requested, and let what it started finish. */
async function nextFrame() {
  await settle();
  for (const cb of frames.splice(0)) cb(0);
  await settle();
}

function browser(opts: {
  secure?: boolean;
  camera?: () => Promise<MediaStream>;
  detect?: () => Promise<{ rawValue: string }[]>;
}) {
  frames = [];
  vi.stubGlobal('isSecureContext', opts.secure ?? true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  if (opts.detect) vi.stubGlobal('BarcodeDetector', class { detect = opts.detect!; });
  if (opts.camera) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: opts.camera },
    });
  }
}

function mount() {
  const found: Route[] = [];
  const closes: true[] = [];
  const r = render(ScannerView, {
    props: {
      onFound: (route: Route) => { found.push(route); },
      onClose: () => { closes.push(true); },
    },
  });
  return { ...r, found, closes };
}

const refuse = (name: string) => () => Promise.reject(new DOMException('nope', name));
const working = async () => fakeStream().stream;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('ScannerView — the three ways a camera fails need three different fixes', () => {
  it('over plain http it names HTTPS as the problem, rather than showing a dead viewfinder', async () => {
    // The one that will actually happen: the gudang tablet opening the app over LAN http.
    browser({ secure: false, camera: working });
    const r = mount();

    await waitFor(() => expect(r.getByRole('alert')).toBeTruthy());
    expect(r.getByText('Kamera butuh HTTPS')).toBeTruthy();
    expect(r.getByText(/https atau localhost/)).toBeTruthy();
  });

  it('a refused permission points at the browser settings, not at a broken-camera hunt', async () => {
    browser({ camera: refuse('NotAllowedError') });
    const r = mount();

    await waitFor(() => expect(r.getByText('Izin kamera ditolak')).toBeTruthy());
    expect(r.getByText(/pengaturan browser/)).toBeTruthy();
    expect(r.queryByText('Kamera tidak ditemukan')).toBeNull();
    expect(r.queryByText('Kamera butuh HTTPS')).toBeNull();
  });

  it('a device with no camera says so — no setting the user could change would help', async () => {
    browser({ camera: refuse('NotFoundError') });
    const r = mount();

    await waitFor(() => expect(r.getByText('Kamera tidak ditemukan')).toBeTruthy());
    expect(r.queryByText('Izin kamera ditolak')).toBeNull();
    expect(r.queryByText('Kamera butuh HTTPS')).toBeNull();
  });
});

describe('ScannerView — what the camera decoded', () => {
  it('hands a decoded label up as the route it points at, so the caller never parses text', async () => {
    browser({ camera: working, detect: async () => [{ rawValue: 'https://x.test/#/scan?l=LOC-A1' }] });
    const r = mount();

    await nextFrame();

    expect(r.found).toEqual([{ name: 'scan', target: 'location', id: 'LOC-A1' }]);
    expect(r.queryByRole('alert')).toBeNull();
  });

  it('says a foreign QR is unrecognised and echoes it — silence reads as a broken camera', async () => {
    browser({ camera: working, detect: async () => [{ rawValue: 'https://wa.me/628123' }] });
    const r = mount();

    await nextFrame();

    await waitFor(() => expect(r.getByText('Label tidak dikenal')).toBeTruthy());
    // Echoing the raw text is what lets someone tell "wrong sticker" from "wrong app".
    expect(r.getByText('https://wa.me/628123')).toBeTruthy();
    expect(r.found).toHaveLength(0);
  });

  it('reports one scan, not one per frame — a QR sits in view for dozens of frames', async () => {
    // The guarantee this file exists for: a per-frame scanner would log twenty withdrawals
    // for one label held up to the camera.
    const detect = vi.fn(async () => [{ rawValue: 'LOC-A1' }]);
    browser({ camera: working, detect });
    const r = mount();
    await settle();

    // Deliver the queued frames twice over, so two detect() calls are in flight at once —
    // the only opening through which a second hit could reach onFound.
    const queued = frames.splice(0);
    for (const cb of [...queued, ...queued]) cb(0);
    await settle();
    expect(detect).toHaveBeenCalledTimes(2);

    await nextFrame();
    await nextFrame();

    expect(r.found).toEqual([{ name: 'scan', target: 'location', id: 'LOC-A1' }]);
    // And it stopped polling once it had its answer — no frame was requested after the hit.
    expect(detect).toHaveBeenCalledTimes(2);
  });
});

describe('ScannerView — leaving the screen', () => {
  it('releases the camera track on unmount, so the light goes out and a shelf tablet survives', async () => {
    const { stream, track } = fakeStream();
    browser({ camera: async () => stream, detect: async () => [] });
    const r = mount();
    await settle();

    r.unmount();

    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('the close button hands control back to the caller', async () => {
    browser({ camera: working, detect: async () => [] });
    const r = mount();
    await settle();

    fireEvent.click(r.getByLabelText('Tutup pemindai'));

    expect(r.closes).toHaveLength(1);
  });
});
