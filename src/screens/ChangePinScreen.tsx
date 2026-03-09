import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { AppButton } from '../components/AppButton';
import { PinKeypad } from '../components/ui/PinKeypad';
import { ScanDialog } from '../components/ui/ScanDialog';
import { StepProgressBar } from '../components/ui/StepProgressBar';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { changeWalletPin, type WalletActionResult } from '../services/cardService';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ChangePin>;

type StepKey = 'old' | 'next' | 'confirm';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 3;

export const ChangePinScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [pins, setPins] = useState<Record<StepKey, string>>({
    old: '',
    next: '',
    confirm: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(t('changePinStatusStart'));
  const [scanVisible, setScanVisible] = useState(false);

  const stepMeta: Array<{ key: StepKey; title: string; subtitle: string }> = useMemo(
    () => [
      { key: 'old', title: t('changePinCurrentTitle'), subtitle: t('changePinCurrentSubtitle') },
      { key: 'next', title: t('changePinNewTitle'), subtitle: t('changePinNewSubtitle') },
      { key: 'confirm', title: t('changePinConfirmTitle'), subtitle: t('changePinConfirmSubtitle') },
    ],
    [t],
  );

  const currentStep = stepMeta[stepIndex];
  const currentPin = pins[currentStep.key];

  const canSubmit = currentPin.length === PIN_LENGTH;

  const progressMessage = useMemo(() => {
    return `${currentStep.title} — ${currentStep.subtitle}`;
  }, [currentStep.subtitle, currentStep.title]);

  const handleDigit = useCallback(
    (digit: string) => {
      setPins(prev => {
        const value = prev[currentStep.key];
        if (value.length >= PIN_LENGTH) {
          return prev;
        }
        return { ...prev, [currentStep.key]: `${value}${digit}` };
      });
      setErrorMessage(null);
    },
    [currentStep.key],
  );

  const handleBackspace = useCallback(() => {
    setPins(prev => ({ ...prev, [currentStep.key]: prev[currentStep.key].slice(0, -1) }));
    setErrorMessage(null);
  }, [currentStep.key]);

  const executeChangePin = useCallback(async (): Promise<WalletActionResult> => {
    return changeWalletPin(pins.old, pins.next);
  }, [pins.next, pins.old]);

  const handleFlowSuccess = useCallback(
    ({ result }: { result: WalletActionResult }) => {
      setScanVisible(false);

      if (!result.ok) {
        setErrorMessage(result.statusWord ? `${result.message} (SW: ${result.statusWord})` : result.message);
        return;
      }

      showToast(t('changePinSuccess'), 'success');
      navigation.goBack();
    },
    [navigation, showToast, t],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit) {
      return;
    }

    if (stepIndex < 2) {
      setStepIndex(prev => prev + 1);
      setStatusMessage(stepMeta[stepIndex + 1].subtitle);
      return;
    }

    if (pins.confirm !== pins.next) {
      setErrorMessage(t('changePinErrorConfirmMismatch'));
      setPins(prev => ({ ...prev, confirm: '' }));
      return;
    }

    if (pins.old === pins.next) {
      setErrorMessage(t('changePinErrorMustDiffer'));
      return;
    }

    setErrorMessage(null);
    setStatusMessage(t('changePinStatusSwipe'));
    setScanVisible(true);
  }, [canSubmit, pins.confirm, pins.next, pins.old, stepIndex, stepMeta, t]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.stepSubtitle}>{`${t('commonStep')} ${stepIndex + 1} ${t('commonOf')} ${TOTAL_STEPS} — ${t('changePinStepSuffix')}`}</Text>
          <StepProgressBar currentStep={stepIndex + 1} totalSteps={TOTAL_STEPS} />

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="key-outline" size={42} color={themeTokens.primary} />
            </View>
            <Text style={styles.title}>{currentStep.title}</Text>
            <Text style={styles.bodyText}>{progressMessage}</Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <View key={index} style={[styles.dot, index < currentPin.length && styles.dotFilled]} />
            ))}
          </View>

          <View style={styles.keypadWrapper}>
            <PinKeypad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onSubmit={handleSubmit}
              submitDisabled={!canSubmit}
            />
          </View>

          <Text style={styles.statusText}>{statusMessage}</Text>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          <View style={styles.footerButtons}>
            <AppButton label={t('commonCancel')} variant="text" onPress={() => navigation.goBack()} />
          </View>
        </View>

        <ScanDialog
          visible={scanVisible}
          isNfcEnabled={isEnabled}
          onClose={() => setScanVisible(false)}
          onSuccess={handleFlowSuccess}
          onShowToast={showToast}
          types="flow"
          prefilledPin={pins.old}
          onFlowScan={executeChangePin}
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
    paddingTop: 6,
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
    marginBottom: 12,
  },
  statusText: {
    color: '#9AA5BA',
    fontSize: theme.typography.subtext,
    textAlign: 'center',
    minHeight: 18,
  },
  errorText: {
    color: theme.danger,
    fontSize: theme.typography.subtext,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 22,
  },
  footerButtons: {
    width: '100%',
    marginTop: 12,
  },
});

export default ChangePinScreen;
