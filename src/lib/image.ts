/** 把圖片縮到長邊 maxSide，輸出 JPEG（平台建議 1600px 以內、只收 PNG/JPG） */
export async function resizeImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  if ('close' in bmp && typeof (bmp as ImageBitmap).close === 'function') (bmp as ImageBitmap).close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片轉換失敗'))), 'image/jpeg', quality),
  );
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    } catch {
      /* 改用 <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 紀錄用的小縮圖 */
export function thumbnail(file: Blob) {
  return resizeImage(file, 320, 0.75);
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  return await r.blob();
}
