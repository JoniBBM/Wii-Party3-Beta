/** Tolerante Auswertung von Freitext-Antworten. */

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Editierdistanz (Damerau / optimal string alignment): Buchstabendreher zählen als 1. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** Erlaubte Tippfehler abhängig von der Länge der richtigen Antwort. */
function tolerance(len: number): number {
  if (len >= 10) return 2;
  if (len >= 5) return 1;
  return 0;
}

export function isTextAnswerCorrect(given: string, accepted: readonly string[]): boolean {
  const g = normalizeAnswer(given);
  if (!g) return false;
  return accepted.some((a) => {
    const n = normalizeAnswer(a);
    if (!n) return false;
    if (n === g) return true;
    // "der Rhein" vs "Rhein": Artikel ignorieren
    const strip = (x: string) => x.replace(/^(der|die|das|the|ein|eine) /, '');
    if (strip(n) === strip(g)) return true;
    return editDistance(strip(n), strip(g)) <= tolerance(strip(n).length);
  });
}
