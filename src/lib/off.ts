import type { FoodItem, Nutrients } from './types';

/** Open Food Facts：全球開放的包裝食品資料庫，支援條碼查詢，免金鑰 */
const FIELDS =
  'code,product_name,product_name_zh,product_name_en,brands,serving_size,serving_quantity,nutriments,quantity';

function pick(nm: any, key: string, suffix: '_100g' | '_serving'): number | undefined {
  const v = nm?.[key + suffix];
  return typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) || undefined : undefined;
}

function nutrientsFrom(nm: any, suffix: '_100g' | '_serving'): Nutrients | undefined {
  let kcal = pick(nm, 'energy-kcal', suffix);
  if (kcal === undefined) {
    const kj = pick(nm, 'energy', suffix);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined) return undefined;
  const sodiumG = pick(nm, 'sodium', suffix) ?? (pick(nm, 'salt', suffix) ?? 0) / 2.5;
  return {
    kcal,
    protein: pick(nm, 'proteins', suffix) ?? 0,
    carbs: pick(nm, 'carbohydrates', suffix) ?? 0,
    fat: pick(nm, 'fat', suffix) ?? 0,
    fiber: pick(nm, 'fiber', suffix) ?? 0,
    sugar: pick(nm, 'sugars', suffix) ?? 0,
    sodium: (sodiumG ?? 0) * 1000,
    satFat: pick(nm, 'saturated-fat', suffix) ?? 0,
  };
}

export function offToFood(p: any): FoodItem | undefined {
  const name = p.product_name_zh || p.product_name || p.product_name_en;
  if (!name) return undefined;
  const nm = p.nutriments ?? {};
  const perServing = nutrientsFrom(nm, '_serving');
  const per100 = nutrientsFrom(nm, '_100g');
  const servingQty = typeof p.serving_quantity === 'number' ? p.serving_quantity : parseFloat(p.serving_quantity);
  if (perServing && Number.isFinite(servingQty) && servingQty > 0) {
    return {
      id: 'off:' + p.code,
      name,
      brand: p.brands,
      serving: `1份(${p.serving_size || servingQty + 'g'})`,
      grams: servingQty,
      n: perServing,
      source: 'off',
      barcode: p.code,
    };
  }
  if (per100) {
    return {
      id: 'off:' + p.code,
      name,
      brand: p.brands,
      serving: '100g',
      grams: 100,
      n: per100,
      source: 'off',
      barcode: p.code,
    };
  }
  return undefined;
}

async function getJson(url: string, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const j = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (j?.status !== 1 || !j.product) return null;
  return offToFood({ ...j.product, code }) ?? null;
}

export async function searchOff(q: string): Promise<FoodItem[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`;
  const j = await getJson(url, 20000);
  return (j?.products ?? []).map(offToFood).filter(Boolean) as FoodItem[];
}
