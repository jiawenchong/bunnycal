export const FAST_PRESETS = [
  { hours: 12, label: '12:12', desc: '入門' },
  { hours: 14, label: '14:10', desc: '輕鬆' },
  { hours: 16, label: '16:8', desc: '最常見' },
  { hours: 18, label: '18:6', desc: '進階' },
  { hours: 20, label: '20:4', desc: '挑戰' },
  { hours: 23, label: '23:1', desc: '一日一餐' },
];

export function fastStage(hours: number): { title: string; desc: string } {
  if (hours < 4) return { title: '消化中', desc: '身體正在消化上一餐，血糖慢慢回穩。' };
  if (hours < 12) return { title: '血糖下降', desc: '胰島素下降，身體開始使用儲存的肝醣。' };
  if (hours < 16) return { title: '轉換燃料', desc: '肝醣逐漸用完，開始提高脂肪的使用比例。' };
  if (hours < 24) return { title: '燃脂模式', desc: '脂肪成為主要能量來源，記得補充水分與電解質。' };
  return { title: '長時間斷食', desc: '超過 24 小時請留意身體狀況，有不適請立即進食。' };
}
