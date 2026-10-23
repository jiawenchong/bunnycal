import type { MacroPreset, Nutrients, Profile, Targets } from './types';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: '久坐', desc: '辦公室工作，幾乎不運動' },
  { value: 1.375, label: '輕度活動', desc: '每週運動 1–3 天' },
  { value: 1.55, label: '中度活動', desc: '每週運動 3–5 天' },
  { value: 1.725, label: '高度活動', desc: '每週運動 6–7 天' },
  { value: 1.9, label: '非常高', desc: '勞力工作或一天練兩次' },
];

export const MACRO_PRESETS: Record<MacroPreset, { label: string; proteinPerKg: number; fatPct: number; desc: string }> = {
  balanced: { label: '均衡', proteinPerKg: 1.6, fatPct: 0.28, desc: '蛋白質 1.6 g/kg，脂肪 28%' },
  highProtein: { label: '高蛋白', proteinPerKg: 2.0, fatPct: 0.25, desc: '蛋白質 2.0 g/kg，適合增肌減脂' },
  lowCarb: { label: '低碳', proteinPerKg: 1.8, fatPct: 0.4, desc: '脂肪 40%，碳水較低' },
  lowFat: { label: '低脂', proteinPerKg: 1.6, fatPct: 0.2, desc: '脂肪 20%，碳水較高' },
};

/** 每公斤體脂約 7700 大卡 */
export const KCAL_PER_KG = 7700;

export function ageFrom(birthYear: number, now = new Date()) {
  return now.getFullYear() - birthYear;
}

/** Mifflin-St Jeor 基礎代謝 */
export function bmr(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>, weightKg: number) {
  const age = ageFrom(p.birthYear);
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

export function formulaTdee(p: Profile, weightKg = p.weightKg) {
  return bmr(p, weightKg) * p.activity;
}

/** 依目標換算的每日熱量差 */
export function goalDelta(p: Profile) {
  if (p.goal === 'maintain') return 0;
  const d = (p.rateKg * KCAL_PER_KG) / 7;
  return p.goal === 'lose' ? -d : d;
}

export function round(n: number, step = 1) {
  return Math.round(n / step) * step;
}

export function buildTargets(p: Profile, tdee: number, weightKg = p.weightKg): Targets {
  const minKcal = p.sex === 'male' ? 1500 : 1200;
  const kcal = Math.max(minKcal, round(tdee + goalDelta(p), 10));
  const preset = MACRO_PRESETS[p.macro];
  let protein = round(preset.proteinPerKg * weightKg);
  // 蛋白質最多佔 40% 熱量
  protein = Math.min(protein, round((kcal * 0.4) / 4));
  const fat = round((kcal * preset.fatPct) / 9);
  const carbs = Math.max(0, round((kcal - protein * 4 - fat * 9) / 4));
  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: Math.max(20, round((kcal / 1000) * 14)),
    sugarMax: round((kcal * 0.1) / 4),
    sodiumMax: 2300,
    tdee: round(tdee, 10),
    updatedAt: Date.now(),
  };
}

export const EMPTY: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0 };

export function scale(n: Nutrients, k: number): Nutrients {
  return {
    kcal: n.kcal * k,
    protein: n.protein * k,
    carbs: n.carbs * k,
    fat: n.fat * k,
    fiber: (n.fiber ?? 0) * k,
    sugar: (n.sugar ?? 0) * k,
    sodium: (n.sodium ?? 0) * k,
    satFat: (n.satFat ?? 0) * k,
  };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
    sugar: (a.sugar ?? 0) + (b.sugar ?? 0),
    sodium: (a.sodium ?? 0) + (b.sodium ?? 0),
    satFat: (a.satFat ?? 0) + (b.satFat ?? 0),
  };
}

export function sumEntries(entries: { n: Nutrients; qty: number }[]): Nutrients {
  return entries.reduce((acc, e) => add(acc, scale(e.n, e.qty)), { ...EMPTY });
}

/** 把任意輸入整理成合法的營養素物件 */
export function cleanNutrients(x: any): Nutrients {
  const num = (v: any) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    kcal: num(x?.kcal ?? x?.calories),
    protein: num(x?.protein),
    carbs: num(x?.carbs ?? x?.carbohydrates),
    fat: num(x?.fat),
    fiber: num(x?.fiber),
    sugar: num(x?.sugar),
    sodium: num(x?.sodium),
    satFat: num(x?.satFat ?? x?.saturatedFat),
  };
}

export function fmt(n: number | undefined, digits = 0) {
  const v = n ?? 0;
  if (digits === 0) return Math.round(v).toLocaleString('zh-TW');
  return (Math.round(v * 10 ** digits) / 10 ** digits).toString();
}
