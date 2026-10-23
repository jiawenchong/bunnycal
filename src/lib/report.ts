import { db } from './db';
import { addDays, formatMD, toDateKey } from './dates';
import { fmt, scale, sumEntries } from './nutrition';
import { slope, weightTrend } from './tdee';
import type { Targets } from './types';

export interface PeriodReport {
  days: number;
  loggedDays: number;
  avg: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number };
  onTargetDays: number;
  proteinHitDays: number;
  overDays: number;
  topFoods: { name: string; kcal: number; times: number }[];
  lateNightKcalPct: number;
  weightChange?: number;
  bullets: { good: string[]; improve: string[] };
  text: string;
}

export async function buildReport(days: number, targets: Targets, today = toDateKey()): Promise<PeriodReport> {
  const from = addDays(today, -(days - 1));
  const rows = await db.entries.where('date').between(from, today, true, true).toArray();
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const dayTotals = [...byDay.entries()].map(([d, es]) => ({ d, ...sumEntries(es) }));
  const logged = dayTotals.filter((d) => d.kcal >= targets.kcal * 0.4);
  const n = Math.max(logged.length, 1);
  const avgOf = (k: keyof (typeof logged)[number]) => logged.reduce((s, d) => s + (d[k] as number), 0) / n;
  const avg = {
    kcal: avgOf('kcal'),
    protein: avgOf('protein'),
    carbs: avgOf('carbs'),
    fat: avgOf('fat'),
    fiber: avgOf('fiber'),
    sugar: avgOf('sugar'),
    sodium: avgOf('sodium'),
  };
  const onTargetDays = logged.filter((d) => Math.abs(d.kcal - targets.kcal) <= targets.kcal * 0.1).length;
  const overDays = logged.filter((d) => d.kcal > targets.kcal * 1.1).length;
  const proteinHitDays = logged.filter((d) => d.protein >= targets.protein * 0.9).length;

  const foodMap = new Map<string, { kcal: number; times: number }>();
  let lateKcal = 0;
  let totalKcal = 0;
  for (const r of rows) {
    const k = scale(r.n, r.qty).kcal;
    const f = foodMap.get(r.name) ?? { kcal: 0, times: 0 };
    foodMap.set(r.name, { kcal: f.kcal + k, times: f.times + 1 });
    totalKcal += k;
    if (new Date(r.time).getHours() >= 21) lateKcal += k;
  }
  const topFoods = [...foodMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, 5);
  const lateNightKcalPct = totalKcal ? lateKcal / totalKcal : 0;

  const weights = await db.weights.where('date').between(addDays(from, -14), today, true, true).toArray();
  const trend = weightTrend(weights).filter((p) => p.date >= from);
  const weightChange = trend.length >= 2 ? trend[trend.length - 1].trend - trend[0].trend : undefined;
  const perWeek = trend.length >= 5 ? slope(trend.map((p, i) => ({ x: i, y: p.trend }))) * 7 : undefined;

  const good: string[] = [];
  const improve: string[] = [];
  const rate = logged.length / days;
  if (rate >= 0.8) good.push(`記錄率 ${Math.round(rate * 100)}%，非常穩定`);
  else improve.push(`記錄率只有 ${Math.round(rate * 100)}%，試著每天至少記一餐`);
  if (proteinHitDays >= logged.length * 0.6 && logged.length) good.push(`${proteinHitDays} 天蛋白質達標`);
  else if (logged.length) improve.push(`蛋白質平均 ${fmt(avg.protein)}g（目標 ${targets.protein}g），每餐加一份豆魚蛋肉`);
  if (onTargetDays >= logged.length * 0.5 && logged.length) good.push(`${onTargetDays} 天熱量落在目標 ±10%`);
  if (overDays >= Math.max(2, logged.length * 0.3)) improve.push(`有 ${overDays} 天熱量超過目標 10% 以上`);
  if (avg.sodium > targets.sodiumMax) improve.push(`鈉平均 ${fmt(avg.sodium)}mg，超過建議的 ${targets.sodiumMax}mg`);
  if (avg.fiber < targets.fiber * 0.6 && logged.length) improve.push(`纖維平均 ${fmt(avg.fiber)}g，偏少（建議 ${targets.fiber}g）`);
  if (avg.sugar > targets.sugarMax) improve.push(`糖平均 ${fmt(avg.sugar)}g，手搖飲可以改微糖`);
  if (lateNightKcalPct > 0.25) improve.push(`${Math.round(lateNightKcalPct * 100)}% 的熱量在晚上 9 點後吃`);
  if (perWeek !== undefined && perWeek < -0.1) good.push(`趨勢體重每週下降 ${Math.abs(perWeek).toFixed(2)}kg`);

  const text = [
    `期間：最近 ${days} 天（${formatMD(from)}～${formatMD(today)}），有完整記錄 ${logged.length} 天`,
    `每日目標：${fmt(targets.kcal)} 大卡、蛋白質 ${targets.protein}g、碳水 ${targets.carbs}g、脂肪 ${targets.fat}g`,
    `平均攝取：${fmt(avg.kcal)} 大卡、蛋白質 ${fmt(avg.protein)}g、碳水 ${fmt(avg.carbs)}g、脂肪 ${fmt(avg.fat)}g、纖維 ${fmt(avg.fiber)}g、糖 ${fmt(avg.sugar)}g、鈉 ${fmt(avg.sodium)}mg`,
    `熱量達標（±10%）${onTargetDays} 天、超標 ${overDays} 天；蛋白質達標 ${proteinHitDays} 天`,
    `晚上 9 點後的熱量佔 ${Math.round(lateNightKcalPct * 100)}%`,
    `熱量來源前五名：${topFoods.map((f) => `${f.name}（${f.times} 次，共 ${fmt(f.kcal)} 大卡）`).join('、') || '無'}`,
    weightChange !== undefined ? `趨勢體重變化：${weightChange > 0 ? '+' : ''}${weightChange.toFixed(2)} kg` : '體重資料不足',
  ].join('\n');

  return { days, loggedDays: logged.length, avg, onTargetDays, proteinHitDays, overDays, topFoods, lateNightKcalPct, weightChange, bullets: { good, improve }, text };
}
