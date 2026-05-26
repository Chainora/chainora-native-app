import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinInput } from '../../../components/ui/PinInput';
import type { ToastType } from '../../../features/toast';
import {
  PinGhostButton,
  PIN_DISPLAY_FONT_BOLD,
  PIN_DISPLAY_FONT_MEDIUM,
  PIN_MONO_FONT,
  PIN_SANS_FONT,
  PIN_SANS_FONT_SEMIBOLD,
} from '../../../components/ui/pinTheme';
import { useSettings } from '../../../features/settings';
import { initialiseWallet, signInWallet } from '../../../services/cardService';
import type { RootStackParamList } from '../../../navigation/routes/rootStackParamList';
import {
  clearScanCardFlow,
  getScanCardFlow,
  type ScanCardFlowKind,
  type ScanMode,
} from '../../../services/scanCardFlowRegistry';
import { ScanCardShell } from '../components/ScanCardShell';
import { useScanCardFlowState } from '../hooks/useScanCardFlowState';
import { useScanCardNfcLifecycle } from '../hooks/useScanCardNfcLifecycle';
import { resolveScanResultMessage, toFriendlyMessage } from '../utils/scanCardResult';

type ModeOption = {
  value: ScanMode;
};

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCard'>;

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

const ScanCardScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, resolvedTheme } = useSettings();
  const flowConfig = useMemo(() => getScanCardFlow(route.params.flowId), [route.params.flowId]);
  const visible = true;
  const isNfcEnabled = flowConfig?.isNfcEnabled ?? null;
  const onStatusChange = flowConfig?.onStatusChange;
  const onScanningChange = flowConfig?.onScanningChange;
  const onShowToast = flowConfig?.onShowToast;
  const onSuccess = flowConfig?.onSuccess;
  const initialMode = flowConfig?.initialMode;
  const prefilledPin = flowConfig?.prefilledPin;
  const types: ScanCardFlowKind = flowConfig?.flowType ?? 'auth';
  const onFlowScan = flowConfig?.onFlowScan;
  const autoStartDelayMs = flowConfig?.autoStartDelayMs ?? 180;

  useEffect(() => {
    if (flowConfig) {
      return;
    }
    navigation.goBack();
  }, [flowConfig, navigation]);

  useEffect(() => {
    return () => {
      clearScanCardFlow(route.params.flowId);
    };
  }, [route.params.flowId]);

  const handleClose = useCallback(() => {
    Promise.resolve(flowConfig?.onClose?.())
      .catch(() => undefined)
      .finally(() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      });
  }, [flowConfig, navigation]);

  const modeInstructions = useMemo(
    () => ({
      initCreate: t('scanStatusCreatePin'),
      initConfirm: t('scanStatusConfirmPin'),
      signin: t('scanStatusEnterPinSignIn'),
    }),
    [t],
  );

  const {
    appendStageLog,
    confirmPinValue,
    handlePinChange,
    isVisualScanning,
    mode,
    operationTokenRef,
    phase,
    pinStage,
    pinValue,
    resetForMode,
    setConfirmPinValue,
    setPhase,
    setPinStage,
    setPinValue,
    setStageLogs,
    setStatusMessage,
    stageLogs,
    statusMessage,
  } = useScanCardFlowState({
    initialMode,
    modeInstructions,
    onStatusChange,
    prefilledPin,
    t,
  });
  const [allowBackdropClose, setAllowBackdropClose] = useState(false);

  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const modalScaleAnim = useRef(new Animated.Value(0.9)).current;
  const modalOpacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scanSignalAnim = useRef(new Animated.Value(0)).current;

  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    return () => {
      operationTokenRef.current += 1;
    };
  }, [operationTokenRef]);

  useEffect(() => {
    onScanningChange?.(phase === 'working');

    if (!isVisualScanning) {
      pulseAnim.stopAnimation();
      scanSignalAnim.stopAnimation();
      pulseAnim.setValue(0);
      scanSignalAnim.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );

    const signalLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanSignalAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanSignalAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );

    pulseLoop.start();
    signalLoop.start();

    return () => {
      pulseLoop.stop();
      signalLoop.stop();
      pulseAnim.stopAnimation();
      scanSignalAnim.stopAnimation();
      pulseAnim.setValue(0);
      scanSignalAnim.setValue(0);
    };
  }, [isVisualScanning, onScanningChange, phase, pulseAnim, scanSignalAnim]);

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      onShowToast?.(message, type);
    },
    [onShowToast],
  );

  const shakeDialog = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);
  const { ensureNfcReady } = useScanCardNfcLifecycle({
    isNfcEnabled,
    showToast,
    shakeDialog,
    t,
  });

  useEffect(() => {
    if (visible) {
      setAllowBackdropClose(false);
      const startMode = initialMode ?? mode;
      resetForMode(startMode, false);
      indicatorAnim.setValue(startMode === 'init' ? 0 : 1);
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
    indicatorAnim.setValue((initialMode ?? 'init') === 'init' ? 0 : 1);
  }, [visible, mode, resetForMode, modalScaleAnim, modalOpacityAnim, initialMode, prefilledPin, onStatusChange, t, indicatorAnim, setPinValue, setStatusMessage]);

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

  const beginScan = useCallback(async () => {
    const nfcReady = await ensureNfcReady();
    if (!nfcReady) {
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

        if (operationTokenRef.current !== token) {
          return;
        }

        setPhase('success');
        const successMessage = resolveScanResultMessage(mode, result, t);
        setStatusMessage(successMessage);
        appendStageLog(successMessage);
        onStatusChange?.(successMessage);
        showToast(t('scanToastSuccess'), 'success');
      } else {
        const failureMessage = resolveScanResultMessage(mode, result, t);
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
    ensureNfcReady,
    mode,
    operationTokenRef,
    onFlowScan,
    onStatusChange,
    onSuccess,
    appendStageLog,
    pinValue,
    prefilledPin,
    setPhase,
    setStageLogs,
    setStatusMessage,
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
    setConfirmPinValue,
    setPinStage,
    setStatusMessage,
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
  const showVisual = phase !== 'pin' || types === 'flow' || Boolean(prefilledPin);

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
  const showShellStatus = phase !== 'pin' || Boolean(prefilledPin) || types === 'flow';
  const isScanExperience = showShellStatus;
  const pinPromptTitle =
    mode === 'init'
      ? pinStage === 'create'
        ? t('scanPinCreateTitle')
        : t('scanPinConfirmTitle')
      : t('scanPinSignInTitle');
  const pinPromptSubtitle =
    mode === 'init'
      ? pinStage === 'create'
        ? t('scanPinCreateSubtitle')
        : t('scanPinConfirmSubtitle')
      : t('scanPinSignInSubtitle');
  const scanBadgeLabel =
    isVisualScanning
      ? t('qrFlagScanning')
      : phase === 'success'
      ? t('scanPrimaryComplete')
      : phase === 'error'
      ? t('scanPrimaryTryAgain')
      : t('scanPrimaryScanCard');
  const scanTitle = t('scanPrimaryScanCard');
  const scanHeadline = statusMessage;
  const scanSupportingText =
    isVisualScanning
      ? t('scanHintKeepCardClose')
      : shouldShowSuccess
      ? stageMessage
      : phase === 'error'
      ? stageMessage ?? t('scanHintKeepCardClose')
      : null;
  const showScanPrimaryButton = !isVisualScanning;

  if (!flowConfig) {
    return null;
  }

  return (
    <ScanCardShell
      resolvedTheme={resolvedTheme}
      allowBackdropClose={allowBackdropClose}
      isScanExperience={isScanExperience}
      modalOpacityAnim={modalOpacityAnim}
      modalScaleAnim={modalScaleAnim}
      shakeAnim={shakeAnim}
      onClose={handleClose}
    >
      {isScanExperience ? (
            <View style={styles.scanLayout}>
              <View style={styles.scanHeaderRow}>
                <Pressable style={styles.scanBackButton} onPress={handleClose} hitSlop={10}>
                  <Ionicons name="chevron-back" size={30} color={COLORS.text} />
                </Pressable>
                <Text style={styles.scanHeaderTitle}>{scanTitle}</Text>
                <View style={styles.scanHeaderSpacer} />
              </View>

              <View style={styles.scanBody}>
                <View style={styles.scanStatePill}>
                  <Animated.View
                    style={[
                      styles.scanStateDot,
                      phase === 'working'
                        ? {
                            opacity: scanSignalAnim.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [1, 0.38, 1],
                            }),
                            transform: [{
                              scale: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [1, 0.82, 1],
                              }),
                            }],
                          }
                        : null,
                    ]}
                  />
                  <Text style={styles.scanStateText}>{scanBadgeLabel}</Text>
                </View>

                {showVisual ? (
                  <View style={styles.touchStage}>
                    {!shouldShowSuccess ? (
                      <Animated.View
                        style={[
                          styles.touchPulse,
                          {
                            opacity: pulseAnim.interpolate({
                              inputRange: [0, 0.12, 1],
                              outputRange: [0.7, 0.7, 0],
                            }),
                            transform: [{
                              scale: pulseAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.96, 1.12],
                              }),
                            }],
                          },
                        ]}
                      />
                    ) : null}
                    <Animated.View
                      style={[
                        styles.touchRingOne,
                        phase === 'working'
                          ? {
                              opacity: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [0.24, 0.08, 0.24],
                              }),
                              transform: [{
                                scale: scanSignalAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.985, 1.015],
                                }),
                              }],
                            }
                          : null,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.touchRingTwo,
                        phase === 'working'
                          ? {
                              opacity: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [0.42, 0.18, 0.42],
                              }),
                              transform: [{
                                scale: scanSignalAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.99, 1.02],
                                }),
                              }],
                            }
                          : null,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.touchRingThree,
                        phase === 'working'
                          ? {
                              opacity: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [1, 0.55, 1],
                              }),
                              transform: [{
                                scale: scanSignalAnim.interpolate({
                                  inputRange: [0, 0.5, 1],
                                  outputRange: [1, 0.975, 1],
                                }),
                              }],
                            }
                          : null,
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.touchCore,
                        phase === 'working'
                          ? {
                              transform: [{
                                scale: scanSignalAnim.interpolate({
                                  inputRange: [0, 0.5, 1],
                                  outputRange: [1, 0.985, 1],
                                }),
                              }],
                            }
                          : null,
                      ]}
                    >
                      {shouldShowSuccess ? (
                        <SuccessIcon color={COLORS.success} />
                      ) : (
                        <Ionicons name="wifi-outline" size={44} color={COLORS.signalBright} />
                      )}
                    </Animated.View>
                  </View>
                ) : null}

                <Text style={styles.touchTitle}>{scanHeadline}</Text>

                {scanSupportingText ? (
                  <Text style={styles.touchBodyText}>{scanSupportingText}</Text>
                ) : null}
              </View>

              <View style={styles.scanFooter}>
                {showScanPrimaryButton ? (
                  <Pressable
                    onPress={handlePrimaryAction}
                    disabled={disablePrimaryButton}
                    style={[
                      styles.scanPrimaryButton,
                      disablePrimaryButton && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.scanPrimaryButtonText}>{primaryButtonLabel}</Text>
                  </Pressable>
                ) : null}

                {showCancel ? (
                  <Pressable
                    style={showScanPrimaryButton ? styles.scanGhostButton : styles.scanSecondaryButton}
                    onPress={handleClose}
                  >
                    <Text
                      style={showScanPrimaryButton ? styles.scanGhostButtonText : styles.scanSecondaryButtonText}
                    >
                      {t('commonCancel')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              <View style={styles.grab} />

              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>{headerTitle}</Text>
                <Pressable style={styles.closeButton} onPress={handleClose}>
                  <Ionicons name="close" size={14} color={COLORS.textSecondary} />
                </Pressable>
              </View>

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

              {phase === 'pin' ? (
                <Animated.View
                  style={styles.pinContentWrap}
                >
                  <PinInput
                    value={mode === 'init' && pinStage === 'confirm' ? confirmPinValue : pinValue}
                    onChange={handlePinChange}
                    onSubmit={handlePrimaryAction}
                    disabled={phase !== 'pin'}
                    submitDisabled={disablePrimaryButton}
                    title={pinPromptTitle}
                    subtitle={pinPromptSubtitle}
                    ctaLabel={primaryButtonLabel}
                    heroIconName={mode === 'init' ? 'shield-checkmark-outline' : 'wifi-outline'}
                    headerSlot={(
                      <View style={styles.pinPromptHeader}>
                        <View style={styles.flagWrap}>
                          <View style={styles.flagDot} />
                          <Text style={styles.flagText}>{t('scanFlagSignature')}</Text>
                        </View>
                      </View>
                    )}
                    afterActionSlot={<PinGhostButton label={t('commonCancel')} onPress={handleClose} />}
                    style={styles.pinInputCard}
                  />
                </Animated.View>
              ) : null}
            </>
          )}
    </ScanCardShell>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#08111B',
  },
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
  },
  screenDialog: {
    flex: 1,
    width: '100%',
    maxWidth: undefined,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  authShell: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.dialog,
    paddingTop: 8,
    paddingBottom: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.58,
    shadowRadius: 36,
    elevation: 26,
  },
  scanShell: {
    minHeight: '96%',
    maxHeight: '96%',
    borderRadius: 34,
    backgroundColor: '#08111B',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.62,
    shadowRadius: 40,
    elevation: 30,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 0,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 17,
    lineHeight: 21,
    fontFamily: PIN_DISPLAY_FONT_MEDIUM,
    letterSpacing: -0.2,
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
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 18,
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    padding: 4,
    minHeight: 44,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: COLORS.text,
  },
  tabLabelInactive: {
    color: COLORS.textMuted,
  },
  pinContentWrap: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  pinInputCard: {
    paddingTop: 2,
  },
  scanLayout: {
    flex: 1,
  },
  scanHeaderRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanBackButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scanHeaderTitle: {
    flex: 1,
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 28,
    fontFamily: PIN_DISPLAY_FONT_BOLD,
    letterSpacing: -0.8,
  },
  scanHeaderSpacer: {
    width: 40,
    height: 40,
  },
  scanBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 26,
  },
  scanStatePill: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.3)',
    backgroundColor: 'rgba(40, 151, 255, 0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanStateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.signal,
  },
  scanStateText: {
    color: '#8CD0FF',
    fontSize: 10,
    fontFamily: PIN_MONO_FONT,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  touchStage: {
    width: 286,
    height: 286,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 34,
    marginBottom: 34,
  },
  touchPulse: {
    position: 'absolute',
    width: 188,
    height: 188,
    borderRadius: 94,
    backgroundColor: 'rgba(15, 52, 101, 0.14)',
  },
  touchRingOne: {
    position: 'absolute',
    width: 274,
    height: 274,
    borderRadius: 137,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.08)',
  },
  touchRingTwo: {
    position: 'absolute',
    width: 198,
    height: 198,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.18)',
  },
  touchRingThree: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(40, 151, 255, 0.92)',
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
  touchCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(18, 24, 37, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.signal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  touchTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 34,
    fontFamily: PIN_DISPLAY_FONT_BOLD,
    textAlign: 'center',
    letterSpacing: -0.86,
    paddingHorizontal: 18,
  },
  touchBodyText: {
    color: '#757B93',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: PIN_SANS_FONT,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 28,
  },
  scanFooter: {
    gap: 10,
  },
  scanPrimaryButton: {
    minHeight: 62,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#2B98FF',
    backgroundColor: '#0A7CF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#2897FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 6,
  },
  scanPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
    letterSpacing: -0.3,
  },
  scanSecondaryButton: {
    minHeight: 62,
    borderRadius: 26,
    backgroundColor: '#151B27',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  scanSecondaryButtonText: {
    color: '#F3F6FB',
    fontSize: 17,
    lineHeight: 22,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
    letterSpacing: -0.24,
  },
  scanGhostButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanGhostButtonText: {
    color: '#B0B8C9',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
    letterSpacing: -0.2,
  },
  statusSection: {
    paddingHorizontal: 20,
  },
  flagWrap: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.24)',
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
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pinPromptHeader: {
    marginBottom: 12,
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 20,
    letterSpacing: -0.08,
    marginBottom: 14,
  },
  logBox: {
    borderRadius: 12,
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
    fontSize: 10.5,
    lineHeight: 16,
    letterSpacing: -0.08,
  },
  visualContainer: {
    minHeight: 188,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 6,
  },
  pulseRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(40, 151, 255, 0.22)',
  },
  viewfinder: {
    position: 'relative',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 3,
    borderColor: COLORS.signalBright,
    backgroundColor: '#060A12',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 6,
  },
  viewfinderGlow: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: 'rgba(40, 151, 255, 0.06)',
  },
  viewfinderInner: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 64,
    backgroundColor: 'rgba(17, 30, 49, 0.34)',
  },
  scanCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: COLORS.signalBright,
    borderWidth: 2,
  },
  scanCornerTopLeft: {
    top: -6,
    left: -6,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
  },
  scanCornerTopRight: {
    top: -6,
    right: -6,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 6,
  },
  scanCornerBottomLeft: {
    bottom: -6,
    left: -6,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
  },
  scanCornerBottomRight: {
    bottom: -6,
    right: -6,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 6,
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.signalBright,
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  cardIcon: {
    width: 70,
    height: 44,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: '#14202F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  cardChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 14,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#D8A852',
  },
  cardLines: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    alignItems: 'flex-end',
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
    position: 'absolute',
    bottom: 10,
    left: 24,
    right: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  scanTipAccent: {
    color: COLORS.signalBright,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  scanTipDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
  },
  scanTipText: {
    color: COLORS.textMuted,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  successCore: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 22,
    gap: 8,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.signalBright,
    backgroundColor: COLORS.signal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: COLORS.signalBright,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  ghostButton: {
    borderRadius: 12,
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

export default ScanCardScreen;
