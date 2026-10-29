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

type Meal = { id: number; name: string } | null;

export function draftToEntry(draft: Draft, date: string, meal: Meal = null): NewEntry {
  return {
    date,
    name: draft.name,
    grams: draft.grams,
    source: draft.source,
    mealId: meal?.id ?? null,
    mealName: meal?.name ?? null,
    ...forPortion(draft.per100g, draft.grams),
  };
}

/** Domyślna nazwa posiłku według pory dnia. */
export function mealNameFor(date: Date): string {
  const h = date.getHours();
  if (h < 11) return 'Śniadanie';
  if (h < 16) return 'Obiad';
  if (h < 21) return 'Kolacja';
  return 'Przekąska';
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

/** Wyciąga gramaturę z wpisu typu „mrożona pizza 300 g” → { text: 'mrożona pizza', grams: 300 }. */
export function splitQuantity(query: string): { text: string; grams: number | null } {
  const match = query.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram\w*|ml|kg)\b\.?/i);
  if (!match) return { text: query.trim(), grams: null };
  const value = parseNumber(match[1]);
  const grams = match[2].toLowerCase() === 'kg' ? value * 1000 : value;
  const text = query.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { text: text || query.trim(), grams: grams > 0 ? Math.round(grams) : null };
}
