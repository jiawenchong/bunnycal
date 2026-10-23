import { fmt } from './nutrition';
import type { Nutrients, Targets } from './types';

export type Mood = 'happy' | 'neutral' | 'worried' | 'cheer' | 'sleepy' | 'proud';

export interface CoachTip {
  mood: Mood;
  text: string;
}

export interface CoachInput {
  targets: Targets;
  eaten: Nutrients;
  entryCount: number;
  hour: number;
  isToday: boolean;
  streak: number;
  fasting?: { hours: number; goal: number };
  weightTrendKgPerWeek?: number;
  goal: 'lose' | 'maintain' | 'gain';
}

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(Math.floor(seed)) % arr.length];

/** 規則式教練：不需要 LLM 就能給的提醒 */
export function coachTips(c: CoachInput): CoachTip[] {
  const t = c.targets;
  const e = c.eaten;
  const tips: CoachTip[] = [];
  const kcalPct = t.kcal ? e.kcal / t.kcal : 0;
  const remaining = t.kcal - e.kcal;
  const proteinLeft = t.protein - e.protein;
  const seed = new Date().getDate() + c.entryCount;

  if (c.fasting) {
    const left = c.fasting.goal - c.fasting.hours;
    tips.push(
      left > 0
        ? { mood: 'neutral', text: `斷食中 ${c.fasting.hours.toFixed(1)} 小時，再撐 ${left.toFixed(1)} 小時就達標！記得多喝水 💧` }
        : { mood: 'cheer', text: `斷食目標達成！蹦！開吃第一餐記得先吃蛋白質和蔬菜喔 🥕` },
    );
  }

  if (!c.isToday) {
    if (c.entryCount === 0) tips.push({ mood: 'sleepy', text: '這天沒有紀錄耶～補記也沒關係，蹦蹦不會生氣的！' });
    else if (kcalPct > 1.1) tips.push({ mood: 'neutral', text: `這天超出目標 ${fmt(-remaining)} 大卡，偶爾一天沒關係，看的是整週平均～` });
    else tips.push({ mood: 'happy', text: `這天吃了 ${fmt(e.kcal)} 大卡，蛋白質 ${fmt(e.protein)}g。` });
    return tips;
  }

  if (c.entryCount === 0) {
    if (c.hour < 10) tips.push({ mood: 'happy', text: pick(['早安！今天也一起加油，早餐記得加顆蛋 🥚', '早安～先量個體重，再來記錄早餐吧！'], seed) });
    else if (c.hour < 14) tips.push({ mood: 'neutral', text: '今天還沒記錄喔！午餐拍一張照就好，很快的～' });
    else tips.push({ mood: 'sleepy', text: '今天好像還沒記錄耶，想起來吃了什麼嗎？用打字的也可以！' });
  } else if (kcalPct > 1.15) {
    tips.push({ mood: 'worried', text: `今天已經超過目標 ${fmt(-remaining)} 大卡了。沒關係！明天正常吃就好，不需要刻意餓肚子。` });
  } else if (kcalPct > 0.95) {
    tips.push({ mood: 'proud', text: `剛剛好達標！今天的熱量控制得超棒 🎉` });
  } else if (c.hour >= 17 && remaining > 300) {
    tips.push({ mood: 'happy', text: `晚餐還有 ${fmt(remaining)} 大卡的額度，可以好好吃一頓～` });
  } else {
    tips.push({ mood: 'happy', text: pick([`還剩 ${fmt(remaining)} 大卡，節奏很好！`, `目前吃了 ${Math.round(kcalPct * 100)}%，穩穩的！`], seed) });
  }

  if (c.entryCount > 0 && proteinLeft > 25) {
    const ideas = ['一盒舒肥雞胸（23g）', '一杯無糖豆漿（15g）', '兩顆茶葉蛋（13g）', '一杯希臘優格（15g）', '一份鮭魚（22g）'];
    tips.push({ mood: 'neutral', text: `蛋白質還差 ${fmt(proteinLeft)}g，可以考慮${pick(ideas, seed)}。` });
  } else if (c.entryCount > 0 && proteinLeft <= 0) {
    tips.push({ mood: 'cheer', text: '蛋白質達標！肌肉在謝謝你 💪' });
  }

  if ((e.sodium ?? 0) > t.sodiumMax) tips.push({ mood: 'worried', text: `鈉已經 ${fmt(e.sodium)}mg，超過建議量了，下一餐湯少喝一點、多喝水。` });
  if ((e.sugar ?? 0) > t.sugarMax) tips.push({ mood: 'worried', text: `糖 ${fmt(e.sugar)}g 有點多，手搖飲可以改微糖或無糖喔～` });
  if (c.hour >= 18 && c.entryCount > 0 && (e.fiber ?? 0) < t.fiber * 0.5)
    tips.push({ mood: 'neutral', text: `纖維只有 ${fmt(e.fiber)}g，晚餐加一份燙青菜吧 🥬` });

  if (c.streak >= 3) tips.push({ mood: 'cheer', text: `已經連續記錄 ${c.streak} 天了！蹦蹦為你驕傲 🏅` });

  if (c.weightTrendKgPerWeek !== undefined) {
    const w = c.weightTrendKgPerWeek;
    if (c.goal === 'lose' && w < -1.2) tips.push({ mood: 'worried', text: `體重每週掉 ${Math.abs(w).toFixed(1)}kg，有點太快了，可以多吃一點保護肌肉。` });
    if (c.goal === 'lose' && w < -0.1 && w >= -1.2) tips.push({ mood: 'proud', text: `體重趨勢每週下降 ${Math.abs(w).toFixed(2)}kg，方向正確！` });
  }
  return tips;
}
