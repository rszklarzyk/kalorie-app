import type { Draft, NewEntry, Per100g, Totals } from '@/lib/types';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function forPortion(per100g: Per100g, grams: number): Per100g {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein: round1(per100g.protein * f),
    fat: round1(per100g.fat * f),
    carbs: round1(per100g.carbs * f),
  };
}

export function draftToEntry(draft: Draft, date: string): NewEntry {
  return { date, name: draft.name, grams: draft.grams, source: draft.source, ...forPortion(draft.per100g, draft.grams) };
}

export function sumTotals(items: Per100g[]): Totals {
  const t = items.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      fat: acc.fat + e.fat,
      carbs: acc.carbs + e.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), fat: round1(t.fat), carbs: round1(t.carbs) };
}

/** Lokalna data w formacie YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

/** Parsuje liczbę wpisaną z polską lub angielską kropką dziesiętną. */
export function parseNumber(text: string): number {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
