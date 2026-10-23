import { useState } from 'react';
import Bunny from '../components/Bunny';
import { NumInput } from '../components/ui';
import { db } from '../lib/db';
import { toDateKey } from '../lib/dates';
import { ACTIVITY_LEVELS, MACRO_PRESETS, buildTargets, fmt, formulaTdee } from '../lib/nutrition';
import { saveProfile } from '../lib/store';
import type { Goal, MacroPreset, Profile } from '../lib/types';

const thisYear = new Date().getFullYear();

export const GOAL_LABEL: Record<Goal, string> = { lose: '減脂', maintain: '維持', gain: '增肌' };

export function ProfileForm({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="form">
      <label className="field">
        <span>性別</span>
        <div className="chips">
          {(['female', 'male'] as const).map((s) => (
            <button key={s} type="button" className={`chip ${value.sex === s ? 'on' : ''}`} onClick={() => set('sex', s)}>
              {s === 'female' ? '女生' : '男生'}
            </button>
          ))}
        </div>
      </label>
      <div className="row3">
        <label className="field">
          <span>出生年</span>
          <NumInput value={value.birthYear} onChange={(v) => set('birthYear', v)} aria-label="出生年" />
        </label>
        <label className="field">
          <span>身高</span>
          <NumInput value={value.heightCm} onChange={(v) => set('heightCm', v)} suffix="cm" aria-label="身高" />
        </label>
        <label className="field">
          <span>體重</span>
          <NumInput value={value.weightKg} onChange={(v) => set('weightKg', v)} suffix="kg" aria-label="體重" />
        </label>
      </div>
      <label className="field">
        <span>平常活動量</span>
        <div className="options">
          {ACTIVITY_LEVELS.map((a) => (
            <button key={a.value} type="button" className={`option ${value.activity === a.value ? 'on' : ''}`} onClick={() => set('activity', a.value)}>
              <b>{a.label}</b>
              <small>{a.desc}</small>
            </button>
          ))}
        </div>
      </label>
      <label className="field">
        <span>目標</span>
        <div className="chips">
          {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
            <button key={g} type="button" className={`chip ${value.goal === g ? 'on' : ''}`} onClick={() => set('goal', g)}>
              {GOAL_LABEL[g]}
            </button>
          ))}
        </div>
      </label>
      {value.goal !== 'maintain' && (
        <>
          <label className="field">
            <span>每週{value.goal === 'lose' ? '減' : '增'}多少</span>
            <div className="chips">
              {(value.goal === 'lose' ? [0.25, 0.5, 0.75, 1] : [0.1, 0.25, 0.5]).map((r) => (
                <button key={r} type="button" className={`chip ${value.rateKg === r ? 'on' : ''}`} onClick={() => set('rateKg', r)}>
                  {r} kg
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span>目標體重（可不填）</span>
            <NumInput value={value.goalWeightKg} onChange={(v) => set('goalWeightKg', v || undefined)} suffix="kg" aria-label="目標體重" />
          </label>
        </>
      )}
      <label className="field">
        <span>飲食比例</span>
        <div className="options">
          {(Object.keys(MACRO_PRESETS) as MacroPreset[]).map((m) => (
            <button key={m} type="button" className={`option ${value.macro === m ? 'on' : ''}`} onClick={() => set('macro', m)}>
              <b>{MACRO_PRESETS[m].label}</b>
              <small>{MACRO_PRESETS[m].desc}</small>
            </button>
          ))}
        </div>
      </label>
    </div>
  );
}

export const DEFAULT_PROFILE: Profile = {
  sex: 'female',
  birthYear: thisYear - 28,
  heightCm: 160,
  weightKg: 55,
  activity: 1.375,
  goal: 'lose',
  rateKg: 0.5,
  macro: 'balanced',
};

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(DEFAULT_PROFILE);
  const valid = p.heightCm > 100 && p.heightCm < 250 && p.weightKg > 25 && p.weightKg < 300 && p.birthYear > thisYear - 100 && p.birthYear < thisYear - 10;
  const tdee = formulaTdee(p);
  const t = buildTargets(p, tdee);

  const finish = async () => {
    await db.weights.put({ date: toDateKey(), kg: p.weightKg, time: Date.now() });
    await saveProfile(p);
  };

  return (
    <div className="onboard">
      {step === 0 && (
        <div className="onboard-hero">
          <Bunny mood="cheer" size={150} bounce />
          <h1>嗨！我是蹦蹦 🐰</h1>
          <p>
            你的兔兔健身教練。
            <br />
            拍照、打字、掃條碼都能記錄，
            <br />
            我會依照你的身體變化自動調整目標！
          </p>
          <button className="btn primary big" onClick={() => setStep(1)}>
            開始設定
          </button>
          <p className="muted small">資料只存在這支手機的瀏覽器裡</p>
        </div>
      )}
      {step === 1 && (
        <div className="onboard-step">
          <div className="onboard-head">
            <Bunny mood="neutral" size={64} />
            <div>
              <h2>先認識你一下</h2>
              <p className="muted">用來估算每天大概消耗多少熱量</p>
            </div>
          </div>
          <ProfileForm value={p} onChange={setP} />
          <div className="onboard-actions">
            <button className="btn" onClick={() => setStep(0)}>
              上一步
            </button>
            <button className="btn primary" disabled={!valid} onClick={() => setStep(2)}>
              下一步
            </button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="onboard-step">
          <div className="onboard-head">
            <Bunny mood="proud" size={64} />
            <div>
              <h2>你的每日目標</h2>
              <p className="muted">之後會根據實際體重變化每週自動校正</p>
            </div>
          </div>
          <div className="card target-card">
            <div className="big-num">
              {fmt(t.kcal)}
              <small> 大卡/天</small>
            </div>
            <p className="muted">估計每日消耗 {fmt(tdee)} 大卡</p>
            <div className="macro-chips">
              <span className="pc">蛋白質 {t.protein}g</span>
              <span className="cc">碳水 {t.carbs}g</span>
              <span className="fc">脂肪 {t.fat}g</span>
            </div>
          </div>
          <div className="onboard-actions">
            <button className="btn" onClick={() => setStep(1)}>
              上一步
            </button>
            <button className="btn primary" onClick={finish}>
              開始記錄 🥕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
