import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinGhostButton, PinTopBar } from '@components/ui/pinTheme';
import { PinInput } from '@components/ui/PinInput';
import type { ScanCardFlowSuccess } from '@app-types/wallet';
import { useChangeWalletPinFlow } from '@hooks/useChangeWalletPinFlow';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useSettings } from '@hooks/useSettings';
import { useToast } from '@hooks/useToast';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { PIN_SCREEN_BACKGROUND, styles } from './ChangePin.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ChangePin
>;
type StepKey = 'old' | 'next' | 'confirm';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 3;

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
      {
        key: 'old' as const,
        title: t('changePinCurrentTitle'),
        subtitle: t('changePinCurrentSubtitle'),
      },
      {
        key: 'next' as const,
        title: t('changePinNewTitle'),
        subtitle: t('changePinNewSubtitle'),
      },
      {
        key: 'confirm' as const,
        title: t('changePinConfirmTitle'),
        subtitle: t('changePinConfirmSubtitle'),
      },
    ],
    [t],
  );

  const currentStep = stepMeta[stepIndex];
  const currentPin = pins[currentStep.key];
  const canSubmit = currentPin.length === PIN_LENGTH;
  const submitLabel =
    stepIndex < 2 ? t('changePinPrimaryContinue') : t('changePinPrimaryAction');

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
    setPins(prev => ({
      ...prev,
      [currentStep.key]: prev[currentStep.key].slice(0, -1),
    }));
    setErrorMessage(null);
  }, [currentStep.key]);

  const handleFlowSuccess = useCallback(
    ({ result }: ScanCardFlowSuccess) => {
      if (!result.ok) {
        setErrorMessage(
          result.statusWord
            ? `${result.message} (SW: ${result.statusWord})`
            : result.message,
        );
        navigation.goBack();
        return;
      }

      showToast(t('changePinSuccess'), 'success');
      navigation.pop(2);
    },
    [navigation, showToast, t],
  );

  const registerChangePinFlow = useChangeWalletPinFlow({
    isNfcEnabled: isEnabled,
    oldPin: pins.old,
    nextPin: pins.next,
    onShowToast: showToast,
    onSuccess: handleFlowSuccess,
  });

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
    const flowId = registerChangePinFlow();
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [
    canSubmit,
    navigation,
    pins.confirm,
    pins.next,
    pins.old,
    registerChangePinFlow,
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
        backgroundColor={PIN_SCREEN_BACKGROUND}
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
            afterActionSlot={
              stepIndex > 0 ? (
                <PinGhostButton
                  label={t('commonBack')}
                  onPress={handleStepBack}
                />
              ) : null
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

export default ChangePinScreen;
