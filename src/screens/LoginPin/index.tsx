import React, { useCallback, useRef, useState } from 'react';
import { StatusBar, View } from 'react-native';
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
import { AUTH_SCREEN_BACKGROUND, styles } from './LoginPin.styles';

const PIN_LENGTH = 4;
type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.LoginPin>;

export const LoginPinScreen: React.FC<Props> = ({ navigation }) => {
  const { initializeSession, completeSession } = useAuth();
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const { showToast } = useToast();
  const registerAuthPinScanFlow = useAuthPinScanFlow({
    isNfcEnabled: isEnabled,
    onShowToast: showToast,
  });
  const [pinValue, setPinValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pinValueRef = useRef('');

  const handleDigit = useCallback((digit: string) => {
    setPinValue(prev => {
      if (prev.length >= PIN_LENGTH) {
        return prev;
      }
      const next = `${prev}${digit}`;
      pinValueRef.current = next;
      return next;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setPinValue(prev => {
      const next = prev.slice(0, -1);
      pinValueRef.current = next;
      return next;
    });
  }, []);

  const openScanScreen = useCallback(() => {
    if (pinValueRef.current.length !== PIN_LENGTH) {
      showToast(t('scanErrorEnterPin4'), 'error');
      return;
    }
    const flowId = registerAuthPinScanFlow({
      initialMode: 'signin',
      prefilledPin: pinValueRef.current,
      onSuccess: async ({ result }: ScanCardFlowSuccess) => {
        if (!result.ethAddress) {
          return;
        }

        setSubmitting(true);
        try {
          const session = await initializeSession(result.ethAddress);
          await completeSession(session.address);
          pinValueRef.current = '';
          setPinValue('');
          navigation.reset({
            index: 0,
            routes: [
              {
                name: ROUTES.Home,
                params: {
                  ethAddress: result.ethAddress,
                  publicKeyHex: result.publicKeyHex,
                  mode: 'signin',
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
    initializeSession,
    navigation,
    registerAuthPinScanFlow,
    showToast,
    t,
  ]);

  const canSubmit = pinValue.length === PIN_LENGTH && !submitting;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={AUTH_SCREEN_BACKGROUND}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <PinTopBar onBack={() => navigation.goBack()} />

          <PinInput
            variant="screen"
            value={pinValue}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onSubmit={openScanScreen}
            submitDisabled={!canSubmit}
            title={t('loginWelcomeBack')}
            subtitle={t('loginEnterPinSubtitle')}
            ctaLabel={t('loginPrimaryAction')}
            heroIconName="wifi-outline"
            animateHero
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

export default LoginPinScreen;
