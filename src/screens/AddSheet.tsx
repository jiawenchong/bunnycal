import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BarcodeScanner from '../components/BarcodeScanner';
import Bunny from '../components/Bunny';
import NutrientFields from '../components/NutrientFields';
import { NumInput, Segmented, Sheet, Spinner, Stepper, toast } from '../components/ui';
import { BUILTIN_FOODS, CATEGORIES } from '../data/foods';
import { analyzeMealPhoto, mealFeedback, parseMealTextAI, readLabelAI, type AiMealResult } from '../lib/ai';
import { db } from '../lib/db';
import { atTime, defaultTimeFor, formatTime } from '../lib/dates';
import { thumbnail } from '../lib/image';
import { LlmError } from '../lib/llm';
import { EMPTY, fmt, scale, sumEntries } from '../lib/nutrition';
import { lookupBarcode, searchOff } from '../lib/off';
import { searchFoods } from '../lib/search';
import { getLlm, recentFoods, saveCustomFood, toggleFavorite, useLlm } from '../lib/store';
import { parseMealText } from '../lib/textparse';
import type { EntrySource, FoodItem, Nutrients } from '../lib/types';
import { GOAL_LABEL } from './Onboarding';

export type AddMode = 'menu' | 'photo' | 'text' | 'search' | 'barcode' | 'label' | 'quick';

interface Draft {
  key: string;
  name: string;
  serving: string;
  qty: number;
  grams?: number;
  n: Nutrients;
  source: EntrySource;
  foodId?: string;
  candidates?: FoodItem[];
}

let keySeq = 0;
const newKey = () => 'd' + ++keySeq;

function fromFood(f: FoodItem, source: EntrySource, qty = 1): Draft {
  return { key: newKey(), name: f.brand ? `${f.name}（${f.brand}）` : f.name, serving: f.serving, qty, grams: f.grams, n: f.n, source, foodId: f.id };
}

function fromAi(r: AiMealResult, source: EntrySource): Draft[] {
  return r.items.map((i) => ({ key: newKey(), name: i.name, serving: i.portion, qty: 1, grams: i.grams, n: i.n, source }));
}

function errMsg(e: any) {
  if (e instanceof LlmError) return e.hint ? `${e.message}\n${e.hint}` : e.message;
  return e?.message ?? String(e);
}

const TITLES: Record<AddMode, string> = {
  menu: '新增紀錄',
  photo: '📷 拍照辨識',
  text: '⌨️ 打字記錄',
  search: '🔎 搜尋食物',
  barcode: '▥ 掃條碼',
  label: '🏷️ 營養標示',
  quick: '⚡ 快速輸入',
};

export default function AddSheet({
  mode,
  setMode,
  date,
  onDone,
}: {
  mode: AddMode | null;
  setMode: (m: AddMode | null) => void;
  date: string;
  onDone: (date: string) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [time, setTime] = useState(() => formatTime(defaultTimeFor(date)));
  const [barcode, setBarcode] = useState<string | undefined>();
  const llm = useLlm();
  const aiOn = !!(llm?.enabled && llm.apiKey && llm.model);

  useEffect(() => {
    if (mode === 'menu') {
      setDrafts([]);
      setPhoto(undefined);
      setBarcode(undefined);
      setTime(formatTime(defaultTimeFor(date)));
    }
  }, [mode, date]);

  const addDrafts = useCallback((d: Draft[]) => setDrafts((x) => [...x, ...d]), []);
  const close = () => setMode(null);

  const commit = async () => {
    const valid = drafts.filter((d) => d.name.trim());
    if (!valid.length) return;
    const t = atTime(date, time);
    const ids: number[] = [];
    for (const [i, d] of valid.entries()) {
      ids.push(
        await db.entries.add({
          date,
          time: t + i,
          name: d.name.trim(),
          serving: d.serving || '1份',
          qty: d.qty,
          grams: d.grams,
          n: d.n,
          source: d.source,
          foodId: d.foodId,
          photo: i === 0 ? photo : undefined,
        }),
      );
    }
    const total = sumEntries(valid);
    toast(`已加入 ${valid.length} 項，共 ${fmt(total.kcal)} 大卡 ✓`);
    onDone(date);
    void requestFeedback(ids[0], date, valid.map((d) => `${d.name} ${d.qty !== 1 ? '×' + d.qty : ''}（${fmt(d.n.kcal * d.qty)} 大卡）`).join('、'));
  };

  const total = sumEntries(drafts);
  const showReview = mode !== 'menu' && drafts.length > 0;

  return (
    <Sheet
      open={!!mode}
      onClose={close}
      tall={mode !== 'menu'}
      title={
        mode && mode !== 'menu' ? (
          <span className="title-back">
            <button className="icon-btn" onClick={() => setMode('menu')} aria-label="返回">
              ‹
            </button>
            {TITLES[mode]}
          </span>
        ) : (
          TITLES.menu
        )
      }
      footer={
        showReview ? (
          <div className="foot-row">
            <label className="time-pick">
              <span>時間</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <button className="btn primary grow" onClick={commit}>
              加入 {drafts.length} 項 · {fmt(total.kcal)} 大卡
            </button>
          </div>
        ) : undefined
      }
    >
      {mode === 'menu' && <Menu setMode={setMode} aiOn={aiOn} />}
      {mode === 'photo' && <PhotoFlow aiOn={aiOn} onResult={addDrafts} setPhoto={setPhoto} hasDrafts={drafts.length > 0} />}
      {mode === 'text' && <TextFlow aiOn={aiOn} onResult={addDrafts} />}
      {mode === 'search' && <SearchFlow onPick={(f) => addDrafts([fromFood(f, 'db')])} />}
      {mode === 'barcode' && (
        <BarcodeFlow
          onFound={(f) => addDrafts([fromFood(f, 'barcode')])}
          onMissing={(code) => {
            setBarcode(code);
            setMode('label');
          }}
          hasDrafts={drafts.length > 0}
        />
      )}
      {mode === 'label' && <LabelFlow aiOn={aiOn} barcode={barcode} onResult={(f) => addDrafts([fromFood(f, 'label')])} hasDrafts={drafts.length > 0} />}
      {mode === 'quick' && <QuickFlow onResult={(d) => addDrafts([d])} />}
      {showReview && <Review drafts={drafts} setDrafts={setDrafts} />}
    </Sheet>
  );
}

/** 背景請兔兔評論這一餐 */
async function requestFeedback(entryId: number, date: string, desc: string) {
  const llm = await getLlm();
  if (!llm.enabled || !llm.autoFeedback || !llm.apiKey || !llm.model) return;
  try {
    const targets = (await db.kv.get('targets'))?.value;
    const profile = (await db.kv.get('profile'))?.value;
    const entries = await db.entries.where('date').equals(date).sortBy('time');
    const eaten = sumEntries(entries);
    const text = await mealFeedback(llm, desc, {
      targets,
      eaten,
      goal: GOAL_LABEL[profile?.goal as keyof typeof GOAL_LABEL] ?? '維持',
      meals: entries.map((e) => ({ time: formatTime(e.time), name: e.name, kcal: e.n.kcal * e.qty, protein: e.n.protein * e.qty })),
    });
    await db.entries.update(entryId, { coach: text });
  } catch {
    /* 回饋失敗不影響紀錄 */
  }
}

function Menu({ setMode, aiOn }: { setMode: (m: AddMode) => void; aiOn: boolean }) {
  const items: { m: AddMode; icon: string; title: string; desc: string; ai?: boolean }[] = [
    { m: 'photo', icon: '📷', title: '拍照辨識', desc: aiOn ? 'AI 辨識食物與份量' : '需要設定 AI（可先存照片）', ai: true },
    { m: 'text', icon: '⌨️', title: '打字記錄', desc: '「兩顆蛋一碗白飯」' },
    { m: 'search', icon: '🔎', title: '搜尋食物', desc: '台灣・馬來西亞・收藏・最近' },
    { m: 'barcode', icon: '▥', title: '掃條碼', desc: '包裝食品，全球資料庫' },
    { m: 'label', icon: '🏷️', title: '營養標示', desc: '拍包裝背面的營養標示' },
    { m: 'quick', icon: '⚡', title: '快速輸入', desc: '直接填熱量與營養素' },
  ];
  return (
    <div className="add-grid">
      {items.map((i) => (
        <button key={i.m} className="add-tile" onClick={() => setMode(i.m)}>
          <span className="add-icon">{i.icon}</span>
          <b>
            {i.title}
            {i.ai && aiOn && <em className="ai-badge">AI</em>}
          </b>
          <small>{i.desc}</small>
        </button>
      ))}
    </div>
  );
}

function PhotoPicker({ files, setFiles, max = 4 }: { files: File[]; setFiles: (f: File[]) => void; max?: number }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles([...files, ...Array.from(list)].slice(0, max));
  };
  return (
    <div className="photo-picker">
      {urls.map((u, i) => (
        <div key={u} className="photo-item">
          <img src={u} alt="" />
          <button className="photo-x" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="移除">
            ✕
          </button>
        </div>
      ))}
      {files.length < max && (
        <>
          <label className="photo-add">
            📷
            <small>拍照</small>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => addFiles(e.target.files)} />
          </label>
          <label className="photo-add">
            🖼️
            <small>相簿</small>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </label>
        </>
      )}
    </div>
  );
}

function PhotoFlow({
  aiOn,
  onResult,
  setPhoto,
  hasDrafts,
}: {
  aiOn: boolean;
  onResult: (d: Draft[]) => void;
  setPhoto: (b?: Blob) => void;
  hasDrafts: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (files[0]) thumbnail(files[0]).then(setPhoto).catch(() => setPhoto(files[0]));
    else setPhoto(undefined);
  }, [files, setPhoto]);

  const analyze = async () => {
    setBusy(true);
    setErr('');
    try {
      const llm = await getLlm();
      const r = await analyzeMealPhoto(llm, files, hint);
      if (!r.items.length) setErr('蹦蹦看不出照片裡有食物耶，換個角度再拍一次？');
      onResult(fromAi(r, 'ai-photo'));
      setNote(r.note ?? '');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const manual = () => onResult([{ key: newKey(), name: '', serving: '1份', qty: 1, n: { ...EMPTY }, source: 'ai-photo' }]);

  if (busy) return <Spinner label="蹦蹦正在看你的照片…（可能需要一點時間）" />;
  return (
    <div className="flow">
      {!hasDrafts && (
        <>
          <PhotoPicker files={files} setFiles={setFiles} />
          <input className="input" placeholder="補充說明（選填）：例如「飯只吃一半」「大杯微糖」" value={hint} onChange={(e) => setHint(e.target.value)} />
          {aiOn ? (
            <button className="btn primary big" disabled={!files.length} onClick={analyze}>
              🐰 請蹦蹦辨識
            </button>
          ) : (
            <div className="notice">
              <p>還沒設定 AI 連線，沒辦法自動辨識照片。可以先存照片，再手動填寫，或用「搜尋」找食物。</p>
              <button className="btn" disabled={!files.length} onClick={manual}>
                存照片並手動填寫
              </button>
            </div>
          )}
        </>
      )}
      {note && <div className="coach-note">🐰 {note}</div>}
      {err && <div className="error">{err}</div>}
    </div>
  );
}

function TextFlow({ aiOn, onResult }: { aiOn: boolean; onResult: (d: Draft[]) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const custom = useLiveQuery(() => db.foods.toArray(), [], []);

  const offline = () => {
    const parsed = parseMealText(text, [custom, BUILTIN_FOODS]);
    const drafts: Draft[] = parsed.map((p) =>
      p.food
        ? { ...fromFood(p.food, 'text', p.qty), candidates: p.candidates }
        : { key: newKey(), name: p.text, serving: '1份', qty: p.qty, n: { ...EMPTY }, source: 'text', candidates: [] },
    );
    const miss = parsed.filter((p) => !p.food).length;
    if (miss) setErr(`有 ${miss} 項在資料庫找不到，請手動填數值${aiOn ? '，或改用 AI 解析' : ''}。`);
    onResult(drafts);
    setText('');
  };

  const ai = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await parseMealTextAI(await getLlm(), text);
      onResult(fromAi(r, 'ai-text'));
      setText('');
    } catch (e) {
      setErr(errMsg(e) + '\n已改用離線解析。');
      offline();
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <Spinner label="蹦蹦正在理解你吃了什麼…" />;
  return (
    <div className="flow">
      <textarea
        className="input"
        rows={3}
        placeholder={'例如：\n鮪魚蛋餅、中杯無糖豆漿\n雞腿便當 加 半杯珍奶'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row2">
        {aiOn && (
          <button className="btn primary" disabled={!text.trim()} onClick={ai}>
            ✨ AI 解析
          </button>
        )}
        <button className={`btn ${aiOn ? '' : 'primary'}`} disabled={!text.trim()} onClick={offline}>
          {aiOn ? '離線解析' : '解析'}
        </button>
      </div>
      <p className="muted small">用頓號、逗號或「和」「加」分開不同食物；數量可以寫「兩顆」「200g」「半碗」。</p>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

type SearchTab = 'all' | 'fav' | 'mine' | 'browse';

function FoodRow({ f, onPick, fav }: { f: FoodItem; onPick: (f: FoodItem) => void; fav: boolean }) {
  return (
    <li className="food-row">
      <button className="food-main" onClick={() => onPick(f)}>
        <span className="food-name">
          {f.name}
          {f.brand && <small> · {f.brand}</small>}
        </span>
        <span className="food-sub">
          {f.serving} · {fmt(f.n.kcal)} 大卡 · 蛋白 {fmt(f.n.protein)}g
        </span>
      </button>
      <button className={`star ${fav ? 'on' : ''}`} onClick={() => toggleFavorite(f)} aria-label="收藏">
        {fav ? '★' : '☆'}
      </button>
      <button className="add-btn" onClick={() => onPick(f)} aria-label="加入">
        ＋
      </button>
    </li>
  );
}

function SearchFlow({ onPick }: { onPick: (f: FoodItem) => void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [online, setOnline] = useState<FoodItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const custom = useLiveQuery(() => db.foods.toArray(), [], []);
  const favs = useLiveQuery(() => db.favorites.orderBy('addedAt').reverse().toArray(), [], []);
  const recents = useLiveQuery(() => recentFoods(), [], []);
  const favIds = new Set(favs.map((f) => f.id));

  const results = useMemo(() => {
    if (q.trim()) return searchFoods(q, [custom, favs.map((f) => f.food), recents, BUILTIN_FOODS]);
    if (tab === 'fav') return favs.map((f) => f.food);
    if (tab === 'all') return recents;
    if (tab === 'mine') return custom;
    return BUILTIN_FOODS.filter((f) => f.category === cat);
  }, [q, tab, cat, custom, favs, recents]);

  const pick = (f: FoodItem) => {
    onPick(f);
    toast(`已加入「${f.name}」，可在下方調整份量`);
  };

  const searchOnline = async () => {
    setBusy(true);
    try {
      setOnline(await searchOff(q));
    } catch {
      toast('線上搜尋失敗，請確認網路', 'err');
    } finally {
      setBusy(false);
    }
  };

  if (creating) return <CustomFoodForm initialName={q} onDone={(f) => (setCreating(false), f && pick(f))} />;

  return (
    <div className="flow">
      <input className="input search" placeholder="搜尋：滷肉飯、nasi lemak、拿鐵…" value={q} onChange={(e) => (setQ(e.target.value), setOnline(null))} autoFocus />
      {!q.trim() && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: '最近' },
            { value: 'fav', label: '收藏' },
            { value: 'mine', label: '自訂' },
            { value: 'browse', label: '分類' },
          ]}
        />
      )}
      {!q.trim() && tab === 'browse' && (
        <div className="chips scroll">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${c === cat ? 'on' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <ul className="food-list">
        {results.map((f) => (
          <FoodRow key={f.id} f={f} onPick={pick} fav={favIds.has(f.id)} />
        ))}
      </ul>
      {!results.length && <p className="muted center small">{q ? '內建資料庫找不到' : tab === 'fav' ? '還沒有收藏，點 ☆ 就能收藏' : '還沒有資料'}</p>}
      {q.trim() && (
        <div className="search-more">
          {online === null ? (
            <button className="btn" onClick={searchOnline} disabled={busy}>
              {busy ? '搜尋中…' : '🌐 搜尋全球包裝食品（Open Food Facts）'}
            </button>
          ) : (
            <>
              <h4>線上結果</h4>
              <ul className="food-list">
                {online.map((f) => (
                  <FoodRow key={f.id} f={f} onPick={pick} fav={favIds.has(f.id)} />
                ))}
              </ul>
              {!online.length && <p className="muted small center">線上也找不到</p>}
            </>
          )}
        </div>
      )}
      <button className="btn ghost" onClick={() => setCreating(true)}>
        ＋ 建立自訂食物
      </button>
    </div>
  );
}

function CustomFoodForm({
  initialName = '',
  initial,
  barcode,
  onDone,
}: {
  initialName?: string;
  initial?: Partial<FoodItem>;
  barcode?: string;
  onDone: (f?: FoodItem) => void;
}) {
  const [name, setName] = useState(initial?.name ?? initialName);
  const [serving, setServing] = useState(initial?.serving ?? '1份');
  const [grams, setGrams] = useState<number | undefined>(initial?.grams);
  const [n, setN] = useState<Nutrients>(initial?.n ?? { ...EMPTY });
  const [save, setSave] = useState(true);
  const submit = async () => {
    if (!name.trim()) return toast('請填名稱', 'err');
    const base = { name: name.trim(), serving: serving || '1份', grams, n, barcode };
    const f = save ? await saveCustomFood(base) : ({ ...base, id: 'tmp:' + Date.now(), source: 'custom' } as FoodItem);
    if (save) toast('已存到「自訂」✓');
    onDone(f);
  };
  return (
    <div className="flow">
      {barcode && <p className="muted small">條碼：{barcode}</p>}
      <label className="field">
        <span>名稱</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：媽媽做的滷肉" />
      </label>
      <div className="row2">
        <label className="field">
          <span>一份是</span>
          <input className="input" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="1碗、1包(30g)" />
        </label>
        <label className="field">
          <span>一份重量（選填）</span>
          <NumInput value={grams} onChange={(v) => setGrams(v || undefined)} suffix="g" aria-label="重量" />
        </label>
      </div>
      <p className="muted small">以下填「一份」的數值：</p>
      <NutrientFields value={n} onChange={setN} />
      <label className="check">
        <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> 存到我的自訂食物{barcode ? '（下次掃條碼直接找到）' : ''}
      </label>
      <div className="row2">
        <button className="btn" onClick={() => onDone()}>
          取消
        </button>
        <button className="btn primary" onClick={submit}>
          加入
        </button>
      </div>
    </div>
  );
}

function BarcodeFlow({ onFound, onMissing, hasDrafts }: { onFound: (f: FoodItem) => void; onMissing: (code: string) => void; hasDrafts: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<'scan' | 'loading' | 'missing' | 'error'>('scan');
  const [scanKey, setScanKey] = useState(0);

  const onDetect = useCallback(
    async (c: string) => {
      setCode(c);
      setState('loading');
      const mine = await db.foods.where('barcode').equals(c).first();
      if (mine) {
        onFound(mine);
        setState('scan');
        return;
      }
      try {
        const f = await lookupBarcode(c);
        if (f) {
          onFound(f);
          setState('scan');
        } else setState('missing');
      } catch {
        setState('error');
      }
    },
    [onFound],
  );

  if (hasDrafts && state === 'scan')
    return (
      <div className="flow">
        <button className="btn" onClick={() => setScanKey((k) => k + 1)}>
          ▥ 再掃一個
        </button>
        {scanKey > 0 && <BarcodeScanner key={scanKey} onDetect={onDetect} />}
      </div>
    );
  if (state === 'loading') return <Spinner label={`查詢條碼 ${code}…`} />;
  if (state === 'missing' || state === 'error')
    return (
      <div className="flow center">
        <Bunny mood="worried" size={80} />
        <p>{state === 'missing' ? `資料庫裡沒有這個條碼（${code}）` : '查詢失敗，可能是網路問題'}</p>
        <button className="btn primary" onClick={() => onMissing(code!)}>
          🏷️ 拍營養標示建立這個商品
        </button>
        <button className="btn" onClick={() => setState('scan')}>
          重新掃描
        </button>
      </div>
    );
  return <BarcodeScanner onDetect={onDetect} />;
}

function LabelFlow({ aiOn, barcode, onResult, hasDrafts }: { aiOn: boolean; barcode?: string; onResult: (f: FoodItem) => void; hasDrafts: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<Partial<FoodItem> | null>(null);
  const [err, setErr] = useState('');
  const [ocrText, setOcrText] = useState('');

  const run = async (useAi: boolean) => {
    setErr('');
    try {
      if (useAi) {
        setBusy('蹦蹦正在讀營養標示…');
        const r = await readLabelAI(await getLlm(), files);
        setResult({ name: r.name, serving: r.servingDesc, grams: r.servingGrams, n: r.n });
      } else {
        setBusy('離線辨識中（第一次要下載中文模型，請稍候）…');
        const { ocrLabel } = await import('../lib/ocr');
        const { text, result: r } = await ocrLabel(files[0], (p) => setBusy(`離線辨識中… ${Math.round(p * 100)}%`));
        setOcrText(text);
        setResult({ name: r.name, serving: r.servingDesc, grams: r.servingGrams, n: r.n });
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  if (hasDrafts) return <p className="muted small">已加入，確認後按下方按鈕。</p>;
  if (busy) return <Spinner label={busy} />;
  if (result)
    return (
      <>
        <div className="notice small">請對照包裝確認數字，辨識可能有誤喔！</div>
        <CustomFoodForm initial={result} barcode={barcode} onDone={(f) => (f ? onResult(f) : setResult(null))} />
        {ocrText && (
          <details>
            <summary className="muted small">辨識到的原始文字</summary>
            <pre className="ocr-text">{ocrText}</pre>
          </details>
        )}
      </>
    );
  return (
    <div className="flow">
      {barcode && <p className="muted small">條碼 {barcode} 會一起存起來，下次掃描就找得到。</p>}
      <p className="muted small">拍營養標示（可以再加一張正面拍品名）：</p>
      <PhotoPicker files={files} setFiles={setFiles} max={3} />
      <div className="row2">
        {aiOn && (
          <button className="btn primary" disabled={!files.length} onClick={() => run(true)}>
            ✨ AI 讀取
          </button>
        )}
        <button className={`btn ${aiOn ? '' : 'primary'}`} disabled={!files.length} onClick={() => run(false)}>
          離線 OCR
        </button>
      </div>
      <button className="btn ghost" onClick={() => setResult({})}>
        直接手動輸入
      </button>
      {err && <div className="error">{err}</div>}
    </div>
  );
}

function QuickFlow({ onResult }: { onResult: (d: Draft) => void }) {
  const [name, setName] = useState('');
  const [n, setN] = useState<Nutrients>({ ...EMPTY });
  return (
    <div className="flow">
      <label className="field">
        <span>名稱（選填）</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="快速紀錄" />
      </label>
      <NutrientFields value={n} onChange={setN} compact />
      <button
        className="btn primary"
        disabled={!n.kcal}
        onClick={() => {
          onResult({ key: newKey(), name: name.trim() || '快速紀錄', serving: '1份', qty: 1, n, source: 'quick' });
          setName('');
          setN({ ...EMPTY });
        }}
      >
        加到清單
      </button>
    </div>
  );
}

function Review({ drafts, setDrafts }: { drafts: Draft[]; setDrafts: (d: Draft[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const update = (key: string, patch: Partial<Draft>) => setDrafts(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  return (
    <div className="review">
      <h4>確認內容（可修改）</h4>
      {drafts.map((d) => {
        const t = scale(d.n, d.qty);
        return (
          <div key={d.key} className="draft">
            <div className="draft-top">
              <input className="draft-name" value={d.name} placeholder="食物名稱" onChange={(e) => update(d.key, { name: e.target.value })} />
              <button className="icon-btn" onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))} aria-label="移除">
                ✕
              </button>
            </div>
            {d.candidates && d.candidates.length > 1 && (
              <select
                className="input small"
                value={d.foodId}
                onChange={(e) => {
                  const f = d.candidates!.find((c) => c.id === e.target.value)!;
                  update(d.key, { name: f.name, serving: f.serving, grams: f.grams, n: f.n, foodId: f.id });
                }}
              >
                {d.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.serving}，{fmt(c.n.kcal)} 大卡）
                  </option>
                ))}
              </select>
            )}
            <div className="draft-mid">
              <Stepper value={d.qty} onChange={(qty) => update(d.key, { qty })} step={0.25} />
              <span className="muted small">× {d.serving}</span>
              {d.grams ? (
                <span className="grams">
                  <NumInput value={Math.round(d.grams * d.qty)} onChange={(g) => g > 0 && update(d.key, { qty: Math.round((g / d.grams!) * 100) / 100 })} suffix="g" aria-label="克數" />
                </span>
              ) : null}
            </div>
            <div className="draft-bottom" onClick={() => setOpen(open === d.key ? null : d.key)}>
              <b>{fmt(t.kcal)} 大卡</b>
              <span>
                蛋白 {fmt(t.protein)} · 碳 {fmt(t.carbs)} · 脂 {fmt(t.fat)}
              </span>
              <span className="link-btn">{open === d.key ? '收起' : '修改數值'}</span>
            </div>
            {open === d.key && (
              <div className="draft-edit">
                <label className="field">
                  <span>份量描述</span>
                  <input className="input" value={d.serving} onChange={(e) => update(d.key, { serving: e.target.value })} />
                </label>
                <p className="muted small">每一份的營養素：</p>
                <NutrientFields value={d.n} onChange={(n) => update(d.key, { n })} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
