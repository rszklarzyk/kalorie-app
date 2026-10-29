import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { DraftEditor } from '@/components/draft-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Chip, Input } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { addEntry, cacheSuggestions, getCachedSuggestions, getDishes, getRecentNames } from '@/db/database';
import { analyzePhoto, isPhotoAnalysisConfigured } from '@/lib/analyze-photo';
import { draftToEntry, forPortion, mealNameFor, parseNumber, splitQuantity, sumTotals, toDateKey } from '@/lib/nutrition';
import { getByBarcode, searchFoods, toDraft, type FoodResult } from '@/lib/openfoodfacts';
import { suggestPortions, type Suggestion } from '@/lib/suggest';
import type { Dish, Draft, Entry } from '@/lib/types';

const emptyDraft = (): Draft => ({
  name: '',
  grams: 100,
  per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  source: 'manual',
});

const entryToDraft = (e: Entry): Draft => {
  const f = e.grams > 0 ? 100 / e.grams : 0;
  return {
    name: e.name,
    grams: e.grams,
    source: e.source,
    per100g: { kcal: Math.round(e.kcal * f), protein: e.protein * f, fat: e.fat * f, carbs: e.carbs * f },
  };
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function AddScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? toDateKey(new Date());

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notes, setNotes] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searched, setSearched] = useState<{ text: string; grams: number | null } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [dishId, setDishId] = useState<number | null>(null);
  const [scaleWeight, setScaleWeight] = useState('');
  const [mealName, setMealName] = useState('');

  useFocusEffect(
    useCallback(() => {
      getRecentNames(db).then(setRecent);
      getDishes(db).then(setDishes);
    }, [db]),
  );

  const dish = dishes.find((d) => d.id === dishId) ?? null;
  const scale = parseNumber(scaleWeight);
  const foodGrams = scale > 0 ? Math.round(scale - (dish?.weightG ?? 0)) : 0;

  const addDrafts = (more: Draft[]) => setDrafts((d) => [...d, ...more]);

  const runPhoto = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Brak uprawnień', 'Zezwól aplikacji na dostęp w ustawieniach telefonu.');

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    if (scale > 0 && foodGrams <= 0) {
      return Alert.alert('Sprawdź wagę', 'Waga z wagi jest mniejsza niż waga pustego naczynia.');
    }

    const picked = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;

    setBusy('Analizuję zdjęcie…');
    try {
      const result = await analyzePhoto(picked.assets[0].uri, {
        hint,
        foodGrams: foodGrams > 0 ? foodGrams : undefined,
        dish: dish ? { name: dish.name, diameterCm: dish.diameterCm } : undefined,
      });
      addDrafts(result.drafts);
      setNotes(result.notes);
      if (result.drafts.length === 0) Alert.alert('Nie rozpoznano jedzenia', result.notes);
    } catch (err) {
      Alert.alert('Błąd analizy', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // Najpierw darmowa baza Open Food Facts; AI (płatne, choć tanie) tylko na życzenie.
  const runSearch = async () => {
    if (!query.trim()) return;
    const parsed = splitQuantity(query);
    setSearched(parsed);
    setBusy('Szukam…');
    setResults([]);
    setSuggestions([]);
    try {
      const found = await searchFoods(parsed.text);
      setResults(found);
      if (found.length === 0 && !isPhotoAnalysisConfigured) {
        Alert.alert('Brak wyników', `Nic nie znalazłem dla „${parsed.text}”. Sprawdź pisownię albo wpisz produkt ręcznie.`);
      }
    } catch (err) {
      Alert.alert('Błąd wyszukiwania', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const askAi = async () => {
    if (!searched) return;
    setBusy('Pytam AI…');
    try {
      const cached = await getCachedSuggestions<Suggestion[]>(db, searched.text);
      const options = cached ?? (await suggestPortions(searched.text));
      if (!cached && options.length > 0) await cacheSuggestions(db, searched.text, options);
      setSuggestions(options);
      if (options.length === 0) Alert.alert('Brak podpowiedzi', 'AI nie rozpoznało tego produktu. Wpisz go ręcznie.');
    } catch (err) {
      Alert.alert('Błąd podpowiedzi', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  /** Gramatura wpisana w wyszukiwarce („pizza 300 g”) wygrywa z domyślną porcją. */
  const withSearchedGrams = (d: Draft): Draft => (searched?.grams ? { ...d, grams: searched.grams } : d);

  const pickResult = (d: Draft) => {
    addDrafts([withSearchedGrams(d)]);
    setResults([]);
    setSuggestions([]);
    setSearched(null);
    setQuery('');
  };

  const onScanned = async (code: string) => {
    setScanning(false);
    setBusy('Szukam produktu…');
    try {
      const found = await getByBarcode(code);
      if (found) addDrafts([toDraft(found)]);
      else Alert.alert('Nie znaleziono produktu', `Kodu ${code} nie ma w Open Food Facts. Wpisz go ręcznie.`);
    } catch (err) {
      Alert.alert('Błąd', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const valid = drafts.filter((d) => d.name.trim() && d.grams > 0);
    if (valid.length === 0) return Alert.alert('Nic do zapisania', 'Uzupełnij nazwę i porcję.');
    // Wszystko zapisane naraz to jeden posiłek, np. śniadanie ze zdjęcia.
    const meal = { id: Date.now(), name: mealName.trim() || mealNameFor(new Date()) };
    await db.withTransactionAsync(async () => {
      for (const d of valid) await addEntry(db, draftToEntry({ ...d, name: d.name.trim() }, date, meal));
    });
    setDrafts([]);
    setNotes('');
    setHint('');
    setScaleWeight('');
    setMealName('');
    setResults([]);
    setSuggestions([]);
    setQuery('');
    router.navigate('/');
  };

  const total = sumTotals(drafts.map((d) => forPortion(d.per100g, d.grams)));

  if (scanning) return <BarcodeScanner onScanned={onScanned} onClose={() => setScanning(false)} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Dodaj posiłek</ThemedText>
          {date !== toDateKey(new Date()) ? (
            <ThemedText type="small" themeColor="textSecondary">
              Do dnia {date}
            </ThemedText>
          ) : null}

          <Card>
            <ThemedText type="smallBold">Ze zdjęcia</ThemedText>
            {isPhotoAnalysisConfigured ? (
              <>
                {dishes.length > 0 ? (
                  <View style={styles.chips}>
                    {[null, ...dishes].map((d) => (
                      <Chip
                        key={d?.id ?? 'none'}
                        label={d ? d.name : 'Bez naczynia'}
                        selected={(d?.id ?? null) === dishId}
                        onPress={() => setDishId(d?.id ?? null)}
                      />
                    ))}
                  </View>
                ) : null}
                <Input
                  label={dish ? `Waga z naczyniem (g, opcjonalnie)` : 'Waga jedzenia (g, opcjonalnie)'}
                  keyboardType="decimal-pad"
                  value={scaleWeight}
                  onChangeText={setScaleWeight}
                />
                {dish && foodGrams > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Samo jedzenie: {foodGrams} g
                  </ThemedText>
                ) : null}
                <Input placeholder="Wskazówka (opcjonalnie), np. „kotlet smażony na maśle”" value={hint} onChangeText={setHint} />
                <View style={styles.row}>
                  <Button title="Zrób zdjęcie" onPress={() => runPhoto(true)} disabled={!!busy} />
                  <Button title="Z galerii" variant="secondary" onPress={() => runPhoto(false)} disabled={!!busy} />
                </View>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Analiza zdjęć wymaga ustawienia EXPO_PUBLIC_ANALYZE_URL (patrz README).
              </ThemedText>
            )}
          </Card>

          <Card>
            <ThemedText type="smallBold">Z bazy produktów</ThemedText>
            <View style={styles.row}>
              <Input placeholder="np. jogurt naturalny, pizza mrożona 300 g" value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" />
            </View>
            <View style={styles.row}>
              <Button title="Szukaj" onPress={runSearch} disabled={!!busy} />
              <Button title="Skanuj kod" variant="secondary" onPress={() => setScanning(true)} disabled={!!busy} />
            </View>
            {busy === 'Szukam…' || busy === 'Pytam AI…' ? (
              <View style={styles.row}>
                <ActivityIndicator />
                <ThemedText themeColor="textSecondary">{busy}</ThemedText>
              </View>
            ) : null}
            {searched?.grams ? (
              <ThemedText type="small" themeColor="textSecondary">
                Porcja: {searched.grams} g (z wpisu)
              </ThemedText>
            ) : null}
            {suggestions.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Typowe porcje
              </ThemedText>
            ) : null}
            {suggestions.map((s, i) => (
              <Pressable
                key={`ai-${i}`}
                onPress={() => pickResult(s.draft)}
                style={styles.result}>
                <View style={styles.flex}>
                  <ThemedText numberOfLines={1}>{s.draft.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {searched?.grams ? `${searched.grams} g` : `${s.portion} · ${s.draft.grams} g`}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">{forPortion(s.draft.per100g, withSearchedGrams(s.draft).grams).kcal} kcal</ThemedText>
              </Pressable>
            ))}
            {results.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Produkty ze sklepu (Open Food Facts)
              </ThemedText>
            ) : null}
            {results.map((r, i) => (
              <Pressable
                key={`${r.code ?? r.name}-${i}`}
                onPress={() => pickResult(toDraft(r))}
                style={styles.result}>
                <ThemedText numberOfLines={2} style={styles.flex}>
                  {r.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {searched?.grams
                    ? `${forPortion(r.per100g, searched.grams).kcal} kcal`
                    : `${r.per100g.kcal} kcal/100 g`}
                </ThemedText>
              </Pressable>
            ))}
            {searched && !busy && suggestions.length === 0 && isPhotoAnalysisConfigured ? (
              <View style={styles.row}>
                <Button
                  title={results.length > 0 ? 'Nie ma? Zapytaj AI o porcje' : 'Brak w bazie. Zapytaj AI o porcje'}
                  variant="secondary"
                  onPress={askAi}
                />
              </View>
            ) : null}
          </Card>

          <View style={styles.row}>
            <Button title="Wpisz ręcznie" variant="secondary" onPress={() => addDrafts([emptyDraft()])} disabled={!!busy} />
          </View>

          {recent.length > 0 && drafts.length === 0 ? (
            <Card>
              <ThemedText type="smallBold">Ostatnio dodawane</ThemedText>
              {recent.map((e) => (
                <Pressable key={e.id} onPress={() => addDrafts([entryToDraft(e)])} style={styles.result}>
                  <ThemedText numberOfLines={1} style={styles.flex}>
                    {e.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round(e.grams)} g · {Math.round(e.kcal)} kcal
                  </ThemedText>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {busy && busy !== 'Szukam…' && busy !== 'Pytam AI…' ? (
            <View style={styles.row}>
              <ActivityIndicator />
              <ThemedText themeColor="textSecondary">{busy}</ThemedText>
            </View>
          ) : null}

          {notes ? (
            <ThemedText type="small" themeColor="textSecondary">
              Uwagi do zdjęcia: {notes}
            </ThemedText>
          ) : null}

          {drafts.map((d, i) => (
            <DraftEditor
              key={i}
              draft={d}
              onChange={(next) => setDrafts((all) => all.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setDrafts((all) => all.filter((_, j) => j !== i))}
            />
          ))}

          {drafts.length > 0 ? (
            <>
              <Input label="Posiłek" placeholder={mealNameFor(new Date())} value={mealName} onChangeText={setMealName} />
              <Button title={`Zapisz posiłek (${total.kcal} kcal)`} onPress={save} disabled={!!busy} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
