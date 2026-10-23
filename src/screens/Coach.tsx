import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import Bunny from '../components/Bunny';
import { Segmented, Spinner } from '../components/ui';
import { analyzePeriod, chatWithBunny } from '../lib/ai';
import { db } from '../lib/db';
import { formatTime } from '../lib/dates';
import { LlmError } from '../lib/llm';
import { fmt, sumEntries } from '../lib/nutrition';
import { buildReport, type PeriodReport } from '../lib/report';
import { getLlm, useLlm, useProfile, useTargets } from '../lib/store';
import { GOAL_LABEL } from './Onboarding';

export default function Coach({ date, onSettings }: { date: string; onSettings: () => void }) {
  const targets = useTargets();
  const profile = useProfile();
  const llm = useLlm();
  const aiOn = !!(llm?.enabled && llm.apiKey && llm.model);
  const [days, setDays] = useState<'7' | '14' | '30'>('7');
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [aiText, setAiText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!targets) return;
    setAiText('');
    buildReport(Number(days), targets).then(setReport);
  }, [days, targets]);

  if (!targets || !profile) return null;

  const deep = async () => {
    if (!report) return;
    setBusy(true);
    setErr('');
    try {
      const text = await analyzePeriod(await getLlm(), `目標：${GOAL_LABEL[profile.goal]}\n${report.text}`);
      setAiText(text);
    } catch (e: any) {
      setErr(e instanceof LlmError ? `${e.message}\n${e.hint ?? ''}` : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <header className="coach-hero">
        <Bunny mood="cheer" size={110} bounce />
        <div>
          <h1>蹦蹦教練</h1>
          <p className="muted">幫你看飲食、給建議、回答問題</p>
        </div>
      </header>

      <section className="card">
        <div className="section-head">
          <h3>飲食分析</h3>
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7天' },
              { value: '14', label: '14天' },
              { value: '30', label: '30天' },
            ]}
          />
        </div>
        {report && (
          <>
            <div className="stat-row">
              <div className="stat">
                <span>平均熱量</span>
                <b>{fmt(report.avg.kcal)}</b>
                <small>/ {fmt(targets.kcal)}</small>
              </div>
              <div className="stat">
                <span>平均蛋白質</span>
                <b>{fmt(report.avg.protein)}</b>
                <small>/ {targets.protein}g</small>
              </div>
              <div className="stat">
                <span>記錄天數</span>
                <b>{report.loggedDays}</b>
                <small>/ {report.days}</small>
              </div>
            </div>
            {report.bullets.good.length > 0 && (
              <div className="bullets good">
                <b>做得好 👍</b>
                <ul>
                  {report.bullets.good.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.bullets.improve.length > 0 && (
              <div className="bullets improve">
                <b>可以加強 🥕</b>
                <ul>
                  {report.bullets.improve.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.topFoods.length > 0 && (
              <div className="bullets">
                <b>熱量來源前幾名</b>
                <ul>
                  {report.topFoods.map((f) => (
                    <li key={f.name}>
                      {f.name} · {f.times} 次 · {fmt(f.kcal)} 大卡
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {aiOn ? (
          busy ? (
            <Spinner label="蹦蹦正在仔細分析…" />
          ) : aiText ? (
            <div className="ai-text">
              <b>🐰 蹦蹦的深入分析</b>
              <p>{aiText}</p>
            </div>
          ) : (
            <button className="btn primary" onClick={deep} disabled={!report?.loggedDays}>
              ✨ 請蹦蹦深入分析
            </button>
          )
        ) : (
          <p className="muted small">
            設定 AI 連線後，蹦蹦可以給更個人化的分析和聊天。
            <button className="link-btn" onClick={onSettings}>
              前往設定 →
            </button>
          </p>
        )}
        {err && <div className="error">{err}</div>}
      </section>

      {aiOn && <Chat date={date} />}
    </div>
  );
}

function Chat({ date }: { date: string }) {
  const targets = useTargets();
  const profile = useProfile();
  const messages = useLiveQuery(() => db.chat.orderBy('time').toArray(), [], []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [messages.length, busy]);

  const send = async (msg = text) => {
    const m = msg.trim();
    if (!m || !targets || !profile) return;
    setText('');
    setBusy(true);
    await db.chat.add({ time: Date.now(), role: 'user', text: m });
    try {
      const entries = await db.entries.where('date').equals(date).sortBy('time');
      const eaten = sumEntries(entries);
      const report = await buildReport(7, targets);
      const context = `目標：${GOAL_LABEL[profile.goal]}；每日 ${fmt(targets.kcal)} 大卡、蛋白質 ${targets.protein}g、碳水 ${targets.carbs}g、脂肪 ${targets.fat}g
${date} 已吃 ${fmt(eaten.kcal)} 大卡、蛋白質 ${fmt(eaten.protein)}g：${entries.map((e) => `${formatTime(e.time)} ${e.name}`).join('、') || '尚無紀錄'}
最近 7 天摘要：
${report.text}`;
      const history = messages.slice(-10).map((x) => ({ role: x.role, text: x.text }));
      const reply = await chatWithBunny(await getLlm(), context, history, m);
      await db.chat.add({ time: Date.now(), role: 'assistant', text: reply });
    } catch (e: any) {
      await db.chat.add({ time: Date.now(), role: 'assistant', text: `（連線失敗：${e instanceof LlmError ? e.message : e.message}）` });
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ['晚餐吃什麼比較好？', '便利商店怎麼買高蛋白？', '今天吃得怎麼樣？', '在馬來西亞怎麼吃比較健康？'];

  return (
    <section className="card chat">
      <div className="section-head">
        <h3>跟蹦蹦聊聊</h3>
        {messages.length > 0 && (
          <button className="link-btn" onClick={() => confirm('清除所有對話？') && db.chat.clear()}>
            清除
          </button>
        )}
      </div>
      <div className="chat-list">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === 'assistant' && <Bunny mood="happy" size={30} />}
            <p>{m.text}</p>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <Bunny mood="neutral" size={30} />
            <p className="typing">
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!messages.length && (
        <div className="chips wrap">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="問蹦蹦任何飲食問題…" disabled={busy} />
        <button className="btn primary" disabled={busy || !text.trim()}>
          送出
        </button>
      </form>
    </section>
  );
}
