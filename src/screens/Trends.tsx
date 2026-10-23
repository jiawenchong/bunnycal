import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import Bunny from '../components/Bunny';
import { KcalBars, WeightChart } from '../components/Charts';
import { Segmented, toast } from '../components/ui';
import { db } from '../lib/db';
import { addDays, formatMD, fromDateKey, toDateKey, weekday } from '../lib/dates';
import { fmt, formulaTdee, sumEntries } from '../lib/nutrition';
import { runCheckin, saveSettings, useProfile, useSettings, useTargets } from '../lib/store';
import { slope, weightTrend } from '../lib/tdee';
import type { LogEntry } from '../lib/types';
import { WeightSheet } from './Today';

type View = 'weight' | 'kcal' | 'calendar' | 'tdee';

export default function Trends({ onPickDate }: { onPickDate: (d: string) => void }) {
  const [view, setView] = useState<View>('weight');
  return (
    <div className="screen">
      <header className="topbar plain">
        <h1>趨勢</h1>
      </header>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'weight', label: '體重' },
          { value: 'kcal', label: '熱量' },
          { value: 'calendar', label: '月曆' },
          { value: 'tdee', label: '代謝' },
        ]}
      />
      {view === 'weight' && <WeightView />}
      {view === 'kcal' && <KcalView onPickDate={onPickDate} />}
      {view === 'calendar' && <CalendarView onPickDate={onPickDate} />}
      {view === 'tdee' && <TdeeView />}
    </div>
  );
}

function WeightView() {
  const profile = useProfile();
  const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('30');
  const [logDate, setLogDate] = useState<string | null>(null);
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), [], []);
  const today = toDateKey();
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const from = range === 'all' ? '' : addDays(today, -Number(range));
  const shown = trend.filter((p) => p.date >= from);
  const last = trend[trend.length - 1];
  const weekAgo = trend.find((p) => p.date >= addDays(last?.date ?? today, -7));
  const recent = trend.slice(-14);
  const perWeek = recent.length >= 7 ? slope(recent.map((p, i) => ({ x: i, y: p.trend }))) * 7 : undefined;
  const goal = profile?.goalWeightKg;
  const etaWeeks = goal && perWeek && last && Math.sign(goal - last.trend) === Math.sign(perWeek) ? Math.abs((goal - last.trend) / perWeek) : undefined;

  return (
    <>
      <section className="card">
        <div className="stat-row">
          <div className="stat">
            <span>趨勢體重</span>
            <b>{last ? last.trend.toFixed(1) : '—'}</b>
            <small>kg</small>
          </div>
          <div className="stat">
            <span>7 天變化</span>
            <b>{last && weekAgo ? (last.trend - weekAgo.trend > 0 ? '+' : '') + (last.trend - weekAgo.trend).toFixed(2) : '—'}</b>
            <small>kg</small>
          </div>
          <div className="stat">
            <span>{goal ? '距離目標' : '每週速度'}</span>
            <b>{goal && last ? Math.abs(last.trend - goal).toFixed(1) : perWeek !== undefined ? perWeek.toFixed(2) : '—'}</b>
            <small>{goal ? 'kg' : 'kg/週'}</small>
          </div>
        </div>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '1個月' },
            { value: '90', label: '3個月' },
            { value: '365', label: '1年' },
            { value: 'all', label: '全部' },
          ]}
        />
        <WeightChart points={shown} goal={goal} />
        <p className="muted small">
          點是每天量的數字，線是過濾掉水分波動後的「趨勢體重」。
          {etaWeeks !== undefined && etaWeeks < 200 && ` 照目前速度，大約 ${Math.ceil(etaWeeks)} 週後到達目標。`}
        </p>
        <button className="btn primary" onClick={() => setLogDate(today)}>
          ＋ 記錄今天體重
        </button>
      </section>
      <section className="card">
        <h3>紀錄</h3>
        <ul className="plain-list">
          {[...weights]
            .reverse()
            .slice(0, 60)
            .map((w) => (
              <li key={w.date} onClick={() => setLogDate(w.date)}>
                <span>
                  {formatMD(w.date)}（{weekday(w.date)}）
                </span>
                <b>{w.kg} kg</b>
              </li>
            ))}
        </ul>
        {!weights.length && <p className="muted small">還沒有體重紀錄</p>}
      </section>
      {logDate && (
        <WeightSheet
          open
          onClose={() => setLogDate(null)}
          date={logDate}
          current={weights.find((w) => w.date === logDate)?.kg ?? last?.trend ?? profile?.weightKg ?? 60}
        />
      )}
    </>
  );
}

function useDailyTotals(days: number) {
  const today = toDateKey();
  const from = addDays(today, -(days - 1));
  return useLiveQuery(
    async () => {
      const rows = await db.entries.where('date').between(from, today, true, true).toArray();
      const by = new Map<string, LogEntry[]>();
      for (const r of rows) by.set(r.date, [...(by.get(r.date) ?? []), r]);
      const out = [];
      for (let d = from; d <= today; d = addDays(d, 1)) out.push({ date: d, ...sumEntries(by.get(d) ?? []), count: by.get(d)?.length ?? 0 });
      return out;
    },
    [from, today],
    [],
  );
}

function KcalView({ onPickDate }: { onPickDate: (d: string) => void }) {
  const targets = useTargets();
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const data = useDailyTotals(Number(days));
  if (!targets) return null;
  const logged = data.filter((d) => d.count > 0);
  const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (logged.length ? logged.reduce((s, d) => s + d[k], 0) / logged.length : 0);
  const onTarget = logged.filter((d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  return (
    <>
      <section className="card">
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: '7天' },
            { value: '14', label: '14天' },
            { value: '30', label: '30天' },
          ]}
        />
        <KcalBars days={data} target={targets.kcal} onPick={onPickDate} />
        <p className="muted small">虛線是每日目標；點長條可以看那天的紀錄。</p>
      </section>
      <section className="card">
        <h3>平均（有記錄的 {logged.length} 天）</h3>
        <div className="stat-row">
          <div className="stat">
            <span>熱量</span>
            <b>{fmt(avg('kcal'))}</b>
            <small>/ {fmt(targets.kcal)}</small>
          </div>
          <div className="stat">
            <span>蛋白質</span>
            <b>{fmt(avg('protein'))}</b>
            <small>/ {targets.protein}g</small>
          </div>
          <div className="stat">
            <span>達標天數</span>
            <b>{onTarget}</b>
            <small>/ {logged.length}</small>
          </div>
        </div>
        <div className="stat-row">
          <div className="stat">
            <span>碳水</span>
            <b>{fmt(avg('carbs'))}</b>
            <small>/ {targets.carbs}g</small>
          </div>
          <div className="stat">
            <span>脂肪</span>
            <b>{fmt(avg('fat'))}</b>
            <small>/ {targets.fat}g</small>
          </div>
          <div className="stat">
            <span>記錄率</span>
            <b>{Math.round((logged.length / data.length) * 100) || 0}%</b>
            <small />
          </div>
        </div>
      </section>
    </>
  );
}

function CalendarView({ onPickDate }: { onPickDate: (d: string) => void }) {
  const targets = useTargets();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const first = toDateKey(month);
  const last = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const data = useLiveQuery(
    async () => {
      const rows = await db.entries.where('date').between(first, last, true, true).toArray();
      const weights = await db.weights.where('date').between(first, last, true, true).primaryKeys();
      const by = new Map<string, number>();
      for (const r of rows) by.set(r.date, (by.get(r.date) ?? 0) + r.n.kcal * r.qty);
      return { by, weights: new Set(weights as string[]) };
    },
    [first, last],
  );
  if (!targets) return null;
  const startPad = month.getDay();
  const daysInMonth = fromDateKey(last).getDate();
  const today = toDateKey();
  const cells: (string | null)[] = [...Array(startPad).fill(null)];
  for (let i = 1; i <= daysInMonth; i++) cells.push(toDateKey(new Date(month.getFullYear(), month.getMonth(), i)));
  const status = (d: string) => {
    const k = data?.by.get(d);
    if (k === undefined) return '';
    const r = k / targets.kcal;
    if (r < 0.5) return 'cal-partial';
    if (r <= 1.1) return 'cal-good';
    return 'cal-over';
  };
  const loggedCount = cells.filter((d) => d && data?.by.has(d)).length;
  return (
    <section className="card">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="上個月">
          ‹
        </button>
        <b>
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </b>
        <button className="icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="下個月">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
          <div key={w} className="cal-wd">
            {w}
          </div>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button key={d} className={`cal-day ${status(d)} ${d === today ? 'cal-today' : ''}`} onClick={() => onPickDate(d)} disabled={d > today}>
              <span>{fromDateKey(d).getDate()}</span>
              {data?.weights.has(d) && <i className="cal-w" />}
            </button>
          ) : (
            <div key={'p' + i} />
          ),
        )}
      </div>
      <div className="cal-legend">
        <span>
          <i className="cal-good" />
          達標
        </span>
        <span>
          <i className="cal-over" />
          超過
        </span>
        <span>
          <i className="cal-partial" />
          記錄不完整
        </span>
        <span>
          <i className="cal-w dot" />
          有量體重
        </span>
      </div>
      <p className="muted small center">這個月記錄了 {loggedCount} 天 🥕</p>
    </section>
  );
}

function TdeeView() {
  const profile = useProfile();
  const targets = useTargets();
  const settings = useSettings();
  const checkins = useLiveQuery(() => db.checkins.orderBy('date').reverse().toArray(), [], []);
  const [busy, setBusy] = useState(false);
  if (!profile || !targets || !settings) return null;
  const formula = formulaTdee(profile);
  const latest = checkins[0];

  const recalc = async () => {
    setBusy(true);
    const est = await runCheckin(true);
    setBusy(false);
    if (est) toast(est.enoughData ? `已更新：每日消耗約 ${fmt(est.suggested)} 大卡` : est.note, est.enoughData ? 'ok' : 'err');
  };

  return (
    <>
      <section className="card tdee-card">
        <div className="tdee-top">
          <Bunny mood="proud" size={64} />
          <div>
            <span className="muted small">目前採用的每日消耗（TDEE）</span>
            <div className="big-num">
              {fmt(targets.tdee)}
              <small> 大卡</small>
            </div>
            <span className="muted small">公式估算：{fmt(formula)} 大卡</span>
          </div>
        </div>
        <p className="small">
          蹦蹦每週會用你「實際吃的熱量」和「體重趨勢」反推真正的消耗：
          <br />
          <code>實際消耗 ≈ 平均攝取 − 體重變化 × 7700 ÷ 天數</code>
          <br />
          需要最近 3 週內至少 10 天完整記錄、3 次體重（跨 7 天以上）。
        </p>
        {latest && <div className="coach-note">🐰 {latest.note}</div>}
        <label className="check">
          <input type="checkbox" checked={settings.autoAdjust} onChange={(e) => saveSettings({ autoAdjust: e.target.checked })} />
          每週自動調整目標
        </label>
        <button className="btn primary" onClick={recalc} disabled={busy}>
          {busy ? '計算中…' : '立即重新計算'}
        </button>
      </section>
      {checkins.length > 0 && (
        <section className="card">
          <h3>校正紀錄</h3>
          <ul className="plain-list">
            {checkins.map((c) => (
              <li key={c.date}>
                <span>{formatMD(c.date)}</span>
                <span className="muted small">
                  {c.observed ? `觀察 ${fmt(c.observed)} → ` : '資料不足 '}採用 {fmt(c.applied)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
