import { fetchWithTimeout } from '@/lib/http';
import type { Draft } from '@/lib/types';

const ANALYZE_URL = process.env.EXPO_PUBLIC_ANALYZE_URL;
const APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN;

/** Odpowiedź z workera (POST /suggest w worker/src/index.ts). */
type SuggestResponse = {
  options: {
    name: string;
    portion: string;
    grams: number;
    kcal_per_100g: number;
    protein_per_100g: number;
    fat_per_100g: number;
    carbs_per_100g: number;
  }[];
};

export type Suggestion = { portion: string; draft: Draft };

/** Typowe porcje wpisanego produktu (np. „1 średni banan”) podpowiadane przez AI. */
export async function suggestPortions(query: string): Promise<Suggestion[]> {
  if (!ANALYZE_URL) return [];
  const res = await fetchWithTimeout(new URL('/suggest', ANALYZE_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}) },
    body: JSON.stringify({ query }),
  }, 30000);
  if (!res.ok) throw new Error(`Podpowiedzi AI nie działają (HTTP ${res.status})`);
  const json: SuggestResponse = await res.json();
  return json.options.map((o) => ({
    portion: o.portion,
    draft: {
      name: o.name,
      grams: Math.round(o.grams),
      source: 'ai',
      per100g: {
        kcal: Math.round(o.kcal_per_100g),
        protein: o.protein_per_100g,
        fat: o.fat_per_100g,
        carbs: o.carbs_per_100g,
      },
    },
  }));
}
