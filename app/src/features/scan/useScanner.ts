import { useEffect, useRef, useState } from 'octane';

// Native BarcodeDetector where it exists (Chrome/Android): no bundle cost, hardware-accelerated,
// and noticeably faster on a cheap tablet. iOS Safari has never shipped it, so a JS decoder is
// loaded LAZILY as the fallback — it never reaches a device that has the native one, and never
// loads at all until someone opens the camera.
//
// The fallback is jsQR (~40kB) rather than @zxing/browser (~870kB). Measured, not assumed:
// zxing pulls its PDF417, DataMatrix and RSS-Expanded decoders into the chunk, and this app
// reads exactly one format. On an iPhone over gudang wifi that difference is the whole wait.
declare const BarcodeDetector: {
  new (options?: { formats?: string[] }): {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
  };
  getSupportedFormats?(): Promise<string[]>;
} | undefined;

export type ScannerStatus =
  | 'starting'
  | 'scanning'
  | 'denied'        // the person said no, or the browser refused
  | 'insecure'      // camera needs https or localhost
  | 'no-camera'
  | 'error';

export interface Scanner {
  status: ScannerStatus;
  /** Which decoder actually ran — worth surfacing when diagnosing a slow phone. */
  engine: 'native' | 'jsqr' | null;
  message?: string;
}

/**
 * Runs the camera and reports decoded text. `onResult` fires at most once per mount:
 * a QR sits in frame for many frames, and a scanner that fired per frame would log twenty
 * withdrawals for one scan.
 */
export function useScanner(
  videoRef: { current: HTMLVideoElement | null },
  onResult: (text: string) => void,
): Scanner {
  const [state, setState] = useState<Scanner>({ status: 'starting', engine: null });
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopFallback: (() => void) | null = null;
    let cancelled = false;

    const finish = (text: string) => {
      if (done.current || cancelled) return;
      done.current = true;
      onResult(text);
    };

    async function start() {
      // getUserMedia is unavailable outside a secure context, and the failure is otherwise
      // indistinguishable from a denied permission — which sends people to the wrong fix.
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState({ status: 'insecure', engine: null });
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The back camera, and a resolution high enough to resolve a small QR at arm's length.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        if (cancelled) return;
        setState({
          status: name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'no-camera' : 'error',
          engine: null,
          message: e instanceof Error ? e.message : String(e),
        });
        return;
      }

      const video = videoRef.current;
      if (!video || cancelled) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // iOS refuses inline playback without it
      await video.play().catch(() => {});

      if (typeof BarcodeDetector !== 'undefined') {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        setState({ status: 'scanning', engine: 'native' });
        const tick = async () => {
          if (cancelled || done.current) return;
          try {
            const [hit] = await detector.detect(video);
            if (hit?.rawValue) return finish(hit.rawValue);
          } catch { /* a dropped frame is not an error worth surfacing */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return;
      }

      const jsQR = (await import('jsqr')).default;
      if (cancelled) return;
      setState({ status: 'scanning', engine: 'jsqr' });

      // jsQR reads pixels, so frames go through a canvas. Downscaling to ~640px wide is a
      // deliberate trade: decoding cost falls roughly with area, and a QR held at arm's length
      // is still many pixels per module. Full 1280px frames make a cheap tablet stutter.
      const canvas = document.createElement('canvas');
      const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
      let timer = 0;

      const scanFrame = () => {
        if (cancelled || done.current || !ctx2d) return;
        const w = video.videoWidth;
        if (w) {
          const scale = Math.min(1, 640 / w);
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
          if (hit?.data) return finish(hit.data);
        }
        // ~8 fps, not every frame. A phone camera does not move fast enough to justify 60,
        // and the battery on a shelf tablet is a real constraint.
        timer = setTimeout(scanFrame, 120) as unknown as number;
      };
      scanFrame();
      stopFallback = () => clearTimeout(timer);
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopFallback?.();
      // Releasing the track is what turns the camera light off. Leaving it on is alarming
      // on a shared device, and drains a tablet that lives on a shelf.
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return state;
}
