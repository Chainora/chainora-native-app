import React, { useCallback, useMemo, useRef, useState } from 'react';
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
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'submit'] as const;

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.LoginPin>;

export const LoginPinScreen: React.FC<Props> = ({ navigation }) => {
  const { initializeSession, completeSession } = useAuth();
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);
  const { showToast } = useToast();
  const [pinValue, setPinValue] = useState('');
  const [scanVisible, setScanVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pinValueRef = useRef('');

  const handleDigit = useCallback(
    (digit: string) => {
      setPinValue(prev => {
        if (prev.length >= PIN_LENGTH) {
          return prev;
        }
        const next = `${prev}${digit}`;
        pinValueRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleBackspace = useCallback(() => {
    setPinValue(prev => {
      const next = prev.slice(0, -1);
      pinValueRef.current = next;
      return next;
    });
  }, []);

  const openScanDialog = useCallback(() => {
    if (pinValueRef.current.length !== PIN_LENGTH) {
      showToast(t('scanErrorEnterPin4'), 'error');
      return;
    }
    setScanVisible(true);
  }, [showToast, t]);

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
        pinValueRef.current = '';
        setPinValue('');
        setScanVisible(false);
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
    [completeSession, initializeSession, navigation],
  );

  const canSubmit = pinValue.length === PIN_LENGTH && !submitting;

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
            <View style={styles.topBarGhost} />
          </View>

          <View style={styles.header}>
            <View style={styles.pinIconWrap}>
              <Ionicons name="wifi-outline" size={34} color="#4FB4FF" />
              <View style={styles.iconRing} />
            </View>
            <Text style={styles.title}>{t('loginWelcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('loginEnterPinSubtitle')}</Text>
          </View>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, index < pinValue.length && styles.dotFilled]}
              />
            ))}
          </View>

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
                  disabled={isSubmit && !canSubmit}
                  onPress={() => {
                    if (key === 'back') {
                      handleBackspace();
                      return;
                    }
                    if (key === 'submit') {
                      openScanDialog();
                      return;
                    }
                    handleDigit(key);
                  }}
                >
                  {isBack && <Ionicons name="backspace-outline" size={22} color="#CBD6EA" />}
                  {isSubmit && (
                    <View style={[styles.submitBubble, !canSubmit && styles.submitBubbleDisabled]}>
                      <Ionicons name="arrow-forward" size={16} color="#EAF4FF" />
                    </View>
                  )}
                  {!isBack && !isSubmit && <Text style={styles.keyText}>{key}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScanDialog
          visible={scanVisible}
          isNfcEnabled={isEnabled}
          onClose={closeScanDialog}
          onSuccess={handleScanSuccess}
          onShowToast={showToast}
          initialMode="signin"
          prefilledPin={pinValue}
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
  topBarGhost: {
    width: 34,
    height: 34,
  },
  header: {
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 18,
  },
  pinIconWrap: {
    width: 82,
    height: 82,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.42)',
    backgroundColor: 'rgba(24, 44, 69, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconRing: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.18)',
  },
  title: {
    color: '#EAF0FB',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
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
    marginBottom: 18,
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
});

export default LoginPinScreen;
