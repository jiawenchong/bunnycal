export function pad(n: number) {
  return n < 10 ? '0' + n : '' + n;
}

export function toDateKey(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** b - a，以天為單位 */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86400000);
}

const WD = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDateLabel(key: string, today = toDateKey()): string {
  if (key === today) return '今天';
  if (key === addDays(today, -1)) return '昨天';
  if (key === addDays(today, 1)) return '明天';
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
}

export function formatMD(key: string): string {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function weekday(key: string): string {
  return WD[fromDateKey(key).getDay()];
}

export function formatTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 以指定日期 + 時:分 建立 epoch ms */
export function atTime(dateKey: string, hhmm: string): number {
  const d = fromDateKey(dateKey);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/** 預設的紀錄時間：今天用現在時間，其他日子用 12:00 */
export function defaultTimeFor(dateKey: string): number {
  if (dateKey === toDateKey()) return Date.now();
  return atTime(dateKey, '12:00');
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}
