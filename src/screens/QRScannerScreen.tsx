import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { AppButton } from '../components/AppButton';
import { PinInput } from '../components/ui/PinInput';
import { ScanDialog } from '../components/ui/ScanDialog';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import {
  createQrLoginProof,
  notifyQrLoginProgress,
  parseQrLoginPayload,
  QrLoginPayload,
  verifyQrLogin,
} from '../services/qrLoginService';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.QRScanner>;
const PIN_LENGTH = 4;

const QRScannerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { isEnabled: isNfcEnabled } = useNfcEnabled();
  const { themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens.background, themeTokens.foreground), [themeTokens.background, themeTokens.foreground]);

  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedPayload, setScannedPayload] = useState<QrLoginPayload | null>(null);
  const [pin, setPin] = useState('');
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [scanDialogVisible, setScanDialogVisible] = useState(false);
  const [verifiedAddress, setVerifiedAddress] = useState('');

  useEffect(() => {
    const status = Camera.getCameraPermissionStatus();
    setPermissionBlocked(status === 'denied' || status === 'restricted');
  }, []);

  const resetScanState = useCallback(() => {
    if (scannedPayload) {
      void notifyQrLoginProgress({
        apiBase: scannedPayload.apiBase,
        sessionId: scannedPayload.sessionId,
        status: 'waiting_qr_scan',
      });
    }

    setScannedPayload(null);
    setPin('');
    setPinDialogVisible(false);
    setScanError('');
    setVerifiedAddress('');
  }, [scannedPayload]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (scannedPayload || !codes.length) {
        return;
      }

      const raw = codes[0].value;
      if (!raw) {
        return;
      }

      try {
        const payload = parseQrLoginPayload(raw);

        void notifyQrLoginProgress({
          apiBase: payload.apiBase,
          sessionId: payload.sessionId,
          status: 'awaiting_card_scan',
        });

        setScannedPayload(payload);
        setPinDialogVisible(true);
        setScanError('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid QR login payload';
        setScanError(message);
      }
    },
  });

  const requestCameraPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      setPermissionBlocked(false);
      return;
    }

    setPermissionBlocked(true);
    Alert.alert(
      'Camera Permission Needed',
      'Enable camera access in system settings to scan QR login codes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            Linking.openSettings().catch(() => {
              Alert.alert('Error', 'Unable to open settings.');
            });
          },
        },
      ],
    );
  };

  const handleFlowScan = useCallback(async (): Promise<WalletActionResult> => {
    if (!scannedPayload) {
      return {
        ok: false,
        message: 'Missing scanned QR payload.',
      };
    }

    try {
      const proof = await createQrLoginProof(scannedPayload, pin);
      if (proof.address.toLowerCase() !== route.params.ethAddress.toLowerCase()) {
        return {
          ok: false,
          message: 'Card address does not match the active wallet in app.',
        };
      }

      await verifyQrLogin({
        apiBase: scannedPayload.apiBase,
        sessionId: scannedPayload.sessionId,
        address: proof.address,
        signatureHex: proof.signatureHex,
        recovery: proof.recovery,
      });

      setVerifiedAddress(proof.address);
      return {
        ok: true,
        message: 'QR login verified. DApp session should complete now.',
        ethAddress: proof.address,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify QR login.';
      return {
        ok: false,
        message,
      };
    }
  }, [pin, route.params.ethAddress, scannedPayload]);

  const handleScanSuccess = useCallback(() => {
    setScanDialogVisible(false);
    Alert.alert('Login Verified', 'Signature was accepted. The web dApp should finish login over websocket.', [
      {
        text: 'OK',
        onPress: () => navigation.goBack(),
      },
    ]);
  }, [navigation]);

  const canSubmitPin = pin.length === PIN_LENGTH && Boolean(scannedPayload) && !scanDialogVisible;

  const handlePinConfirm = useCallback(() => {
    if (!canSubmitPin) {
      return;
    }

    setPinDialogVisible(false);
    setScanDialogVisible(true);
  }, [canSubmitPin]);

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>QR Scanner</Text>
      <Text style={styles.payload}>Scan QR, enter password, then confirm scan card.</Text>

      {!hasPermission ? (
        <View>
          <Pressable
            style={styles.button}
            onPress={() => {
              requestCameraPermission().catch(() => undefined);
            }}
          >
            <Text style={styles.buttonText}>Grant Camera Permission</Text>
          </Pressable>
          {permissionBlocked ? <Text style={styles.payload}>Permission denied. Open Settings to enable camera.</Text> : null}
        </View>
      ) : !device ? (
        <Text style={styles.payload}>No camera device available.</Text>
      ) : (
        <>
          <View style={styles.cameraWrapper}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={!scanDialogVisible && !verifiedAddress}
              codeScanner={codeScanner}
            />
          </View>

          {scannedPayload ? (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Scanned Session</Text>
              <Text style={styles.payload}>sessionId: {scannedPayload.sessionId}</Text>
              <Text style={styles.payload}>nonce: {scannedPayload.nonce}</Text>
              <Text style={styles.payload}>api: {scannedPayload.apiBase}</Text>

              <Pressable style={styles.secondaryButton} onPress={resetScanState}>
                <Text style={styles.secondaryButtonText}>Scan Another QR</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.payload}>Waiting for QR payload...</Text>
          )}
        </>
      )}

      {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
      {verifiedAddress ? <Text style={styles.successText}>Verified address: {verifiedAddress}</Text> : null}

      <Pressable style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>

      <ScanDialog
        visible={scanDialogVisible}
        isNfcEnabled={isNfcEnabled}
        onClose={() => setScanDialogVisible(false)}
        onSuccess={handleScanSuccess}
        types="flow"
        prefilledPin={pin}
        onFlowScan={handleFlowScan}
      />

      <Modal visible={pinDialogVisible} transparent animationType="fade" onRequestClose={() => setPinDialogVisible(false)}>
        <View style={styles.pinDialogBackdrop}>
          <View style={styles.pinDialogCard}>
            <Text style={styles.pinDialogTitle}>Enter Password</Text>
            <Text style={styles.payload}>Use your wallet PIN to continue.</Text>
            <PinInput value={pin} onChange={setPin} disabled={scanDialogVisible} length={PIN_LENGTH} />
            <View style={styles.pinDialogActions}>
              <AppButton label="Cancel" variant="text" onPress={() => setPinDialogVisible(false)} />
              <AppButton label="Confirm" onPress={handlePinConfirm} disabled={!canSubmitPin} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (background: string, foreground: string) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: background,
      padding: 16,
      gap: 12,
    },
    title: {
      color: foreground,
      fontSize: 18,
      fontWeight: '700',
    },
    cameraWrapper: {
      height: 260,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#111',
    },
    detailsCard: {
      gap: 8,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#2b6cb0',
      backgroundColor: 'rgba(43, 108, 176, 0.08)',
    },
    detailsTitle: {
      color: foreground,
      fontSize: 14,
      fontWeight: '700',
    },
    button: {
      backgroundColor: '#2b6cb0',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    buttonText: {
      color: '#fff',
      fontWeight: '700',
    },
    payload: {
      color: foreground,
      fontSize: 12,
    },
    errorText: {
      color: '#d64545',
      fontSize: 12,
    },
    successText: {
      color: '#2f855a',
      fontSize: 12,
      fontWeight: '600',
    },
    secondaryButton: {
      alignSelf: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#2b6cb0',
    },
    secondaryButtonText: {
      color: '#2b6cb0',
      fontWeight: '700',
    },
    pinDialogBackdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      padding: 20,
    },
    pinDialogCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: background,
      borderRadius: 14,
      padding: 16,
      gap: 10,
    },
    pinDialogTitle: {
      color: foreground,
      fontSize: 16,
      fontWeight: '700',
    },
    pinDialogActions: {
      marginTop: 8,
      gap: 8,
    },
  });

export default QRScannerScreen;
