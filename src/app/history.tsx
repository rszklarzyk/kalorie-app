import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, ProgressBar } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getDailyGoal, getDailyKcal } from '@/db/database';
import { shiftDateKey, toDateKey } from '@/lib/nutrition';

const DAYS = 14;

type Day = { date: string; kcal: number };

function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [days, setDays] = useState<Day[]>([]);
  const [goal, setGoal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const today = toDateKey(new Date());
        const from = shiftDateKey(today, -(DAYS - 1));
        const rows = await getDailyKcal(db, from, today);
        const byDate = new Map(rows.map((r) => [r.date, r.kcal]));
        setDays(Array.from({ length: DAYS }, (_, i) => shiftDateKey(today, -i)).map((date) => ({ date, kcal: byDate.get(date) ?? 0 })));
        setGoal(await getDailyGoal(db));
      })();
    }, [db]),
  );

  const logged = days.filter((d) => d.kcal > 0);
  const average = (n: number) => {
    const slice = logged.filter((d) => days.indexOf(d) < n);
    return slice.length ? Math.round(slice.reduce((s, d) => s + d.kcal, 0) / slice.length) : 0;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Historia</ThemedText>
          <Card>
            <ThemedText>Średnio z 7 dni: {average(7)} kcal</ThemedText>
            <ThemedText>Średnio z 14 dni: {average(14)} kcal</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Liczone tylko z dni z wpisami. Cel: {goal} kcal.
            </ThemedText>
          </Card>
          {days.map((d) => (
            <View key={d.date} style={styles.day}>
              <ThemedText type="small" style={styles.label}>
                {dayLabel(d.date)}
              </ThemedText>
              <View style={styles.bar}>
                <ProgressBar value={d.kcal} max={goal} />
              </View>
              <ThemedText type="small" style={styles.kcal}>
                {d.kcal || '–'}
              </ThemedText>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  day: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { width: 90 },
  bar: { flex: 1 },
  kcal: { width: 56, textAlign: 'right' },
});
