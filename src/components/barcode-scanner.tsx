import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';

type Props = { visible: boolean; onScanned: (code: string) => void; onClose: () => void };

export function BarcodeScanner({ visible, onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  // onBarcodeScanned potrafi odpalić kilka razy dla jednego kodu.
  const handled = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => {
        handled.current = false;
      }}>
      <SafeAreaView style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
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
          <Button title="Anuluj" variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  permission: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  white: { color: '#fff', textAlign: 'center' },
  footer: { padding: Spacing.three, flexDirection: 'row' },
});
