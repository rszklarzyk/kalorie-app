import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Macros } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { forPortion, parseNumber } from '@/lib/nutrition';
import type { Draft, Per100g } from '@/lib/types';

type Props = {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onRemove: () => void;
};

const fmt = (n: number) => (n ? String(n) : '');

/** Edycja jednej proponowanej pozycji: nazwa, porcja i wartości na 100 g. */
export function DraftEditor({ draft, onChange, onRemove }: Props) {
  const portion = forPortion(draft.per100g, draft.grams);
  const setPer100g = (key: keyof Per100g) => (text: string) =>
    onChange({ ...draft, per100g: { ...draft.per100g, [key]: parseNumber(text) } });

  return (
    <Card>
      <Input label="Nazwa" value={draft.name} onChangeText={(name) => onChange({ ...draft, name })} />
      <View style={styles.row}>
        <Input
          label="Porcja (g)"
          keyboardType="decimal-pad"
          value={fmt(draft.grams)}
          onChangeText={(t) => onChange({ ...draft, grams: parseNumber(t) })}
        />
        <Input label="kcal / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.kcal)} onChangeText={setPer100g('kcal')} />
      </View>
      <View style={styles.row}>
        <Input label="Białko / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.protein)} onChangeText={setPer100g('protein')} />
        <Input label="Tłuszcz / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.fat)} onChangeText={setPer100g('fat')} />
        <Input label="Węgl. / 100 g" keyboardType="decimal-pad" value={fmt(draft.per100g.carbs)} onChangeText={setPer100g('carbs')} />
      </View>
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
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
});
