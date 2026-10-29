import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { addDish, deleteDish, getDailyGoal, getDishes, setDailyGoal } from '@/db/database';
import { isPhotoAnalysisConfigured } from '@/lib/analyze-photo';
import { parseNumber } from '@/lib/nutrition';
import type { Dish } from '@/lib/types';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [goal, setGoal] = useState('');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [dishName, setDishName] = useState('');
  const [dishWeight, setDishWeight] = useState('');
  const [dishDiameter, setDishDiameter] = useState('');

  const loadDishes = useCallback(() => getDishes(db).then(setDishes), [db]);

  useFocusEffect(
    useCallback(() => {
      getDailyGoal(db).then((g) => setGoal(String(g)));
      loadDishes();
    }, [db, loadDishes]),
  );

  const saveDish = async () => {
    const weight = parseNumber(dishWeight);
    const diameter = parseNumber(dishDiameter);
    if (!dishName.trim() || weight <= 0) return Alert.alert('Uzupełnij naczynie', 'Podaj nazwę i wagę pustego naczynia.');
    await addDish(db, { name: dishName.trim(), weightG: weight, diameterCm: diameter > 0 ? diameter : null });
    setDishName('');
    setDishWeight('');
    setDishDiameter('');
    loadDishes();
  };

  const confirmDeleteDish = (dish: Dish) =>
    Alert.alert('Usunąć naczynie?', dish.name, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await deleteDish(db, dish.id);
          loadDishes();
        },
      },
    ]);

  const save = async () => {
    const value = parseNumber(goal);
    if (value < 800 || value > 6000) return Alert.alert('Nieprawidłowy cel', 'Podaj wartość od 800 do 6000 kcal.');
    await setDailyGoal(db, value);
    Alert.alert('Zapisano', `Dzienny cel: ${Math.round(value)} kcal`);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Ustawienia</ThemedText>
          <Card>
            <Input label="Dzienny cel (kcal)" keyboardType="number-pad" value={goal} onChangeText={setGoal} />
            <Button title="Zapisz cel" onPress={save} />
          </Card>
          <Card>
            <ThemedText type="smallBold">Moje naczynia</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Zważ puste naczynie. Przy zdjęciu wybierzesz je i wpiszesz wagę z jedzeniem, a aplikacja odejmie wagę naczynia.
              Średnica pomaga AI ocenić wielkość porcji.
            </ThemedText>
            {dishes.map((d) => (
              <Pressable key={d.id} onLongPress={() => confirmDeleteDish(d)} style={styles.dish}>
                <ThemedText style={styles.flex}>{d.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {Math.round(d.weightG)} g{d.diameterCm ? ` · Ø ${d.diameterCm} cm` : ''}
                </ThemedText>
              </Pressable>
            ))}
            {dishes.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Przytrzymaj naczynie, aby je usunąć.
              </ThemedText>
            ) : null}
            <Input label="Nazwa" placeholder="np. biały talerz" value={dishName} onChangeText={setDishName} />
            <View style={styles.row}>
              <Input label="Waga pustego (g)" keyboardType="decimal-pad" value={dishWeight} onChangeText={setDishWeight} />
              <Input label="Średnica (cm)" keyboardType="decimal-pad" placeholder="opcjonalnie" value={dishDiameter} onChangeText={setDishDiameter} />
            </View>
            <Button title="Dodaj naczynie" variant="secondary" onPress={saveDish} />
          </Card>
          <Card>
            <ThemedText type="smallBold">Analiza zdjęć</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isPhotoAnalysisConfigured
                ? 'Połączona. Zdjęcia są wysyłane do Twojego pośrednika, a dalej do Claude API.'
                : 'Nieskonfigurowana. Ustaw EXPO_PUBLIC_ANALYZE_URL w pliku .env.'}
            </ThemedText>
          </Card>
          <ThemedText type="small" themeColor="textSecondary">
            Dane produktów: Open Food Facts (licencja ODbL). Wszystkie wpisy są przechowywane tylko na tym telefonie.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  dish: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  flex: { flex: 1 },
});
