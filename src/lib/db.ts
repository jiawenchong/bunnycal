import Dexie, { type Table } from 'dexie';
import type { ChatMessage, FastEntry, FoodItem, LogEntry, TdeeCheckin, WeightEntry } from './types';

export interface KV {
  key: string;
  value: any;
}

export interface Favorite {
  id: string;
  food: FoodItem;
  addedAt: number;
}

class BunnyDB extends Dexie {
  entries!: Table<LogEntry, number>;
  weights!: Table<WeightEntry, string>;
  fasts!: Table<FastEntry, number>;
  foods!: Table<FoodItem, string>;
  favorites!: Table<Favorite, string>;
  chat!: Table<ChatMessage, number>;
  checkins!: Table<TdeeCheckin, string>;
  kv!: Table<KV, string>;

  constructor() {
    super('bunnycal');
    this.version(1).stores({
      entries: '++id, date, time, foodId',
      weights: 'date',
      fasts: '++id, start, end',
      foods: 'id, name, barcode',
      favorites: 'id, addedAt',
      chat: '++id, time',
      checkins: 'date',
      kv: 'key',
    });
  }
}

export const db = new BunnyDB();

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKV<T>(key: string, value: T) {
  await db.kv.put({ key, value });
}
