import { blobToDataUrl, resizeImage } from './image';
import type { LlmConfig, LlmMode } from './types';

export const DEFAULT_ENDPOINT =
  'https://aiagent.domaintwin.kh.asegroup.com:4231/public/kits/openai/v1/chat/completions';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_ENDPOINTS: Record<LlmMode, string> = {
  files: DEFAULT_ENDPOINT,
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: GEMINI_BASE,
};

export const DEFAULT_LLM: LlmConfig = {
  enabled: false,
  mode: 'files',
  endpoint: DEFAULT_ENDPOINT,
  apiKey: '',
  model: '',
  autoFeedback: true,
};

export class LlmError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
  }
}

export function filesUrl(endpoint: string) {
  const i = endpoint.lastIndexOf('/chat/completions');
  return (i >= 0 ? endpoint.slice(0, i) : endpoint.replace(/\/$/, '')) + '/files';
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new LlmError('等太久了，伺服器沒有回應（逾時）', '圖片太多或太大時容易逾時，可以少拍幾張再試。');
    throw new LlmError(
      '連不到 LLM 伺服器',
      '請確認手機有網路。如果用的是公司平台：① 要連公司內網／VPN ② 自簽憑證要先用瀏覽器打開 API 網址並選擇信任 ③ 平台要開放跨網域（CORS）存取。',
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = Array.isArray(json) ? json[0]?.error : json?.error;
    const msg = err?.message || json?.message || json?.detail || text.slice(0, 200);
    if (res.status === 401 || res.status === 403 || /api key|auth key|credential/i.test(String(msg)))
      throw new LlmError(
        `驗證失敗（${res.status}）`,
        `${msg}\n請檢查 API key；公司平台的 key 要跟 agent id 成對，Google AI Studio 的 key 請用「Google Gemini」串接方式。`,
      );
    if (res.status === 404 && /model/i.test(String(msg)))
      throw new LlmError('找不到這個模型（404）', '請按「載入模型清單」從清單裡選。');
    if (res.status === 429) throw new LlmError('請求太頻繁或超過免費額度（429）', '等一兩分鐘再試，或明天額度重置後再用。');
    if (res.status === 504) throw new LlmError('伺服器逾時（504）', '圖片太多容易逾時，請減少張數。');
    throw new LlmError(`伺服器錯誤（${res.status}）`, String(msg ?? ''));
  }
  return json;
}

/** 第 1 步：上傳圖片取得 file_id（每次呼叫都重新上傳，不重複使用） */
export async function uploadImage(cfg: LlmConfig, image: Blob, filename = 'photo.jpg'): Promise<string> {
  const form = new FormData();
  form.append('purpose', 'vision');
  form.append('file', image, filename);
  const res = await request(
    filesUrl(cfg.endpoint),
    { method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}` }, body: form },
    60000,
  );
  const id = res?.id || res?.file_id || res?.data?.id;
  if (!id) throw new LlmError('上傳圖片後沒有拿到 file_id', JSON.stringify(res).slice(0, 200));
  return id;
}

export interface AskOptions {
  images?: Blob[];
  system?: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  temperature?: number;
}

function messageText(msg: any): string {
  let c = msg?.choices?.[0]?.message?.content;
  if (Array.isArray(c)) c = c.map((x: any) => (typeof x === 'string' ? x : x?.text ?? '')).join('');
  if (typeof c !== 'string') throw new LlmError('LLM 回傳格式看不懂', JSON.stringify(msg).slice(0, 200));
  return c.trim();
}

export async function ask(cfg: LlmConfig, prompt: string, opts: AskOptions = {}): Promise<string> {
  if (!cfg.apiKey || !cfg.model) throw new LlmError('還沒設定 LLM', '請到「設定 → AI 連線」填入 API key 與模型。');
  const images = (opts.images ?? []).slice(0, 20);
  const prepared = await Promise.all(images.map((b) => resizeImage(b, 1600)));
  if (cfg.mode === 'gemini') return askGemini(cfg, prompt, prepared, opts);

  const content: any[] = [{ type: 'text', text: prompt }];
  if (cfg.mode === 'files') {
    for (const [i, img] of prepared.entries()) {
      const fileId = await uploadImage(cfg, img, `photo-${i + 1}.jpg`);
      content.push({ type: 'file', file: { file_id: fileId } });
    }
  } else {
    for (const img of prepared) {
      content.push({ type: 'image_url', image_url: { url: await blobToDataUrl(img) } });
    }
  }

  const messages: any[] = [];
  // 平台不一定支援 system role，所以把人設放在第一則 user 訊息裡
  const history = opts.history ?? [];
  if (opts.system) {
    if (history.length) {
      messages.push({ role: 'user', content: opts.system });
      messages.push({ role: 'assistant', content: '好的！' });
    } else {
      content[0].text = `${opts.system}\n\n${prompt}`;
    }
  }
  for (const h of history) messages.push({ role: h.role, content: h.text });
  messages.push({ role: 'user', content: images.length ? content : content[0].text });

  const res = await request(
    cfg.endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, temperature: opts.temperature ?? 0 }),
    },
    420000,
  );
  return messageText(res);
}

/** 從 LLM 回覆中取出 JSON（容忍 ```json 區塊與前後說明文字） */
export function extractJson<T = any>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const starts = [body.indexOf('{'), body.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new LlmError('LLM 沒有回傳 JSON', text.slice(0, 200));
  const start = Math.min(...starts);
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  const end = body.lastIndexOf(close);
  const slice = body.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // 常見問題：尾逗號
    try {
      return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      throw new LlmError('LLM 回傳的 JSON 格式有誤', slice.slice(0, 200));
    }
  }
}

export async function testConnection(cfg: LlmConfig, withImage: boolean): Promise<string> {
  if (!withImage) return ask(cfg, '請只回覆「蹦蹦連線成功」這幾個字。');
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffe3ec';
  ctx.fillRect(0, 0, 200, 120);
  ctx.fillStyle = '#d6336c';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('A7', 50, 78);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return ask(cfg, '圖片中央寫的是什麼字？只回答那兩個字元。', { images: [blob] });
}

/* ---------- Google Gemini 原生 API（AI Studio 的 AQ. 開頭 key 只能走這條） ---------- */

function geminiBase(endpoint: string) {
  return (endpoint || GEMINI_BASE)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/openai(\/chat\/completions)?$/, '')
    .replace(/\/models(\/.*)?$/, '');
}

export function geminiUrl(endpoint: string, model: string) {
  return `${geminiBase(endpoint)}/models/${encodeURIComponent(model.trim().replace(/^models\//, ''))}:generateContent`;
}

export function buildGeminiBody(prompt: string, images: { mime: string; data: string }[], opts: AskOptions = {}) {
  const contents: any[] = (opts.history ?? []).map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.text }],
  }));
  contents.push({
    role: 'user',
    parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))],
  });
  const body: any = { contents, generationConfig: { temperature: opts.temperature ?? 0 } };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  return body;
}

export function geminiText(res: any): string {
  const cand = res?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === 'string' && !p.thought)
    .map((p: any) => p.text)
    .join('')
    .trim();
  if (text) return text;
  const blocked = res?.promptFeedback?.blockReason || (cand?.finishReason === 'SAFETY' && 'SAFETY');
  if (blocked) throw new LlmError('內容被 Gemini 的安全機制擋下', String(blocked));
  throw new LlmError('Gemini 沒有回傳內容', JSON.stringify(res).slice(0, 200));
}

async function askGemini(cfg: LlmConfig, prompt: string, images: Blob[], opts: AskOptions): Promise<string> {
  const parts = await Promise.all(
    images.map(async (b) => {
      const url = await blobToDataUrl(b);
      return { mime: b.type || 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
    }),
  );
  const res = await request(
    geminiUrl(cfg.endpoint, cfg.model),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(buildGeminiBody(prompt, parts, opts)),
    },
    420000,
  );
  return geminiText(res);
}

/** 列出可用的模型（讓使用者用選的，不用自己打名稱） */
export async function listModels(cfg: LlmConfig): Promise<{ id: string; label: string }[]> {
  if (!cfg.apiKey) throw new LlmError('請先填 API key');
  if (cfg.mode === 'gemini') {
    const res = await request(
      `${geminiBase(cfg.endpoint)}/models?pageSize=1000`,
      { method: 'GET', headers: { 'x-goog-api-key': cfg.apiKey } },
      30000,
    );
    return (res?.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName ?? m.name }))
      .filter((m: any) => /gemini/i.test(m.id) && !/embedding|tts|image-generation|native-audio|live/i.test(m.id))
      .sort((a: any, b: any) => Number(/flash/.test(b.id)) - Number(/flash/.test(a.id)) || b.id.localeCompare(a.id));
  }
  const base = cfg.endpoint.replace(/\/chat\/completions\/?$/, '');
  const res = await request(`${base}/models`, { method: 'GET', headers: { Authorization: `Bearer ${cfg.apiKey}` } }, 30000);
  return (res?.data ?? res?.models ?? []).map((m: any) => ({ id: m.id ?? m.name, label: m.id ?? m.name }));
}
