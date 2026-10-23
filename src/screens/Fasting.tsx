import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import Bunny from '../components/Bunny';
import { Ring, Sheet, toast } from '../components/ui';
import { db } from '../lib/db';
import { formatDuration, formatMD, formatTime, pad, toDateKey } from '../lib/dates';
import { FAST_PRESETS, fastStage } from '../lib/fasting';
import { saveSettings, useSettings } from '../lib/store';
import type { FastEntry } from '../lib/types';

function toLocalInput(t: number) {
  const d = new Date(t);
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Fasting() {
  const settings = useSettings();
  const active = useLiveQuery(() => db.fasts.filter((f) => !f.end).first(), []);
  const history = useLiveQuery(() => db.fasts.orderBy('start').reverse().filter((f) => !!f.end).limit(30).toArray(), [], []);
  const [now, setNow] = useState(Date.now());
  const [editStart, setEditStart] = useState(false);
  const [editing, setEditing] = useState<FastEntry | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!settings) return null;
  const goal = active?.goalHours ?? settings.fastGoalHours;
  const elapsed = active ? now - active.start : 0;
  const hours = elapsed / 3600000;
  const done = active && hours >= goal;
  const stage = fastStage(hours);

  const start = async () => {
    await db.fasts.add({ start: Date.now(), goalHours: settings.fastGoalHours });
    toast('開始斷食！蹦蹦陪你 💪');
  };
  const end = async () => {
    if (!active) return;
    await db.fasts.update(active.id!, { end: Date.now() });
    toast(hours >= goal ? `完成 ${hours.toFixed(1)} 小時斷食 🎉` : `已結束，斷食 ${hours.toFixed(1)} 小時`);
  };
  const completed = history.filter((f) => (f.end! - f.start) / 3600000 >= f.goalHours).length;
  const longest = history.reduce((m, f) => Math.max(m, (f.end! - f.start) / 3600000), 0);

  return (
    <div className="screen">
      <header className="topbar plain">
        <h1>斷食</h1>
      </header>
      <section className="card fast-card">
        <Ring value={active ? hours : 0} max={goal} size={230} stroke={18} color={done ? 'var(--good)' : 'var(--accent)'}>
          {active ? (
            <>
              <div className="ring-sub">{done ? '已達標！' : '已斷食'}</div>
              <div className="ring-num big">{formatDuration(elapsed)}</div>
              <div className="ring-sub">目標 {goal} 小時</div>
            </>
          ) : (
            <>
              <Bunny mood="sleepy" size={70} />
              <div className="ring-sub">還沒開始</div>
            </>
          )}
        </Ring>
        {active ? (
          <>
            <div className="fast-stage">
              <b>{stage.title}</b>
              <p className="muted small">{stage.desc}</p>
            </div>
            <div className="fast-times">
              <button className="link-btn" onClick={() => setEditStart(true)}>
                開始 {formatMD(toDateKey(active.start))} {formatTime(active.start)} ✎
              </button>
              <span>預計結束 {formatTime(active.start + goal * 3600000)}</span>
            </div>
            <button className={`btn big ${done ? 'primary' : ''}`} onClick={end}>
              結束斷食
            </button>
          </>
        ) : (
          <>
            <div className="chips wrap center">
              {FAST_PRESETS.map((p) => (
                <button key={p.hours} className={`chip ${settings.fastGoalHours === p.hours ? 'on' : ''}`} onClick={() => saveSettings({ fastGoalHours: p.hours })}>
                  <b>{p.label}</b> <small>{p.desc}</small>
                </button>
              ))}
            </div>
            <button className="btn primary big" onClick={start}>
              開始 {settings.fastGoalHours} 小時斷食
            </button>
          </>
        )}
      </section>

      <section className="card">
        <div className="stat-row">
          <div className="stat">
            <span>完成次數</span>
            <b>{completed}</b>
            <small>/ {history.length}</small>
          </div>
          <div className="stat">
            <span>最長</span>
            <b>{longest.toFixed(1)}</b>
            <small>小時</small>
          </div>
        </div>
        <h3>紀錄</h3>
        <ul className="plain-list">
          {history.map((f) => {
            const h = (f.end! - f.start) / 3600000;
            return (
              <li key={f.id} onClick={() => setEditing(f)}>
                <span>
                  {formatMD(toDateKey(f.start))} {formatTime(f.start)} → {formatTime(f.end!)}
                </span>
                <b className={h >= f.goalHours ? 'good' : ''}>
                  {h.toFixed(1)}h {h >= f.goalHours ? '✓' : ''}
                </b>
              </li>
            );
          })}
        </ul>
        {!history.length && <p className="muted small">完成的斷食會出現在這裡</p>}
      </section>
      <p className="muted small center pad">懷孕、哺乳、糖尿病或有飲食疾患請先諮詢醫師再嘗試斷食。</p>

      {active && (
        <Sheet open={editStart} onClose={() => setEditStart(false)} title="修改開始時間">
          <input
            className="input"
            type="datetime-local"
            defaultValue={toLocalInput(active.start)}
            max={toLocalInput(Date.now())}
            onChange={(e) => {
              const t = new Date(e.target.value).getTime();
              if (Number.isFinite(t) && t <= Date.now()) db.fasts.update(active.id!, { start: t });
            }}
          />
          <button className="btn primary" onClick={() => setEditStart(false)}>
            完成
          </button>
        </Sheet>
      )}
      {editing && (
        <Sheet open onClose={() => setEditing(null)} title="斷食紀錄">
          <label className="field">
            <span>開始</span>
            <input className="input" type="datetime-local" defaultValue={toLocalInput(editing.start)} onChange={(e) => setEditing({ ...editing, start: new Date(e.target.value).getTime() })} />
          </label>
          <label className="field">
            <span>結束</span>
            <input className="input" type="datetime-local" defaultValue={toLocalInput(editing.end!)} onChange={(e) => setEditing({ ...editing, end: new Date(e.target.value).getTime() })} />
          </label>
          <div className="foot-row">
            <button
              className="btn danger-ghost"
              onClick={async () => {
                await db.fasts.delete(editing.id!);
                setEditing(null);
              }}
            >
              刪除
            </button>
            <button
              className="btn primary grow"
              onClick={async () => {
                if (!(editing.end! > editing.start)) return toast('結束時間要晚於開始', 'err');
                await db.fasts.put(editing);
                setEditing(null);
              }}
            >
              儲存
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
