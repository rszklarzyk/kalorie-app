import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Input, Macros } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { forPortion, parseNumber } from '@/lib/nutrition';
import type { Dish, Draft, Per100g } from '@/lib/types';

type Props = {
  draft: Draft;
  dishes: Dish[];
  onChange: (draft: Draft) => void;
  onRemove: () => void;
};

const fmt = (n: number) => (n ? String(Math.round(n * 10) / 10) : '');

const MULTIPLIERS = [0.5, 1, 1.5, 2];

/**
 * Edycja jednej pozycji: nazwa, porcja (wielokrotność, gramy albo waga z naczyniem)
 * i kalorie, wpisane łącznie albo na 100 g.
 */
export function DraftEditor({ draft, dishes, onChange, onRemove }: Props) {
  const [dishId, setDishId] = useState<number | null>(null);
  const [gross, setGross] = useState('');
  const [showMacros, setShowMacros] = useState(false);

  const portion = forPortion(draft.per100g, draft.grams);
  const base = draft.baseGrams ?? 0;
  const dish = dishes.find((d) => d.id === dishId) ?? null;

  const setGrams = (grams: number) => onChange({ ...draft, grams: Math.max(0, Math.round(grams)) });
  const setPer100g = (key: keyof Per100g) => (text: string) =>
    onChange({ ...draft, per100g: { ...draft.per100g, [key]: parseNumber(text) } });
  // Wpisane „kcal razem” przeliczamy na 100 g, żeby zmiana porcji dalej liczyła się poprawnie.
  const setTotalKcal = (text: string) => {
    const total = parseNumber(text);
    const grams = draft.grams > 0 ? draft.grams : 100;
    onChange({ ...draft, grams, per100g: { ...draft.per100g, kcal: (total * 100) / grams } });
  };

  const pickDish = (d: Dish | null) => {
    setDishId(d?.id ?? null);
    setGross('');
  };
  const onGross = (text: string) => {
    setGross(text);
    const g = parseNumber(text);
    if (g > 0) setGrams(g - (dish?.weightG ?? 0));
  };

  return (
    <Card>
      <Input label="Nazwa" value={draft.name} onChangeText={(name) => onChange({ ...draft, name })} />

      {base > 0 ? (
        <View style={styles.chips}>
          {MULTIPLIERS.map((m) => (
            <Chip
              key={m}
              label={`${String(m).replace('.', ',')}× (${Math.round(base * m)} g)`}
              selected={draft.grams === Math.round(base * m)}
              onPress={() => setGrams(base * m)}
            />
          ))}
        </View>
      ) : null}

      {dishes.length > 0 ? (
        <View style={styles.chips}>
          {[null, ...dishes].map((d) => (
            <Chip
              key={d?.id ?? 'none'}
              label={d ? `Na: ${d.name}` : 'Bez naczynia'}
              selected={(d?.id ?? null) === dishId}
              onPress={() => pickDish(d)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {dish ? (
          <Input label={`Waga z naczyniem (g)`} keyboardType="decimal-pad" value={gross} onChangeText={onGross} />
        ) : (
          <Input label="Porcja (g)" keyboardType="decimal-pad" value={fmt(draft.grams)} onChangeText={(t) => setGrams(parseNumber(t))} />
        )}
        <Input label="kcal razem" keyboardType="decimal-pad" value={fmt(portion.kcal)} onChangeText={setTotalKcal} />
      </View>
      {dish && parseNumber(gross) > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Samo jedzenie: {draft.grams} g (naczynie {dish.weightG} g)
        </ThemedText>
      ) : null}

      <Pressable onPress={() => setShowMacros((v) => !v)} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary">
          {showMacros ? '▾' : '▸'} Na 100 g: {fmt(draft.per100g.kcal) || 0} kcal · B {fmt(draft.per100g.protein) || 0} · T{' '}
          {fmt(draft.per100g.fat) || 0} · W {fmt(draft.per100g.carbs) || 0}
        </ThemedText>
      </Pressable>
      {showMacros ? (
        <>
          <View style={styles.row}>
            <Input label="kcal / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.kcal)} onChangeText={setPer100g('kcal')} />
            <Input label="Białko / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.protein)} onChangeText={setPer100g('protein')} />
          </View>
          <View style={styles.row}>
            <Input label="Tłuszcz / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.fat)} onChangeText={setPer100g('fat')} />
            <Input label="Węgl. / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.carbs)} onChangeText={setPer100g('carbs')} />
          </View>
        </>
      ) : null}

      <View style={styles.summary}>
        <View>
          <ThemedText type="smallBold">Razem: {portion.kcal} kcal</ThemedText>
          <Macros value={portion} />
        </View>
        <View>
          <Button title="Usuń" variant="secondary" onPress={onRemove} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
