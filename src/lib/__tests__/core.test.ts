import { describe, expect, it } from 'vitest';
import { BUILTIN_FOODS } from '../../data/foods';
import { addDays } from '../dates';
import { buildGeminiBody, extractJson, filesUrl, geminiText, geminiUrl, sortGeminiModels } from '../llm';
import { buildTargets, cleanNutrients, formulaTdee, sumEntries } from '../nutrition';
import { offToFood } from '../off';
import { parseLabelText } from '../ocr';
import { searchFoods } from '../search';
import { estimateTdee, weightTrend } from '../tdee';
import { parseCnNumber, parseMealText, parseSegment, splitMeal } from '../textparse';
import type { Profile } from '../types';

const profile: Profile = {
  sex: 'female',
  birthYear: new Date().getFullYear() - 30,
  heightCm: 160,
  weightKg: 60,
  activity: 1.375,
  goal: 'lose',
  rateKg: 0.5,
  macro: 'balanced',
};

describe('nutrition', () => {
  it('Mifflin-St Jeor TDEE', () => {
    // 10*60 + 6.25*160 - 5*30 - 161 = 1289 → ×1.375
    expect(Math.round(formulaTdee(profile))).toBe(1772);
  });

  it('targets add up and respect deficit', () => {
    const t = buildTargets(profile, 1772);
    expect(t.kcal).toBe(1220); // 1772 - 550 → 1222 → round 10
    expect(t.protein).toBe(96);
    const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(macroKcal - t.kcal)).toBeLessThan(15);
  });

  it('never goes below minimum calories', () => {
    expect(buildTargets({ ...profile, rateKg: 1 }, 1500).kcal).toBe(1200);
  });

  it('sums entries with quantity', () => {
    const s = sumEntries([
      { n: { kcal: 100, protein: 10, carbs: 5, fat: 2 }, qty: 2 },
      { n: { kcal: 50, protein: 1, carbs: 10, fat: 0, sodium: 100 }, qty: 0.5 },
    ]);
    expect(s.kcal).toBe(225);
    expect(s.protein).toBe(20.5);
    expect(s.sodium).toBe(50);
  });

  it('cleans messy LLM numbers', () => {
    expect(cleanNutrients({ kcal: '350', protein: -3, carbs: null, fat: 'abc', calories: 1 })).toMatchObject({ kcal: 350, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('adaptive TDEE', () => {
  const today = '2026-10-20';
  function scenario(avgIntake: number, kgPerWeek: number, days = 21) {
    const intake = new Map<string, number>();
    const weights = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(today, -(days - 1) + i);
      intake.set(d, avgIntake + (i % 2 ? 80 : -80));
      weights.push({ date: d, kg: 60 + (kgPerWeek / 7) * i + (i % 3 === 0 ? 0.3 : -0.15), time: 0 });
    }
    return { intake, weights };
  }

  it('reports not enough data at first', () => {
    const est = estimateTdee({ profile, intake: new Map(), weights: [], today });
    expect(est.enoughData).toBe(false);
    expect(est.suggested).toBeCloseTo(formulaTdee(profile));
  });

  it('infers real expenditure from intake and weight loss', () => {
    // 吃 1500、每週掉 0.5kg → 實際消耗 ≈ 1500 + 550 = 2050
    const { intake, weights } = scenario(1500, -0.5);
    const est = estimateTdee({ profile, intake, weights, today, previous: 2050 });
    expect(est.enoughData).toBe(true);
    expect(est.observed!).toBeGreaterThan(1950);
    expect(est.observed!).toBeLessThan(2150);
  });

  it('moves gradually and caps the weekly change', () => {
    const { intake, weights } = scenario(1500, -0.5);
    // 觀察值約 2050，前次 1600：往觀察值移動一半（約 +230）
    const half = estimateTdee({ profile, intake, weights, today, previous: 1600 });
    expect(half.suggested).toBeGreaterThan(1800);
    expect(half.suggested).toBeLessThan(1850);
    // 前次 1300：一半會是 +375，但每次最多 +250
    const capped = estimateTdee({ profile, intake, weights, today, previous: 1300 });
    expect(capped.suggested).toBe(1550);
  });

  it('ignores obviously incomplete days', () => {
    const { intake, weights } = scenario(1800, 0);
    for (const k of [...intake.keys()].slice(0, 5)) intake.set(k, 200);
    const est = estimateTdee({ profile, intake, weights, today, previous: 1800 });
    expect(est.loggedDays).toBe(16);
  });

  it('trend smooths daily noise', () => {
    const t = weightTrend([
      { date: '2026-10-01', kg: 60, time: 0 },
      { date: '2026-10-02', kg: 62, time: 0 },
      { date: '2026-10-04', kg: 60, time: 0 },
    ]);
    expect(t).toHaveLength(4);
    expect(t[1].trend).toBeCloseTo(60.2);
    expect(t[2].kg).toBeUndefined();
  });
});

describe('offline text parsing', () => {
  it('parses Chinese numbers', () => {
    expect(parseCnNumber('兩')).toBe(2);
    expect(parseCnNumber('十二')).toBe(12);
    expect(parseCnNumber('半')).toBe(0.5);
    expect(parseCnNumber('1.5')).toBe(1.5);
  });

  it('splits a meal description', () => {
    expect(splitMeal('早餐吃了鮪魚蛋餅、中杯無糖豆漿和一根香蕉')).toEqual(['鮪魚蛋餅', '中杯無糖豆漿', '一根香蕉']);
  });

  it('extracts quantities', () => {
    expect(parseSegment('兩顆茶葉蛋')).toEqual({ name: '茶葉蛋', qty: 2 });
    expect(parseSegment('半碗白飯')).toEqual({ name: '白飯', qty: 0.5 });
    expect(parseSegment('200g雞胸肉')).toEqual({ name: '雞胸肉', qty: 1, grams: 200 });
    expect(parseSegment('水餃10顆')).toEqual({ name: '水餃', qty: 10 });
    expect(parseSegment('一碗半滷肉飯')).toEqual({ name: '滷肉飯', qty: 1.5 });
  });

  it('matches the food database', () => {
    const r = parseMealText('兩顆蛋、一碗白飯、200g雞胸肉、nasi lemak', [BUILTIN_FOODS]);
    expect(r.map((x) => x.food?.name)).toEqual(['雞蛋', '白飯', '雞胸肉', '椰漿飯']);
    expect(r[0].qty).toBe(2);
    expect(r[2].qty).toBe(2);
  });

  it('search finds aliases and Malaysian dishes', () => {
    expect(searchFoods('roti canai', [BUILTIN_FOODS])[0].name).toBe('印度煎餅');
    expect(searchFoods('nasi lemak', [BUILTIN_FOODS]).map((f) => f.name)).toEqual(['椰漿飯', '椰漿飯+炸雞']);
    expect(searchFoods('珍奶', [BUILTIN_FOODS])[0].name).toContain('珍珠奶茶');
    expect(searchFoods('魯肉飯', [BUILTIN_FOODS])[0].name).toBe('滷肉飯');
  });

  it('builtin foods have plausible energy', () => {
    for (const f of BUILTIN_FOODS) {
      const est = f.n.protein * 4 + f.n.carbs * 4 + f.n.fat * 9;
      if (f.n.kcal < 30 || /酒|高粱|啤酒/.test(f.name)) continue;
      const ratio = est / f.n.kcal;
      expect(ratio, `${f.name}: ${est.toFixed(0)} vs ${f.n.kcal}`).toBeGreaterThan(0.75);
      expect(ratio, `${f.name}: ${est.toFixed(0)} vs ${f.n.kcal}`).toBeLessThan(1.3);
    }
  });

  it('builtin ids are unique', () => {
    expect(new Set(BUILTIN_FOODS.map((f) => f.id)).size).toBe(BUILTIN_FOODS.length);
  });
});

describe('LLM helpers', () => {
  it('derives the files endpoint', () => {
    expect(filesUrl('https://x.com:4231/public/kits/openai/v1/chat/completions')).toBe('https://x.com:4231/public/kits/openai/v1/files');
  });

  it('builds Gemini native URLs from any base form', () => {
    const want = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x-flash:generateContent';
    expect(geminiUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-x-flash')).toBe(want);
    expect(geminiUrl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'models/gemini-x-flash')).toBe(want);
    expect(geminiUrl('', ' gemini-x-flash ')).toBe(want);
  });

  it('builds Gemini request bodies with images, history and system prompt', () => {
    const body = buildGeminiBody('看圖', [{ mime: 'image/jpeg', data: 'AAA' }], {
      system: '你是蹦蹦',
      history: [
        { role: 'user', text: '嗨' },
        { role: 'assistant', text: '蹦！' },
      ],
      temperature: 0.5,
    });
    expect(body.systemInstruction).toEqual({ parts: [{ text: '你是蹦蹦' }] });
    expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.contents[2].parts).toEqual([{ text: '看圖' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAA' } }]);
    expect(body.generationConfig.temperature).toBe(0.5);
  });

  it('puts the newest stable Flash model first and drops unusable ones', () => {
    const ids = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-image', 'gemini-omni-flash-preview', 'gemma-4-31b-it', 'gemini-4-argon', 'gemini-3.1-pro-preview'];
    expect(sortGeminiModels(ids.map((id) => ({ id }))).map((m) => m.id)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
    ]);
  });

  it('reads Gemini responses and skips thought parts', () => {
    expect(geminiText({ candidates: [{ content: { parts: [{ text: '想…', thought: true }, { text: '答案' }] } }] })).toBe('答案');
    expect(() => geminiText({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow('安全機制');
  });

  it('extracts JSON from fenced or chatty output', () => {
    expect(extractJson('好的！\n```json\n{"items":[{"name":"飯"}]}\n```')).toEqual({ items: [{ name: '飯' }] });
    expect(extractJson('結果如下 {"a": [1, 2,],} 謝謝')).toEqual({ a: [1, 2] });
    expect(extractJson('[{"name":"蛋"}]')).toEqual([{ name: '蛋' }]);
  });
});

describe('nutrition label OCR parsing', () => {
  it('reads a Taiwanese nutrition label', () => {
    const text = `營養標示
每一份量 30 公克
本包裝含 5 份
每份 每100公克
熱量 150 大卡 500 大卡
蛋白質 2.1 公克 7.0 公克
脂肪 8.4 公克 28 公克
飽和脂肪 3.9 公克 13 公克
反式脂肪 0 公克 0 公克
碳水化合物 16.5 公克 55 公克
糖 1.2 公克 4 公克
鈉 135 毫克 450 毫克`;
    const r = parseLabelText(text);
    expect(r.servingGrams).toBe(30);
    expect(r.servingsPerPackage).toBe(5);
    expect(r.n).toMatchObject({ kcal: 150, protein: 2.1, fat: 8.4, satFat: 3.9, carbs: 16.5, sugar: 1.2, sodium: 135 });
  });
});

describe('Open Food Facts mapping', () => {
  it('prefers per-serving values', () => {
    const f = offToFood({
      code: '123',
      product_name: 'Milo',
      brands: 'Nestle',
      serving_size: '30 g',
      serving_quantity: 30,
      nutriments: { 'energy-kcal_serving': 120, proteins_serving: 3, carbohydrates_serving: 20, fat_serving: 3, sodium_serving: 0.05, 'energy-kcal_100g': 400 },
    })!;
    expect(f.serving).toBe('1份(30 g)');
    expect(f.n.kcal).toBe(120);
    expect(f.n.sodium).toBe(50);
  });

  it('falls back to 100g and kJ', () => {
    const f = offToFood({ code: '9', product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 1 } })!;
    expect(f.serving).toBe('100g');
    expect(f.n.kcal).toBeCloseTo(100);
  });
});
