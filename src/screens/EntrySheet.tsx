import { useEffect, useMemo, useState } from 'react';
import NutrientFields from '../components/NutrientFields';
import { Sheet, Stepper, toast } from '../components/ui';
import { db } from '../lib/db';
import { atTime, defaultTimeFor, formatTime, toDateKey } from '../lib/dates';
import { fmt, scale } from '../lib/nutrition';
import { saveCustomFood, toggleFavorite } from '../lib/store';
import type { LogEntry } from '../lib/types';

export default function EntrySheet({ entry, onClose }: { entry: LogEntry | null; onClose: () => void }) {
  const [e, setE] = useState<LogEntry | null>(entry);
  const [showAll, setShowAll] = useState(false);
  const photoUrl = useMemo(() => (entry?.photo ? URL.createObjectURL(entry.photo) : undefined), [entry]);
  useEffect(() => {
    setE(entry);
    setShowAll(false);
  }, [entry]);
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl]);
  if (!e) return null;
  const total = scale(e.n, e.qty);
  const favId = e.foodId ?? 'e:' + e.name + '|' + e.serving;

  const save = async () => {
    await db.entries.put(e);
    onClose();
  };
  const remove = async () => {
    if (!confirm(`刪除「${e.name}」？`)) return;
    await db.entries.delete(e.id!);
    onClose();
  };
  const copyToToday = async () => {
    const { id: _id, coach: _c, ...rest } = e;
    const today = toDateKey();
    await db.entries.add({ ...rest, date: today, time: defaultTimeFor(today), source: 'copy' });
    toast('已複製到今天 ✓');
    onClose();
  };
  const fav = async () => {
    await toggleFavorite({ id: favId, name: e.name, serving: e.serving, grams: e.grams, n: e.n, source: 'custom' });
    toast('已更新收藏 ⭐');
  };
  const saveFood = async () => {
    const f = await saveCustomFood({ name: e.name, serving: e.serving, grams: e.grams, n: e.n });
    await db.entries.update(e.id!, { foodId: f.id });
    toast('已存成自訂食物，搜尋就找得到 ✓');
  };

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title="編輯紀錄"
      footer={
        <div className="foot-row">
          <button className="btn danger-ghost" onClick={remove}>
            刪除
          </button>
          <button className="btn primary grow" onClick={save}>
            儲存
          </button>
        </div>
      }
    >
      {photoUrl && <img src={photoUrl} className="entry-photo" alt="" />}
      <label className="field">
        <span>名稱</span>
        <input value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
      </label>
      <div className="row2">
        <label className="field">
          <span>份數（每份 {e.serving}）</span>
          <Stepper value={e.qty} onChange={(qty) => setE({ ...e, qty })} step={0.25} />
        </label>
        <label className="field">
          <span>時間</span>
          <input type="time" value={formatTime(e.time)} onChange={(ev) => setE({ ...e, time: atTime(e.date, ev.target.value) })} />
        </label>
      </div>
      <div className="total-line">
        合計 <b>{fmt(total.kcal)}</b> 大卡 · 蛋白質 {fmt(total.protein)}g · 碳水 {fmt(total.carbs)}g · 脂肪 {fmt(total.fat)}g
      </div>
      <details open={showAll} onToggle={(ev) => setShowAll((ev.target as HTMLDetailsElement).open)}>
        <summary>每一份的營養素</summary>
        <NutrientFields value={e.n} onChange={(n) => setE({ ...e, n })} />
      </details>
      {e.coach && (
        <div className="coach-note">
          <b>🐰 蹦蹦說：</b>
          {e.coach}
        </div>
      )}
      <div className="chips wrap">
        <button className="chip" onClick={fav}>
          ⭐ 收藏
        </button>
        <button className="chip" onClick={saveFood}>
          💾 存成自訂食物
        </button>
        {e.date !== toDateKey() && (
          <button className="chip" onClick={copyToToday}>
            📋 複製到今天
          </button>
        )}
      </div>
    </Sheet>
  );
}
