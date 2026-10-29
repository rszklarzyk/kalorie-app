import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';

type Props = { onScanned: (code: string) => void; onClose: () => void };

/**
 * Skaner na całym ekranie zamiast w Modal: z natywnymi kartami okienko Modal
 * na Androidzie potrafiło się w ogóle nie pokazać.
 */
export function BarcodeScanner({ onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  // onBarcodeScanned potrafi odpalić kilka razy dla jednego kodu.
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const submitTyped = () => {
    const code = typed.replace(/\D/g, '');
    if (code.length >= 8) onScanned(code);
  };

  return (
    <SafeAreaView style={styles.container}>
      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={({ data }) => {
            if (handled.current) return;
            handled.current = true;
            onScanned(data);
          }}
        />
      ) : (
        <View style={styles.permission}>
          <ThemedText style={styles.white}>Aplikacja potrzebuje aparatu, żeby zeskanować kod kreskowy.</ThemedText>
          <Button title="Zezwól na aparat" onPress={requestPermission} />
        </View>
      )}
      <View style={styles.footer}>
        <ThemedText type="small" style={styles.white}>
          Nakieruj aparat na kod kreskowy albo wpisz cyfry spod kodu.
        </ThemedText>
        <Input
          placeholder="np. 5900820000394"
          keyboardType="number-pad"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={submitTyped}
          returnKeyType="search"
        />
        <View style={styles.row}>
          <Button title="Szukaj kodu" onPress={submitTyped} disabled={typed.replace(/\D/g, '').length < 8} />
          <Button title="Anuluj" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permission: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  white: { color: '#fff', textAlign: 'center' },
  footer: { padding: Spacing.three, gap: Spacing.two, paddingBottom: BottomTabInset + Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
});
