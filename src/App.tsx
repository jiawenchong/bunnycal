import { useEffect, useState } from 'react';
import { ToastHost, toast } from './components/ui';
import { toDateKey } from './lib/dates';
import { runCheckin, useProfile, useTargets } from './lib/store';
import AddSheet, { type AddMode } from './screens/AddSheet';
import Coach from './screens/Coach';
import Fasting from './screens/Fasting';
import Onboarding from './screens/Onboarding';
import Settings from './screens/Settings';
import Today from './screens/Today';
import Trends from './screens/Trends';

export type Tab = 'today' | 'trends' | 'fasting' | 'coach';

const TABS: { id: Tab | 'add'; label: string; icon: string }[] = [
  { id: 'today', label: '今天', icon: '🍽️' },
  { id: 'trends', label: '趨勢', icon: '📈' },
  { id: 'add', label: '記錄', icon: '＋' },
  { id: 'fasting', label: '斷食', icon: '⏱️' },
  { id: 'coach', label: '兔兔', icon: '🐰' },
];

export default function App() {
  const profile = useProfile();
  const targets = useTargets();
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'today');
  const [date, setDate] = useState(toDateKey());
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    history.replaceState(null, '', '#' + tab);
    window.scrollTo(0, 0);
  }, [tab]);

  // 每週自動校正 TDEE
  useEffect(() => {
    if (!profile || !targets) return;
    runCheckin().then((est) => {
      if (est?.enoughData) toast(`蹦蹦幫你校正了每日目標：${Math.round(est.suggested)} 大卡消耗`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!profile, !!targets]);

  // 回到 App 時如果跨日了就跳到今天
  useEffect(() => {
    let last = toDateKey();
    const onVis = () => {
      const now = toDateKey();
      if (document.visibilityState === 'visible' && now !== last) {
        setDate(now);
        last = now;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (profile === null || targets === null) return <div className="boot" />;
  if (!profile || !targets) return <Onboarding />;

  const goToDate = (d: string) => {
    setDate(d);
    setTab('today');
  };

  return (
    <div className="app">
      <main className="main">
        {tab === 'today' && <Today date={date} setDate={setDate} onAdd={setAddMode} onSettings={() => setSettingsOpen(true)} />}
        {tab === 'trends' && <Trends onPickDate={goToDate} />}
        {tab === 'fasting' && <Fasting />}
        {tab === 'coach' && <Coach date={date} onSettings={() => setSettingsOpen(true)} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) =>
          t.id === 'add' ? (
            <button key="add" className="tab-add" onClick={() => setAddMode('menu')} aria-label="新增紀錄">
              <span>＋</span>
            </button>
          ) : (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id as Tab)}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ),
        )}
      </nav>
      <AddSheet
        mode={addMode}
        setMode={setAddMode}
        date={tab === 'today' ? date : toDateKey()}
        onDone={(d) => {
          setAddMode(null);
          setDate(d);
          setTab('today');
        }}
      />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastHost />
    </div>
  );
}
