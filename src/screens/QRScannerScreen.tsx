import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { AppButton } from '../components/AppButton';
import { PinInput } from '../components/ui/PinInput';
import { ScanDialog } from '../components/ui/ScanDialog';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import { verifyQrLoginWithOneTapVerification } from '../services/qrAuthFlowService';
import { createPoolViaQrOneTap } from '../services/qrCreateGroupFlowService';
import { executePoolActionViaQrOneTap } from '../services/qrPoolActionFlowService';
import { isQrFlowCancelledError } from '../services/qrFlowCommonService';
import { parseQrLoginPayload, type QrLoginPayload } from '../services/qrPayloadParserService';
import { notifyQrLoginProgress } from '../services/qrSessionProgressService';
import { registerUsernameRelayerOneTap } from '../services/qrUsernameFlowService';
import { pauseActivitySync, resumeActivitySync } from '../services/activitySyncService';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.QRScanner>;
const PIN_LENGTH = 4;

const toFriendlyStageStatus = (raw: string): string => {
  const message = String(raw ?? '').trim();
  if (!message) {
    return 'Processing your request...';
  }

  const lower = message.toLowerCase();
  if (lower.includes('waiting for transaction confirmation') || lower.includes('pending confirmation')) {
    return 'Finalizing your request...';
  }
  if (lower.includes('broadcast') || lower.includes('submit') || lower.includes('sending transaction')) {
    return 'Sending your request...';
  }
  if (lower.includes('precheck') || lower.includes('simulate')) {
    return 'Checking request details...';
  }
  if (lower.includes('sync') || lower.includes('backend')) {
    return 'Updating your group data...';
  }
  if (lower.includes('nfc') || lower.includes('card')) {
    return 'Hold your card near the phone...';
  }
  if (lower.includes('0x') || lower.includes('sessionid') || lower.includes('selector')) {
    return 'Processing your request...';
  }

  return message;
};

const toFriendlyFlowError = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return 'Could not complete this request. Please try again.';
  }

  const lower = message.toLowerCase();
  if (lower.includes('pin') && (lower.includes('invalid') || lower.includes('incorrect'))) {
    return 'Incorrect PIN. Please try again.';
  }
  if (lower.includes('nfc') || lower.includes('card') || lower.includes('transport')) {
    return 'Card not detected. Hold it close to your phone and try again.';
  }
  if (
    lower.includes('sequence')
    || lower.includes('nonce')
    || lower.includes('rpc')
    || lower.includes('eth_sendrawtransaction')
    || lower.includes('selector')
    || lower.includes('invalid parameters')
    || lower.includes('payload')
    || lower.includes('sessionid')
  ) {
    return 'Network is busy right now. Please wait a moment and try again.';
  }
  if (lower.includes('expired qr') || lower.includes('invalid qr') || lower.includes('unsupported qr')) {
    return 'This QR code is invalid or expired. Please refresh QR on the dApp.';
  }

  return message;
};

const resolveRequestTypeLabel = (payload: QrLoginPayload): string => {
  if (payload.feature === 'chainora-native-wallet:create-pool') {
    return 'Create Group';
  }
  if (payload.feature === 'chainora-native-wallet:pool-action') {
    return 'Group Action';
  }
  if (payload.feature === 'username.register' || payload.feature === 'username.set_primary') {
    return 'Username';
  }
  return 'Sign In';
};

const resolveRequestTitle = (payload: QrLoginPayload): string => {
  if (payload.feature === 'chainora-native-wallet:create-pool') {
    return 'Approve create group request';
  }
  if (payload.feature === 'chainora-native-wallet:pool-action') {
    return payload.poolAction?.label?.trim()
      ? `Approve ${payload.poolAction.label}`
      : 'Approve group action';
  }
  if (payload.feature === 'username.set_primary') {
    return 'Set primary username';
  }
  if (payload.feature === 'username.register') {
    return 'Register username';
  }
  return 'Approve sign in request';
};

const resolveRequestDescription = (payload: QrLoginPayload): string => {
  if (payload.feature === 'chainora-native-wallet:create-pool') {
    const groupName = payload.createPool?.groupName?.trim();
    return groupName
      ? `Group: ${groupName}`
      : 'You will create a new savings group.';
  }
  if (payload.feature === 'username.register' || payload.feature === 'username.set_primary') {
    return payload.username?.trim()
      ? `Username: ${payload.username}`
      : 'You are confirming a username request.';
  }
  return 'Enter your wallet PIN, then tap your card to continue.';
};

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
  const flowInProgressRef = React.useRef(false);
  const flowCancelRequestedRef = React.useRef(false);
  const flowMainTxSubmittedRef = React.useRef(false);

  useEffect(() => {
    const status = Camera.getCameraPermissionStatus();
    setPermissionBlocked(status === 'denied' || status === 'restricted');
  }, []);

  const resetScanState = useCallback(() => {
    if (scannedPayload?.sessionId) {
      notifyQrLoginProgress({
        apiBase: scannedPayload.apiBase,
        sessionId: scannedPayload.sessionId,
        status: 'waiting_qr_scan',
      }).catch(() => undefined);
    }

    setScannedPayload(null);
    setPin('');
    setPinDialogVisible(false);
    setScanError('');
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

        if (payload.sessionId) {
          notifyQrLoginProgress({
            apiBase: payload.apiBase,
            sessionId: payload.sessionId,
            status: 'awaiting_card_scan',
          }).catch(() => undefined);
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

  const handleFlowScan = useCallback(async (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
    if (!scannedPayload) {
      return {
        ok: false,
        message: 'Missing QR request. Please scan again.',
      };
    }

    flowInProgressRef.current = true;
    flowCancelRequestedRef.current = false;
    flowMainTxSubmittedRef.current = false;

    const setFriendlyStageStatus = (status: string) => {
      setStageStatus(toFriendlyStageStatus(status));
    };

    try {
      if (scannedPayload.feature === 'username.register' || scannedPayload.feature === 'username.set_primary') {
        const isPrimarySelection = scannedPayload.feature === 'username.set_primary';
        setFriendlyStageStatus(
          isPrimarySelection
            ? 'Preparing primary username request...'
            : 'Preparing username request...',
        );
        const registerResult = await registerUsernameRelayerOneTap({
          payload: scannedPayload,
          pin,
          expectedAddress: route.params.ethAddress,
          onProgress: setFriendlyStageStatus,
        });
        setScanError('');
        return {
          ok: true,
          message: isPrimarySelection
            ? 'Primary username updated successfully.'
            : 'Username registered successfully.',
          ethAddress: registerResult.address ?? route.params.ethAddress,
        };
      }

      if (scannedPayload.feature === 'chainora-native-wallet:create-pool') {
        pauseActivitySync();
        try {
          setFriendlyStageStatus('Preparing create group request...');
          const createResult = await createPoolViaQrOneTap({
            payload: scannedPayload,
            pin,
            expectedAddress: route.params.ethAddress,
            onProgress: setFriendlyStageStatus,
            isCancelled: () => flowCancelRequestedRef.current,
            onMainTxSubmitted: () => {
              flowMainTxSubmittedRef.current = true;
            },
          });

          setScanError('');
          return {
            ok: true,
            message: 'Group created successfully.',
            ethAddress: createResult.address ?? route.params.ethAddress,
          };
        } finally {
          resumeActivitySync();
        }
      }

      if (scannedPayload.feature === 'chainora-native-wallet:pool-action') {
        pauseActivitySync();
        try {
          setFriendlyStageStatus('Preparing group action...');
          const actionResult = await executePoolActionViaQrOneTap({
            payload: scannedPayload,
            pin,
            expectedAddress: route.params.ethAddress,
            onProgress: setFriendlyStageStatus,
            isCancelled: () => flowCancelRequestedRef.current,
            onMainTxSubmitted: () => {
              flowMainTxSubmittedRef.current = true;
            },
          });

          const actionLabel = scannedPayload.poolAction?.label?.trim() || 'Group action';
          setScanError('');
          return {
            ok: true,
            message: `${actionLabel} completed successfully.`,
            ethAddress: actionResult.address ?? route.params.ethAddress,
          };
        } finally {
          resumeActivitySync();
        }
      }

      const sessionId = scannedPayload.sessionId?.trim();
      if (!sessionId) {
        throw new Error('Missing QR session.');
      }

      setFriendlyStageStatus('Preparing sign in...');
      const verifyResult = await verifyQrLoginWithOneTapVerification({
        payload: scannedPayload,
        pin,
        expectedAddress: route.params.ethAddress,
        onProgress: status => {
          setFriendlyStageStatus(status);
        },
      });

      setScanError('');
      return {
        ok: true,
        message: 'Sign in approved successfully.',
        ethAddress: verifyResult.address ?? route.params.ethAddress,
      };
    } catch (error) {
      const cancelledByUser = isQrFlowCancelledError(error);
      const message = cancelledByUser
        ? 'Request was cancelled.'
        : toFriendlyFlowError(error);

      if (
        (scannedPayload.feature === 'chainora-native-wallet:create-pool'
          || scannedPayload.feature === 'chainora-native-wallet:pool-action')
        && scannedPayload.sessionId?.trim()
      ) {
        notifyQrLoginProgress({
          apiBase: scannedPayload.apiBase,
          sessionId: scannedPayload.sessionId.trim(),
          status: scannedPayload.feature === 'chainora-native-wallet:pool-action'
            ? 'pool_action_failed'
            : 'create_pool_failed',
        }).catch(() => undefined);
      }

      setScanError(message);
      return {
        ok: false,
        message,
      };
    } finally {
      flowInProgressRef.current = false;
      flowCancelRequestedRef.current = false;
      flowMainTxSubmittedRef.current = false;
    }
  }, [pin, route.params.ethAddress, scannedPayload]);

  const handleCloseScanDialog = useCallback(() => {
    if (flowInProgressRef.current) {
      if (flowMainTxSubmittedRef.current) {
        Alert.alert(
          'Request is being processed',
          'Your request has already been sent. Closing now will not cancel it.',
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
    const successText = details?.result?.message || 'Request completed successfully.';
    Alert.alert('Sign Completed', successText, [
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
      <Text style={styles.title}>Scan QR</Text>
      <Text style={styles.subtitle}>Scan the code from Chainora dApp, enter PIN, then tap your card to approve.</Text>

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
              <Text style={styles.requestBadge}>{resolveRequestTypeLabel(scannedPayload)}</Text>
              <Text style={styles.detailsTitle}>{resolveRequestTitle(scannedPayload)}</Text>
              <Text style={styles.payload}>{resolveRequestDescription(scannedPayload)}</Text>
              <Text style={styles.payload}>You can scan another QR if this is not your request.</Text>

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
            <Text style={styles.payload}>Use your wallet PIN, then tap your card to approve this request.</Text>
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
