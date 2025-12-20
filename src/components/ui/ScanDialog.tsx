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
}) => {
  const [mode, setMode] = useState<ScanMode>('init');
  const [pinValue, setPinValue] = useState('');
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
      init: 'Create a 4-digit PIN for your new wallet',
      signin: 'Enter your PIN to access your wallet',
    }),
    [],
  );

  // --- Interpolations for Theming ---
  const dialogBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#0F172A'], // Crisp White vs Midnight Blue
  });
  const dialogBorder = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.12)'],
  });
  const subtitleColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#334155', '#E2E8F0'],
  });
  const infoColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#475569', '#94A3B8'],
  });
  const secondaryColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.primary, '#60A5FA'],
  });
  const tabBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#F1F5F9', '#1E293B'],
  });
  const tabIndicatorColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#334155'],
  });
  const tabActiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0F172A', '#F8FAFC'],
  });
  const tabInactiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#94A3B8', '#64748B'],
  });
  const pulseColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(59, 130, 246, 0.15)', 'rgba(56, 189, 248, 0.15)'],
  });
  const scannerBeamColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(59, 130, 246, 0.5)', 'rgba(56, 189, 248, 0.6)'],
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
      setPinValue('');
      setInfoLines([]);
      const instructions = modeInstructions[nextMode];
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
      resetForMode(mode, false);
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
    resetForMode('init');
  }, [visible, mode, resetForMode, modalScaleAnim, modalOpacityAnim]);

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

  const handlePinChange = useCallback((value: string) => {
    setPinValue(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
  }, []);

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
      const result = mode === 'init' ? await initialiseWallet(pinValue) : await signInWallet(pinValue);
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
  }, [isNfcEnabled, mode, onStatusChange, onSuccess, pinValue, showToast, shakeDialog]);

  const handleSubmitPin = useCallback(() => {
    if (pinValue.length !== PIN_LENGTH) {
      showToast(`Enter a ${PIN_LENGTH}-digit PIN`, 'error');
      shakeDialog();
      return;
    }
    beginScan();
  }, [beginScan, pinValue.length, showToast, shakeDialog]);

  const handlePrimaryAction = useCallback(() => {
    if (phase === 'pin') {
      handleSubmitPin();
      return;
    }
    beginScan();
  }, [beginScan, handleSubmitPin, phase]);

  const handleResetPin = useCallback(() => {
    resetForMode(mode, false);
  }, [mode, resetForMode]);

  const themeScheme: 'light' | 'dark' = mode === 'signin' ? 'dark' : 'light';
  const shouldShowVideo = phase === 'working';
  const shouldShowSuccess = phase === 'success';
  const showReset = phase !== 'pin';

  const primaryButtonLabel = phase === 'pin' ? 'Scan Card' : phase === 'success' ? 'Complete' : 'Try Again';
  const disablePrimaryButton = phase === 'working' || (phase === 'pin' && pinValue.length !== PIN_LENGTH);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
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

          <View style={styles.content}>
            <AnimatedText style={[styles.subtitle, { color: subtitleColor }]}>{statusMessage}</AnimatedText>

            {phase === 'pin' && (
              <PinInput value={pinValue} onChange={handlePinChange} disabled={phase !== 'pin'} colorScheme={themeScheme} />
            )}

            {(shouldShowVideo || shouldShowSuccess) && (
              <View style={styles.visualContainer}>
                {shouldShowVideo && (
                   <Animated.View 
                     style={[styles.pulseRing, { backgroundColor: pulseColor, transform: [{ scale: pulseAnim }] }]} 
                   />
                )}
                
                <View style={styles.visualWrapper}>
                   {shouldShowSuccess ? (
                     <SuccessIcon color={mode === 'signin' ? '#60A5FA' : THEME.primary} />
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
                      {/* Scanner Beam */}
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
                     </>
                   )}
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
              {showReset && (
                <Pressable style={styles.secondaryAction} onPress={handleResetPin} disabled={phase === 'working'}>
                  <AnimatedText style={[styles.secondaryLabel, { color: secondaryColor }]}>
                    Cancel & Reset
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    shadowColor: '#000',
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
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  content: {
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 16,
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
  visualWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 4,
    borderColor: '#FFFFFF',
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
  scannerBeam: {
    position: 'absolute',
    width: '100%',
    height: 6,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  successCircle: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheck: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  infoContainer: {
    marginBottom: 24,
    width: '100%',
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 14,
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
    fontSize: 15,
  },
});
