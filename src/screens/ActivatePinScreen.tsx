import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinInput } from '../components/ui/PinInput';
import { PIN_COLORS, PinTopBar } from '../components/ui/pinTheme';
import { useAuth } from '../features/auth';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 2;
const AUTH_SCREEN_BACKGROUND = '#08111B';

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
    const flowId = registerScanCardFlow({
      isNfcEnabled: isEnabled,
      initialMode: 'init',
      prefilledPin: createPin,
      onShowToast: showToast,
      onSuccess: async ({ result }: { result: WalletActionResult }) => {
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
    isEnabled,
    navigation,
    showToast,
    step,
    t,
  ]);

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
        backgroundColor={AUTH_SCREEN_BACKGROUND}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <PinTopBar
            onBack={() => navigation.goBack()}
            right={(
              <Text style={styles.stepText}>
                {`${t('commonStep').toUpperCase()} ${currentStepNumber}/${TOTAL_STEPS}`}
              </Text>
            )}
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
            ctaLabel={step === 'create' ? t('activatePrimaryContinue') : t('activatePrimaryAction')}
            heroIconName={step === 'create' ? 'shield-checkmark-outline' : 'checkmark-done-outline'}
            progressCurrent={currentStepNumber}
            progressTotal={TOTAL_STEPS}
            progressLabel={`${t('commonStep')} ${currentStepNumber}/${TOTAL_STEPS}`}
            errorMessage={errorMessage || null}
          />
        </View>

      </SafeAreaView>
    </View>
  );
};

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_SCREEN_BACKGROUND,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
  },
  stepText: {
    color: PIN_COLORS.textSoft,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});

const styles = createStyles();

export default ActivatePinScreen;
