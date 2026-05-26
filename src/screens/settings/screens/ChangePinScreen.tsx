import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PinGhostButton,
  PIN_COLORS,
  PinTopBar,
} from '../../../components/ui/pinTheme';
import { PinInput } from '../../../components/ui/PinInput';
import { useNfcEnabled } from '../../../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../../../features/settings';
import { useToast } from '../../../features/toast';
import type { RootStackParamList } from '../../../navigation/routes/rootStackParamList';
import { ROUTES } from '../../../navigation/routes/routes';
import { changeWalletPin, type WalletActionResult } from '../../../services/cardService';
import { registerScanCardFlow } from '../../../services/scanCardFlowRegistry';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ChangePin>;
type StepKey = 'old' | 'next' | 'confirm';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 3;
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PIN_COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 18,
  },
});

const ChangePinScreen: React.FC<Props> = ({ navigation }) => {
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [pins, setPins] = useState<Record<StepKey, string>>({
    old: '',
    next: '',
    confirm: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(t('changePinStatusStart'));

  const stepMeta = useMemo(
    () => [
      { key: 'old' as const, title: t('changePinCurrentTitle'), subtitle: t('changePinCurrentSubtitle') },
      { key: 'next' as const, title: t('changePinNewTitle'), subtitle: t('changePinNewSubtitle') },
      { key: 'confirm' as const, title: t('changePinConfirmTitle'), subtitle: t('changePinConfirmSubtitle') },
    ],
    [t],
  );

  const currentStep = stepMeta[stepIndex];
  const currentPin = pins[currentStep.key];
  const canSubmit = currentPin.length === PIN_LENGTH;
  const submitLabel = stepIndex < 2 ? t('changePinPrimaryContinue') : t('changePinPrimaryAction');

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
      if (!result.ok) {
        setErrorMessage(result.statusWord ? `${result.message} (SW: ${result.statusWord})` : result.message);
        navigation.goBack();
        return;
      }

      showToast(t('changePinSuccess'), 'success');
      navigation.pop(2);
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
    const flowId = registerScanCardFlow({
      isNfcEnabled: isEnabled,
      onShowToast: showToast,
      flowType: 'flow',
      prefilledPin: pins.old,
      onFlowScan: executeChangePin,
      onSuccess: handleFlowSuccess,
    });
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [
    canSubmit,
    executeChangePin,
    handleFlowSuccess,
    isEnabled,
    navigation,
    pins.confirm,
    pins.next,
    pins.old,
    showToast,
    stepIndex,
    stepMeta,
    t,
  ]);

  const handleStepBack = useCallback(() => {
    if (stepIndex <= 0) {
      return;
    }
    setErrorMessage(null);
    setStepIndex(prev => {
      const previousStep = prev - 1;
      setStatusMessage(stepMeta[previousStep].subtitle);
      return previousStep;
    });
  }, [stepIndex, stepMeta]);

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={PIN_COLORS.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <PinTopBar onBack={() => navigation.goBack()} />

          <PinInput
            variant="card"
            value={currentPin}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onSubmit={handleSubmit}
            submitDisabled={!canSubmit}
            title={currentStep.title}
            subtitle={currentStep.subtitle}
            ctaLabel={submitLabel}
            showHero={false}
            squareIndicators
            heroIconName="key-outline"
            progressCurrent={stepIndex + 1}
            progressTotal={TOTAL_STEPS}
            progressLabel={`${t('commonStep')} ${stepIndex + 1}/${TOTAL_STEPS}`}
            supportingText={statusMessage}
            errorMessage={errorMessage}
            afterActionSlot={stepIndex > 0 ? <PinGhostButton label={t('commonBack')} onPress={handleStepBack} /> : null}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

export default ChangePinScreen;
