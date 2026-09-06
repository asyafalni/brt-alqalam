import { useEffect, useRef, useState } from 'octane';

// Native BarcodeDetector where it exists (Chrome/Android): no bundle cost, hardware-accelerated,
// and noticeably faster on a cheap tablet. iOS Safari has never shipped it, so @zxing/browser is
// loaded LAZILY as the fallback — meaning the ~200kB decoder never reaches a device that has the
// native one, and never loads at all until someone actually opens the camera.
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
  engine: 'native' | 'zxing' | null;
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
    let stopZxing: (() => void) | null = null;
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

      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (cancelled) return;
      setState({ status: 'scanning', engine: 'zxing' });
      const controls = await new BrowserQRCodeReader().decodeFromVideoElement(video, (result) => {
        if (result) finish(result.getText());
      });
      stopZxing = () => controls.stop();
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopZxing?.();
      // Releasing the track is what turns the camera light off. Leaving it on is alarming
      // on a shared device, and drains a tablet that lives on a shelf.
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return state;
}
