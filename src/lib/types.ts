/** Wartości odżywcze w przeliczeniu na 100 g produktu. */
export type Per100g = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

/** Jedna pozycja w dzienniku (już przeliczona na zjedzoną porcję). */
export type Entry = {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  source: EntrySource;
  /** Pozycje zapisane razem (np. ze jednego zdjęcia) mają wspólny posiłek. */
  mealId: number | null;
  mealName: string | null;
  createdAt: string;
};

export type EntrySource = 'manual' | 'search' | 'photo' | 'ai';

export type NewEntry = Omit<Entry, 'id' | 'createdAt'>;

/** Propozycja pozycji (z wyszukiwarki lub ze zdjęcia), którą użytkownik zatwierdza. */
export type Draft = {
  name: string;
  grams: number;
  per100g: Per100g;
  source: EntrySource;
};

export type Totals = Per100g;

/** Naczynie użytkownika: waga pustego naczynia pozwala policzyć masę samego jedzenia. */
export type Dish = {
  id: number;
  name: string;
  weightG: number;
  diameterCm: number | null;
};
