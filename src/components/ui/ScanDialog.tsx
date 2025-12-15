import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';

import { AppButton } from '../AppButton';
import { PinInput } from './PinInput';
import { initialiseWallet, signInWallet, WalletActionResult, WalletActionCode } from '../../services/cardService';
import { THEME } from '../../utils/theme/colors';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);
const CHROME_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);
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
    lines.push(`Public key: ${formatPublicKeySummary(result.publicKeyHex)}`);
  }

  if (result.ok && result.ethAddress) {
    lines.push(`Ethereum address: ${result.ethAddress}`);
  }

  const suggestion = suggestionForCode(mode, result.code);
  if (suggestion) {
    lines.push(suggestion);
  }

  if (result.statusWord) {
    lines.push(`Status word: ${result.statusWord}`);
  }

  return lines;
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
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);
  const operationTokenRef = useRef(0); // Cancels in-flight NFC operations when state resets.

  const modeInstructions = useMemo(
    () => ({
      init: 'Enter your 4 digit PIN to set up your wallet',
      signin: 'Enter your 4 digit PIN to sign in',
    }),
    [],
  );

  const dialogBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#0F172A'],
  });
  const dialogBorder = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(15,23,42,0.08)', 'rgba(148,163,184,0.4)'],
  });
  const subtitleColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0F172A', '#E2E8F0'],
  });
  const infoColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1F2937', '#CBD5F5'],
  });
  const secondaryColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.primary, '#60A5FA'],
  });
  const tabBackground = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#EEF2FF', '#162038'],
  });
  const tabIndicatorColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THEME.primary, '#38BDF8'],
  });
  const tabActiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0F172A', '#F8FAFC'],
  });
  const tabInactiveColor = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#64748B', '#94A3B8'],
  });

  useEffect(() => {
    return () => {
      operationTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onScanningChange?.(phase === 'working');
  }, [phase, onScanningChange]);

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      onShowToast?.(message, type);
    },
    [onShowToast],
  );

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
      return;
    }

    resetForMode('init');
  }, [visible, mode, resetForMode]);

  const handleModeChange = useCallback(
    (nextMode: ScanMode) => {
      if (nextMode === mode) {
        return;
      }

      resetForMode(nextMode, false);
      Animated.timing(indicatorAnim, {
        toValue: nextMode === 'init' ? 0 : 1,
        duration: 320,
        easing: CHROME_EASING,
        useNativeDriver: false,
      }).start();
    },
    [indicatorAnim, mode, resetForMode],
  );

  const handlePinChange = useCallback((value: string) => {
    setPinValue(value.replace(/\D/g, '').slice(0, PIN_LENGTH));
  }, []);

  const beginScan = useCallback(async () => {
    if (isNfcEnabled === false) {
      Alert.alert('NFC disabled', 'Turn on NFC in system settings and try again.');
      showToast('NFC is disabled', 'error');
      return;
    }

    const token = operationTokenRef.current + 1;
    operationTokenRef.current = token;
    setPhase('working');
    setInfoLines([]);
    setStatusMessage('Hold your card near the device');
    onStatusChange?.('Hold your card near the device');

    try {
      const result = mode === 'init' ? await initialiseWallet(pinValue) : await signInWallet(pinValue);
      if (operationTokenRef.current !== token) {
        return;
      }

      setInfoLines(buildInfoLines(mode, result));

      if (result.ok) {
        setPhase('success');
        setStatusMessage(result.message);
        onStatusChange?.(result.message);
        showToast('Scan completed successfully', 'success');
        onSuccess?.({ result, mode });
      } else {
        setPhase('error');
        setStatusMessage(result.message);
        onStatusChange?.(result.message);
        showToast(result.message, 'error');
      }
    } catch (error) {
      if (operationTokenRef.current !== token) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const fallbackMessage = `Scan failed: ${message}`;
      setInfoLines([]);
      setPhase('error');
      setStatusMessage(fallbackMessage);
      onStatusChange?.(fallbackMessage);
      showToast(fallbackMessage, 'error');
    }
  }, [isNfcEnabled, mode, onStatusChange, onSuccess, pinValue, showToast]);

  const handleSubmitPin = useCallback(() => {
    if (pinValue.length !== PIN_LENGTH) {
      showToast(`PIN must be ${PIN_LENGTH} digits`, 'error');
      return;
    }

    beginScan();
  }, [beginScan, pinValue.length, showToast]);

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

  const tabScales = [
    indicatorAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }),
    indicatorAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
  ];

  const themeScheme: 'light' | 'dark' = mode === 'signin' ? 'dark' : 'light';
  const shouldShowVideo = phase === 'working';
  const showReset = phase !== 'pin';

  const primaryButtonLabel = phase === 'pin' ? 'Submit' : phase === 'success' ? 'Scan Again' : 'Try Again';
  const disablePrimaryButton = phase === 'working' || (phase === 'pin' && pinValue.length !== PIN_LENGTH);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.dialog, { backgroundColor: dialogBackground, borderColor: dialogBorder }]}> 
          <Animated.View
            style={[styles.tabContainer, { backgroundColor: tabBackground }]}
            onLayout={event => {
              const widthPerTab = event.nativeEvent.layout.width / MODE_OPTIONS.length;
              if (Math.abs(widthPerTab - tabWidth) > 0.5) {
                setTabWidth(widthPerTab);
              }
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.tabIndicator, { width: tabWidth || undefined, backgroundColor: tabIndicatorColor }, {
                transform: [
                  {
                    translateX: indicatorAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, tabWidth],
                    }),
                  },
                ],
              }]}
            />
            {MODE_OPTIONS.map((option, index) => {
              const selected = option.value === mode;
              return (
                <AnimatedPressable
                  key={option.value}
                  style={[styles.tabButton, index === 0 ? styles.tabButtonLeft : styles.tabButtonRight, {
                    transform: [{ scale: tabScales[index] }],
                  }]}
                  onPress={() => handleModeChange(option.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <AnimatedText
                    style={[styles.tabLabel, selected ? { color: tabActiveColor } : { color: tabInactiveColor }]}
                  >
                    {option.label}
                  </AnimatedText>
                </AnimatedPressable>
              );
            })}
          </Animated.View>

          <View style={styles.content}>
            <AnimatedText style={[styles.subtitle, { color: subtitleColor }]}>{statusMessage}</AnimatedText>

            {phase === 'pin' ? (
              <PinInput value={pinValue} onChange={handlePinChange} disabled={phase !== 'pin'} colorScheme={themeScheme} />
            ) : null}

            {shouldShowVideo ? (
              <View style={styles.videoWrapper}>
                <Video
                  source={SCAN_GUIDE_VIDEO}
                  style={styles.video}
                  resizeMode="contain"
                  repeat
                  muted
                  paused={!shouldShowVideo}
                  accessibilityLabel="NFC scanning guide"
                />
              </View>
            ) : null}

            {infoLines.map(line => (
              <AnimatedText key={line} style={[styles.infoText, { color: infoColor }]}>
                {line}
              </AnimatedText>
            ))}

            <View style={styles.actions}>
              <AppButton label={primaryButtonLabel} onPress={handlePrimaryAction} disabled={disablePrimaryButton} />
              {showReset ? (
                <Pressable style={styles.secondaryAction} onPress={handleResetPin} disabled={phase === 'working'}>
                  <AnimatedText style={[styles.secondaryLabel, { color: secondaryColor }]}>{'Reset PIN'}</AnimatedText>
                </Pressable>
              ) : null}
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 16,
    marginBottom: 28,
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    borderRadius: 16,
    backgroundColor: THEME.primary,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLeft: {
    paddingLeft: 8,
  },
  tabButtonRight: {
    paddingRight: 8,
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  content: {
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  videoWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  actions: {
    width: '100%',
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryAction: {
    marginTop: 12,
  },
  secondaryLabel: {
    fontWeight: '600',
  },
});
