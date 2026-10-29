import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Draft } from '@/lib/types';

const ANALYZE_URL = process.env.EXPO_PUBLIC_ANALYZE_URL;
const APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN;

export const isPhotoAnalysisConfigured = Boolean(ANALYZE_URL);

/** Odpowiedź z workera (worker/src/index.ts). */
type AnalyzeResponse = {
  items: {
    name: string;
    grams: number;
    kcal_per_100g: number;
    protein_per_100g: number;
    fat_per_100g: number;
    carbs_per_100g: number;
  }[];
  notes: string;
};

export type PhotoAnalysis = { drafts: Draft[]; notes: string };

export type PhotoContext = {
  hint?: string;
  /** Zważona masa samego jedzenia (bez naczynia). */
  foodGrams?: number;
  dish?: { name: string; diameterCm: number | null };
};

/** Skaluje gramatury tak, żeby sumowały się dokładnie do zważonej masy. */
function scaleToTotal(drafts: Draft[], total: number): Draft[] {
  const sum = drafts.reduce((s, d) => s + d.grams, 0);
  if (sum <= 0) return drafts;
  return drafts.map((d) => ({ ...d, grams: Math.round((d.grams * total) / sum) }));
}

/** Zmniejsza zdjęcie, wysyła je do workera i zwraca propozycje pozycji do zatwierdzenia. */
export async function analyzePhoto(uri: string, context: PhotoContext = {}): Promise<PhotoAnalysis> {
  if (!ANALYZE_URL) throw new Error('Brak EXPO_PUBLIC_ANALYZE_URL w pliku .env');

  // 1024 px wystarcza modelowi, a zdjęcie jest wielokrotnie mniejsze.
  const image = await ImageManipulator.manipulate(uri).resize({ width: 1024 }).renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error('Nie udało się przygotować zdjęcia');

  const res = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {}) },
    body: JSON.stringify({
      image: saved.base64,
      mediaType: 'image/jpeg',
      hint: context.hint,
      foodGrams: context.foodGrams,
      dish: context.dish,
    }),
  });
  if (!res.ok) throw new Error(`Analiza zdjęcia nie powiodła się (HTTP ${res.status}): ${await res.text()}`);
  const json: AnalyzeResponse = await res.json();

  const drafts: Draft[] = json.items.map((i) => ({
    name: i.name,
    grams: Math.round(i.grams),
    source: 'photo',
    per100g: {
      kcal: Math.round(i.kcal_per_100g),
      protein: i.protein_per_100g,
      fat: i.fat_per_100g,
      carbs: i.carbs_per_100g,
    },
  }));

  return { notes: json.notes, drafts: context.foodGrams ? scaleToTotal(drafts, context.foodGrams) : drafts };
}
