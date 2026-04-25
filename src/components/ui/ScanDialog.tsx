import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import NfcManager from 'react-native-nfc-manager';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinInput } from './PinInput';
import { useSettings } from '../../features/settings';
import { initialiseWallet, signInWallet, WalletActionResult, WalletActionCode } from '../../services/cardService';
import { ToastType } from '../Toast';

export type ScanMode = 'init' | 'signin';
export type ScanDialogTypes = 'auth' | 'flow';

type ModeOption = {
  value: ScanMode;
};

type ScanDialogProps = {
  visible: boolean;
  isNfcEnabled: boolean | null;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
  onScanningChange?: (isScanning: boolean) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onSuccess?: (details: { result: WalletActionResult; mode: ScanMode }) => void | Promise<void>;
  initialMode?: ScanMode;
  prefilledPin?: string;
  types?: ScanDialogTypes;
  onFlowScan?: (setStageStatus: (status: string) => void) => Promise<WalletActionResult>;
  autoStartDelayMs?: number;
};

type ScanPhase = 'pin' | 'working' | 'success' | 'error';

const PIN_LENGTH = 4;

const MODE_OPTIONS: ModeOption[] = [
  { value: 'init' },
  { value: 'signin' },
];

const AnimatedText = Animated.createAnimatedComponent(Text);

const SPRING_CONFIG = { tension: 120, friction: 14, useNativeDriver: true };
const BEZIER_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

const COLORS = {
  overlay: 'rgba(3, 5, 9, 0.78)',
  dialog: '#11161F',
  surface: '#171C27',
  surfaceAlt: '#1E2431',
  border: '#272E3E',
  borderStrong: '#384053',
  text: '#E8ECF3',
  textSecondary: '#B6BDCC',
  textMuted: '#7A829A',
  textLow: '#525B73',
  signal: '#0A7CF2',
  signalBright: '#2897FF',
  success: '#10B981',
};

const suggestionForCode = (
  _mode: ScanMode,
  code: WalletActionCode | undefined,
  translate: (key: any) => string,
): string | null => {
  switch (code) {
    case 'PIN_ALREADY_INITIALISED':
      return translate('scanHintSwitchToSignin');
    case 'PIN_NOT_INITIALISED':
      return translate('scanHintRunInitFirst');
    case 'PIN_INVALID':
      return translate('scanHintPinInvalid');
    case 'TRANSPORT_ERROR':
      return translate('scanHintKeepCardClose');
    default:
      return null;
  }
};

const toFriendlyMessage = (raw: string, fallback: string): string => {
  const message = String(raw ?? '').trim();
  if (!message) {
    return fallback;
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('session')
    || lower.includes('payload')
    || lower.includes('selector')
    || lower.includes('nonce')
    || lower.includes('rpc')
    || lower.includes('sequence')
    || lower.includes('status word')
    || lower.includes('sw:')
    || lower.includes('eth_sendrawtransaction')
    || lower.includes('tx ')
    || /0x[a-f0-9]{10,}/i.test(message)
  ) {
    return fallback;
  }

  return message.length > 140 ? fallback : message;
};

const SuccessIcon = ({ color }: { color: string }) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.successCore, { borderColor: color, transform: [{ scale }] }]}> 
      <Ionicons name="checkmark" size={32} color={color} />
    </Animated.View>
  );
};

export const ScanDialog: React.FC<ScanDialogProps> = ({
  visible,
  isNfcEnabled,
  onClose,
  onStatusChange,
  onScanningChange,
  onShowToast,
  onSuccess,
  initialMode,
  prefilledPin,
  types = 'auth',
  onFlowScan,
  autoStartDelayMs = 180,
}) => {
  const { t } = useSettings();
  const [mode, setMode] = useState<ScanMode>(initialMode ?? 'init');
  const [pinValue, setPinValue] = useState('');
  const [pinStage, setPinStage] = useState<'create' | 'confirm'>('create');
  const [confirmPinValue, setConfirmPinValue] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('pin');
  const [statusMessage, setStatusMessage] = useState(t('scanStatusEnterSetup'));
  const [stageLogs, setStageLogs] = useState<string[]>([]);
  const [allowBackdropClose, setAllowBackdropClose] = useState(false);

  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const modalScaleAnim = useRef(new Animated.Value(0.9)).current;
  const modalOpacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const [tabWidth, setTabWidth] = useState(0);
  const operationTokenRef = useRef(0);

  const modeInstructions = useMemo(
    () => ({
      initCreate: t('scanStatusCreatePin'),
      initConfirm: t('scanStatusConfirmPin'),
      signin: t('scanStatusEnterPinSignIn'),
    }),
    [t],
  );

  useEffect(() => {
    return () => {
      operationTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onScanningChange?.(phase === 'working');

    if (phase === 'working') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1200, easing: BEZIER_EASING, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: BEZIER_EASING, useNativeDriver: true }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scanLineAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      scanLineAnim.setValue(0);
    }
  }, [phase, onScanningChange, pulseAnim, scanLineAnim]);

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      onShowToast?.(message, type);
    },
    [onShowToast],
  );

  const appendStageLog = useCallback((raw: string) => {
    const message = raw.trim();
    if (!message) {
      return;
    }

    setStageLogs(previous => {
      if (previous[0] === message) {
        return previous;
      }
      return [message];
    });
  }, []);

  const shakeDialog = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const openNfcSettings = useCallback(async () => {
    try {
      const manager = NfcManager as unknown as { goToNfcSetting?: () => Promise<void> };
      if (manager.goToNfcSetting) {
        await manager.goToNfcSetting();
        return;
      }

      await Linking.openSettings();
    } catch {
      showToast(t('scanOpenSettingsFail'), 'error');
    }
  }, [showToast, t]);

  const resetForMode = useCallback(
    (nextMode: ScanMode, snapIndicator = true) => {
      operationTokenRef.current += 1;
      if (mode !== nextMode) {
        setMode(nextMode);
      }
      setPhase('pin');
      setPinStage('create');
      setPinValue('');
      setConfirmPinValue('');
      setStageLogs([]);
      const instructions =
        nextMode === 'init' ? modeInstructions.initCreate : modeInstructions.signin;
      setStatusMessage(instructions);
      onStatusChange?.(instructions);
      if (snapIndicator) {
        indicatorAnim.setValue(nextMode === 'init' ? 0 : 1);
      }
    },
    [indicatorAnim, mode, modeInstructions, onStatusChange],
  );

  useEffect(() => {
    if (visible) {
      setAllowBackdropClose(false);
      const startMode = initialMode ?? mode;
      resetForMode(startMode, false);
      if (prefilledPin) {
        setPinValue(prefilledPin);
        setStatusMessage(t('scanStatusHoldCard'));
        onStatusChange?.(t('scanStatusHoldCard'));
      }
      modalScaleAnim.setValue(0.92);
      modalOpacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(modalScaleAnim, {
          toValue: 1,
          ...SPRING_CONFIG,
        }),
        Animated.timing(modalOpacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      const unlockTimer = setTimeout(() => {
        setAllowBackdropClose(true);
      }, 250);

      return () => {
        clearTimeout(unlockTimer);
      };
    }
    setAllowBackdropClose(false);
    resetForMode(initialMode ?? 'init');
  }, [visible, mode, resetForMode, modalScaleAnim, modalOpacityAnim, initialMode, prefilledPin, onStatusChange, t]);

  const handleModeChange = useCallback(
    (nextMode: ScanMode) => {
      if (nextMode === mode) return;

      resetForMode(nextMode, false);
      Animated.timing(indicatorAnim, {
        toValue: nextMode === 'init' ? 0 : 1,
        duration: 350,
        easing: BEZIER_EASING,
        useNativeDriver: true,
      }).start();
    },
    [indicatorAnim, mode, resetForMode],
  );

  const handlePinChange = useCallback(
    (value: string) => {
      const next = value.replace(/\D/g, '').slice(0, PIN_LENGTH);
      if (mode === 'init' && pinStage === 'confirm') {
        setConfirmPinValue(next);
      } else {
        setPinValue(next);
      }
    },
    [mode, pinStage],
  );

  const beginScan = useCallback(async () => {
    let currentNfcEnabled = isNfcEnabled;
    if (currentNfcEnabled !== true) {
      try {
        currentNfcEnabled = await NfcManager.isEnabled();
      } catch {
        currentNfcEnabled = isNfcEnabled;
      }
    }

    if (currentNfcEnabled === false) {
      Alert.alert(t('scanNfcDisabledTitle'), t('scanNfcDisabledMessage'), [
        {
          text: t('scanOpenSettings'),
          onPress: () => {
            openNfcSettings().catch(() => undefined);
          },
        },
      ]);
      showToast(t('scanToastNfcDisabled'), 'error');
      shakeDialog();
      return;
    }

    const token = operationTokenRef.current + 1;
    operationTokenRef.current = token;
    setPhase('working');
    setStatusMessage(t('scanStatusHoldCard'));
    setStageLogs([]);
    appendStageLog(t('scanStageFlowStarted'));
    appendStageLog(t('scanStatusHoldCard'));
    onStatusChange?.(t('scanStatusHoldCard'));

    const setStageStatus = (status: string) => {
      if (operationTokenRef.current !== token) return;
      const nextStatus = toFriendlyMessage(status, t('scanStatusProcessingRequest'));
      setStatusMessage(nextStatus);
      appendStageLog(nextStatus);
      onStatusChange?.(nextStatus);
    };

    try {
      const result =
        types === 'flow' && onFlowScan
          ? await onFlowScan(setStageStatus)
          : mode === 'init'
          ? await initialiseWallet(prefilledPin ?? pinValue)
          : await signInWallet(prefilledPin ?? pinValue);
      if (operationTokenRef.current !== token) return;

      if (result.ok) {
        try {
          await Promise.resolve(onSuccess?.({ result, mode }));
        } catch (onSuccessError) {
          if (operationTokenRef.current !== token) return;
          const rawMessage = onSuccessError instanceof Error ? onSuccessError.message : String(onSuccessError);
          const fallbackMessage = toFriendlyMessage(
            rawMessage,
            t('scanErrorGeneric'),
          );
          setPhase('error');
          setStatusMessage(fallbackMessage);
          onStatusChange?.(fallbackMessage);
          showToast(fallbackMessage, 'error');
          shakeDialog();
          return;
        }

        setPhase('success');
        const successMessage = toFriendlyMessage(result.message, t('scanStatusGenericSuccess'));
        setStatusMessage(successMessage);
        appendStageLog(successMessage);
        onStatusChange?.(successMessage);
        showToast(t('scanToastSuccess'), 'success');
      } else {
        const codeHint = suggestionForCode(mode, result.code, t);
        const failureMessage = codeHint ?? toFriendlyMessage(
          result.message,
          t('scanErrorGeneric'),
        );
        setPhase('error');
        setStatusMessage(failureMessage);
        appendStageLog(failureMessage);
        onStatusChange?.(failureMessage);
        showToast(failureMessage, 'error');
        shakeDialog();
      }
    } catch (error) {
      if (operationTokenRef.current !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      const fallbackMessage = toFriendlyMessage(message, t('scanErrorGeneric'));
      setPhase('error');
      setStatusMessage(fallbackMessage);
      appendStageLog(fallbackMessage);
      onStatusChange?.(fallbackMessage);
      showToast(fallbackMessage, 'error');
      shakeDialog();
    }
  }, [
    isNfcEnabled,
    mode,
    onFlowScan,
    onStatusChange,
    onSuccess,
    openNfcSettings,
    appendStageLog,
    pinValue,
    prefilledPin,
    showToast,
    shakeDialog,
    t,
    types,
  ]);

  const handleSubmitPin = useCallback(() => {
    if (types === 'flow') {
      beginScan();
      return;
    }

    if (mode === 'init') {
      if (pinStage === 'create') {
        if (pinValue.length !== PIN_LENGTH) {
          showToast(t('scanErrorEnterPin4'), 'error');
          shakeDialog();
          return;
        }
        setPinStage('confirm');
        const nextMessage = modeInstructions.initConfirm;
        setStatusMessage(nextMessage);
        onStatusChange?.(nextMessage);
        return;
      }

      if (confirmPinValue.length !== PIN_LENGTH) {
        showToast(t('scanErrorConfirmPin4'), 'error');
        shakeDialog();
        return;
      }

      if (confirmPinValue !== pinValue) {
        showToast(t('scanErrorPinsMismatch'), 'error');
        setConfirmPinValue('');
        shakeDialog();
        return;
      }
    } else {
      if (pinValue.length !== PIN_LENGTH) {
        showToast(t('scanErrorEnterPin4'), 'error');
        shakeDialog();
        return;
      }
    }

    beginScan();
  }, [
    beginScan,
    confirmPinValue,
    mode,
    modeInstructions.initConfirm,
    onStatusChange,
    pinStage,
    pinValue,
    shakeDialog,
    showToast,
    t,
    types,
  ]);

  const handlePrimaryAction = useCallback(() => {
    if (phase === 'pin') {
      handleSubmitPin();
      return;
    }
    beginScan();
  }, [beginScan, handleSubmitPin, phase]);

  useEffect(() => {
    if (!visible || !prefilledPin || phase !== 'pin') return;
    const timer = setTimeout(() => {
      beginScan();
    }, Math.max(120, autoStartDelayMs));
    return () => clearTimeout(timer);
  }, [autoStartDelayMs, beginScan, phase, prefilledPin, visible]);

  const shouldShowSuccess = phase === 'success';
  const showCancel = phase !== 'success';
  const showVisual = phase === 'working' || shouldShowSuccess || types === 'flow' || Boolean(prefilledPin);

  const primaryButtonLabel =
    phase === 'pin'
      ? types === 'flow'
        ? t('scanPrimaryScanCard')
        : prefilledPin
        ? t('scanPrimaryScanCard')
        : mode === 'init' && pinStage === 'create'
        ? t('scanPrimaryContinue')
        : t('scanPrimaryScanCard')
      : phase === 'success'
      ? t('scanPrimaryComplete')
      : t('scanPrimaryTryAgain');

  const activePinLength =
    mode === 'init' && pinStage === 'confirm' ? confirmPinValue.length : pinValue.length;

  const disablePrimaryButton =
    phase === 'working' ||
    (phase === 'pin' && types !== 'flow' && !prefilledPin && activePinLength !== PIN_LENGTH);

  const headerTitle = phase === 'success' ? t('scanPrimaryComplete') : t('scanPrimaryScanCard');
  const stageMessage = stageLogs[0] ?? (phase === 'working' ? t('scanStageWaitingHandshake') : null);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!allowBackdropClose) {
              return;
            }
            onClose();
          }}
        />

        <Animated.View
          style={[
            styles.dialog,
            {
              opacity: modalOpacityAnim,
              transform: [
                { scale: modalScaleAnim },
                { translateX: shakeAnim },
              ],
            },
          ]}
        >
          <View style={styles.grab} />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={14} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {!prefilledPin && types !== 'flow' && (
            <Animated.View
              style={styles.tabContainer}
              onLayout={event => {
                const widthPerTab = (event.nativeEvent.layout.width - 8) / MODE_OPTIONS.length;
                if (Math.abs(widthPerTab - tabWidth) > 0.5) {
                  setTabWidth(widthPerTab);
                }
              }}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.tabIndicator,
                  {
                    width: tabWidth || undefined,
                    transform: [{
                      translateX: indicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, tabWidth],
                      }),
                    }],
                  },
                ]}
              />

              {MODE_OPTIONS.map((option) => {
                const selected = option.value === mode;
                return (
                  <Pressable
                    key={option.value}
                    style={styles.tabButton}
                    onPress={() => handleModeChange(option.value)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <AnimatedText style={[styles.tabLabel, selected ? styles.tabLabelActive : styles.tabLabelInactive]}>
                      {option.value === 'init' ? t('scanTabInit') : t('scanTabSignIn')}
                    </AnimatedText>
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          <View style={styles.flagWrap}>
            <View style={styles.flagDot} />
            <Text style={styles.flagText}>{t('scanFlagSignature')}</Text>
          </View>

          <Text style={styles.statusText}>{statusMessage}</Text>

          {stageMessage ? (
            <View style={styles.logBox}>
              <View style={styles.logDot} />
              <Text style={styles.logText}>{stageMessage}</Text>
            </View>
          ) : null}

          {phase === 'pin' && !prefilledPin && types !== 'flow' && (
            <PinInput
              value={mode === 'init' && pinStage === 'confirm' ? confirmPinValue : pinValue}
              onChange={handlePinChange}
              disabled={phase !== 'pin'}
              colorScheme="dark"
            />
          )}

          {showVisual && (
            <View style={styles.visualContainer}>
              {!shouldShowSuccess && (
                <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
              )}

              <View style={styles.viewfinder}>
                {!shouldShowSuccess && (
                  <Animated.View
                    style={[
                      styles.scanBeam,
                      {
                        transform: [{
                          translateY: scanLineAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-50, 50],
                          }),
                        }],
                      },
                    ]}
                  />
                )}

                {shouldShowSuccess ? (
                  <SuccessIcon color={COLORS.success} />
                ) : (
                  <View style={styles.cardIcon}>
                    <View style={styles.cardChip} />
                    <View style={styles.cardLine} />
                    <View style={[styles.cardLine, styles.cardLineSecond]} />
                    <View style={[styles.cardLine, styles.cardLineThird]} />
                  </View>
                )}
              </View>

              <View style={styles.scanTip}>
                <Text style={styles.scanTipText}>{t('scanTipScanningSignal')}</Text>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={handlePrimaryAction}
              disabled={disablePrimaryButton}
              style={[styles.primaryButton, disablePrimaryButton && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
            </Pressable>

            {showCancel && (
              <Pressable style={styles.ghostButton} onPress={onClose}>
                <Text style={styles.ghostButtonText}>{t('commonCancel')}</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dialog: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.dialog,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 34,
    elevation: 24,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    marginTop: 14,
    marginBottom: 14,
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    padding: 4,
    minHeight: 42,
  },
  tabIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 999,
    backgroundColor: COLORS.dialog,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  tabButton: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: COLORS.text,
  },
  tabLabelInactive: {
    color: COLORS.textMuted,
  },
  flagWrap: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.28)',
    backgroundColor: 'rgba(40, 151, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.signalBright,
  },
  flagText: {
    color: COLORS.signalBright,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  logBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(10, 14, 23, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.signalBright,
  },
  logText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  visualContainer: {
    height: 188,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  pulseRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(40, 151, 255, 0.18)',
  },
  viewfinder: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 3,
    borderColor: COLORS.signalBright,
    backgroundColor: '#0C1320',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 6,
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.signalBright,
    opacity: 0.65,
  },
  cardIcon: {
    width: 72,
    height: 46,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: '#14202F',
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  cardChip: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 14,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#D8A852',
  },
  cardLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.signalBright,
    opacity: 0.7,
  },
  cardLineSecond: {
    marginTop: 4,
  },
  cardLineThird: {
    marginTop: 4,
    width: 14,
  },
  scanTip: {
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  scanTipText: {
    color: COLORS.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  successCore: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    gap: 8,
  },
  primaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.signalBright,
    backgroundColor: COLORS.signal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ScanDialog;
