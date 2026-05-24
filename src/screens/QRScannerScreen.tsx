import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { PinInput } from '../components/ui/PinInput';
import { PinGhostButton } from '../components/ui/pinTheme';
import { useAuth } from '../features/auth';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { withVerifiedWalletSession, type WalletActionResult } from '../services/cardService';
import { parseWalletRelayPairingUri } from '../services/walletRelayUri';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';
import type { WalletRelayPairingPayload } from '../services/walletRelayProtocol';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.QRScanner>;
const PIN_LENGTH = 4;
const FRAME_SIZE = 240;
const LASER_TRAVEL = FRAME_SIZE - 26;

const coerceHexAddress = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const normalizedPrefix = trimmed.replace(/^0X/, '0x');
  if (/^0x[0-9a-fA-F]{40}$/.test(normalizedPrefix)) {
    return normalizedPrefix;
  }
  if (/^[0-9a-fA-F]{40}$/.test(normalizedPrefix)) {
    return `0x${normalizedPrefix}`;
  }

  return normalizedPrefix;
};

const toFriendlyPairingError = (
  raw: unknown,
  translate: (key: any) => string,
): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return translate('qrErrorCompletePairing');
  }

  const lower = message.toLowerCase();
  if (lower.includes('unsupported qr') || lower.includes('pairing uri')) {
    return translate('qrErrorInvalidPairingQr');
  }
  if (lower.includes('pin')) {
    return translate('qrErrorPinInvalid');
  }
  if (lower.includes('timed out')) {
    return translate('qrErrorTimedOut');
  }
  if (lower.includes('login_scan_required')) {
    return translate('qrErrorLoginScanRequired');
  }
  if (lower.includes('relay') || lower.includes('websocket')) {
    return translate('qrErrorRelayConnection');
  }

  return message;
};

const QRScannerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { session } = useAuth();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);

  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [scanError, setScanError] = useState('');
  const [pairingPayload, setPairingPayload] = useState<WalletRelayPairingPayload | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolvedCardAddress, setResolvedCardAddress] = useState('');
  const pairingFlowLockRef = useRef(false);

  const laser = useRef(new Animated.Value(0)).current;
  const laserTranslateY = laser.interpolate({
    inputRange: [0, 1],
    outputRange: [0, LASER_TRAVEL],
  });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laser, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(laser, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [laser]);

  useEffect(() => {
    const status = Camera.getCameraPermissionStatus();
    setPermissionBlocked(status === 'denied' || status === 'restricted');
  }, []);

  useEffect(() => {
    return () => {
      if (pairingFlowLockRef.current) {
        pairingFlowLockRef.current = false;
        walletRelaySessionManager.endPairingFlow();
      }
    };
  }, []);

  const resetScanState = useCallback(() => {
    setPairingPayload(null);
    setPin('');
    setResolvedCardAddress('');
    setSubmitting(false);
    setScanError('');
    if (pairingFlowLockRef.current) {
      pairingFlowLockRef.current = false;
      walletRelaySessionManager.endPairingFlow();
    }
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (pairingPayload || !codes.length || submitting) {
        return;
      }

      const raw = codes[0].value;
      if (!raw) {
        return;
      }

      console.log('[wallet-relay][scanner] qr.detected', {
        codes: codes.length,
        rawLength: raw.length,
        rawPreview: raw.slice(0, 220),
      });

      try {
        const parsed = parseWalletRelayPairingUri(raw);
        console.log('[wallet-relay][scanner] qr.parsed', {
          sessionIdPreview: `${parsed.sessionId.slice(0, 8)}...`,
          chainId: parsed.chainId,
          relayWsBase: parsed.relayWsBase,
          version: parsed.version,
        });
        setPairingPayload(parsed);
        setScanError('');
      } catch (error) {
        console.warn('[wallet-relay][scanner] qr.parse_failed', {
          message: error instanceof Error ? error.message : String(error),
          rawPreview: raw.slice(0, 220),
        });
        setScanError(toFriendlyPairingError(error, t));
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
      t('qrCameraPermissionTitle'),
      t('qrCameraPermissionMessage'),
      [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('scanOpenSettings'),
          onPress: () => {
            Linking.openSettings().catch(() => {
              Alert.alert(t('qrErrorTitle'), t('qrErrorOpenSettings'));
            });
          },
        },
      ],
    );
  };

  const canSubmitPin = pin.length === PIN_LENGTH && Boolean(pairingPayload) && !submitting;

  const handlePairConfirm = useCallback(async () => {
    if (!pairingPayload || !canSubmitPin) {
      return;
    }

    setScanError('');
    setSubmitting(true);
    const flowId = registerScanCardFlow({
      isNfcEnabled: isEnabled,
      flowType: 'flow',
      prefilledPin: pin,
      onFlowScan: executePairFlow,
      onSuccess: async ({ result }: { result: WalletActionResult }) => {
        const cardAddress = (result.ethAddress || resolvedCardAddress || '').trim();
        console.log('[wallet-relay][scanner] pair.success', {
          sessionIdPreview: pairingPayload?.sessionId.slice(0, 8) ?? '',
          cardAddress,
        });

        setSubmitting(false);
        setScanError('');
        if (pairingFlowLockRef.current) {
          pairingFlowLockRef.current = false;
          walletRelaySessionManager.endPairingFlow();
        }

        navigation.pop(2);
      },
      onClose: () => {
        setSubmitting(false);
        if (pairingFlowLockRef.current) {
          pairingFlowLockRef.current = false;
          walletRelaySessionManager.endPairingFlow();
        }
      },
    });
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [canSubmitPin, pairingPayload]);

  const executePairFlow = useCallback(async (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
    if (!pairingPayload) {
      return {
        ok: false,
        message: t('qrErrorPairingMissing'),
      };
    }

    if (!pairingFlowLockRef.current) {
      pairingFlowLockRef.current = true;
      walletRelaySessionManager.beginPairingFlow();
    }
    try {
      setStageStatus(t('qrStatusVerifyingCardPin'));
      const result = await withVerifiedWalletSession(pin, async session => {
        const coerced = coerceHexAddress(String(session.ethAddress ?? ''));
        console.log('[wallet-relay][scanner] card.session', {
          sessionIdPreview: `${pairingPayload.sessionId.slice(0, 8)}...`,
          publicKeyPreview: `${session.publicKeyHex.slice(0, 12)}...${session.publicKeyHex.slice(-8)}`,
          ethAddressRaw: session.ethAddress,
          ethAddressCoerced: coerced,
          rawLength: String(session.ethAddress ?? '').length,
        });
        setStageStatus(t('qrStatusConnectingRelaySession'));
        return walletRelaySessionManager.pairAndApproveConnectAndLoginOnce(
          pairingPayload,
          {
            ethAddress: coerced,
            signHash: session.signHash,
          },
          {
            loginTimeoutMs: 8_000,
          },
        );
      });

      console.log('[wallet-relay][scanner] pair.start', {
        sessionIdPreview: `${pairingPayload.sessionId.slice(0, 8)}...`,
        cardAddress: result.address,
      });
      walletRelaySessionManager.setActiveAccount(result.address || route.params.ethAddress || session?.address || '');
      setResolvedCardAddress(result.address);

      return {
        ok: true,
        message: result.loginApproved
          ? t('qrStatusPairedAndLoginApproved')
          : t('qrStatusPairedReadyForRequests'),
        ethAddress: result.address,
      };
    } catch (error) {
      const friendly = toFriendlyPairingError(error, t);
      console.warn('[wallet-relay][scanner] pair.failed', {
        sessionIdPreview: pairingPayload.sessionId.slice(0, 8),
        message: error instanceof Error ? error.message : String(error),
        friendly,
      });
      return {
        ok: false,
        message: friendly,
      };
    }
  }, [pairingPayload, pin, route.params.ethAddress, session?.address, t]);

  const handlePasteUri = useCallback(async () => {
    try {
      const raw = await Clipboard.getString();
      const parsed = parseWalletRelayPairingUri(raw);
      setPairingPayload(parsed);
      setScanError('');
    } catch (error) {
      setScanError(toFriendlyPairingError(error, t));
    }
  }, [t]);

  const handlePickFromLibrary = useCallback(() => {
    Alert.alert(t('qrNotAvailableTitle'), t('qrNotAvailableMessage'));
  }, [t]);

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor="#04060B"
      />

      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {hasPermission && device ? (
          <View style={styles.cameraWrap}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={!pairingPayload}
              codeScanner={codeScanner}
            />
            <View style={styles.cameraOverlay} />
          </View>
        ) : (
          <View style={styles.fallbackWrap}>
            <Text style={styles.fallbackTitle}>{t('qrFallbackTitle')}</Text>
            <Text style={styles.fallbackSub}>
              {t('qrFallbackSubtitle')}
            </Text>
            {!hasPermission ? (
              <>
                <Pressable
                  style={styles.fallbackButton}
                  onPress={() => {
                    requestCameraPermission().catch(() => undefined);
                  }}
                >
                  <Text style={styles.fallbackButtonText}>{t('qrGrantCameraPermission')}</Text>
                </Pressable>
                {permissionBlocked ? (
                  <Text style={styles.fallbackNote}>{t('qrPermissionDeniedNote')}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.fallbackNote}>{t('qrNoCameraDevice')}</Text>
            )}
            <Pressable style={[styles.fallbackButton, styles.fallbackGhost]} onPress={() => navigation.goBack()}>
              <Text style={styles.fallbackButtonText}>{t('commonBack')}</Text>
            </Pressable>
          </View>
        )}

        {hasPermission && device ? (
          <>
            <View style={styles.topBar}>
              <Pressable style={styles.topIconBtn} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={17} color="#EAF0FB" />
              </Pressable>
              <View style={styles.topIconBtn}>
                <Ionicons name="flash-outline" size={16} color="#D6E2F5" />
              </View>
              <View pointerEvents="none" style={styles.topTitleWrap}>
                <Text style={styles.topTitle}>{t('homeScanQrTitle')}</Text>
              </View>
            </View>

            <View style={styles.frameLayer} pointerEvents="none">
              <View style={styles.scrimTop} />
              <View style={styles.scrimBottom} />
              <View style={styles.scrimLeft} />
              <View style={styles.scrimRight} />

              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
                <Animated.View
                  style={[
                    styles.laser,
                    {
                      transform: [{ translateY: laserTranslateY }],
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.frameHint}>
              <Text style={styles.frameHintTitle}>{t('qrFrameHintTitle')}</Text>
              <Text style={styles.frameHintBody}>
                {t('qrFrameHintBody')}
              </Text>
            </View>

            <View style={styles.sheet}>
              <View style={styles.flag}>
                <View style={styles.flagDot} />
                <Text style={styles.flagText}>{t('qrFlagScanning')}</Text>
              </View>

              <Text style={styles.sheetTitle}>
                {pairingPayload ? t('qrSheetPairingCaptured') : t('qrSheetAnalyzing')}
              </Text>

              <Text style={styles.sheetSub}>
                {pairingPayload
                  ? `${t('walletRelaySessionLabel')} ${pairingPayload.sessionId.slice(0, 12)}... · ${t('walletRelaySummaryChain')} ${pairingPayload.chainId}`
                  : t('qrSheetAutoDetect')}
              </Text>

              {scanError ? <Text style={styles.sheetError}>{scanError}</Text> : null}

              <View style={styles.sheetActions}>
                <Pressable style={styles.sheetButton} onPress={handlePasteUri}>
                  <Ionicons name="clipboard-outline" size={14} color="#DDE7F8" />
                  <Text style={styles.sheetButtonText}>{t('qrPasteUri')}</Text>
                </Pressable>
                <Pressable style={styles.sheetButton} onPress={handlePickFromLibrary}>
                  <Ionicons name="images-outline" size={14} color="#DDE7F8" />
                  <Text style={styles.sheetButtonText}>{t('qrFromLibrary')}</Text>
                </Pressable>
              </View>

              {pairingPayload ? (
                <Pressable style={styles.secondaryInlineButton} onPress={resetScanState}>
                  <Text style={styles.secondaryInlineButtonText}>{t('qrScanAnother')}</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        {pairingPayload ? (
          <View style={styles.pairingSheetBackdrop}>
            <View style={styles.pairingSheetCard}>
              <PinInput
                value={pin}
                onChange={setPin}
                onSubmit={() => {
                  handlePairConfirm().catch(error => {
                    console.warn('[wallet-relay][scanner] pair.confirm_failed', error);
                  });
                }}
                disabled={submitting}
                submitDisabled={!canSubmitPin || submitting}
                title={t('qrPinDialogTitle')}
                subtitle={t('qrPinDialogSubtitle')}
                ctaLabel={submitting ? t('qrPairingInProgress') : t('qrConfirmPairingAction')}
                heroIconName="qr-code-outline"
                afterActionSlot={(
                  <PinGhostButton
                    label={t('commonCancel')}
                    onPress={() => {
                      setPairingPayload(null);
                      setPin('');
                      setSubmitting(false);
                    }}
                  />
                )}
              />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#04060B',
    },
    cameraWrap: {
      ...StyleSheet.absoluteFillObject,
    },
    cameraOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(2, 6, 12, 0.12)',
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(4, 6, 11, 0.68)',
      zIndex: 30,
    },
    topIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: 'rgba(16, 23, 35, 0.8)',
      borderWidth: 1,
      borderColor: '#243248',
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitleWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 14,
      alignItems: 'center',
    },
    topTitle: {
      textAlign: 'center',
      color: '#EAF0FB',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    frameLayer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '22%',
      height: FRAME_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrimTop: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: '100%',
      height: 900,
      backgroundColor: 'rgba(3, 6, 10, 0.72)',
    },
    scrimBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '100%',
      height: 900,
      backgroundColor: 'rgba(3, 6, 10, 0.72)',
    },
    scrimLeft: {
      position: 'absolute',
      right: '50%',
      marginRight: FRAME_SIZE / 2,
      top: 0,
      bottom: 0,
      width: 900,
      backgroundColor: 'rgba(3, 6, 10, 0.72)',
    },
    scrimRight: {
      position: 'absolute',
      left: '50%',
      marginLeft: FRAME_SIZE / 2,
      top: 0,
      bottom: 0,
      width: 900,
      backgroundColor: 'rgba(3, 6, 10, 0.72)',
    },
    scanFrame: {
      width: FRAME_SIZE,
      height: FRAME_SIZE,
      borderRadius: 28,
      position: 'relative',
      overflow: 'hidden',
    },
    corner: {
      position: 'absolute',
      width: 32,
      height: 32,
      borderColor: '#4FB4FF',
      borderWidth: 3,
      shadowColor: '#4FB4FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.75,
      shadowRadius: 8,
      elevation: 3,
    },
    cornerTopLeft: {
      top: 0,
      left: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderTopLeftRadius: 18,
    },
    cornerTopRight: {
      top: 0,
      right: 0,
      borderLeftWidth: 0,
      borderBottomWidth: 0,
      borderTopRightRadius: 18,
    },
    cornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderRightWidth: 0,
      borderTopWidth: 0,
      borderBottomLeftRadius: 18,
    },
    cornerBottomRight: {
      bottom: 0,
      right: 0,
      borderLeftWidth: 0,
      borderTopWidth: 0,
      borderBottomRightRadius: 18,
    },
    laser: {
      position: 'absolute',
      left: 12,
      right: 12,
      top: 12,
      height: 2,
      borderRadius: 2,
      backgroundColor: '#4FB4FF',
      shadowColor: '#2897FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 10,
      elevation: 4,
    },
    frameHint: {
      position: 'absolute',
      left: 24,
      right: 24,
      top: '56%',
      alignItems: 'center',
    },
    frameHintTitle: {
      color: '#EAF0FB',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    frameHintBody: {
      marginTop: 4,
      color: '#A7B6CD',
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    sheet: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 46,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: '#243248',
      backgroundColor: 'rgba(14, 22, 34, 0.92)',
      padding: 16,
    },
    flag: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(79, 180, 255, 0.35)',
      backgroundColor: 'rgba(40, 151, 255, 0.13)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 6,
    },
    flagDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#2897FF',
    },
    flagText: {
      color: '#8CD0FF',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    sheetTitle: {
      color: '#EAF0FB',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    sheetSub: {
      marginTop: 4,
      color: '#A7B6CD',
      fontSize: 12,
      lineHeight: 18,
    },
    sheetError: {
      marginTop: 6,
      color: '#FF8A8A',
      fontSize: 12,
      lineHeight: 18,
    },
    sheetActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    sheetButton: {
      flex: 1,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#2C3A51',
      backgroundColor: 'rgba(17, 26, 40, 0.85)',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    sheetButtonText: {
      color: '#DDE7F8',
      fontSize: 13,
      fontWeight: '600',
    },
    secondaryInlineButton: {
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#4F6FA0',
      backgroundColor: 'rgba(79, 111, 160, 0.22)',
    },
    secondaryInlineButtonText: {
      color: '#D8E6FF',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    fallbackWrap: {
      flex: 1,
      paddingHorizontal: 22,
      justifyContent: 'center',
      gap: 12,
    },
    fallbackTitle: {
      color: '#EAF0FB',
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    fallbackSub: {
      color: '#A7B6CD',
      fontSize: 14,
      lineHeight: 20,
    },
    fallbackNote: {
      color: '#A7B6CD',
      fontSize: 13,
      lineHeight: 18,
    },
    fallbackButton: {
      height: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2F4667',
      backgroundColor: '#1B2B42',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackGhost: {
      backgroundColor: '#121A28',
      borderColor: '#233145',
    },
    fallbackButtonText: {
      color: '#EAF4FF',
      fontSize: 14,
      fontWeight: '700',
    },
    pairingSheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(2, 6, 23, 0.68)',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    pairingSheetCard: {
      borderRadius: 18,
      backgroundColor: '#0F172A',
      borderWidth: 1,
      borderColor: '#1E293B',
      padding: 16,
      gap: 12,
    },
  });

export default QRScannerScreen;
