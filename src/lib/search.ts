import { BUILTIN_FOODS } from '../data/foods';
import type { FoodItem } from './types';

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[\s()（）\-_.,，、]/g, '');
}

function score(food: FoodItem, q: string): number {
  const names = [food.name, ...(food.aliases ?? []), food.brand ?? ''].filter(Boolean).map(normalize);
  let best = 0;
  for (const [i, n] of names.entries()) {
    const penalty = i === 0 ? 0 : 5;
    if (n === q) best = Math.max(best, 100 - penalty);
    else if (n.startsWith(q)) best = Math.max(best, 80 - penalty - (n.length - q.length));
    else if (n.includes(q)) best = Math.max(best, 60 - penalty - (n.length - q.length));
    else if (q.includes(n) && n.length >= 2) best = Math.max(best, 45 - penalty + n.length);
    else if (!/[a-z]/.test(q)) {
      // 逐字比對（只用在中文）：查詢的字大部分都出現在名稱裡
      const chars = [...q];
      const hit = chars.filter((c) => n.includes(c)).length;
      if (chars.length >= 2 && hit / chars.length >= 0.75) best = Math.max(best, 20 + hit - penalty);
    }
  }
  return best;
}

export function searchFoods(query: string, pools: FoodItem[][], limit = 40): FoodItem[] {
  const q = normalize(query);
  if (!q) return [];
  const seen = new Set<string>();
  const scored: { f: FoodItem; s: number; order: number }[] = [];
  let order = 0;
  for (const pool of pools) {
    for (const f of pool) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const s = score(f, q);
      if (s > 0) scored.push({ f, s: s + (f.source === 'custom' ? 3 : 0), order: order++ });
    }
  }
  return scored
    .sort((a, b) => b.s - a.s || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.f);
}

export function bestMatch(name: string, pools: FoodItem[][]): FoodItem | undefined {
  return searchFoods(name, pools, 1)[0];
}

export const builtinPool = BUILTIN_FOODS;
