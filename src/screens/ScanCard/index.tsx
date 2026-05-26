import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinInput } from '@components/ui/PinInput';
import { ScanCardShell } from '@components/auth/ScanCardShell';
import type { ScanCardFlowKind, ScanMode } from '@app-types/wallet';
import type { ToastType } from '@hooks/useToast';
import { PinGhostButton } from '@components/ui/pinTheme';
import { useSettings } from '@hooks/useSettings';
import {
  useScanCardAuthActions,
  useScanCardFlowConfig,
} from '@hooks/useScanCardFlowConfig';
import { useScanCardFlowState } from '@hooks/useScanCardFlowState';
import { useScanCardNfcLifecycle } from '@hooks/useScanCardNfcLifecycle';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import {
  resolveScanResultMessage,
  toFriendlyMessage,
} from '@utils/scanCardResult';
import { COLORS, styles } from './ScanCard.styles';

type ModeOption = {
  value: ScanMode;
};

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCard'>;

const PIN_LENGTH = 4;

const MODE_OPTIONS: ModeOption[] = [{ value: 'init' }, { value: 'signin' }];

const AnimatedText = Animated.createAnimatedComponent(Text);

const SPRING_CONFIG = { tension: 120, friction: 14, useNativeDriver: true };
const BEZIER_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

const SuccessIcon = ({ color }: { color: string }) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Animated.View
      style={[
        styles.successCore,
        { borderColor: color, transform: [{ scale }] },
      ]}
    >
      <Ionicons name="checkmark" size={32} color={color} />
    </Animated.View>
  );
};

const ScanCardScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, resolvedTheme } = useSettings();
  const flowConfig = useScanCardFlowConfig(route.params.flowId);
  const { executeAuthScan } = useScanCardAuthActions();
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
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    const signalLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanSignalAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanSignalAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
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
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
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
  }, [
    visible,
    mode,
    resetForMode,
    modalScaleAnim,
    modalOpacityAnim,
    initialMode,
    prefilledPin,
    onStatusChange,
    t,
    indicatorAnim,
    setPinValue,
    setStatusMessage,
  ]);

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
      const nextStatus = toFriendlyMessage(
        status,
        t('scanStatusProcessingRequest'),
      );
      setStatusMessage(nextStatus);
      appendStageLog(nextStatus);
      onStatusChange?.(nextStatus);
    };

    try {
      const result =
        types === 'flow' && onFlowScan
          ? await onFlowScan(setStageStatus)
          : mode === 'init'
          ? await executeAuthScan('init', prefilledPin ?? pinValue)
          : await executeAuthScan('signin', prefilledPin ?? pinValue);
      if (operationTokenRef.current !== token) return;

      if (result.ok) {
        try {
          await Promise.resolve(onSuccess?.({ result, mode }));
        } catch (onSuccessError) {
          if (operationTokenRef.current !== token) return;
          const rawMessage =
            onSuccessError instanceof Error
              ? onSuccessError.message
              : String(onSuccessError);
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
    executeAuthScan,
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
  const showVisual =
    phase !== 'pin' || types === 'flow' || Boolean(prefilledPin);

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
    mode === 'init' && pinStage === 'confirm'
      ? confirmPinValue.length
      : pinValue.length;

  const disablePrimaryButton =
    phase === 'working' ||
    (phase === 'pin' &&
      types !== 'flow' &&
      !prefilledPin &&
      activePinLength !== PIN_LENGTH);

  const headerTitle =
    phase === 'success' ? t('scanPrimaryComplete') : t('scanPrimaryScanCard');
  const stageMessage =
    stageLogs[0] ??
    (phase === 'working' ? t('scanStageWaitingHandshake') : null);
  const showShellStatus =
    phase !== 'pin' || Boolean(prefilledPin) || types === 'flow';
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
  const scanBadgeLabel = isVisualScanning
    ? t('qrFlagScanning')
    : phase === 'success'
    ? t('scanPrimaryComplete')
    : phase === 'error'
    ? t('scanPrimaryTryAgain')
    : t('scanPrimaryScanCard');
  const scanTitle = t('scanPrimaryScanCard');
  const scanHeadline = statusMessage;
  const scanSupportingText = isVisualScanning
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
            <Pressable
              style={styles.scanBackButton}
              onPress={handleClose}
              hitSlop={10}
            >
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
                        transform: [
                          {
                            scale: scanSignalAnim.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [1, 0.82, 1],
                            }),
                          },
                        ],
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
                        transform: [
                          {
                            scale: pulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.96, 1.12],
                            }),
                          },
                        ],
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
                          transform: [
                            {
                              scale: scanSignalAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.985, 1.015],
                              }),
                            },
                          ],
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
                          transform: [
                            {
                              scale: scanSignalAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.99, 1.02],
                              }),
                            },
                          ],
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
                          transform: [
                            {
                              scale: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [1, 0.975, 1],
                              }),
                            },
                          ],
                        }
                      : null,
                  ]}
                />
                <Animated.View
                  style={[
                    styles.touchCore,
                    phase === 'working'
                      ? {
                          transform: [
                            {
                              scale: scanSignalAnim.interpolate({
                                inputRange: [0, 0.5, 1],
                                outputRange: [1, 0.985, 1],
                              }),
                            },
                          ],
                        }
                      : null,
                  ]}
                >
                  {shouldShowSuccess ? (
                    <SuccessIcon color={COLORS.success} />
                  ) : (
                    <Ionicons
                      name="wifi-outline"
                      size={44}
                      color={COLORS.signalBright}
                    />
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
                <Text style={styles.scanPrimaryButtonText}>
                  {primaryButtonLabel}
                </Text>
              </Pressable>
            ) : null}

            {showCancel ? (
              <Pressable
                style={
                  showScanPrimaryButton
                    ? styles.scanGhostButton
                    : styles.scanSecondaryButton
                }
                onPress={handleClose}
              >
                <Text
                  style={
                    showScanPrimaryButton
                      ? styles.scanGhostButtonText
                      : styles.scanSecondaryButtonText
                  }
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
              const widthPerTab =
                (event.nativeEvent.layout.width - 8) / MODE_OPTIONS.length;
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
                  transform: [
                    {
                      translateX: indicatorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, tabWidth],
                      }),
                    },
                  ],
                },
              ]}
            />

            {MODE_OPTIONS.map(option => {
              const selected = option.value === mode;
              return (
                <Pressable
                  key={option.value}
                  style={styles.tabButton}
                  onPress={() => handleModeChange(option.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <AnimatedText
                    style={[
                      styles.tabLabel,
                      selected
                        ? styles.tabLabelActive
                        : styles.tabLabelInactive,
                    ]}
                  >
                    {option.value === 'init'
                      ? t('scanTabInit')
                      : t('scanTabSignIn')}
                  </AnimatedText>
                </Pressable>
              );
            })}
          </Animated.View>

          {phase === 'pin' ? (
            <Animated.View style={styles.pinContentWrap}>
              <PinInput
                value={
                  mode === 'init' && pinStage === 'confirm'
                    ? confirmPinValue
                    : pinValue
                }
                onChange={handlePinChange}
                onSubmit={handlePrimaryAction}
                disabled={phase !== 'pin'}
                submitDisabled={disablePrimaryButton}
                title={pinPromptTitle}
                subtitle={pinPromptSubtitle}
                ctaLabel={primaryButtonLabel}
                heroIconName={
                  mode === 'init' ? 'shield-checkmark-outline' : 'wifi-outline'
                }
                headerSlot={
                  <View style={styles.pinPromptHeader}>
                    <View style={styles.flagWrap}>
                      <View style={styles.flagDot} />
                      <Text style={styles.flagText}>
                        {t('scanFlagSignature')}
                      </Text>
                    </View>
                  </View>
                }
                afterActionSlot={
                  <PinGhostButton
                    label={t('commonCancel')}
                    onPress={handleClose}
                  />
                }
                style={styles.pinInputCard}
              />
            </Animated.View>
          ) : null}
        </>
      )}
    </ScanCardShell>
  );
};

export default ScanCardScreen;
