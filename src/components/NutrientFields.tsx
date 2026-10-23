import { NumInput } from './ui';
import type { Nutrients } from '../lib/types';

const FIELDS: { k: keyof Nutrients; label: string; unit: string }[] = [
  { k: 'kcal', label: '熱量', unit: '大卡' },
  { k: 'protein', label: '蛋白質', unit: 'g' },
  { k: 'carbs', label: '碳水', unit: 'g' },
  { k: 'fat', label: '脂肪', unit: 'g' },
  { k: 'fiber', label: '纖維', unit: 'g' },
  { k: 'sugar', label: '糖', unit: 'g' },
  { k: 'sodium', label: '鈉', unit: 'mg' },
  { k: 'satFat', label: '飽和脂肪', unit: 'g' },
];

export default function NutrientFields({ value, onChange, compact }: { value: Nutrients; onChange: (n: Nutrients) => void; compact?: boolean }) {
  const fields = compact ? FIELDS.slice(0, 4) : FIELDS;
  return (
    <div className="nutrient-grid">
      {fields.map((f) => (
        <label key={f.k} className="field mini">
          <span>{f.label}</span>
          <NumInput value={value[f.k] ?? 0} onChange={(v) => onChange({ ...value, [f.k]: v })} suffix={f.unit} aria-label={f.label} />
        </label>
      ))}
    </div>
  );
}
