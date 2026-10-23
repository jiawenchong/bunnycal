import { useLiveQuery } from 'dexie-react-hooks';
import { db, getKV, setKV } from './db';
import { addDays, daysBetween, toDateKey } from './dates';
import { blobToDataUrl, dataUrlToBlob } from './image';
import { DEFAULT_LLM } from './llm';
import { buildTargets, formulaTdee, scale } from './nutrition';
import { estimateTdee } from './tdee';
import type { AppSettings, FoodItem, LlmConfig, LogEntry, Profile, Targets } from './types';

export const DEFAULT_SETTINGS: AppSettings = { autoAdjust: true, fastGoalHours: 16 };

export function useKV<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(async () => (await db.kv.get(key))?.value ?? fallback, [key]);
}

export const useProfile = () => useLiveQuery(async () => (await db.kv.get('profile'))?.value as Profile | undefined, [], null);
export const useTargets = () => useLiveQuery(async () => (await db.kv.get('targets'))?.value as Targets | undefined, [], null);
export const useLlm = () => useKV<LlmConfig>('llm', DEFAULT_LLM);
export const useSettings = () => useKV<AppSettings>('settings', DEFAULT_SETTINGS);

export async function getLlm(): Promise<LlmConfig> {
  return { ...DEFAULT_LLM, ...(await getKV<Partial<LlmConfig>>('llm', {})) };
}

export async function getSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...(await getKV<Partial<AppSettings>>('settings', {})) };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  await setKV('settings', { ...(await getSettings()), ...patch });
}

export async function latestWeight(): Promise<number | undefined> {
  const w = await db.weights.orderBy('date').last();
  return w?.kg;
}

/** 儲存個人資料並重新計算目標（用公式 TDEE） */
export async function saveProfile(p: Profile, resetTdee = true) {
  await setKV('profile', p);
  const current = await getKV<Targets | undefined>('targets', undefined);
  const w = (await latestWeight()) ?? p.weightKg;
  const tdee = resetTdee || !current ? formulaTdee(p, w) : current.tdee;
  await setKV('targets', buildTargets(p, tdee, w));
}

export async function saveTargets(t: Targets) {
  await setKV('targets', { ...t, updatedAt: Date.now() });
}

export async function addEntry(e: Omit<LogEntry, 'id'>) {
  return db.entries.add(e as LogEntry);
}

export async function dayIntakeMap(from: string, to: string): Promise<Map<string, number>> {
  const rows = await db.entries.where('date').between(from, to, true, true).toArray();
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.n.kcal * r.qty);
  return m;
}

export async function currentStreak(today = toDateKey()): Promise<number> {
  const dates = new Set((await db.entries.where('date').between(addDays(today, -400), today, true, true).keys()) as string[]);
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export async function toggleFavorite(food: FoodItem) {
  const exists = await db.favorites.get(food.id);
  if (exists) await db.favorites.delete(food.id);
  else await db.favorites.put({ id: food.id, food, addedAt: Date.now() });
}

export async function saveCustomFood(f: Omit<FoodItem, 'id' | 'source'> & { id?: string }) {
  const food: FoodItem = { ...f, id: f.id ?? 'c:' + Date.now().toString(36), source: 'custom' };
  await db.foods.put(food);
  return food;
}

/** 由最近的紀錄整理出「最近吃過」 */
export async function recentFoods(limit = 30): Promise<FoodItem[]> {
  const rows = await db.entries.orderBy('time').reverse().limit(300).toArray();
  const seen = new Set<string>();
  const out: FoodItem[] = [];
  for (const r of rows) {
    const key = r.foodId ?? r.name + '|' + r.serving;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.foodId ?? 'r:' + key,
      name: r.name,
      serving: r.serving,
      grams: r.grams,
      n: r.n,
      source: 'custom',
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** 每週校正：資料足夠時根據實際攝取和體重變化更新 TDEE */
export async function runCheckin(force = false) {
  const profile = await getKV<Profile | undefined>('profile', undefined);
  const targets = await getKV<Targets | undefined>('targets', undefined);
  if (!profile || !targets) return null;
  const settings = await getSettings();
  const today = toDateKey();
  if (!force && settings.lastCheckin && daysBetween(settings.lastCheckin, today) < 7) return null;

  const intake = await dayIntakeMap(addDays(today, -21), addDays(today, -1));
  const weights = await db.weights.toArray();
  const est = estimateTdee({ profile, intake, weights, today: addDays(today, -1), previous: targets.tdee });
  const w = (await latestWeight()) ?? profile.weightKg;
  const apply = settings.autoAdjust || force;
  const applied = apply ? est.suggested : targets.tdee;
  if (apply) await setKV('targets', buildTargets(profile, applied, w));
  await db.checkins.put({
    date: today,
    formula: est.formula,
    observed: est.observed,
    applied,
    avgIntake: est.avgIntake,
    weightSlopeKgPerWeek: est.slopeKgPerWeek,
    loggedDays: est.loggedDays,
    note: est.note,
  });
  await saveSettings({ lastCheckin: today });
  return est;
}

export function entryTotal(e: LogEntry) {
  return scale(e.n, e.qty);
}

/* ---------- 備份 ---------- */

export async function exportAll(): Promise<string> {
  const entries = await Promise.all(
    (await db.entries.toArray()).map(async (e) => ({ ...e, photo: e.photo ? await blobToDataUrl(e.photo) : undefined })),
  );
  const data = {
    app: 'bunnycal',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    weights: await db.weights.toArray(),
    fasts: await db.fasts.toArray(),
    foods: await db.foods.toArray(),
    favorites: await db.favorites.toArray(),
    checkins: await db.checkins.toArray(),
    chat: await db.chat.toArray(),
    // API key 不匯出
    kv: (await db.kv.toArray()).map((r) => (r.key === 'llm' ? { ...r, value: { ...r.value, apiKey: '' } } : r)),
  };
  return JSON.stringify(data);
}

export async function importAll(json: string) {
  const data = JSON.parse(json);
  if (data?.app !== 'bunnycal') throw new Error('這不是兔兔卡路里的備份檔');
  const entries = await Promise.all(
    (data.entries ?? []).map(async (e: any) => ({ ...e, photo: e.photo ? await dataUrlToBlob(e.photo) : undefined })),
  );
  const keepLlm = await db.kv.get('llm');
  await db.transaction('rw', [db.entries, db.weights, db.fasts, db.foods, db.favorites, db.checkins, db.chat, db.kv], async () => {
    await Promise.all([db.entries.clear(), db.weights.clear(), db.fasts.clear(), db.foods.clear(), db.favorites.clear(), db.checkins.clear(), db.chat.clear(), db.kv.clear()]);
    await db.entries.bulkAdd(entries);
    await db.weights.bulkPut(data.weights ?? []);
    await db.fasts.bulkAdd(data.fasts ?? []);
    await db.foods.bulkPut(data.foods ?? []);
    await db.favorites.bulkPut(data.favorites ?? []);
    await db.checkins.bulkPut(data.checkins ?? []);
    await db.chat.bulkAdd(data.chat ?? []);
    await db.kv.bulkPut(data.kv ?? []);
    if (keepLlm?.value?.apiKey) {
      const llm = (data.kv ?? []).find((r: any) => r.key === 'llm')?.value ?? {};
      await db.kv.put({ key: 'llm', value: { ...keepLlm.value, ...llm, apiKey: keepLlm.value.apiKey } });
    }
  });
}

export async function wipeAll() {
  await db.delete();
  location.reload();
}
