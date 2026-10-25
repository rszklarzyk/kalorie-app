import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Macros, ProgressBar } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { deleteEntry, getDailyGoal, getEntriesForDate } from '@/db/database';
import { shiftDateKey, sumTotals, toDateKey } from '@/lib/nutrition';
import type { Entry } from '@/lib/types';

const SOURCE_LABEL: Record<Entry['source'], string> = { manual: 'ręcznie', search: 'baza', photo: 'zdjęcie' };

function dateLabel(key: string) {
  const today = toDateKey(new Date());
  if (key === today) return 'Dziś';
  if (key === shiftDateKey(today, -1)) return 'Wczoraj';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [goal, setGoal] = useState(0);

  const load = useCallback(async () => {
    setEntries(await getEntriesForDate(db, date));
    setGoal(await getDailyGoal(db));
  }, [db, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totals = sumTotals(entries);
  const left = goal - totals.kcal;
  const isToday = date === toDateKey(new Date());

  const confirmDelete = (entry: Entry) =>
    Alert.alert('Usunąć pozycję?', `${entry.name}, ${Math.round(entry.kcal)} kcal`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, entry.id);
          load();
        },
      },
    ]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.dateRow}>
            <Pressable onPress={() => setDate(shiftDateKey(date, -1))} hitSlop={16}>
              <ThemedText type="subtitle">‹</ThemedText>
            </Pressable>
            <ThemedText type="smallBold" style={styles.dateText}>
              {dateLabel(date)}
            </ThemedText>
            <Pressable onPress={() => !isToday && setDate(shiftDateKey(date, 1))} hitSlop={16} disabled={isToday}>
              <ThemedText type="subtitle" style={{ opacity: isToday ? 0.2 : 1 }}>
                ›
              </ThemedText>
            </Pressable>
          </View>

          <Card>
            <ThemedText type="subtitle">{totals.kcal} kcal</ThemedText>
            <ProgressBar value={totals.kcal} max={goal} />
            <ThemedText type="small" themeColor="textSecondary">
              {left >= 0 ? `Zostało ${left} z ${goal} kcal` : `Przekroczono cel o ${-left} kcal`}
            </ThemedText>
            <Macros value={totals} />
          </Card>

          {entries.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              Brak posiłków w tym dniu.
            </ThemedText>
          ) : (
            entries.map((e) => (
              <Pressable key={e.id} onLongPress={() => confirmDelete(e)}>
                <Card style={styles.entry}>
                  <View style={styles.entryText}>
                    <ThemedText numberOfLines={2}>{e.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {Math.round(e.grams)} g · {SOURCE_LABEL[e.source]}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">{Math.round(e.kcal)} kcal</ThemedText>
                </Card>
              </Pressable>
            ))
          )}
          {entries.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Przytrzymaj pozycję, aby ją usunąć.
            </ThemedText>
          ) : null}

          <Button title="Dodaj posiłek" onPress={() => router.navigate({ pathname: '/add', params: { date } })} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { textTransform: 'capitalize' },
  empty: { textAlign: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  entryText: { flex: 1 },
});
