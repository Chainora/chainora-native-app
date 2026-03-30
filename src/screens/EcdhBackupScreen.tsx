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

type StepKey =
  | 'pinMain'
  | 'pinSecondary'
  | 'scanMainAuth'
  | 'scanSecondaryInit'
  | 'scanMainExport'
  | 'scanSecondaryImport';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 6;

const formatFailure = (message: string, statusWord?: string) =>
  statusWord ? `${message} (SW: ${statusWord})` : message;

export const EcdhBackupScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [mainPin, setMainPin] = useState('');
  const [secondaryPin, setSecondaryPin] = useState('');
  const [statusMessage, setStatusMessage] = useState(t('ecdhInitialStatus'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanVisible, setScanVisible] = useState(false);
  const [done, setDone] = useState(false);

  const [destCert, setDestCert] = useState<Uint8Array | null>(null);
  const [destLinkProof, setDestLinkProof] = useState<Uint8Array | null>(null);
  const [sourceCert, setSourceCert] = useState<Uint8Array | null>(null);
  const [sourceLinkProof, setSourceLinkProof] = useState<Uint8Array | null>(null);
  const [envelope, setEnvelope] = useState<Uint8Array | null>(null);

  const flowSteps: Array<{ key: StepKey; title: string; prompt: string }> = useMemo(
    () => [
      {
        key: 'pinMain',
        title: t('ecdhStepMainAuthTitle'),
        prompt: t('ecdhStepMainAuthPrompt'),
      },
      {
        key: 'pinSecondary',
        title: t('ecdhStepSecondaryInitTitle'),
        prompt: t('ecdhStepSecondaryInitPrompt'),
      },
      {
        key: 'scanMainAuth',
        title: t('ecdhStepMainAuthTitle'),
        prompt: t('ecdhStepMainAuthSwipe'),
      },
      {
        key: 'scanSecondaryInit',
        title: t('ecdhStepSecondaryInitTitle'),
        prompt: t('ecdhStepSecondaryInitSwipe'),
      },
      {
        key: 'scanMainExport',
        title: t('ecdhStepExportTitle'),
        prompt: t('ecdhStepExportSwipe'),
      },
      {
        key: 'scanSecondaryImport',
        title: t('ecdhStepImportTitle'),
        prompt: t('ecdhStepImportSwipe'),
      },
    ],
    [t],
  );

  const currentStep = flowSteps[stepIndex];
  const isPinStep = currentStep.key === 'pinMain' || currentStep.key === 'pinSecondary';
  const currentPin = currentStep.key === 'pinMain' ? mainPin : secondaryPin;
  const scanPin =
    currentStep.key === 'scanMainAuth' || currentStep.key === 'scanMainExport'
      ? mainPin
      : secondaryPin;

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
    return currentStep.prompt;
  }, [currentStep.prompt, done, t]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (!isPinStep || digit.length === 0) {
        return;
      }

      if (currentStep.key === 'pinMain') {
        setMainPin(prev => (prev.length >= PIN_LENGTH ? prev : `${prev}${digit}`));
      } else {
        setSecondaryPin(prev => (prev.length >= PIN_LENGTH ? prev : `${prev}${digit}`));
      }
      setErrorMessage(null);
    },
    [currentStep.key, isPinStep],
  );

  const handleBackspace = useCallback(() => {
    if (!isPinStep) {
      return;
    }

    if (currentStep.key === 'pinMain') {
      setMainPin(prev => prev.slice(0, -1));
    } else {
      setSecondaryPin(prev => prev.slice(0, -1));
    }
    setErrorMessage(null);
  }, [currentStep.key, isPinStep]);

  const executeCurrentStep = useCallback(async (): Promise<WalletActionResult> => {
    setStatusMessage(`${currentStep.prompt}...`);

    if (currentStep.key === 'scanMainAuth') {
      return signInWallet(mainPin);
    }

    if (currentStep.key === 'scanSecondaryInit') {
      const result = await initialisePinAndPrepareBackupDestination(secondaryPin);
      if (result.ok && result.deviceCert && result.linkProof) {
        setDestCert(result.deviceCert);
        setDestLinkProof(result.linkProof);
      }
      return result;
    }

    if (currentStep.key === 'scanMainExport') {
      if (!destCert || !destLinkProof) {
        return {
          ok: false,
          message: t('ecdhMissingDestination'),
          code: 'BACKUP_EXPORT_FAILED',
        };
      }

      const result = await performBackupExport(mainPin, destCert, destLinkProof);
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

    return performBackupImport(secondaryPin, sourceCert, sourceLinkProof, envelope);
  }, [
    currentStep.key,
    currentStep.prompt,
    destCert,
    destLinkProof,
    envelope,
    mainPin,
    secondaryPin,
    sourceCert,
    sourceLinkProof,
    t,
  ]);

  const handleFlowScanSuccess = useCallback(
    ({ result }: { result: WalletActionResult }) => {
      setScanVisible(false);

      if (!result.ok) {
        setErrorMessage(formatFailure(result.message, result.statusWord));
        return;
      }

      setErrorMessage(null);

      if (stepIndex === flowSteps.length - 1) {
        setDone(true);
        setStatusMessage(t('ecdhImportCompleted'));
        return;
      }

      setStepIndex(prev => prev + 1);
      setStatusMessage(t('ecdhStepSuccessNext'));
    },
    [flowSteps.length, stepIndex, t],
  );

  const handleRunStep = useCallback(() => {
    if (done) {
      navigation.goBack();
      return;
    }

    if (isPinStep) {
      if (currentPin.length !== PIN_LENGTH) {
        setErrorMessage(t('ecdhPinLengthError'));
        return;
      }

      setErrorMessage(null);
      setStatusMessage(t('ecdhStepSuccessNext'));
      setStepIndex(prev => prev + 1);
      return;
    }

    setErrorMessage(null);
    setScanVisible(true);
  }, [currentPin, done, isPinStep, navigation, t]);

  const currentStepNumber = done ? TOTAL_STEPS : stepIndex + 1;
  const canSubmit = done || !isPinStep || currentPin.length === PIN_LENGTH;

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

          {!done && isPinStep && (
            <>
              <View style={styles.dotsRow}>
                {Array.from({ length: PIN_LENGTH }, (_, index) => (
                  <View key={index} style={[styles.dot, index < currentPin.length && styles.dotFilled]} />
                ))}
              </View>

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

          {!done && !isPinStep && (
            <View style={styles.scanActionWrap}>
              <AppButton label={t('scanPrimaryScanCard')} onPress={handleRunStep} />
            </View>
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
          prefilledPin={scanPin}
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
  scanActionWrap: {
    width: '100%',
    marginTop: 10,
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
