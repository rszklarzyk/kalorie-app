import type { SQLiteDatabase } from 'expo-sqlite';

import type { Dish, Entry, NewEntry } from '@/lib/types';

export const DATABASE_NAME = 'kalorie.db';
const SCHEMA_VERSION = 3;
export const DEFAULT_DAILY_GOAL = 2000;

/** Tworzy lub migruje schemat. Wywoływane przez SQLiteProvider przy starcie. */
export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        grams REAL NOT NULL,
        kcal REAL NOT NULL,
        protein REAL NOT NULL,
        fat REAL NOT NULL,
        carbs REAL NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS entries_date ON entries(date);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }
  if (version < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS dishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        weight_g REAL NOT NULL,
        diameter_cm REAL
      );
    `);
  }
  if (version < 3) {
    await db.execAsync(`
      ALTER TABLE entries ADD COLUMN meal_id INTEGER;
      ALTER TABLE entries ADD COLUMN meal_name TEXT;
      CREATE TABLE IF NOT EXISTS suggestion_cache (
        query TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

type EntryRow = Omit<Entry, 'createdAt' | 'mealId' | 'mealName'> & {
  created_at: string;
  meal_id: number | null;
  meal_name: string | null;
};

const fromRow = ({ created_at, meal_id, meal_name, ...rest }: EntryRow): Entry => ({
  ...rest,
  mealId: meal_id,
  mealName: meal_name,
  createdAt: created_at,
});

export async function getEntriesForDate(db: SQLiteDatabase, date: string): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE date = ? ORDER BY id', date);
  return rows.map(fromRow);
}

export async function addEntry(db: SQLiteDatabase, e: NewEntry) {
  await db.runAsync(
    `INSERT INTO entries (date, name, grams, kcal, protein, fat, carbs, source, meal_id, meal_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.date, e.name, e.grams, e.kcal, e.protein, e.fat, e.carbs, e.source, e.mealId, e.mealName,
  );
}

export async function deleteEntry(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

export async function deleteMeal(db: SQLiteDatabase, mealId: number) {
  await db.runAsync('DELETE FROM entries WHERE meal_id = ?', mealId);
}

/** Ostatnio dodawane produkty, do szybkiego ponownego wpisu. */
export async function getRecentNames(db: SQLiteDatabase, limit = 10): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT * FROM entries WHERE id IN (SELECT MAX(id) FROM entries GROUP BY name)
     ORDER BY id DESC LIMIT ?`,
    limit,
  );
  return rows.map(fromRow);
}

export async function getDailyKcal(db: SQLiteDatabase, from: string, to: string) {
  return db.getAllAsync<{ date: string; kcal: number }>(
    'SELECT date, ROUND(SUM(kcal)) AS kcal FROM entries WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date',
    from, to,
  );
}

export async function getDailyGoal(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'daily_goal'");
  return row ? Number(row.value) : DEFAULT_DAILY_GOAL;
}

export async function setDailyGoal(db: SQLiteDatabase, kcal: number) {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('daily_goal', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(Math.round(kcal)),
  );
}

type DishRow = { id: number; name: string; weight_g: number; diameter_cm: number | null };

export async function getDishes(db: SQLiteDatabase): Promise<Dish[]> {
  const rows = await db.getAllAsync<DishRow>('SELECT * FROM dishes ORDER BY name');
  return rows.map((r) => ({ id: r.id, name: r.name, weightG: r.weight_g, diameterCm: r.diameter_cm }));
}

export async function addDish(db: SQLiteDatabase, dish: Omit<Dish, 'id'>) {
  await db.runAsync(
    'INSERT INTO dishes (name, weight_g, diameter_cm) VALUES (?, ?, ?)',
    dish.name, dish.weightG, dish.diameterCm,
  );
}

export async function deleteDish(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM dishes WHERE id = ?', id);
}

/** Podpowiedzi AI zapamiętane lokalnie, żeby to samo zapytanie nie kosztowało drugi raz. */
export async function getCachedSuggestions<T>(db: SQLiteDatabase, query: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ json: string }>(
    "SELECT json FROM suggestion_cache WHERE query = ? AND created_at > datetime('now', '-90 days')",
    query.toLowerCase(),
  );
  return row ? (JSON.parse(row.json) as T) : null;
}

export async function cacheSuggestions(db: SQLiteDatabase, query: string, value: unknown) {
  await db.runAsync(
    'INSERT OR REPLACE INTO suggestion_cache (query, json) VALUES (?, ?)',
    query.toLowerCase(),
    JSON.stringify(value),
  );
}
