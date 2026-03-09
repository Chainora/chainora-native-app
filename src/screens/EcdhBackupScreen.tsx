import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import {
  initialisePinAndPrepareBackupDestination,
  performBackupExport,
  performBackupImport,
  signInWallet,
  type WalletActionResult,
} from '../services/cardService';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.EcdhBackup>;

type StepKey = 'mainAuth1' | 'secondaryInit' | 'mainAuth2' | 'secondaryAuth';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 4;

const formatFailure = (message: string, statusWord?: string) =>
  statusWord ? `${message} (SW: ${statusWord})` : message;

export const EcdhBackupScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [pins, setPins] = useState<Record<StepKey, string>>({
    mainAuth1: '',
    secondaryInit: '',
    mainAuth2: '',
    secondaryAuth: '',
  });
  const [statusMessage, setStatusMessage] = useState(t('ecdhInitialStatus'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autofillHint, setAutofillHint] = useState<string | null>(null);
  const [scanVisible, setScanVisible] = useState(false);
  const [done, setDone] = useState(false);

  const [destCert, setDestCert] = useState<Uint8Array | null>(null);
  const [destLinkProof, setDestLinkProof] = useState<Uint8Array | null>(null);
  const [sourceCert, setSourceCert] = useState<Uint8Array | null>(null);
  const [sourceLinkProof, setSourceLinkProof] = useState<Uint8Array | null>(null);
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);

  const flowSteps: Array<{ key: StepKey; title: string; prompt: string; swipeHint: string }> = useMemo(
    () => [
      {
        key: 'mainAuth1',
        title: t('ecdhStepMainAuthTitle'),
        prompt: t('ecdhStepMainAuthPrompt'),
        swipeHint: t('ecdhStepMainAuthSwipe'),
      },
      {
        key: 'secondaryInit',
        title: t('ecdhStepSecondaryInitTitle'),
        prompt: t('ecdhStepSecondaryInitPrompt'),
        swipeHint: t('ecdhStepSecondaryInitSwipe'),
      },
      {
        key: 'mainAuth2',
        title: t('ecdhStepExportTitle'),
        prompt: t('ecdhStepExportPrompt'),
        swipeHint: t('ecdhStepExportSwipe'),
      },
      {
        key: 'secondaryAuth',
        title: t('ecdhStepImportTitle'),
        prompt: t('ecdhStepImportPrompt'),
        swipeHint: t('ecdhStepImportSwipe'),
      },
    ],
    [t],
  );

  const currentStep = flowSteps[stepIndex];
  const currentPin = pins[currentStep.key];

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: t('ecdhHeaderTitle'),
    });
  }, [navigation, t]);

  const progressText = useMemo(() => {
    if (done) {
      return t('ecdhBackupCompleted');
    }
    return `${currentStep.prompt} -> ${currentStep.swipeHint}`;
  }, [currentStep.prompt, currentStep.swipeHint, done, t]);

  const handleDigit = useCallback(
    (digit: string) => {
      setPins(prev => {
        const currentValue = prev[currentStep.key];
        if (currentValue.length >= PIN_LENGTH) {
          return prev;
        }
        return { ...prev, [currentStep.key]: `${currentValue}${digit}` };
      });
      setAutofillHint(null);
      setErrorMessage(null);
    },
    [currentStep.key],
  );

  const handleBackspace = useCallback(() => {
    setPins(prev => ({ ...prev, [currentStep.key]: prev[currentStep.key].slice(0, -1) }));
    setAutofillHint(null);
    setErrorMessage(null);
  }, [currentStep.key]);

  const executeCurrentStep = useCallback(async (): Promise<WalletActionResult> => {
    setStatusMessage(`${currentStep.swipeHint}...`);

    if (stepIndex === 0) {
      return signInWallet(currentPin);
    }

    if (stepIndex === 1) {
      const result = await initialisePinAndPrepareBackupDestination(currentPin);
      if (result.ok && result.deviceCert && result.linkProof) {
        setDestCert(result.deviceCert);
        setDestLinkProof(result.linkProof);
      }
      return result;
    }

    if (stepIndex === 2) {
      if (!destCert || !destLinkProof) {
        return {
          ok: false,
          message: t('ecdhMissingDestination'),
          code: 'BACKUP_EXPORT_FAILED',
        };
      }

      const result = await performBackupExport(currentPin, destCert, destLinkProof);
      if (result.ok && result.envelope && result.sourceCert && result.sourceLinkProof) {
        setEnvelope(result.envelope);
        setSourceCert(result.sourceCert);
        setSourceLinkProof(result.sourceLinkProof);
      }
      return result;
    }

    if (!sourceCert || !sourceLinkProof || !envelope) {
      return {
        ok: false,
        message: t('ecdhMissingSource'),
        code: 'BACKUP_IMPORT_FAILED',
      };
    }

    return performBackupImport(currentPin, sourceCert, sourceLinkProof, envelope);
  }, [currentPin, currentStep.swipeHint, destCert, destLinkProof, envelope, sourceCert, sourceLinkProof, stepIndex, t]);

  const handleFlowScanSuccess = useCallback(
    ({ result }: { result: WalletActionResult }) => {
      setScanVisible(false);

      if (!result.ok) {
        setErrorMessage(formatFailure(result.message, result.statusWord));
        return;
      }

      setErrorMessage(null);

      if (stepIndex === 3) {
        setDone(true);
        setStatusMessage(t('ecdhImportCompleted'));
        return;
      }

      if (stepIndex === 1) {
        setPins(prev => ({
          ...prev,
          mainAuth2: prev.mainAuth1,
        }));
        setAutofillHint(t('ecdhAutofillMainPin'));
      }

      if (stepIndex === 2) {
        setPins(prev => ({
          ...prev,
          secondaryAuth: prev.secondaryInit,
        }));
        setAutofillHint(t('ecdhAutofillSecondaryPin'));
      }

      setStepIndex(prev => prev + 1);
      setStatusMessage(t('ecdhStepSuccessNext'));
    },
    [stepIndex, t],
  );

  const handleRunStep = useCallback(() => {
    if (done) {
      navigation.goBack();
      return;
    }

    if (currentPin.length !== PIN_LENGTH) {
      setErrorMessage(t('ecdhPinLengthError'));
      return;
    }

    setErrorMessage(null);
    setScanVisible(true);
  }, [currentPin, done, navigation]);

  const currentStepNumber = done ? TOTAL_STEPS : stepIndex + 1;
  const canSubmit = done || currentPin.length === PIN_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.stepSubtitle}>{`${t('commonStep')} ${currentStepNumber} ${t('commonOf')} ${TOTAL_STEPS} — ${t('ecdhStepSuffix')}`}</Text>
          <StepProgressBar currentStep={currentStepNumber} totalSteps={TOTAL_STEPS} />

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name={done ? 'checkmark-done-outline' : 'sync-outline'} size={42} color={themeTokens.primary} />
            </View>
            <Text style={styles.title}>{done ? t('ecdhBackupDoneTitle') : currentStep.title}</Text>
            <Text style={styles.bodyText}>{progressText}</Text>
          </View>

          {!done && (
            <>
              <View style={styles.dotsRow}>
                {Array.from({ length: PIN_LENGTH }, (_, index) => (
                  <View key={index} style={[styles.dot, index < currentPin.length && styles.dotFilled]} />
                ))}
              </View>

              {autofillHint && <Text style={styles.autofillHintText}>{autofillHint}</Text>}

              <View style={styles.keypadWrapper}>
                <PinKeypad
                  onDigit={handleDigit}
                  onBackspace={handleBackspace}
                  onSubmit={handleRunStep}
                  submitDisabled={!canSubmit}
                />
              </View>
            </>
          )}

          {statusMessage.length > 0 && <Text style={styles.statusText}>{statusMessage}</Text>}
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          <View style={styles.footerButtons}>
            {done ? (
              <AppButton label={t('commonDone')} onPress={() => navigation.goBack()} />
            ) : (
              <AppButton label={t('commonCancel')} variant="text" onPress={() => navigation.goBack()} />
            )}
          </View>
        </View>

        <ScanDialog
          visible={scanVisible}
          isNfcEnabled={isEnabled}
          onClose={() => setScanVisible(false)}
          onSuccess={handleFlowScanSuccess}
          onShowToast={showToast}
          initialMode="signin"
          prefilledPin={currentPin}
          types="flow"
          onFlowScan={executeCurrentStep}
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
  autofillHintText: {
    color: theme.primaryLight,
    fontSize: theme.typography.small,
    textAlign: 'center',
    marginBottom: 8,
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

export default EcdhBackupScreen;
