import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAddress } from 'viem';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { AppButton } from '../components/AppButton';
import { PinInput } from '../components/ui/PinInput';
import { ScanDialog } from '../components/ui/ScanDialog';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { useWalletConnect } from '../features/walletconnect';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import { verifyCardAttestationForCreatePool } from '../services/qrCreateGroupDeviceVerificationService';
import { DEVICE_ATTEST_QR_FEATURE } from '../services/qr-login/constants';
import { parseQrLoginPayload, type QrLoginPayload } from '../services/qrPayloadParserService';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.QRScanner>;
const PIN_LENGTH = 4;

const toFriendlyStageStatus = (raw: string): string => {
  const message = String(raw ?? '').trim();
  if (!message) {
    return 'Processing device attestation...';
  }

  const lower = message.toLowerCase();
  if (lower.includes('challenge')) {
    return 'Preparing challenge...';
  }
  if (lower.includes('attestation proof')) {
    return 'Generating card attestation proof...';
  }
  if (lower.includes('submitting on-chain') || lower.includes('verification transaction')) {
    return 'Submitting on-chain verification...';
  }
  if (lower.includes('confirmation') || lower.includes('receipt')) {
    return 'Waiting for confirmation...';
  }
  if (lower.includes('nfc') || lower.includes('card')) {
    return 'Hold your card near the phone...';
  }

  return message;
};

const toFriendlyFlowError = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return 'Could not complete device attestation. Please try again.';
  }

  const lower = message.toLowerCase();
  if (lower.includes('pin') && (lower.includes('invalid') || lower.includes('incorrect'))) {
    return 'Incorrect PIN. Please try again.';
  }
  if (lower.includes('nfc') || lower.includes('card') || lower.includes('transport')) {
    return 'Card not detected. Hold it close to your phone and try again.';
  }
  if (lower.includes('invalid qr') || lower.includes('unsupported qr') || lower.includes('missing')) {
    return 'This QR is not a valid device-attestation request.';
  }
  if (
    lower.includes('rpc')
    || lower.includes('nonce')
    || lower.includes('sequence')
    || lower.includes('network')
    || lower.includes('timed out')
  ) {
    return 'Network is busy right now. Please wait a moment and try again.';
  }

  return message;
};

const normalizeWalletConnectError = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return 'WalletConnect pairing failed.';
  }
  return message;
};

const isFlowCancelledError = (raw: unknown): boolean => {
  const message = raw instanceof Error ? raw.message : String(raw ?? '');
  const lower = message.toLowerCase();
  return lower.includes('cancel') || lower.includes('cancelled');
};

const resolveRequestDescription = (payload: QrLoginPayload): string => {
  const requestId = payload.deviceAttest?.requestId?.trim() || '';
  const shortRequestId = requestId.length > 14
    ? `${requestId.slice(0, 8)}...${requestId.slice(-4)}`
    : requestId;
  return shortRequestId
    ? `Request ID: ${shortRequestId}`
    : 'Device verification request';
};

const isWalletConnectPayload = (raw: string): boolean => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('wc:')) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return lower.includes('uri=wc%3a') || lower.includes('uri=wc:') || lower.startsWith('chainora://wc');
};

const QRScannerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { isEnabled: isNfcEnabled } = useNfcEnabled();
  const { themeTokens } = useSettings();
  const { showToast } = useToast();
  const { pairWithInput, latestStatus: walletConnectStatus, latestError: walletConnectError } = useWalletConnect();
  const styles = useMemo(() => createStyles(themeTokens.background, themeTokens.foreground), [themeTokens.background, themeTokens.foreground]);

  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedPayload, setScannedPayload] = useState<QrLoginPayload | null>(null);
  const [isWalletConnectPairing, setIsWalletConnectPairing] = useState(false);
  const [pin, setPin] = useState('');
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [scanDialogVisible, setScanDialogVisible] = useState(false);
  const flowInProgressRef = React.useRef(false);
  const flowCancelRequestedRef = React.useRef(false);
  const flowMainTxSubmittedRef = React.useRef(false);
  const scannedPayloadRef = useRef<QrLoginPayload | null>(null);
  const walletConnectScanLockRef = useRef(false);
  const walletConnectScanCooldownUntilRef = useRef(0);

  useEffect(() => {
    const status = Camera.getCameraPermissionStatus();
    setPermissionBlocked(status === 'denied' || status === 'restricted');
  }, []);

  useEffect(() => {
    scannedPayloadRef.current = scannedPayload;
  }, [scannedPayload]);

  const resetScanState = useCallback(() => {
    setScannedPayload(null);
    setPin('');
    setPinDialogVisible(false);
    setScanError('');
  }, []);

  const handleWalletConnectPair = useCallback(async (rawInput: string) => {
    const now = Date.now();
    if (walletConnectScanLockRef.current || now < walletConnectScanCooldownUntilRef.current) {
      return;
    }

    walletConnectScanLockRef.current = true;
    walletConnectScanCooldownUntilRef.current = now + 2_500;
    setIsWalletConnectPairing(true);
    setScanError('');

    try {
      await pairWithInput(rawInput, route.params.ethAddress);
      showToast('Connecting to dApp... review the session request.', 'info');
    } catch (error) {
      setScanError(normalizeWalletConnectError(error));
    } finally {
      setIsWalletConnectPairing(false);
      walletConnectScanLockRef.current = false;
    }
  }, [pairWithInput, route.params.ethAddress, showToast]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (
        scannedPayloadRef.current
        || walletConnectScanLockRef.current
        || !codes.length
      ) {
        return;
      }

      const raw = codes[0].value;
      if (!raw) {
        return;
      }

      if (isWalletConnectPayload(raw)) {
        void handleWalletConnectPair(raw);
        return;
      }

      try {
        const payload = parseQrLoginPayload(raw);
        if (payload.feature !== DEVICE_ATTEST_QR_FEATURE || !payload.deviceAttest) {
          throw new Error('Unsupported QR feature');
        }

        setScannedPayload(payload);
        setPinDialogVisible(true);
        setScanError('');
      } catch (error) {
        setScanError(toFriendlyFlowError(error));
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
      'Enable camera access in system settings to scan attestation QR codes.',
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

  const handleFlowScan = useCallback(async (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
    if (!scannedPayload || scannedPayload.feature !== DEVICE_ATTEST_QR_FEATURE || !scannedPayload.deviceAttest) {
      return {
        ok: false,
        message: 'Missing device-attestation request. Please scan again.',
      };
    }

    flowInProgressRef.current = true;
    flowCancelRequestedRef.current = false;
    flowMainTxSubmittedRef.current = false;

    const setFriendlyStageStatus = (status: string) => {
      setStageStatus(toFriendlyStageStatus(status));
    };

    try {
      const expectedAddress = getAddress(route.params.ethAddress);
      const requestedAddress = getAddress(scannedPayload.deviceAttest.address);
      if (requestedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
        throw new Error('Device-attestation QR is for a different wallet address.');
      }

      setFriendlyStageStatus('Preparing device attestation...');
      await verifyCardAttestationForCreatePool({
        apiBase: scannedPayload.deviceAttest.apiBase?.trim() || scannedPayload.apiBase,
        pin,
        expectedAddress,
        factoryAddress: getAddress(scannedPayload.deviceAttest.factoryAddress),
        onProgress: setFriendlyStageStatus,
        isCancelled: () => flowCancelRequestedRef.current,
        txSubmitPolicy: 'strict',
      });

      flowMainTxSubmittedRef.current = true;
      setScanError('');
      return {
        ok: true,
        message: 'Device attestation completed successfully.',
        ethAddress: expectedAddress,
      };
    } catch (error) {
      const cancelledByUser = isFlowCancelledError(error);
      const message = cancelledByUser
        ? 'Request was cancelled.'
        : toFriendlyFlowError(error);

      setScanError(message);
      return {
        ok: false,
        message,
      };
    } finally {
      flowInProgressRef.current = false;
      flowCancelRequestedRef.current = false;
    }
  }, [pin, route.params.ethAddress, scannedPayload]);

  const handleCloseScanDialog = useCallback(() => {
    if (flowInProgressRef.current) {
      if (flowMainTxSubmittedRef.current) {
        Alert.alert(
          'Request is being processed',
          'Your attestation transaction has already been sent. Closing now will not cancel it.',
          [
            {
              text: 'Keep waiting',
              style: 'cancel',
            },
            {
              text: 'Close anyway',
              style: 'destructive',
              onPress: () => {
                setScanDialogVisible(false);
              },
            },
          ],
        );
        return;
      }

      flowCancelRequestedRef.current = true;
    }

    setScanDialogVisible(false);
  }, []);

  const handleScanSuccess = useCallback((details?: { result: WalletActionResult }) => {
    setScanDialogVisible(false);
    const successText = details?.result?.message || 'Device attestation completed successfully.';
    Alert.alert('Attestation Completed', successText, [
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

  const pasteWalletConnectUri = useCallback(() => {
    void (async () => {
      const clipboardValue = (await Clipboard.getString()).trim();
      if (!clipboardValue) {
        setScanError('Clipboard is empty. Copy a wc: URI first.');
        return;
      }
      await handleWalletConnectPair(clipboardValue);
    })();
  }, [handleWalletConnectPair]);

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>Scan QR</Text>
      <Text style={styles.subtitle}>Scan WalletConnect QR (pairing) or device-attestation QR.</Text>

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
              isActive={!scanDialogVisible}
              codeScanner={codeScanner}
            />
          </View>

          {scannedPayload ? (
            <View style={styles.detailsCard}>
              <Text style={styles.requestBadge}>Device Attestation</Text>
              <Text style={styles.detailsTitle}>Verify card device</Text>
              <Text style={styles.payload}>{resolveRequestDescription(scannedPayload)}</Text>
              <Text style={styles.payload}>Enter wallet PIN and tap card to complete verification.</Text>

              <Pressable style={styles.secondaryButton} onPress={resetScanState}>
                <Text style={styles.secondaryButtonText}>Scan Another QR</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>WalletConnect pairing</Text>
              <Text style={styles.payload}>Scan WC QR from dApp/desktop, or paste wc URI from clipboard.</Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={pasteWalletConnectUri}
                disabled={isWalletConnectPairing}
              >
                <Text style={styles.secondaryButtonText}>
                  {isWalletConnectPairing ? 'Pairing...' : 'Paste WalletConnect URI'}
                </Text>
              </Pressable>
              <Text style={styles.walletConnectStatus}>Status: {walletConnectStatus}</Text>
              {walletConnectError ? <Text style={styles.errorText}>{walletConnectError}</Text> : null}
            </View>
          )}
        </>
      )}

      {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}

      <Pressable style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>

      <ScanDialog
        visible={scanDialogVisible}
        isNfcEnabled={isNfcEnabled}
        onClose={handleCloseScanDialog}
        onSuccess={handleScanSuccess}
        types="flow"
        prefilledPin={pin}
        onFlowScan={handleFlowScan}
      />

      <Modal visible={pinDialogVisible} transparent animationType="fade" onRequestClose={() => setPinDialogVisible(false)}>
        <View style={styles.pinDialogBackdrop}>
          <View style={styles.pinDialogCard}>
            <Text style={styles.pinDialogTitle}>Enter Password</Text>
            <Text style={styles.payload}>Use your wallet PIN, then tap your card to complete device attestation.</Text>
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
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 14,
      gap: 14,
    },
    title: {
      color: foreground,
      fontSize: 24,
      fontWeight: '700',
    },
    subtitle: {
      color: `${foreground}CC`,
      fontSize: 13,
      lineHeight: 20,
      marginTop: -6,
    },
    cameraWrapper: {
      height: 280,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#111',
      borderWidth: 1,
      borderColor: '#334155',
    },
    detailsCard: {
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#1d4ed8',
      backgroundColor: 'rgba(29, 78, 216, 0.10)',
    },
    requestBadge: {
      alignSelf: 'flex-start',
      color: '#dbeafe',
      backgroundColor: '#1e40af',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: '700',
      overflow: 'hidden',
    },
    detailsTitle: {
      color: foreground,
      fontSize: 16,
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
      fontSize: 13,
      lineHeight: 19,
    },
    errorText: {
      color: '#d64545',
      fontSize: 13,
      lineHeight: 18,
    },
    secondaryButton: {
      alignSelf: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#1d4ed8',
    },
    secondaryButtonText: {
      color: '#1d4ed8',
      fontWeight: '700',
    },
    walletConnectStatus: {
      color: foreground,
      fontSize: 12,
      lineHeight: 18,
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
