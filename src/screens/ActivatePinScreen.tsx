import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { ScanDialog } from '../components/ui/ScanDialog';
import { useAuth } from '../features/auth';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';

const PIN_LENGTH = 4;
const TOTAL_STEPS = 2;
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'submit'] as const;

type Step = 'create' | 'confirm';
type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ActivatePin
>;

export const ActivatePinScreen: React.FC<Props> = ({ navigation }) => {
  const { initializeSession, completeSession } = useAuth();
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);
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
        backgroundColor="#05070D"
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={16} color="#AAB8CF" />
            </Pressable>
            <View style={styles.topBarSpacer} />
            <Text style={styles.stepText}>
              {`${t('commonStep').toUpperCase()} ${currentStepNumber}/${TOTAL_STEPS}`}
            </Text>
          </View>

          <View style={styles.progressRow}>
            <View style={[styles.progressSegment, styles.progressSegmentOn]} />
            <View style={[styles.progressSegment, step === 'confirm' && styles.progressSegmentOn]} />
          </View>

          <View style={styles.header}>
            <View style={styles.pinIconWrap}>
              <Ionicons
                name={step === 'create' ? 'shield-checkmark-outline' : 'checkmark-done-outline'}
                size={32}
                color="#4FB4FF"
              />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.bodyText}>{bodyText}</Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, index < pinValue.length && styles.dotFilled]}
              />
            ))}
          </View>

          <Text style={styles.errorText}>{errorMessage || ' '}</Text>

          <View style={styles.keypad}>
            {KEYPAD_KEYS.map(key => {
              const isBack = key === 'back';
              const isSubmit = key === 'submit';
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [
                    styles.key,
                    isSubmit && styles.keySubmit,
                    pressed && styles.keyPressed,
                  ]}
                  disabled={isSubmit && (!canSubmit || submitting)}
                  onPress={() => {
                    if (key === 'back') {
                      handleBackspace();
                      return;
                    }
                    if (key === 'submit') {
                      handleSubmit();
                      return;
                    }
                    handleDigit(key);
                  }}
                >
                  {isBack && <Ionicons name="backspace-outline" size={22} color="#CBD6EA" />}
                  {isSubmit && (
                    <View style={[styles.submitBubble, (!canSubmit || submitting) && styles.submitBubbleDisabled]}>
                      <Ionicons name="arrow-forward" size={16} color="#EAF4FF" />
                    </View>
                  )}
                  {!isBack && !isSubmit && <Text style={styles.keyText}>{key}</Text>}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <View style={styles.securityNote}>
              <Ionicons name="lock-closed-outline" size={16} color="#4FB4FF" />
              <Text style={styles.securityNoteText}>{t('activateSecurityNote')}</Text>
            </View>
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

const createStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070D',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#121A28',
    borderWidth: 1,
    borderColor: '#233145',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarSpacer: {
    flex: 1,
  },
  stepText: {
    color: '#8EA0BC',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1B2536',
  },
  progressSegmentOn: {
    backgroundColor: '#2897FF',
  },
  header: {
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 18,
  },
  pinIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.42)',
    backgroundColor: 'rgba(24, 44, 69, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#EAF0FB',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  bodyText: {
    marginTop: 8,
    color: '#9AA7BE',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: '#2C384C',
    backgroundColor: '#0D1320',
  },
  dotFilled: {
    borderColor: '#4FB4FF',
    backgroundColor: '#2897FF',
  },
  errorText: {
    minHeight: 20,
    textAlign: 'center',
    color: '#FF7A7A',
    fontSize: 12,
    marginBottom: 2,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  key: {
    width: '31.2%',
    height: 70,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#253349',
    backgroundColor: '#101827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySubmit: {
    borderColor: '#355072',
    backgroundColor: '#0E1726',
  },
  keyPressed: {
    backgroundColor: '#162137',
  },
  keyText: {
    color: '#E7EEFA',
    fontSize: 30,
    fontWeight: '500',
  },
  submitBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(128, 204, 255, 0.7)',
    backgroundColor: '#2897FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBubbleDisabled: {
    opacity: 0.45,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223248',
    backgroundColor: '#111A29',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  securityNoteText: {
    flex: 1,
    color: '#9CACCA',
    fontSize: 12,
    lineHeight: 18,
  },
});

export default ActivatePinScreen;
