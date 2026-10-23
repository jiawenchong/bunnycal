import { ask, extractJson } from './llm';
import { cleanNutrients, fmt } from './nutrition';
import type { LlmConfig, Nutrients } from './types';

export const BUNNY_PERSONA = `你是「蹦蹦」，一隻戴著粉紅色運動頭帶的兔子健身教練，也是專業營養師。
說話風格：繁體中文（台灣用語），親切、活潑、會鼓勵人，偶爾用「蹦！」「🥕」，但內容要具體、實用、有根據。
不要說教、不要恐嚇，也不要給醫療診斷。回答精簡。`;

export interface AiFoodItem {
  name: string;
  portion: string;
  grams?: number;
  n: Nutrients;
}

export interface AiMealResult {
  items: AiFoodItem[];
  confidence?: string;
  note?: string;
}

const ITEM_SCHEMA = `{
  "items": [
    {"name": "食物名稱（繁體中文）", "portion": "份量描述，例如 1碗、半盤、2顆", "grams": 估計重量g,
     "kcal": 熱量, "protein": 蛋白質g, "carbs": 碳水g, "fat": 脂肪g,
     "fiber": 纖維g, "sugar": 糖g, "sodium": 鈉mg, "satFat": 飽和脂肪g}
  ],
  "confidence": "high | medium | low",
  "note": "一句話補充（例如看不清楚的地方或建議）"
}`;

const CONTEXT = `使用者住在台灣，常吃台灣外食與小吃，也常吃馬來西亞料理，有時出國旅行。
請以台灣與東南亞常見的份量與做法估算，數值用一般外食的平均值。`;

function toResult(raw: any): AiMealResult {
  const items = Array.isArray(raw) ? raw : raw?.items ?? [];
  return {
    items: items
      .filter((x: any) => x && (x.name || x.food))
      .map((x: any) => ({
        name: String(x.name ?? x.food).trim(),
        portion: String(x.portion ?? x.serving ?? '1份').trim(),
        grams: Number(x.grams) > 0 ? Number(x.grams) : undefined,
        n: cleanNutrients(x),
      })),
    confidence: raw?.confidence,
    note: raw?.note,
  };
}

export async function analyzeMealPhoto(cfg: LlmConfig, images: Blob[], hint: string): Promise<AiMealResult> {
  const prompt = `${CONTEXT}
請辨識照片中「實際會被吃掉」的每一樣食物與飲料，分開列出，估計份量與營養素。
如果照片是營養標示或菜單，請依照上面的資訊判斷。看不出是食物就回傳空的 items。
${hint ? `使用者補充：${hint}\n` : ''}
只輸出 JSON，不要任何其他文字，格式：
${ITEM_SCHEMA}`;
  return toResult(extractJson(await ask(cfg, prompt, { images })));
}

export async function parseMealTextAI(cfg: LlmConfig, text: string): Promise<AiMealResult> {
  const prompt = `${CONTEXT}
使用者用文字描述吃了什麼，請拆成一項一項食物，估計份量與營養素。數量詞要算進去（例如「兩顆蛋」就是 2 顆的總量）。
描述：「${text}」
只輸出 JSON，不要任何其他文字，格式：
${ITEM_SCHEMA}`;
  return toResult(extractJson(await ask(cfg, prompt)));
}

export interface LabelResult {
  name: string;
  servingDesc: string;
  servingGrams?: number;
  servingsPerPackage?: number;
  n: Nutrients;
}

export async function readLabelAI(cfg: LlmConfig, images: Blob[]): Promise<LabelResult> {
  const prompt = `這是食品包裝（可能包含正面與營養標示）。請讀出產品名稱與「每一份」的營養標示。
如果只有每 100 公克的數值，就以 100g 為一份。鈉的單位是毫克。
只輸出 JSON：
{"name": "產品名稱", "servingDesc": "每一份量描述，例如 1份(30g)", "servingGrams": 一份的重量g,
 "servingsPerPackage": 本包裝份數, "kcal": 熱量, "protein": 蛋白質g, "carbs": 碳水化合物g, "fat": 脂肪g,
 "satFat": 飽和脂肪g, "sugar": 糖g, "sodium": 鈉mg, "fiber": 膳食纖維g}`;
  const j = extractJson(await ask(cfg, prompt, { images }));
  return {
    name: String(j.name ?? '包裝食品'),
    servingDesc: String(j.servingDesc ?? '1份'),
    servingGrams: Number(j.servingGrams) > 0 ? Number(j.servingGrams) : undefined,
    servingsPerPackage: Number(j.servingsPerPackage) > 0 ? Number(j.servingsPerPackage) : undefined,
    n: cleanNutrients(j),
  };
}

export interface DaySnapshot {
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  eaten: Nutrients;
  meals: { time: string; name: string; kcal: number; protein: number }[];
  goal: string;
}

function snapshotText(s: DaySnapshot) {
  return `目標：${s.goal}
今日目標：${fmt(s.targets.kcal)} 大卡、蛋白質 ${s.targets.protein}g、碳水 ${s.targets.carbs}g、脂肪 ${s.targets.fat}g
目前已吃：${fmt(s.eaten.kcal)} 大卡、蛋白質 ${fmt(s.eaten.protein)}g、碳水 ${fmt(s.eaten.carbs)}g、脂肪 ${fmt(s.eaten.fat)}g、纖維 ${fmt(s.eaten.fiber)}g、鈉 ${fmt(s.eaten.sodium)}mg
今天的紀錄：
${s.meals.map((m) => `- ${m.time} ${m.name}（${fmt(m.kcal)} 大卡，蛋白質 ${fmt(m.protein)}g）`).join('\n') || '（還沒有）'}`;
}

export async function mealFeedback(cfg: LlmConfig, mealDesc: string, day: DaySnapshot): Promise<string> {
  const prompt = `${snapshotText(day)}

使用者剛剛記錄了：${mealDesc}
請用 2～3 句話給回饋：先肯定一件做得好的事，再根據今天剩下的額度給一個具體可行的下一餐建議（例如推薦台灣容易買到的食物）。不要用條列。`;
  return ask(cfg, prompt, { system: BUNNY_PERSONA, temperature: 0.7 });
}

export async function analyzePeriod(cfg: LlmConfig, report: string): Promise<string> {
  const prompt = `以下是使用者最近的飲食與體重資料摘要：
${report}

請以兔兔教練的身分做分析，格式：
1. 一句話總結
2. 做得好的地方（2～3 點）
3. 可以改進的地方（2～3 點，具體到食物或時間）
4. 接下來一週的小目標（1～2 個，可量化）
用條列，總長度 300 字以內。`;
  return ask(cfg, prompt, { system: BUNNY_PERSONA, temperature: 0.5 });
}

export async function chatWithBunny(
  cfg: LlmConfig,
  context: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  message: string,
): Promise<string> {
  const prompt = `（背景資料，不用複述）\n${context}\n\n使用者說：${message}`;
  return ask(cfg, prompt, {
    system: BUNNY_PERSONA,
    history: history.slice(-10),
    temperature: 0.7,
  });
}
