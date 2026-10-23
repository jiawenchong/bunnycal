import { formatMD } from '../lib/dates';

interface Pt {
  date: string;
  kg?: number;
  trend: number;
}

/** 體重：點 = 實際測量，線 = 趨勢 */
export function WeightChart({ points, goal, height = 200 }: { points: Pt[]; goal?: number; height?: number }) {
  if (points.length < 1) return <div className="chart-empty">記錄兩次以上體重就會出現趨勢圖</div>;
  const W = 340;
  const H = height;
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const vals = points.flatMap((p) => (p.kg !== undefined ? [p.kg, p.trend] : [p.trend]));
  if (goal) vals.push(goal);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  lo = Math.floor(lo - 0.3);
  hi = Math.ceil(hi + 0.3);
  const n = points.length;
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = niceTicks(lo, hi, 4);
  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`).join('');
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="體重趨勢圖">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {goal && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} className="goal-line" />
          <text x={W - pad.r} y={y(goal) - 4} className="axis goal-text" textAnchor="end">
            目標 {goal}
          </text>
        </g>
      )}
      <path d={trendPath} className="trend-line" />
      {points.map((p, i) =>
        p.kg !== undefined ? <circle key={p.date} cx={x(i)} cy={y(p.kg)} r={n > 60 ? 2 : 3.2} className="weight-dot" /> : null,
      )}
      {labelIdx.map((i) => (
        <text key={i} x={x(i)} y={H - 6} className="axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
          {formatMD(points[i].date)}
        </text>
      ))}
    </svg>
  );
}

/** 每日熱量長條 + 目標線 */
export function KcalBars({ days, target, height = 180, onPick }: { days: { date: string; kcal: number }[]; target: number; height?: number; onPick?: (d: string) => void }) {
  if (!days.length) return <div className="chart-empty" style={{ height }} />;
  const W = 340;
  const H = height;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const hi = Math.max(target * 1.3, ...days.map((d) => d.kcal), 500);
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const ticks = niceTicks(0, hi, 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="每日熱量">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const over = d.kcal > target * 1.1;
        const h = Math.max(0, H - pad.b - y(d.kcal));
        return (
          <g key={d.date} onClick={() => onPick?.(d.date)} style={{ cursor: onPick ? 'pointer' : undefined }}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
            <rect
              x={pad.l + i * bw + bw * 0.18}
              y={y(d.kcal)}
              width={bw * 0.64}
              height={h}
              rx={Math.min(4, bw * 0.3)}
              className={d.kcal === 0 ? 'bar-empty' : over ? 'bar-over' : 'bar-ok'}
            />
          </g>
        );
      })}
      <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} className="goal-line" />
      {[0, days.length - 1].map((i) => (
        <text key={i} x={pad.l + i * bw + bw / 2} y={H - 6} className="axis" textAnchor={i === 0 ? 'start' : 'end'}>
          {days[i] && formatMD(days[i].date)}
        </text>
      ))}
    </svg>
  );
}

function niceTicks(lo: number, hi: number, count: number) {
  const span = hi - lo;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
