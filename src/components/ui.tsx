import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Per100g } from '@/lib/types';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.backgroundSelected;
  const fg = variant === 'secondary' ? theme.text : theme.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <ThemedText style={{ color: fg, fontWeight: 600 }}>{title}</ThemedText>}
    </Pressable>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]} {...rest} />;
}

export function Input({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.inputWrap}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background }, style]}
        {...rest}
      />
    </View>
  );
}

export function Macros({ value }: { value: Per100g }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      B {value.protein} g · T {value.fat} g · W {value.carbs} g
    </ThemedText>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const theme = useTheme();
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: value > max ? theme.danger : theme.primary }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  inputWrap: { gap: Spacing.one, flexGrow: 1, flexBasis: 0 },
  input: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, minHeight: 44, fontSize: 16 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
