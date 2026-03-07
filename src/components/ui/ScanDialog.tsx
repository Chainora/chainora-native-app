import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';

import { AppButton } from '../AppButton';
import { PinInput } from './PinInput';
import { initialiseWallet, signInWallet, WalletActionResult, WalletActionCode } from '../../services/cardService';
import { THEME } from '../../types/theme/colors';
import { ToastType } from '../Toast';

export type ScanMode = 'init' | 'signin';

type ModeOption = {
  label: string;
  value: ScanMode;
};

type ScanDialogProps = {
  visible: boolean;
  isNfcEnabled: boolean | null;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
  onScanningChange?: (isScanning: boolean) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onSuccess?: (details: { result: WalletActionResult; mode: ScanMode }) => void;
  initialMode?: ScanMode;
  prefilledPin?: string;
};

type ScanPhase = 'pin' | 'working' | 'success' | 'error';

const PIN_LENGTH = 4;

const MODE_OPTIONS: ModeOption[] = [
  { label: 'Init Wallet', value: 'init' },
  { label: 'Sign In', value: 'signin' },
];

const AnimatedText = Animated.createAnimatedComponent(Text);

// Custom Easing
const SPRING_CONFIG = { tension: 120, friction: 14, useNativeDriver: true };
const BEZIER_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
const SCAN_GUIDE_VIDEO = require('../../assets/scan.mp4');

const formatPublicKeySummary = (value: string) => {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 12)}...${value.slice(-12)}`;
};

const suggestionForCode = (mode: ScanMode, code?: WalletActionCode): string | null => {
  switch (code) {
    case 'PIN_ALREADY_INITIALISED':
      return 'Switch to Sign In mode to continue.';
    case 'PIN_NOT_INITIALISED':
      return 'Run Init Wallet first, then try signing in.';
    case 'PIN_INVALID':
      return 'Double-check the PIN and try again.';
    case 'TRANSPORT_ERROR':
      return 'Keep the card close to the device until the scan finishes.';
    default:
      return null;
  }
};

const buildInfoLines = (mode: ScanMode, result: WalletActionResult): string[] => {
  const lines: string[] = [];

  if (result.ok && result.publicKeyHex) {
    lines.push(`Public Key: ${formatPublicKeySummary(result.publicKeyHex)}`);
  }

  if (result.ok && result.ethAddress) {
    lines.push(`Address: ${result.ethAddress}`);
  }

  const suggestion = suggestionForCode(mode, result.code);
  if (suggestion) {
    lines.push(suggestion);
  }

  if (result.statusWord) {
    lines.push(`Status: ${result.statusWord}`);
  }

  return lines;
};

/* --- Success Checkmark Component --- */
const SuccessIcon = ({ color }: { color: any }) => {
  const scale = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Animated.View style={[styles.successCircle, { borderColor: color, transform: [{ scale }] }]}>
      <Animated.Text style={[styles.successCheck, { color }]}>✓</Animated.Text>
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
}) => {
  const [mode, setMode] = useState<ScanMode>(initialMode ?? 'init');
  const [pinValue, setPinValue] = useState('');
  const [pinStage, setPinStage] = useState<'create' | 'confirm'>('create');
  const [confirmPinValue, setConfirmPinValue] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('pin');
  const [statusMessage, setStatusMessage] = useState('Enter your 4 digit PIN to set up your wallet');
  const [infoLines, setInfoLines] = useState<string[]>([]);
  
  // Animation Values
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
      initCreate: 'Create a 4-digit PIN for your new wallet',
      initConfirm: 'Confirm your 4-digit PIN',
      signin: 'Enter your PIN to access your wallet',
    }),
    [],
  );

  // --- Interpolations for Theming ---
  const dialogBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.surface, THEME.surface],
  });
  const dialogBorder = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.border, THEME.border],
  });
  const subtitleColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.foreground, THEME.foreground],
  });
  const infoColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.foregroundMuted, THEME.foregroundMuted],
  });
  const secondaryColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.primary, THEME.primary],
  });
  const tabBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.surfaceHighlight, THEME.surfaceHighlight],
  });
  const tabIndicatorColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#252C37', '#252C37'],
  });
  const tabActiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.foreground, THEME.foreground],
  });
  const tabInactiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.foregroundMuted, THEME.foregroundMuted],
  });
  const pulseColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(191, 164, 106, 0.14)', 'rgba(191, 164, 106, 0.14)'],
  });
  const scannerBeamColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(191, 164, 106, 0.52)', 'rgba(191, 164, 106, 0.52)'],
  });

  useEffect(() => {
    return () => {
      operationTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onScanningChange?.(phase === 'working');
    
    if (phase === 'working') {
      // Pulse Animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1200, easing: BEZIER_EASING, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: BEZIER_EASING, useNativeDriver: true }),
        ])
      ).start();

      // Scanner Line Animation
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

  const shakeDialog = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

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
      setInfoLines([]);
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
      const startMode = initialMode ?? mode;
      resetForMode(startMode, false);
      if (prefilledPin) {
        setPinValue(prefilledPin);
        setStatusMessage('Hold your card near the device...');
        onStatusChange?.('Hold your card near the device...');
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
      return;
    }
    resetForMode(initialMode ?? 'init');
  }, [visible, mode, resetForMode, modalScaleAnim, modalOpacityAnim, initialMode, prefilledPin, onStatusChange]);

  const handleModeChange = useCallback(
    (nextMode: ScanMode) => {
      if (nextMode === mode) return;

      resetForMode(nextMode, false);
      Animated.timing(indicatorAnim, {
        toValue: nextMode === 'init' ? 0 : 1,
        duration: 350,
        easing: BEZIER_EASING,
        useNativeDriver: true, // Switched to Native Driver
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
    if (isNfcEnabled === false) {
      Alert.alert('NFC Disabled', 'Please enable NFC in your system settings to continue.');
      showToast('NFC is disabled', 'error');
      shakeDialog();
      return;
    }

    const token = operationTokenRef.current + 1;
    operationTokenRef.current = token;
    setPhase('working');
    setInfoLines([]);
    setStatusMessage('Hold your card near the device...');
    onStatusChange?.('Hold your card near the device...');

    try {
      const result = mode === 'init' ? await initialiseWallet(prefilledPin ?? pinValue) : await signInWallet(prefilledPin ?? pinValue);
      if (operationTokenRef.current !== token) return;

      setInfoLines(buildInfoLines(mode, result));

      if (result.ok) {
        setPhase('success');
        setStatusMessage(result.message);
        onStatusChange?.(result.message);
        showToast('Success!', 'success');
        onSuccess?.({ result, mode });
      } else {
        setPhase('error');
        setStatusMessage(result.message);
        onStatusChange?.(result.message);
        showToast(result.message, 'error');
        shakeDialog();
      }
    } catch (error) {
      if (operationTokenRef.current !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      const fallbackMessage = `Scan failed: ${message}`;
      setInfoLines([]);
      setPhase('error');
      setStatusMessage(fallbackMessage);
      onStatusChange?.(fallbackMessage);
      showToast(fallbackMessage, 'error');
      shakeDialog();
    }
  }, [isNfcEnabled, mode, onStatusChange, onSuccess, pinValue, prefilledPin, showToast, shakeDialog]);

  const handleSubmitPin = useCallback(() => {
    if (mode === 'init') {
      if (pinStage === 'create') {
        if (pinValue.length !== PIN_LENGTH) {
          showToast(`Enter a ${PIN_LENGTH}-digit PIN`, 'error');
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
        showToast(`Confirm the ${PIN_LENGTH}-digit PIN`, 'error');
        shakeDialog();
        return;
      }

      if (confirmPinValue !== pinValue) {
        showToast('PINs do not match. Try again.', 'error');
        setConfirmPinValue('');
        shakeDialog();
        return;
      }
    } else {
      if (pinValue.length !== PIN_LENGTH) {
        showToast(`Enter a ${PIN_LENGTH}-digit PIN`, 'error');
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
    }, 180);
    return () => clearTimeout(timer);
  }, [beginScan, phase, prefilledPin, visible]);

  const themeScheme: 'light' | 'dark' = mode === 'signin' ? 'dark' : 'light';
  const shouldShowVideo = phase === 'working';
  const shouldShowSuccess = phase === 'success';
  const showCancel = phase !== 'success';

  const primaryButtonLabel =
    phase === 'pin'
      ? prefilledPin
        ? 'Scan Card'
        : mode === 'init' && pinStage === 'create'
        ? 'Continue'
        : 'Scan Card'
      : phase === 'success'
      ? 'Complete'
      : 'Try Again';

  const activePinLength =
    mode === 'init' && pinStage === 'confirm' ? confirmPinValue.length : pinValue.length;

  const disablePrimaryButton =
    phase === 'working' ||
    (phase === 'pin' && !prefilledPin && activePinLength !== PIN_LENGTH);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View 
          style={[
            styles.dialog, 
            { 
              backgroundColor: dialogBackground, 
              borderColor: dialogBorder,
              opacity: modalOpacityAnim,
              transform: [
                { scale: modalScaleAnim },
                { translateX: shakeAnim }
              ]
            }
          ]}
        >
          {!prefilledPin && (
          <Animated.View
            style={[styles.tabContainer, { backgroundColor: tabBackground }]}
            onLayout={event => {
              const widthPerTab = (event.nativeEvent.layout.width - 8) / MODE_OPTIONS.length;
              if (Math.abs(widthPerTab - tabWidth) > 0.5) {
                setTabWidth(widthPerTab);
              }
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.tabIndicator, { 
                width: tabWidth || undefined, 
                backgroundColor: tabIndicatorColor,
                // Removed shadowOpacity animation to support native driver
              }, {
                transform: [{ translateX: indicatorAnim.interpolate({ inputRange: [0, 1], outputRange: [0, tabWidth] }) }],
              }]}
            />
            {MODE_OPTIONS.map((option) => {
              const selected = option.value === mode;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.tabButton]}
                  onPress={() => handleModeChange(option.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <AnimatedText
                    style={[styles.tabLabel, selected ? { color: tabActiveColor } : { color: tabInactiveColor }]}
                  >
                    {option.label}
                  </AnimatedText>
                </Pressable>
              );
            })}
          </Animated.View>
          )}

          <View style={styles.content}>
            <AnimatedText style={[styles.subtitle, { color: subtitleColor }]}>{statusMessage}</AnimatedText>

            {phase === 'pin' && !prefilledPin && (
              <PinInput
                value={mode === 'init' && pinStage === 'confirm' ? confirmPinValue : pinValue}
                onChange={handlePinChange}
                disabled={phase !== 'pin'}
                colorScheme={themeScheme}
              />
            )}

            {(shouldShowVideo || shouldShowSuccess) && (
              <View style={styles.visualContainer}>
                {shouldShowVideo && (
                   <Animated.View 
                     style={[styles.pulseRing, { backgroundColor: pulseColor, transform: [{ scale: pulseAnim }] }]} 
                   />
                )}

                <View style={styles.viewfinderWrapper}>
                  {shouldShowVideo && (
                    <>
                      <View style={[styles.viewfinderCorner, styles.viewfinderCornerTL]} />
                      <View style={[styles.viewfinderCorner, styles.viewfinderCornerTR]} />
                      <View style={[styles.viewfinderCorner, styles.viewfinderCornerBL]} />
                      <View style={[styles.viewfinderCorner, styles.viewfinderCornerBR]} />
                    </>
                  )}
                <View style={styles.visualWrapper}>
                   {shouldShowSuccess ? (
                     <SuccessIcon color={THEME.primary} />
                   ) : (
                     <>
                      <Video
                        source={SCAN_GUIDE_VIDEO}
                        style={styles.video}
                        resizeMode="cover"
                        repeat
                        muted
                        paused={!shouldShowVideo}
                      />
                      <View style={styles.videoTint} />
                      <Animated.View 
                        style={[
                          styles.scannerBeam,
                          { 
                            backgroundColor: scannerBeamColor,
                            transform: [{ 
                              translateY: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 160] }) 
                            }] 
                          }
                        ]} 
                      />
                      <Animated.View 
                        style={[
                          styles.scannerBeamGlow,
                          { 
                            backgroundColor: scannerBeamColor,
                            transform: [{ 
                              translateY: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 160] }) 
                            }] 
                          }
                        ]} 
                      />
                     </>
                   )}
                </View>
                </View>
              </View>
            )}

            <View style={styles.infoContainer}>
              {infoLines.map((line, i) => (
                <AnimatedText key={i} style={[styles.infoText, { color: infoColor }]}>
                  {line}
                </AnimatedText>
              ))}
            </View>

            <View style={styles.actions}>
              <AppButton 
                label={primaryButtonLabel} 
                onPress={handlePrimaryAction} 
                disabled={disablePrimaryButton} 
                variant={mode === 'signin' ? 'secondary' : 'primary'}
              />
              {showCancel && (
                <Pressable style={styles.secondaryAction} onPress={onClose}>
                  <AnimatedText style={[styles.secondaryLabel, { color: secondaryColor }]}>
                    Cancel
                  </AnimatedText>
                </Pressable>
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: THEME.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 32,
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    shadowColor: THEME.shadow,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 20,
    marginBottom: 32,
    padding: 4,
    height: 52,
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabLabel: {
    fontSize: THEME.typography.subtext,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  content: {
    alignItems: 'center',
  },
  subtitle: {
    fontSize: THEME.typography.body,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 24,
  },
  visualContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    marginTop: 12,
    height: 160,
    width: '100%',
  },
  pulseRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  viewfinderWrapper: {
    position: 'relative',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: THEME.primary,
    opacity: 0.9,
  },
  viewfinderCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 4,
  },
  viewfinderCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 4,
  },
  viewfinderCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 4,
  },
  viewfinderCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 4,
  },
  visualWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#111418',
    borderWidth: 4,
    borderColor: THEME.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 11, 13, 0.42)',
  },
  scannerBeam: {
    position: 'absolute',
    width: '100%',
    height: 4,
    left: 0,
    shadowColor: THEME.primaryLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  scannerBeamGlow: {
    position: 'absolute',
    width: '100%',
    height: 20,
    left: 0,
    opacity: 0.25,
  },
  successCircle: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111418',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheck: {
    fontSize: THEME.typography.display,
    fontWeight: 'bold',
  },
  infoContainer: {
    marginBottom: 24,
    width: '100%',
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: THEME.typography.subtext,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  secondaryAction: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryLabel: {
    fontWeight: '600',
    fontSize: THEME.typography.subtext,
  },
});
