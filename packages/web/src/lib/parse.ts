/**
 * Zahl aus einer Schätz-Eingabe lesen – deutsch und englisch:
 * „1.500“ → 1500, „1.234,5“ → 1234.5, „3,5“ → 3.5, „3.5“ → 3.5, „0.125“ → 0.125.
 */
export function parseEstimate(raw: string): number {
  const v = raw.trim().replace(/\s+/g, '');
  if (!v) return Number.NaN;
  if (v.includes(',')) return Number(v.replace(/\./g, '').replace(',', '.'));
  const dots = (v.match(/\./g) ?? []).length;
  // Mehrere Punkte oder genau drei Ziffern nach einem Punkt (ohne führende 0) = Tausendertrenner
  if (dots > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(v)) return Number(v.replace(/\./g, ''));
  return Number(v);
}
