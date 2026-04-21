import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinKeypad } from '../components/ui/PinKeypad';
import { ScanDialog } from '../components/ui/ScanDialog';
import { StepProgressBar } from '../components/ui/StepProgressBar';
import { useAuth } from '../features/auth';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import type { ThemeTokens } from '../types/theme/colors';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 2;

type Step = 'create' | 'confirm';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ActivatePin
>;

export const ActivatePinScreen: React.FC<Props> = ({ navigation }) => {
  const { initializeSession, completeSession } = useAuth();
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('create');
  const [createPin, setCreatePin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scanVisible, setScanVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentStepNumber = step === 'create' ? 1 : 2;
  const pinValue = step === 'create' ? createPin : confirmPin;
  const setPinValue = step === 'create' ? setCreatePin : setConfirmPin;

  const handleDigit = useCallback(
    (digit: string) => {
      setPinValue(prev => {
        if (prev.length >= PIN_LENGTH) {
          return prev;
        }
        return `${prev}${digit}`;
      });
    },
    [setPinValue],
  );

  const handleBackspace = useCallback(() => {
    setErrorMessage('');
    setPinValue(prev => prev.slice(0, -1));
  }, [setPinValue]);

  const handleSubmit = useCallback(() => {
    if (step === 'create') {
      if (createPin.length !== PIN_LENGTH) {
        return;
      }
      setErrorMessage('');
      setStep('confirm');
      return;
    }

    if (confirmPin.length !== PIN_LENGTH) {
      return;
    }

    if (confirmPin !== createPin) {
      setErrorMessage(t('activatePinsNotMatch'));
      setConfirmPin('');
      return;
    }

    setErrorMessage('');
    setScanVisible(true);
  }, [confirmPin, createPin, step, t]);

  const closeScanDialog = useCallback(() => {
    if (submitting) {
      return;
    }
    setScanVisible(false);
  }, [submitting]);

  const handleScanSuccess = useCallback(
    async ({ result }: { result: WalletActionResult }) => {
      if (!result.ethAddress) {
        return;
      }

      setSubmitting(true);
      try {
        const session = await initializeSession(result.ethAddress);
        await completeSession(session.address);
        setScanVisible(false);
        navigation.reset({
          index: 0,
          routes: [
            {
              name: ROUTES.ActivateSuccess,
              params: {
                ethAddress: result.ethAddress,
                publicKeyHex: result.publicKeyHex,
                mode: 'init',
              },
            },
          ],
        });
      } finally {
        setSubmitting(false);
      }
    },
    [completeSession, initializeSession, navigation],
  );

  const stepSubtitle = `${t('commonStep')} ${currentStepNumber} ${t('commonOf')} ${TOTAL_STEPS} — ${t('activateSecureWalletSuffix')}`;
  const title = step === 'create' ? t('activateChoosePinTitle') : t('activateConfirmPinTitle');
  const bodyText =
    step === 'create'
      ? t('activateChoosePinBody')
      : t('activateConfirmPinBody');
  const canSubmit = pinValue.length === PIN_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
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
                color={themeTokens.primary}
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
            <PinKeypad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onSubmit={handleSubmit}
              submitDisabled={!canSubmit || submitting}
            />
          </View>

          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={18} color={themeTokens.primary} />
            <Text style={styles.securityNoteText}>
              {t('activateSecurityNote')}
            </Text>
          </View>
        </View>

        <ScanDialog
          visible={scanVisible}
          isNfcEnabled={isEnabled}
          onClose={closeScanDialog}
          onSuccess={handleScanSuccess}
          onShowToast={showToast}
          initialMode="init"
          prefilledPin={createPin}
        />
      </SafeAreaView>
    </View>
  );
};

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
    fontSize: theme.typography.subtext,
    color: theme.foregroundMuted,
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
    backgroundColor: theme.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: theme.typography.title,
    lineHeight: 28,
    fontWeight: '800',
    color: theme.foreground,
    marginBottom: 6,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: theme.typography.subtext,
    color: theme.foregroundMuted,
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
    borderColor: theme.border,
  },
  dotFilled: {
    backgroundColor: theme.primary,
    borderColor: theme.primaryLight,
  },
  keypadWrapper: {
    marginTop: 4,
    marginBottom: 10,
  },
  errorText: {
    minHeight: 22,
    color: theme.danger,
    fontSize: theme.typography.subtext,
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
    backgroundColor: theme.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  securityNoteText: {
    flex: 1,
    color: theme.foregroundMuted,
    fontSize: theme.typography.subtext,
    lineHeight: 20,
  },
});

export default ActivatePinScreen;
