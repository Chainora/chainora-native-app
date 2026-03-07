import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinKeypad } from '../components/ui/PinKeypad';
import { StepProgressBar } from '../components/ui/StepProgressBar';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 2;

type Step = 'create' | 'confirm';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ActivatePin
>;

export const ActivatePinScreen: React.FC<Props> = ({ navigation }) => {
  const [step, setStep] = useState<Step>('create');
  const [createPin, setCreatePin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const currentStepNumber = step === 'create' ? 1 : 2;
  const pinValue = step === 'create' ? createPin : confirmPin;
  const setPinValue = step === 'create' ? setCreatePin : setConfirmPin;

  const handleDigit = useCallback(
    (digit: string) => {
      setPinValue(prev => {
        if (prev.length >= PIN_LENGTH) {
          return prev;
        }

        const next = `${prev}${digit}`;
        if (next.length === PIN_LENGTH) {
          if (step === 'create') {
            setErrorMessage('');
            setStep('confirm');
            setConfirmPin('');
          } else if (next === createPin) {
            navigation.navigate(ROUTES.NfcScan, {
              initialMode: 'init',
              pin: createPin,
            });
          } else {
            setErrorMessage('PINs do not match. Try again.');
            return '';
          }
        }

        return next;
      });
    },
    [createPin, navigation, setPinValue, step],
  );

  const handleBackspace = useCallback(() => {
    setErrorMessage('');
    setPinValue(prev => prev.slice(0, -1));
  }, [setPinValue]);

  const stepSubtitle = `Step ${currentStepNumber} of ${TOTAL_STEPS} — Secure your wallet`;
  const title = step === 'create' ? 'Choose a 4-digit PIN' : 'Confirm your PIN';
  const bodyText =
    step === 'create'
      ? 'This PIN protects your card. Never share it.'
      : 'Re-enter your PIN to confirm.';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.stepSubtitle}>{stepSubtitle}</Text>
          <StepProgressBar
            currentStep={currentStepNumber}
            totalSteps={TOTAL_STEPS}
          />

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons
                name={
                  step === 'create'
                    ? 'shield-checkmark-outline'
                    : 'checkmark-done-outline'
                }
                size={42}
                color={THEME.primary}
              />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.bodyText}>{bodyText}</Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index < pinValue.length && styles.dotFilled,
                ]}
              />
            ))}
          </View>

          {!!errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}

          <View style={styles.keypadWrapper}>
            <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
          </View>

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={18} color={THEME.primary} />
            <Text style={styles.securityNoteText}>
              Your PIN is stored on the card, not on your phone or any server.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: 'center',
  },
  stepSubtitle: {
    fontSize: THEME.typography.subtext,
    color: THEME.foregroundMuted,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  iconWrapper: {
    width: 78,
    height: 78,
    borderRadius: 20,
    backgroundColor: '#1D2330',
    borderWidth: 1,
    borderColor: 'rgba(191, 164, 106, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: THEME.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: THEME.typography.title,
    lineHeight: 28,
    fontWeight: '800',
    color: THEME.foreground,
    marginBottom: 6,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: THEME.typography.subtext,
    color: THEME.foregroundMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#29334A',
  },
  dotFilled: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primaryLight,
  },
  keypadWrapper: {
    marginTop: 4,
    marginBottom: 10,
  },
  errorText: {
    minHeight: 22,
    color: THEME.danger,
    fontSize: THEME.typography.subtext,
    fontWeight: '600',
    textAlign: 'center',
  },
  securityNote: {
    marginTop: 6,
    width: '100%',
    minHeight: 68,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.surfaceHighlight,
    borderWidth: 1,
    borderColor: THEME.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  securityNoteText: {
    flex: 1,
    color: '#6D7891',
    fontSize: THEME.typography.subtext,
    lineHeight: 20,
  },
});

export default ActivatePinScreen;
