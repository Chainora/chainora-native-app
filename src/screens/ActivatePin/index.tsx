import React, { useCallback, useState } from 'react';
import { StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinInput } from '@components/ui/PinInput';
import { PinTopBar } from '@components/ui/pinTheme';
import type { ScanCardFlowSuccess } from '@app-types/wallet';
import { useAuth } from '@hooks/useAuth';
import { useAuthPinScanFlow } from '@hooks/useAuthPinScanFlow';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useSettings } from '@hooks/useSettings';
import { useToast } from '@hooks/useToast';
import { ROUTES } from '@navigation/routes/routes';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { AUTH_SCREEN_BACKGROUND, styles } from './ActivatePin.styles';

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
  const { resolvedTheme, t } = useSettings();
  const { showToast } = useToast();
  const registerAuthPinScanFlow = useAuthPinScanFlow({
    isNfcEnabled: isEnabled,
    onShowToast: showToast,
  });
  const [step, setStep] = useState<Step>('create');
  const [createPin, setCreatePin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentStepNumber = step === 'create' ? 1 : 2;
  const pinValue = step === 'create' ? createPin : confirmPin;
  const setPinValue = step === 'create' ? setCreatePin : setConfirmPin;

  const handleDigit = useCallback(
    (digit: string) => {
      setErrorMessage('');
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
    const flowId = registerAuthPinScanFlow({
      initialMode: 'init',
      prefilledPin: createPin,
      onSuccess: async ({ result }: ScanCardFlowSuccess) => {
        if (!result.ethAddress) {
          return;
        }

        setSubmitting(true);
        try {
          const session = await initializeSession(result.ethAddress);
          await completeSession(session.address);
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
    });
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [
    completeSession,
    confirmPin,
    createPin,
    initializeSession,
    navigation,
    registerAuthPinScanFlow,
    step,
    t,
  ]);

  const title =
    step === 'create'
      ? t('activateChoosePinTitle')
      : t('activateConfirmPinTitle');
  const bodyText =
    step === 'create'
      ? t('activateChoosePinBody')
      : t('activateConfirmPinBody');
  const canSubmit = pinValue.length === PIN_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={AUTH_SCREEN_BACKGROUND}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <PinTopBar
            onBack={() => navigation.goBack()}
            right={
              <Text style={styles.stepText}>
                {`${t(
                  'commonStep',
                ).toUpperCase()} ${currentStepNumber}/${TOTAL_STEPS}`}
              </Text>
            }
          />

          <PinInput
            variant="screen"
            value={pinValue}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onSubmit={handleSubmit}
            submitDisabled={!canSubmit || submitting}
            title={title}
            subtitle={bodyText}
            ctaLabel={
              step === 'create'
                ? t('activatePrimaryContinue')
                : t('activatePrimaryAction')
            }
            heroIconName={
              step === 'create'
                ? 'shield-checkmark-outline'
                : 'checkmark-done-outline'
            }
            progressCurrent={currentStepNumber}
            progressTotal={TOTAL_STEPS}
            progressLabel={`${t(
              'commonStep',
            )} ${currentStepNumber}/${TOTAL_STEPS}`}
            errorMessage={errorMessage || null}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

export default ActivatePinScreen;
