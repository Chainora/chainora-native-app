import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { ScanDialog } from '../components/ui/ScanDialog';
import { PinKeypad } from '../components/ui/PinKeypad';
import { useAuth } from '../features/auth';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import { useToast } from '../features/toast';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../services/cardService';
import type { ThemeTokens } from '../types/theme/colors';

const PIN_LENGTH = 4;

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.LoginPin>;

export const LoginPinScreen: React.FC<Props> = ({ navigation }) => {
  const { initializeSession, completeSession } = useAuth();
  const { isEnabled } = useNfcEnabled();
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
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

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="wifi-outline" size={40} color={themeTokens.primary} />
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

          <View style={styles.keypadWrapper}>
            <PinKeypad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              onSubmit={openScanDialog}
              submitDisabled={submitting}
            />
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
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: theme.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: theme.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: theme.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.subtext,
    color: theme.foregroundMuted,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 30,
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
    marginTop: 8,
  },
});

export default LoginPinScreen;
