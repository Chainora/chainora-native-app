import React, { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Toast, ToastType } from '../components/Toast';
import { ScanDialog } from '../components/ui/ScanDialog';
import { ScanButton } from '../components/ui/ScanButton';
import { useNfcEnabled } from '../hooks/useNfcEnabled';
import { THEME } from '../theme/colors';

export const NfcScanScreen: React.FC = () => {
  const { isEnabled, isSupported, error: nfcError } = useNfcEnabled();
  const [status, setStatus] = useState('Ready to scan');
  const [isScanning, setIsScanning] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<ToastType>('info');

  useEffect(() => {
    if (nfcError) {
      setStatus(nfcError);
    } else if (isSupported === false) {
      setStatus('NFC is not supported on this device');
    } else if (isEnabled === false) {
      setStatus('Enable NFC to scan your Chainora card');
    }
  }, [isEnabled, isSupported, nfcError]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToastType(type);
    setToastMessage(message);
    setToastVisible(true);
  }, []);

  const dismissToast = useCallback(() => {
    setToastVisible(false);
    setToastMessage(null);
  }, []);

  const closeScanDialog = useCallback(() => {
    setDialogVisible(false);
  }, []);

  const openScanDialog = useCallback(() => {
    if (isEnabled === false) {
      Alert.alert('NFC disabled', 'Turn on NFC in system settings and try again.');
      return;
    }
    setDialogVisible(true);
  }, [isEnabled]);

  const handleDisableOrderCard = useCallback(() => {
    Alert.alert('Coming soon', 'The disable order card action is not available yet.');
  }, []);

  const canScan = isEnabled !== false && !isScanning;
  const primaryLabel = isScanning ? 'Scanning...' : 'Scan NFC';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <View style={styles.container}>
        <Text style={styles.heading}>Chainora NFC</Text>
        <Text style={styles.statusText}>{status}</Text>
        <ScanButton label={primaryLabel} onPress={openScanDialog} disabled={!canScan} />
        <View style={styles.secondaryButtonWrapper}>
          <AppButton label="Order Card" onPress={handleDisableOrderCard} variant="secondary" />
        </View>
      </View>
      <ScanDialog
        visible={dialogVisible}
        isNfcEnabled={isEnabled}
        onClose={closeScanDialog}
        onStatusChange={setStatus}
        onScanningChange={setIsScanning}
        onShowToast={showToast}
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
  statusText: {
    color: THEME.foregroundMuted,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  secondaryButtonWrapper: {
    width: '100%',
    marginTop: 24,
    alignItems: 'center',
  },
});

export default NfcScanScreen;
