import { cleanNutrients } from './nutrition';
import type { LabelResult } from './ai';

/**
 * 離線讀營養標示：Tesseract OCR（第一次使用會下載中文辨識模型，約 10MB）。
 * 準確度不如 AI，讀完一定要讓使用者確認。
 */
export async function ocrLabel(image: Blob, onProgress?: (p: number) => void): Promise<{ text: string; result: LabelResult }> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['chi_tra', 'eng'], 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, result: parseLabelText(data.text) };
  } finally {
    await worker.terminate();
  }
}

function firstNumber(line: string): number | undefined {
  const m = line.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : undefined;
}

/** 從營養標示文字取出每份的數值（第一欄通常是每份） */
export function parseLabelText(raw: string): LabelResult {
  const text = raw.replace(/[ \t]+/g, ' ');
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const find = (re: RegExp, exclude?: RegExp) => {
    for (const l of lines) {
      if (re.test(l) && !(exclude && exclude.test(l))) {
        const after = l.replace(re, '§').split('§')[1] ?? '';
        const v = firstNumber(after);
        if (v !== undefined) return v;
      }
    }
    return undefined;
  };
  const servingM = text.match(/每一?份量?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(公克|克|g|毫升|ml)/i);
  const perPkgM = text.match(/本包裝含\s*[:：]?\s*(\d+(?:\.\d+)?)\s*份/);
  const n = cleanNutrients({
    kcal: find(/熱\s*量|energy|calories/i),
    protein: find(/蛋\s*白\s*質|protein/i),
    fat: find(/(?:^|[^和])脂\s*肪|^fat|total fat/i, /飽和|反式|saturated|trans/i),
    satFat: find(/飽\s*和\s*脂\s*肪|saturated/i),
    carbs: find(/碳\s*水\s*化\s*合\s*物|carbohydrate/i),
    sugar: find(/^糖|[^化]糖\s|sugars?/i),
    sodium: find(/鈉|sodium/i),
    fiber: find(/膳\s*食\s*纖\s*維|fiber|fibre/i),
  });
  const servingGrams = servingM ? parseFloat(servingM[1]) : undefined;
  return {
    name: '包裝食品',
    servingDesc: servingGrams ? `1份(${servingGrams}${/ml|毫升/i.test(servingM![2]) ? 'ml' : 'g'})` : '1份',
    servingGrams,
    servingsPerPackage: perPkgM ? parseFloat(perPkgM[1]) : undefined,
    n,
  };
}
