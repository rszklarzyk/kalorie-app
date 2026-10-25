import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getDailyGoal, setDailyGoal } from '@/db/database';
import { isPhotoAnalysisConfigured } from '@/lib/analyze-photo';
import { parseNumber } from '@/lib/nutrition';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [goal, setGoal] = useState('');

  useFocusEffect(
    useCallback(() => {
      getDailyGoal(db).then((g) => setGoal(String(g)));
    }, [db]),
  );

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
});
