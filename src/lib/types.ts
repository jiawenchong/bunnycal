export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  /** 毫克 */
  sodium?: number;
  satFat?: number;
}

export type FoodSource = 'builtin' | 'custom' | 'off' | 'ai';

export interface FoodItem {
  id: string;
  name: string;
  aliases?: string[];
  category?: string;
  /** 份量描述，例如「1碗」「100g」 */
  serving: string;
  /** 一份的重量（g 或 ml），未知則省略 */
  grams?: number;
  /** 每一份的營養素 */
  n: Nutrients;
  source: FoodSource;
  barcode?: string;
  brand?: string;
}

export type EntrySource = 'db' | 'ai-photo' | 'ai-text' | 'text' | 'barcode' | 'label' | 'quick' | 'copy';

export interface LogEntry {
  id?: number;
  /** YYYY-MM-DD（本地時間） */
  date: string;
  /** epoch ms */
  time: number;
  name: string;
  serving: string;
  /** 份數 */
  qty: number;
  /** 一份的營養素（總量 = n × qty） */
  n: Nutrients;
  source: EntrySource;
  foodId?: string;
  grams?: number;
  photo?: Blob;
  note?: string;
  coach?: string;
}

export interface WeightEntry {
  date: string;
  kg: number;
  time: number;
}

export interface FastEntry {
  id?: number;
  start: number;
  end?: number;
  goalHours: number;
}

export interface ChatMessage {
  id?: number;
  time: number;
  role: 'user' | 'assistant';
  text: string;
}

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type MacroPreset = 'balanced' | 'highProtein' | 'lowCarb' | 'lowFat';

export interface Profile {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  /** 活動係數 */
  activity: number;
  goal: Goal;
  /** 每週體重變化目標（kg，正數） */
  rateKg: number;
  goalWeightKg?: number;
  macro: MacroPreset;
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugarMax: number;
  sodiumMax: number;
  /** 目前採用的每日消耗估計 */
  tdee: number;
  updatedAt: number;
}

export interface TdeeCheckin {
  date: string;
  formula: number;
  observed?: number;
  applied: number;
  avgIntake?: number;
  weightSlopeKgPerWeek?: number;
  loggedDays: number;
  note: string;
}

export type LlmMode = 'files' | 'openai' | 'gemini';

export interface LlmConfig {
  enabled: boolean;
  mode: LlmMode;
  endpoint: string;
  apiKey: string;
  model: string;
  /** 每次餐點紀錄後自動請兔兔評論 */
  autoFeedback: boolean;
}

export interface AppSettings {
  autoAdjust: boolean;
  lastCheckin?: string;
  fastGoalHours: number;
}
