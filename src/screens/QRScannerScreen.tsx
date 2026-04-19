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
  const [flowSuccessMessage, setFlowSuccessMessage] = useState('');
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
    setVerifiedAddress('');
    setFlowSuccessMessage('');
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

  const handleFlowScan = useCallback(async (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
    if (!scannedPayload) {
      return {
        ok: false,
        message: 'Missing scanned QR payload.',
      };
    }

    flowInProgressRef.current = true;
    flowCancelRequestedRef.current = false;
    flowMainTxSubmittedRef.current = false;

    try {
      console.log('[QRFlow] start handleFlowScan', {
        feature: scannedPayload.feature,
        sessionId: scannedPayload.sessionId,
        apiBase: scannedPayload.apiBase,
      });
      if (scannedPayload.feature === 'username.register' || scannedPayload.feature === 'username.set_primary') {
        const isPrimarySelection = scannedPayload.feature === 'username.set_primary';
        setStageStatus(
          isPrimarySelection
            ? 'Starting primary username selection flow (single card tap)...'
            : 'Starting username verification flow (single card tap)...',
        );
        const registerResult = await registerUsernameRelayerOneTap({
          payload: scannedPayload,
          pin,
          expectedAddress: route.params.ethAddress,
          onProgress: setStageStatus,
        });
        console.log('[QRFlow] username relayer flow finished');
        setVerifiedAddress(registerResult.address ?? route.params.ethAddress);
        setScanError('');
        return {
          ok: true,
          message: isPrimarySelection
            ? 'Primary username selected and card verified in one NFC session.'
            : 'Username registered and card verified in one NFC session.',
          ethAddress: registerResult.address ?? route.params.ethAddress,
        };
      } else if (scannedPayload.feature === 'chainora-native-wallet:create-pool') {
        pauseActivitySync();
        try {
          setStageStatus('Preparing create pool flow...');
          const createResult = await createPoolViaQrOneTap({
            payload: scannedPayload,
            pin,
            expectedAddress: route.params.ethAddress,
            onProgress: setStageStatus,
            isCancelled: () => flowCancelRequestedRef.current,
            onMainTxSubmitted: () => {
              flowMainTxSubmittedRef.current = true;
            },
          });

          const summary = `Pool created\nPool ID: ${createResult.poolId ?? '-'}\nPool: ${createResult.poolAddress ?? '-'}\nTx: ${createResult.txHash ?? '-'}`;
          setVerifiedAddress(createResult.address ?? route.params.ethAddress);
          setFlowSuccessMessage(summary);
          setScanError('');

          return {
            ok: true,
            message: summary,
            ethAddress: createResult.address ?? route.params.ethAddress,
          };
        } finally {
          resumeActivitySync();
        }
      } else if (scannedPayload.feature === 'chainora-native-wallet:pool-action') {
        pauseActivitySync();
        try {
          setStageStatus('Preparing pool action flow...');
          const actionResult = await executePoolActionViaQrOneTap({
            payload: scannedPayload,
            pin,
            expectedAddress: route.params.ethAddress,
            onProgress: setStageStatus,
            isCancelled: () => flowCancelRequestedRef.current,
            onMainTxSubmitted: () => {
              flowMainTxSubmittedRef.current = true;
            },
          });

          const actionLabel = scannedPayload.poolAction?.label?.trim() || 'Pool action';
          const summary = actionResult.pendingConfirmation
            ? `${actionLabel} submitted\nTx: ${actionResult.txHash ?? '-'}\nStatus: Pending confirmation (RPC slow)`
            : `${actionLabel} completed\nTx: ${actionResult.txHash ?? '-'}`;
          setVerifiedAddress(actionResult.address ?? route.params.ethAddress);
          setFlowSuccessMessage(summary);
          setScanError('');

          return {
            ok: true,
            message: summary,
            ethAddress: actionResult.address ?? route.params.ethAddress,
          };
        } finally {
          resumeActivitySync();
        }
      } else {
        const sessionId = scannedPayload.sessionId?.trim();
        if (!sessionId) {
          throw new Error('QR payload missing sessionId for auth login.');
        }

        setStageStatus('Signing login challenge and running first-login verification...');
        const verifyResult = await verifyQrLoginWithOneTapVerification({
          payload: scannedPayload,
          pin,
          expectedAddress: route.params.ethAddress,
          onProgress: status => {
            setStageStatus(status);
          },
        });
        console.log('[QRFlow] auth verify finished');

        setScanError('');
        setVerifiedAddress(verifyResult.address ?? route.params.ethAddress);
        return {
          ok: true,
          message: 'QR login verified. DApp session should complete now.',
          ethAddress: verifyResult.address ?? route.params.ethAddress,
        };
      }
    } catch (error) {
      const cancelledByUser = isQrFlowCancelledError(error);
      const message = cancelledByUser
        ? 'Flow cancelled on mobile before main transaction submission.'
        : error instanceof Error
          ? error.message
          : 'Unable to verify QR login.';
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
      console.log('[QRFlow] handleFlowScan failed', { message });
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
          'Transaction already submitted',
          'Transaction was already broadcast to Chainora. Closing now will not cancel it, and it can still confirm shortly.',
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
    const successText = details?.result?.message || flowSuccessMessage || 'Signature was accepted.';
    Alert.alert('Sign Completed', successText, [
      {
        text: 'OK',
        onPress: () => navigation.goBack(),
      },
    ]);
  }, [flowSuccessMessage, navigation]);

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
      <Text style={styles.payload}>Scan QR, enter password, then tap your NFC card to authorize and sign the requested action.</Text>

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
              <Text style={styles.detailsTitle}>Scanned Request</Text>
              <Text style={styles.payload}>feature: {scannedPayload.feature ?? 'auth.login'}</Text>
              {scannedPayload.sessionId ? <Text style={styles.payload}>sessionId: {scannedPayload.sessionId}</Text> : null}
              {scannedPayload.nonce ? <Text style={styles.payload}>nonce: {scannedPayload.nonce}</Text> : null}
              {scannedPayload.username ? <Text style={styles.payload}>username: {scannedPayload.username}</Text> : null}
              {scannedPayload.createPool ? (
                <>
                  <Text style={styles.payload}>NFC purpose: sign create pool transaction with your card</Text>
                  <Text style={styles.payload}>factory: {scannedPayload.createPool.factoryAddress}</Text>
                  <Text style={styles.payload}>
                    amount: {scannedPayload.createPool.contributionAmount}{' '}
                    {scannedPayload.createPool.contributionTokenSymbol ?? 'tcUSD'}
                  </Text>
                  <Text style={styles.payload}>members: {scannedPayload.createPool.targetMembers}</Text>
                </>
              ) : null}
              {scannedPayload.poolAction ? (
                <>
                  <Text style={styles.payload}>NFC purpose: sign pool action transaction with your card</Text>
                  {scannedPayload.poolAction.label ? (
                    <Text style={styles.payload}>action: {scannedPayload.poolAction.label}</Text>
                  ) : null}
                  <Text style={styles.payload}>to: {scannedPayload.poolAction.to}</Text>
                </>
              ) : null}
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
            <Text style={styles.payload}>Use your wallet PIN, then tap NFC card to sign the request from this QR.</Text>
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
