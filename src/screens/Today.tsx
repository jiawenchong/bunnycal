import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import Bunny from '../components/Bunny';
import { Bar, NumInput, Ring, Sheet, toast } from '../components/ui';
import { coachTips } from '../lib/coach';
import { db } from '../lib/db';
import { addDays, formatDateLabel, formatTime, toDateKey } from '../lib/dates';
import { fmt, scale, sumEntries } from '../lib/nutrition';
import { currentStreak, useProfile, useTargets } from '../lib/store';
import { weightTrend, slope } from '../lib/tdee';
import type { LogEntry } from '../lib/types';
import type { AddMode } from './AddSheet';
import EntrySheet from './EntrySheet';

const SOURCE_ICON: Record<string, string> = {
  'ai-photo': '📷',
  'ai-text': '✨',
  text: '⌨️',
  db: '🔎',
  barcode: '▥',
  label: '🏷️',
  quick: '⚡',
  copy: '📋',
};

function Thumb({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} className="thumb" alt="" />;
}

export default function Today({
  date,
  setDate,
  onAdd,
  onSettings,
}: {
  date: string;
  setDate: (d: string) => void;
  onAdd: (m: AddMode) => void;
  onSettings: () => void;
}) {
  const targets = useTargets();
  const profile = useProfile();
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('time'), [date], [] as LogEntry[]);
  const weight = useLiveQuery(() => db.weights.get(date), [date]);
  const recentWeights = useLiveQuery(() => db.weights.where('date').between(addDays(date, -28), date, true, true).toArray(), [date], []);
  const activeFast = useLiveQuery(() => db.fasts.filter((f) => !f.end).first(), []);
  const streak = useLiveQuery(() => currentStreak(), [entries?.length], 0);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [weightOpen, setWeightOpen] = useState(false);
  const [showMicro, setShowMicro] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (!targets || !profile) return null;
  const today = toDateKey();
  const isToday = date === today;
  const eaten = sumEntries(entries);
  const remaining = targets.kcal - eaten.kcal;

  const trend = weightTrend(recentWeights ?? []);
  const wSlope =
    trend.length >= 7 ? slope(trend.map((p, i) => ({ x: i, y: p.trend }))) * 7 : undefined;

  const tips = coachTips({
    targets,
    eaten,
    entryCount: entries.length,
    hour: new Date(now).getHours(),
    isToday,
    streak: streak ?? 0,
    fasting: activeFast && isToday ? { hours: (now - activeFast.start) / 3600000, goal: activeFast.goalHours } : undefined,
    weightTrendKgPerWeek: wSlope,
    goal: profile.goal,
  });
  // 最新一筆 AI 回饋優先顯示
  const lastCoach = [...entries].reverse().find((e) => e.coach);
  const bubble = lastCoach && tipIdx === 0 ? { mood: 'happy' as const, text: lastCoach.coach! } : tips[tipIdx % Math.max(tips.length, 1)];

  const share = async () => {
    try {
      const { renderDayCard, shareOrDownload } = await import('../lib/share');
      const blob = await renderDayCard(date, entries, targets);
      await shareOrDownload(blob, `bunnycal-${date}.png`);
    } catch (e: any) {
      toast('產生圖片失敗：' + e.message, 'err');
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">
          ‹
        </button>
        <button className="date-btn" onClick={() => setDate(today)}>
          {formatDateLabel(date)}
          {!isToday && <small>回今天</small>}
        </button>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="後一天" disabled={date >= today}>
          ›
        </button>
        <button className="icon-btn settings-btn" onClick={onSettings} aria-label="設定">
          ⚙️
        </button>
      </header>

      <section className="bunny-card" onClick={() => setTipIdx((i) => i + 1)}>
        <Bunny mood={bubble?.mood ?? 'happy'} size={72} />
        <div className="bubble">
          <p>{bubble?.text}</p>
          {(tips.length > 1 || lastCoach) && <small className="muted">點一下看下一則</small>}
        </div>
      </section>

      <section className="card summary">
        <Ring value={eaten.kcal} max={targets.kcal} size={150}>
          <div className="ring-num">{fmt(Math.abs(remaining))}</div>
          <div className="ring-sub">{remaining >= 0 ? '還可以吃' : '超過了'}</div>
        </Ring>
        <div className="summary-side">
          <div className="kv">
            <span>目標</span>
            <b>{fmt(targets.kcal)}</b>
          </div>
          <div className="kv">
            <span>已吃</span>
            <b>{fmt(eaten.kcal)}</b>
          </div>
          <button className="kv weight-kv" onClick={() => setWeightOpen(true)}>
            <span>體重</span>
            <b>{weight ? `${weight.kg} kg` : '＋ 記錄'}</b>
          </button>
          {activeFast && isToday && (
            <div className="kv">
              <span>斷食</span>
              <b>{((now - activeFast.start) / 3600000).toFixed(1)} h</b>
            </div>
          )}
        </div>
      </section>

      <section className="card macros">
        <Bar label="蛋白質" value={eaten.protein} max={targets.protein} color="var(--protein)" />
        <Bar label="碳水" value={eaten.carbs} max={targets.carbs} color="var(--carbs)" />
        <Bar label="脂肪" value={eaten.fat} max={targets.fat} color="var(--fat)" />
        <button className="link-btn" onClick={() => setShowMicro((x) => !x)}>
          {showMicro ? '收起' : '更多營養素'} {showMicro ? '▴' : '▾'}
        </button>
        {showMicro && (
          <div className="micro">
            <Bar label="膳食纖維" value={eaten.fiber ?? 0} max={targets.fiber} color="var(--fiber)" />
            <Bar label="糖（上限）" value={eaten.sugar ?? 0} max={targets.sugarMax} color="var(--sugar)" />
            <Bar label="鈉（上限）" value={eaten.sodium ?? 0} max={targets.sodiumMax} color="var(--sodium)" unit="mg" />
            <div className="micro-line muted small">飽和脂肪 {fmt(eaten.satFat, 1)} g</div>
          </div>
        )}
      </section>

      <section className="timeline">
        <div className="section-head">
          <h3>飲食紀錄</h3>
          {entries.length > 0 && (
            <button className="link-btn" onClick={share}>
              分享今日圖卡 ↗
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="empty">
            <p>還沒有紀錄，選一個方式開始吧！</p>
            <div className="quick-add">
              <button onClick={() => onAdd('photo')}>📷 拍照</button>
              <button onClick={() => onAdd('text')}>⌨️ 打字</button>
              <button onClick={() => onAdd('search')}>🔎 搜尋</button>
              <button onClick={() => onAdd('barcode')}>▥ 條碼</button>
            </div>
          </div>
        ) : (
          <ol className="entries">
            {entries.map((e) => {
              const t = scale(e.n, e.qty);
              return (
                <li key={e.id} className="entry" onClick={() => setEditing(e)}>
                  <span className="entry-time">{formatTime(e.time)}</span>
                  <span className="entry-dot" />
                  {e.photo ? <Thumb blob={e.photo} /> : <span className="thumb icon">{SOURCE_ICON[e.source] ?? '🍽️'}</span>}
                  <div className="entry-main">
                    <div className="entry-name">{e.name}</div>
                    <div className="entry-sub">
                      {e.qty !== 1 ? `${e.qty} × ` : ''}
                      {e.serving} · 蛋白 {fmt(t.protein)} · 碳 {fmt(t.carbs)} · 脂 {fmt(t.fat)}
                    </div>
                  </div>
                  <div className="entry-kcal">
                    {fmt(t.kcal)}
                    <small>大卡</small>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} date={date} current={weight?.kg ?? recentWeights?.[recentWeights.length - 1]?.kg ?? profile.weightKg} />
    </div>
  );
}

export function WeightSheet({ open, onClose, date, current }: { open: boolean; onClose: () => void; date: string; current: number }) {
  const [kg, setKg] = useState(current);
  useEffect(() => setKg(current), [current, open]);
  const save = async () => {
    if (!(kg > 20 && kg < 400)) return toast('體重數字怪怪的', 'err');
    await db.weights.put({ date, kg: Math.round(kg * 10) / 10, time: Date.now() });
    toast('體重已記錄 ✓');
    onClose();
  };
  const remove = async () => {
    await db.weights.delete(date);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`${formatDateLabel(date)}的體重`}>
      <p className="muted small">建議每天早上起床、上完廁所後量，趨勢會最準。</p>
      <div className="weight-input">
        <button className="btn round" onClick={() => setKg((k) => Math.round((k - 0.1) * 10) / 10)}>
          −
        </button>
        <NumInput value={kg} onChange={setKg} suffix="kg" className="huge" aria-label="體重" />
        <button className="btn round" onClick={() => setKg((k) => Math.round((k + 0.1) * 10) / 10)}>
          ＋
        </button>
      </div>
      <div className="foot-row">
        <button className="btn danger-ghost" onClick={remove}>
          刪除
        </button>
        <button className="btn primary grow" onClick={save}>
          儲存
        </button>
      </div>
    </Sheet>
  );
}
