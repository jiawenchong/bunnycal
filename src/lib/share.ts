import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Bunny from '../components/Bunny';
import { formatDateLabel, formatTime, fromDateKey } from './dates';
import { fmt, scale, sumEntries } from './nutrition';
import type { LogEntry, Targets } from './types';

async function bunnyImage(): Promise<HTMLImageElement> {
  const svg = renderToStaticMarkup(createElement(Bunny, { mood: 'proud', size: 240 })).replace(
    '<svg',
    '<svg xmlns="http://www.w3.org/2000/svg"',
  );
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  return img;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 產生今日飲食分享圖（1080×1350） */
export async function renderDayCard(date: string, entries: LogEntry[], targets: Targets): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffe3ec');
  g.addColorStop(1, '#fff7f9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const total = sumEntries(entries);
  const d = fromDateKey(date);
  ctx.fillStyle = '#5a4650';
  ctx.font = font(800, 64);
  ctx.fillText(`${d.getMonth() + 1}月${d.getDate()}日 的飲食`, 72, 130);
  ctx.font = font(500, 34);
  ctx.fillStyle = '#9a8590';
  ctx.fillText(`BunnyCal 兔兔卡路里 · ${formatDateLabel(date)}`, 72, 186);

  const bunny = await bunnyImage();
  ctx.drawImage(bunny, W - 300, 40, 240, 280);

  // 熱量圓環
  const cx = 250;
  const cy = 430;
  const r = 150;
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffd6e0';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const pct = Math.min(total.kcal / targets.kcal, 1);
  ctx.strokeStyle = total.kcal > targets.kcal * 1.05 ? '#e5586f' : '#ff8fab';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a4650';
  ctx.font = font(800, 72);
  ctx.fillText(fmt(total.kcal), cx, cy + 10);
  ctx.font = font(500, 30);
  ctx.fillStyle = '#9a8590';
  ctx.fillText(`/ ${fmt(targets.kcal)} 大卡`, cx, cy + 56);
  ctx.textAlign = 'left';

  const macros: [string, number, number, string][] = [
    ['蛋白質', total.protein, targets.protein, '#5aa9e6'],
    ['碳水', total.carbs, targets.carbs, '#f4a259'],
    ['脂肪', total.fat, targets.fat, '#b388eb'],
  ];
  macros.forEach(([label, v, max, color], i) => {
    const y = 340 + i * 90;
    ctx.fillStyle = '#5a4650';
    ctx.font = font(700, 34);
    ctx.fillText(label, 470, y);
    ctx.font = font(500, 30);
    ctx.fillStyle = '#9a8590';
    ctx.textAlign = 'right';
    ctx.fillText(`${fmt(v)} / ${fmt(max)} g`, 1008, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f3e3e8';
    roundRect(ctx, 470, y + 18, 538, 20, 10);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, 470, y + 18, Math.max(20, 538 * Math.min(v / max, 1)), 20, 10);
    ctx.fill();
  });

  // 餐點列表
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 56, 640, W - 112, 640, 36);
  ctx.fill();
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const shown = sorted.slice(0, 10);
  shown.forEach((e, i) => {
    const y = 712 + i * 56;
    const t = scale(e.n, e.qty);
    ctx.fillStyle = '#9a8590';
    ctx.font = font(500, 30);
    ctx.fillText(formatTime(e.time), 96, y);
    ctx.fillStyle = '#5a4650';
    ctx.font = font(600, 32);
    let name = e.name + (e.qty !== 1 ? ` ×${e.qty}` : '');
    while (ctx.measureText(name).width > 620 && name.length > 2) name = name.slice(0, -2) + '…';
    ctx.fillText(name, 210, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${fmt(t.kcal)} 大卡`, W - 96, y);
    ctx.textAlign = 'left';
  });
  if (sorted.length > shown.length) {
    ctx.fillStyle = '#9a8590';
    ctx.font = font(500, 28);
    ctx.fillText(`…還有 ${sorted.length - shown.length} 項`, 210, 712 + shown.length * 56);
  }
  if (!sorted.length) {
    ctx.fillStyle = '#9a8590';
    ctx.font = font(500, 32);
    ctx.fillText('今天還沒有紀錄', 96, 720);
  }

  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: '今天的飲食' });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
