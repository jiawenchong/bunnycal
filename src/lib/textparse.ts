import { searchFoods } from './search';
import type { FoodItem } from './types';

/**
 * 不需要 LLM 的簡易文字解析：
 * 「兩顆蛋、一碗白飯、半杯豆漿 200g雞胸肉」→ 拆成項目，辨識數量，再到資料庫找最接近的食物。
 */
export interface ParsedItem {
  text: string;
  qty: number;
  grams?: number;
  food?: FoodItem;
  candidates: FoodItem[];
}

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 壹: 1, 兩: 2, 二: 2, 貳: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5,
};

const UNITS = '個|顆|粒|碗|杯|片|份|條|塊|盒|包|根|串|匙|湯匙|茶匙|盤|罐|瓶|支|隻|捲|球|把|貫|塊|顆|張|個半';

export function parseCnNumber(s: string): number | undefined {
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (s === '半') return 0.5;
  let total = 0;
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    total = (a ? CN_NUM[a] ?? 1 : 1) * 10 + (b ? CN_NUM[b] ?? 0 : 0);
    return total;
  }
  if (s.length === 1 && s in CN_NUM) return CN_NUM[s];
  return undefined;
}

export function splitMeal(text: string): string[] {
  return text
    .replace(/(早餐|午餐|晚餐|宵夜|點心|下午茶)(吃了|喝了|吃|喝)?[:：]?/g, '，')
    .replace(/(我)?(今天|剛剛|剛才)?(吃了|喝了|有吃|有喝)/g, '，')
    .split(/[，,、;；\n+＋]|和|跟|加上|還有|配|以及/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseSegment(seg: string): { name: string; qty: number; grams?: number } {
  let s = seg.trim();
  // 200g雞胸 / 雞胸200g / 雞胸 200 克
  const g = s.match(/(\d+(?:\.\d+)?)\s*(g|克|公克|ml|毫升|cc)/i);
  if (g) {
    const grams = parseFloat(g[1]);
    const name = s.replace(g[0], '').trim();
    return { name, qty: 1, grams };
  }
  const re = new RegExp(`^(\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十半壹貳]+)\\s*(?:${UNITS})?(半)?`);
  const m = s.match(re);
  let qty = 1;
  if (m) {
    const n = parseCnNumber(m[1]);
    if (n !== undefined) {
      qty = n + (m[2] ? 0.5 : 0);
      s = s.slice(m[0].length);
    }
  } else {
    // 雞蛋2顆 / 蛋 x2
    const tail = s.match(new RegExp(`(?:x|×|\\*)?\\s*(\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十半]+)\\s*(?:${UNITS})?$`));
    if (tail && tail.index && tail.index > 0) {
      const n = parseCnNumber(tail[1]);
      if (n !== undefined) {
        qty = n;
        s = s.slice(0, tail.index);
      }
    }
  }
  s = s.replace(/^(的|個|顆|碗|杯|片|份)/, '').replace(/(大杯|中杯|小杯)/, '').trim();
  return { name: s || seg, qty: qty || 1 };
}

export function parseMealText(text: string, pools: FoodItem[][]): ParsedItem[] {
  return splitMeal(text).map((seg) => {
    const { name, qty, grams } = parseSegment(seg);
    const candidates = searchFoods(name, pools, 6);
    const food = candidates[0];
    let q = qty;
    if (grams && food?.grams) q = grams / food.grams;
    return { text: seg, qty: Math.round(q * 100) / 100, grams, food, candidates };
  });
}
