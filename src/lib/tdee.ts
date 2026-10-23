import { addDays, daysBetween } from './dates';
import { KCAL_PER_KG, formulaTdee } from './nutrition';
import type { Profile, WeightEntry } from './types';

export interface TrendPoint {
  date: string;
  kg?: number;
  trend: number;
}

/**
 * 體重趨勢：指數移動平均（每天平滑 10%），沒量體重的日子沿用前一天的趨勢。
 * 這可以濾掉水分、鹽分造成的每日波動。
 */
export function weightTrend(weights: WeightEntry[], alpha = 0.1): TrendPoint[] {
  if (!weights.length) return [];
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((w) => [w.date, w.kg]));
  const out: TrendPoint[] = [];
  let trend = sorted[0].kg;
  const last = sorted[sorted.length - 1].date;
  for (let d = sorted[0].date; d <= last; d = addDays(d, 1)) {
    const kg = byDate.get(d);
    if (kg !== undefined) trend = trend + alpha * (kg - trend);
    out.push({ date: d, kg, trend });
  }
  return out;
}

/** 最小平方法斜率（y 對 x） */
export function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export interface TdeeEstimate {
  formula: number;
  observed?: number;
  /** 建議採用的 TDEE */
  suggested: number;
  avgIntake?: number;
  slopeKgPerWeek?: number;
  loggedDays: number;
  weighIns: number;
  enoughData: boolean;
  note: string;
}

export interface EstimateInput {
  profile: Profile;
  /** date → 當日總攝取熱量 */
  intake: Map<string, number>;
  weights: WeightEntry[];
  today: string;
  /** 前一次採用的 TDEE，用來平滑 */
  previous?: number;
  windowDays?: number;
}

/**
 * 自動調整 TDEE（類似 MacroFactor 的做法）：
 *   實際消耗 ≈ 平均攝取 − 體重變化 × 7700 / 天數
 * 只用「有認真記錄」的日子算平均攝取，體重用回歸斜率而不是頭尾相減，避免單日波動。
 */
export function estimateTdee(input: EstimateInput): TdeeEstimate {
  const { profile, intake, weights, today } = input;
  const windowDays = input.windowDays ?? 21;
  const start = addDays(today, -(windowDays - 1));
  const latestWeight =
    [...weights].sort((a, b) => b.date.localeCompare(a.date))[0]?.kg ?? profile.weightKg;
  const formula = formulaTdee(profile, latestWeight);
  const minLogged = formula * 0.45;

  const loggedVals: number[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const k = intake.get(d);
    // 熱量太低的日子多半是漏記，不列入
    if (k !== undefined && k >= minLogged) loggedVals.push(k);
  }
  const inWindow = weights.filter((w) => w.date >= start && w.date <= today);
  const span = inWindow.length
    ? daysBetween(
        inWindow.reduce((a, w) => (w.date < a ? w.date : a), inWindow[0].date),
        inWindow.reduce((a, w) => (w.date > a ? w.date : a), inWindow[0].date),
      )
    : 0;

  const base = input.previous ?? formula;
  const result: TdeeEstimate = {
    formula,
    suggested: base,
    loggedDays: loggedVals.length,
    weighIns: inWindow.length,
    enoughData: false,
    note: '',
  };

  if (loggedVals.length < 10 || inWindow.length < 3 || span < 7) {
    const need: string[] = [];
    if (loggedVals.length < 10) need.push(`再完整記錄 ${10 - loggedVals.length} 天飲食`);
    if (inWindow.length < 3) need.push(`再量 ${3 - inWindow.length} 次體重`);
    else if (span < 7) need.push('體重紀錄需要跨越至少 7 天');
    result.note = `資料還不夠，先用公式估算。${need.join('、')}後就能自動校正。`;
    return result;
  }

  const avgIntake = loggedVals.reduce((a, b) => a + b, 0) / loggedVals.length;
  const s = slope(inWindow.map((w) => ({ x: daysBetween(start, w.date), y: w.kg })));
  const observed = avgIntake - s * KCAL_PER_KG;

  // 合理範圍，避免異常資料讓目標暴衝
  const bmrLike = formula / profile.activity;
  const clampedObserved = Math.min(Math.max(observed, bmrLike * 1.05), bmrLike * 2.6);
  // 與前次估計平滑：往觀察值移動一半，且每次最多調 250 大卡
  let next = base + (clampedObserved - base) * 0.5;
  next = Math.min(Math.max(next, base - 250), base + 250);

  result.observed = observed;
  result.avgIntake = avgIntake;
  result.slopeKgPerWeek = s * 7;
  result.suggested = next;
  result.enoughData = true;
  const dir = s * 7;
  result.note =
    `過去 ${windowDays} 天平均攝取 ${Math.round(avgIntake)} 大卡，` +
    `體重${dir >= 0 ? '上升' : '下降'} ${Math.abs(dir).toFixed(2)} kg/週，` +
    `推算實際消耗約 ${Math.round(observed)} 大卡。`;
  return result;
}
