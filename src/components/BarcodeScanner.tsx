import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

type Detector = { detect: (src: any) => Promise<{ rawValue: string }[]> };

async function createDetector(): Promise<Detector> {
  const Native = (window as any).BarcodeDetector;
  if (Native) {
    try {
      const supported: string[] = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) return new Native({ formats });
    } catch {
      /* 改用 polyfill */
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: FORMATS as any }) as unknown as Detector;
}

export default function BarcodeScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('正在開啟相機…');
  const [manual, setManual] = useState('');
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    (async () => {
      try {
        const detector = await createDetector();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setStatus('把條碼對準框框');
        const tick = async () => {
          if (stopped || done.current) return;
          try {
            if (v.readyState >= 2) {
              const codes = await detector.detect(v);
              const code = codes.find((c) => /^\d{6,14}$/.test(c.rawValue))?.rawValue ?? codes[0]?.rawValue;
              if (code) {
                done.current = true;
                navigator.vibrate?.(60);
                onDetect(code);
                return;
              }
            }
          } catch {
            /* 下一格再試 */
          }
          timer = window.setTimeout(tick, 220);
        };
        tick();
      } catch (e: any) {
        setStatus(
          e?.name === 'NotAllowedError'
            ? '沒有相機權限，請在瀏覽器設定允許相機，或改用下方拍照／手動輸入'
            : '無法開啟相機，可以改用下方拍照或手動輸入條碼',
        );
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  const fromPhoto = async (file?: File) => {
    if (!file) return;
    setStatus('辨識照片中…');
    try {
      const detector = await createDetector();
      const bmp = await createImageBitmap(file);
      const codes = await detector.detect(bmp);
      if (codes[0]) onDetect(codes[0].rawValue);
      else setStatus('照片裡找不到條碼，靠近一點再拍一次');
    } catch {
      setStatus('照片辨識失敗');
    }
  };

  return (
    <div className="scanner">
      <div className="scanner-view">
        <video ref={videoRef} playsInline muted />
        <div className="scanner-frame" />
      </div>
      <p className="muted small center">{status}</p>
      <div className="scanner-alt">
        <label className="btn file-btn">
          📷 拍條碼照片
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromPhoto(e.target.files?.[0])} />
        </label>
        <form
          className="manual-code"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onDetect(manual.trim());
          }}
        >
          <input inputMode="numeric" placeholder="手動輸入條碼" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} />
          <button className="btn" type="submit">
            查
          </button>
        </form>
      </div>
    </div>
  );
}
