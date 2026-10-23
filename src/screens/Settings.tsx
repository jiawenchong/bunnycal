import { useEffect, useState } from 'react';
import Bunny from '../components/Bunny';
import { NumInput, Sheet, toast } from '../components/ui';
import { setKV } from '../lib/db';
import { DEFAULT_ENDPOINT, LlmError, testConnection } from '../lib/llm';
import { fmt } from '../lib/nutrition';
import { exportAll, importAll, saveProfile, saveTargets, useLlm, useProfile, useTargets, wipeAll } from '../lib/store';
import type { LlmConfig, Profile, Targets } from '../lib/types';
import { ProfileForm } from './Onboarding';

type Section = 'root' | 'profile' | 'targets' | 'ai' | 'data';

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>('root');
  useEffect(() => {
    if (open) setSection('root');
  }, [open]);
  const titles: Record<Section, string> = { root: '設定', profile: '個人資料與目標', targets: '手動調整每日目標', ai: 'AI 連線', data: '資料備份' };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={
        section === 'root' ? (
          titles.root
        ) : (
          <span className="title-back">
            <button className="icon-btn" onClick={() => setSection('root')} aria-label="返回">
              ‹
            </button>
            {titles[section]}
          </span>
        )
      }
    >
      {section === 'root' && <Root go={setSection} />}
      {section === 'profile' && <ProfileSection done={() => setSection('root')} />}
      {section === 'targets' && <TargetsSection done={() => setSection('root')} />}
      {section === 'ai' && <AiSection />}
      {section === 'data' && <DataSection />}
    </Sheet>
  );
}

function Root({ go }: { go: (s: Section) => void }) {
  const llm = useLlm();
  const targets = useTargets();
  const aiOn = !!(llm?.enabled && llm.apiKey && llm.model);
  return (
    <div className="settings-list">
      <button onClick={() => go('profile')}>
        <span>👤 個人資料與目標</span>
        <small>重新計算建議熱量</small>
      </button>
      <button onClick={() => go('targets')}>
        <span>🎯 手動調整每日目標</span>
        <small>{targets ? `${fmt(targets.kcal)} 大卡 · P${targets.protein} C${targets.carbs} F${targets.fat}` : ''}</small>
      </button>
      <button onClick={() => go('ai')}>
        <span>🤖 AI 連線</span>
        <small className={aiOn ? 'good' : ''}>{aiOn ? '已啟用' : '未設定'}</small>
      </button>
      <button onClick={() => go('data')}>
        <span>💾 資料備份與還原</span>
        <small>匯出 / 匯入 JSON</small>
      </button>
      <div className="about">
        <Bunny mood="happy" size={56} />
        <p className="muted small">
          BunnyCal 兔兔卡路里 v1.0
          <br />
          資料只存在這個瀏覽器，不會上傳到任何伺服器（AI 功能只會把照片和文字送到你設定的 LLM）。
          <br />
          iPhone：Safari 分享 → 加入主畫面；Android：Chrome 選單 → 安裝應用程式。
        </p>
      </div>
    </div>
  );
}

function ProfileSection({ done }: { done: () => void }) {
  const profile = useProfile();
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => {
    if (profile && !p) setP(profile);
  }, [profile, p]);
  if (!p) return null;
  return (
    <div className="flow">
      <ProfileForm value={p} onChange={setP} />
      <p className="muted small">儲存後會用公式重新估算每日消耗，之後仍會每週自動校正。</p>
      <button
        className="btn primary"
        onClick={async () => {
          await saveProfile(p);
          toast('已更新目標 ✓');
          done();
        }}
      >
        儲存並重新計算
      </button>
    </div>
  );
}

function TargetsSection({ done }: { done: () => void }) {
  const targets = useTargets();
  const [t, setT] = useState<Targets | null>(null);
  useEffect(() => {
    if (targets && !t) setT(targets);
  }, [targets, t]);
  if (!t) return null;
  const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  const set = (k: keyof Targets, v: number) => setT({ ...t, [k]: v });
  return (
    <div className="flow">
      <div className="nutrient-grid">
        {(
          [
            ['kcal', '熱量', '大卡'],
            ['protein', '蛋白質', 'g'],
            ['carbs', '碳水', 'g'],
            ['fat', '脂肪', 'g'],
            ['fiber', '纖維', 'g'],
            ['sugarMax', '糖上限', 'g'],
            ['sodiumMax', '鈉上限', 'mg'],
          ] as const
        ).map(([k, label, unit]) => (
          <label key={k} className="field mini">
            <span>{label}</span>
            <NumInput value={t[k]} onChange={(v) => set(k, v)} suffix={unit} aria-label={label} />
          </label>
        ))}
      </div>
      <p className={`small ${Math.abs(macroKcal - t.kcal) > 100 ? 'warn' : 'muted'}`}>
        三大營養素合計 {fmt(macroKcal)} 大卡{Math.abs(macroKcal - t.kcal) > 100 ? '，跟熱量目標差比較多喔' : ''}
      </p>
      <p className="muted small">提醒：開著「每週自動調整」時，下次校正會覆蓋手動設定，可在「趨勢 → 代謝」關閉。</p>
      <button
        className="btn primary"
        onClick={async () => {
          await saveTargets(t);
          toast('已儲存 ✓');
          done();
        }}
      >
        儲存
      </button>
    </div>
  );
}

function AiSection() {
  const llm = useLlm();
  const [c, setC] = useState<LlmConfig | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (llm && !c) setC(llm);
  }, [llm, c]);
  if (!c) return null;
  const set = <K extends keyof LlmConfig>(k: K, v: LlmConfig[K]) => setC({ ...c, [k]: v });

  const save = async (cfg = c) => {
    await setKV('llm', cfg);
    toast('已儲存 ✓');
  };
  const test = async (image: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const text = await testConnection({ ...c, enabled: true }, image);
      setResult({ ok: true, text: `✅ 連線成功，回覆：「${text.slice(0, 80)}」` });
    } catch (e: any) {
      setResult({ ok: false, text: e instanceof LlmError ? `❌ ${e.message}\n${e.hint ?? ''}` : `❌ ${e.message}` });
    } finally {
      setBusy(false);
    }
  };
  let origin = '';
  try {
    origin = new URL(c.endpoint).origin;
  } catch {
    /* 網址格式錯誤 */
  }

  return (
    <div className="flow">
      <label className="check big">
        <input type="checkbox" checked={c.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        啟用 AI（拍照辨識、AI 解析、兔兔回饋與聊天）
      </label>
      <label className="field">
        <span>串接方式</span>
        <select className="input" value={c.mode} onChange={(e) => set('mode', e.target.value as LlmConfig['mode'])}>
          <option value="files">先上傳圖片取得 file_id（公司 Agent 平台）</option>
          <option value="openai">OpenAI 相容（圖片用 base64 image_url）</option>
        </select>
      </label>
      <label className="field">
        <span>Chat Completions 網址</span>
        <input className="input" value={c.endpoint} onChange={(e) => set('endpoint', e.target.value.trim())} placeholder={DEFAULT_ENDPOINT} />
      </label>
      <label className="field">
        <span>{c.mode === 'files' ? 'Agent ID（model）' : 'Model'}</span>
        <input className="input" value={c.model} onChange={(e) => set('model', e.target.value.trim())} placeholder={c.mode === 'files' ? '你的 agent-id' : 'gpt-4o-mini'} autoCapitalize="off" autoCorrect="off" />
      </label>
      <label className="field">
        <span>API Key{c.mode === 'files' ? '（要跟 Agent ID 成對）' : ''}</span>
        <div className="row-input">
          <input
            className="input"
            type={showKey ? 'text' : 'password'}
            value={c.apiKey}
            onChange={(e) => set('apiKey', e.target.value.trim())}
            placeholder="ask_…"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn" type="button" onClick={() => setShowKey((s) => !s)}>
            {showKey ? '隱藏' : '顯示'}
          </button>
        </div>
      </label>
      <label className="check">
        <input type="checkbox" checked={c.autoFeedback} onChange={(e) => set('autoFeedback', e.target.checked)} />
        每次記錄後讓蹦蹦自動給回饋
      </label>
      <button className="btn primary" onClick={() => save()}>
        儲存
      </button>
      <div className="row2">
        <button className="btn" onClick={() => test(false)} disabled={busy || !c.apiKey || !c.model}>
          測試文字
        </button>
        <button className="btn" onClick={() => test(true)} disabled={busy || !c.apiKey || !c.model}>
          測試圖片
        </button>
      </div>
      {busy && <p className="muted small">測試中…</p>}
      {result && <div className={result.ok ? 'notice' : 'error'}>{result.text}</div>}
      <div className="notice small">
        <b>連不上的話：</b>
        <ol>
          <li>手機要連公司網路或 VPN 才能連到內網的 Agent 平台（出國時通常連不到，其他功能照常可用）。</li>
          <li>
            平台用的是自簽憑證，請先用同一個瀏覽器打開{' '}
            {origin ? (
              <a href={origin} target="_blank" rel="noreferrer">
                {origin}
              </a>
            ) : (
              'API 網址'
            )}{' '}
            並選擇「繼續前往／信任」，再回來測試。
          </li>
          <li>如果瀏覽器跳出「允許存取區域網路上的裝置」，請按允許。</li>
          <li>平台需要允許從這個網站跨網域呼叫（CORS）。如果測試一直顯示「連不到」，請平台管理員把 {location.origin} 加入允許清單。</li>
        </ol>
        API Key 只存在這支手機的瀏覽器，不會被匯出，也不會上傳到 GitHub。
      </div>
    </div>
  );
}

function DataSection() {
  const [busy, setBusy] = useState(false);
  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bunnycal-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } finally {
      setBusy(false);
    }
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    if (!confirm('匯入會取代目前所有資料，確定嗎？')) return;
    try {
      await importAll(await f.text());
      toast('匯入完成 ✓');
    } catch (e: any) {
      toast('匯入失敗：' + e.message, 'err');
    }
  };
  return (
    <div className="flow">
      <p className="muted small">資料存在瀏覽器裡。換手機、清除瀏覽器資料前，記得先匯出備份。</p>
      <button className="btn primary" onClick={doExport} disabled={busy}>
        ⬇️ 匯出備份（JSON）
      </button>
      <label className="btn file-btn">
        ⬆️ 從備份匯入
        <input type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
      </label>
      <button
        className="btn danger-ghost"
        onClick={() => {
          if (confirm('真的要刪除所有資料嗎？這個動作無法復原。') && confirm('最後確認：刪除全部紀錄？')) wipeAll();
        }}
      >
        🗑️ 刪除所有資料
      </button>
    </div>
  );
}
