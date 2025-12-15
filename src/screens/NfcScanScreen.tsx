import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Toast } from '../components/Toast';
import { AppButton } from '../components/AppButton';
import { ScanDialog } from '../components/ui/ScanDialog';
import { ScanButton } from '../components/ui/ScanButton';
import { useNfcScanScreen } from '../features/nfc/hooks/useNfcScanScreen';
import { THEME } from '../utils/theme/colors';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.NfcScan>;

export const NfcScanScreen: React.FC<Props> = ({ navigation }) => {
  const {
    title,
    isEnabled,
    isScanning,
    isResetting,
    dialogVisible,
    toastMessage,
    toastVisible,
    toastType,
    primaryLabel,
    resetLabel,
    openScanDialog,
    closeScanDialog,
    showToast,
    dismissToast,
    handleScanSuccess,
    handleScanningChange,
    confirmReset,
  } = useNfcScanScreen({ navigation });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <View style={styles.container}>
        <Text style={styles.heading}>{title}</Text>
        <View style={styles.actions}>
          <View style={styles.scanButtonWrapper}>
            <ScanButton
              label={primaryLabel}
              onPress={openScanDialog}
              disabled={isScanning || isResetting}
            />
          </View>
          <View style={styles.resetButtonWrapper}>
            <AppButton
              label={resetLabel}
              onPress={confirmReset}
              disabled={isScanning || isResetting}
              variant="secondary"
            />
          </View>
        </View>
      </View>
      <ScanDialog
        visible={dialogVisible}
        isNfcEnabled={isEnabled}
        onClose={closeScanDialog}
        onScanningChange={handleScanningChange}
        onShowToast={showToast}
        onSuccess={handleScanSuccess}
      />
      <Toast
        message={toastMessage}
        visible={toastVisible}
        type={toastType}
        onTimeout={dismissToast}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.background,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: THEME.foreground,
    marginBottom: 24,
  },
  actions: {
    width: '100%',
    maxWidth: 360,
  },
  scanButtonWrapper: {
    alignItems: 'center',
    marginBottom: 18,
  },
  resetButtonWrapper: {
    alignItems: 'stretch',
    width: '100%',
  },
});

export default NfcScanScreen;
