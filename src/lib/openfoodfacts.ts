import type { Draft, Per100g } from '@/lib/types';

// Open Food Facts prosi o identyfikujący User-Agent: https://openfoodfacts.github.io/openfoodfacts-server/api/
const HEADERS = { 'User-Agent': 'KalorieApp/0.1 (prywatna aplikacja)' };
const FIELDS = 'code,product_name,product_name_pl,brands,nutriments';

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_pl?: string;
  brands?: string | string[];
  nutriments?: Record<string, number | string | undefined>;
};

export type FoodResult = { code?: string; name: string; per100g: Per100g };

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

function toResult(p: OffProduct): FoodResult | null {
  const n = p.nutriments ?? {};
  const kcal = num(n['energy-kcal_100g']) || num(n['energy_100g']) / 4.184;
  const name = p.product_name_pl || p.product_name;
  if (!name || !kcal) return null;
  const brand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0];
  return {
    code: p.code,
    name: brand ? `${name} (${brand.trim()})` : name,
    per100g: {
      kcal: Math.round(kcal),
      protein: num(n['proteins_100g']),
      fat: num(n['fat_100g']),
      carbs: num(n['carbohydrates_100g']),
    },
  };
}

export async function searchFoods(query: string): Promise<FoodResult[]> {
  const url =
    'https://search.openfoodfacts.org/search?' +
    new URLSearchParams({ q: query, langs: 'pl', page_size: '25', fields: FIELDS });
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
  const json: { hits?: OffProduct[] } = await res.json();
  return (json.hits ?? []).map(toResult).filter((r): r is FoodResult => r !== null);
}

export async function getByBarcode(barcode: string): Promise<FoodResult | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`);
  const json: { status?: number; product?: OffProduct } = await res.json();
  return json.status === 1 && json.product ? toResult({ code: barcode, ...json.product }) : null;
}

export const toDraft = (r: FoodResult, grams = 100): Draft => ({
  name: r.name,
  grams,
  per100g: r.per100g,
  source: 'search',
});
