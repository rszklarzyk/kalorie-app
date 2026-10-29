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
import { addEntry, getDishes, getRecentNames } from '@/db/database';
import { analyzePhoto, isPhotoAnalysisConfigured } from '@/lib/analyze-photo';
import { draftToEntry, forPortion, parseNumber, sumTotals, toDateKey } from '@/lib/nutrition';
import { getByBarcode, searchFoods, toDraft, type FoodResult } from '@/lib/openfoodfacts';
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
  const [scanning, setScanning] = useState(false);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [dishId, setDishId] = useState<number | null>(null);
  const [scaleWeight, setScaleWeight] = useState('');

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

  const runSearch = async () => {
    if (!query.trim()) return;
    setBusy('Szukam…');
    try {
      setResults(await searchFoods(query.trim()));
    } catch (err) {
      Alert.alert('Błąd wyszukiwania', errorMessage(err));
    } finally {
      setBusy(null);
    }
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
    await db.withTransactionAsync(async () => {
      for (const d of valid) await addEntry(db, draftToEntry({ ...d, name: d.name.trim() }, date));
    });
    setDrafts([]);
    setNotes('');
    setHint('');
    setScaleWeight('');
    setResults([]);
    setQuery('');
    router.navigate('/');
  };

  const total = sumTotals(drafts.map((d) => forPortion(d.per100g, d.grams)));

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
              <Input placeholder="np. jogurt naturalny" value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" />
            </View>
            <View style={styles.row}>
              <Button title="Szukaj" onPress={runSearch} disabled={!!busy} />
              <Button title="Skanuj kod" variant="secondary" onPress={() => setScanning(true)} disabled={!!busy} />
            </View>
            {results.map((r, i) => (
              <Pressable
                key={`${r.code ?? r.name}-${i}`}
                onPress={() => {
                  addDrafts([toDraft(r)]);
                  setResults([]);
                }}
                style={styles.result}>
                <ThemedText numberOfLines={2} style={styles.flex}>
                  {r.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.per100g.kcal} kcal/100 g
                </ThemedText>
              </Pressable>
            ))}
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

          {busy ? (
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
            <Button title={`Zapisz (${total.kcal} kcal)`} onPress={save} disabled={!!busy} />
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <BarcodeScanner visible={scanning} onScanned={onScanned} onClose={() => setScanning(false)} />
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
