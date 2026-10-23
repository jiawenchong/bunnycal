import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${tall ? 'sheet-tall' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="關閉">
              ✕
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Ring({
  value,
  max,
  size = 160,
  stroke = 14,
  color = 'var(--accent)',
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? 'var(--danger)' : color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .5s ease' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, color, label, unit = 'g' }: { value: number; max: number; color: string; label: string; unit?: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div className="macro">
      <div className="macro-top">
        <span className="macro-label">
          <i style={{ background: color }} />
          {label}
        </span>
        <span className="macro-val">
          <b>{Math.round(value)}</b>
          <small>
            /{Math.round(max)}
            {unit}
          </small>
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: pct + '%', background: value > max * 1.05 ? 'var(--danger)' : color }} />
      </div>
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
  className = '',
  ...rest
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(value === undefined || Number.isNaN(value) ? '' : String(round2(value)));
  useEffect(() => {
    const cur = parseFloat(text);
    if (value !== undefined && Math.abs((cur || 0) - value) > 0.001) setText(String(round2(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={`num-input ${className}`}>
      <input
        inputMode="decimal"
        type="text"
        value={text}
        aria-label={rest['aria-label']}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setText(t);
          const v = parseFloat(t);
          onChange(Number.isFinite(v) ? Math.max(min, v) : 0);
        }}
        step={step}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function Stepper({ value, onChange, step = 0.5, min = 0.25 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, round2(value - step)))} aria-label="減少">
        −
      </button>
      <NumInput value={value} onChange={(v) => onChange(v || min)} aria-label="份數" />
      <button type="button" onClick={() => onChange(round2(value + step))} aria-label="增加">
        +
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}

/* ---------- toast ---------- */
type ToastMsg = { id: number; text: string; kind?: 'ok' | 'err' };
let pushToast: (t: ToastMsg) => void = () => {};
export function toast(text: string, kind: 'ok' | 'err' = 'ok') {
  pushToast({ id: Date.now() + Math.random(), text, kind });
}
export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    // 一次只顯示一則，新的取代舊的
    pushToast = (t) => {
      setItems([t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.kind === 'err' ? 5000 : 2200);
    };
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'toast-err' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
