import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinKeypad } from '../components/ui/PinKeypad';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

const PIN_LENGTH = 4;

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.LoginPin>;

export const LoginPinScreen: React.FC<Props> = ({ navigation }) => {
  const [pinValue, setPinValue] = useState('');

  const handleDigit = useCallback(
    (digit: string) => {
      setPinValue(prev => {
        if (prev.length >= PIN_LENGTH) {
          return prev;
        }

        const next = `${prev}${digit}`;
        if (next.length === PIN_LENGTH) {
          navigation.navigate(ROUTES.NfcScan, {
            initialMode: 'signin',
            pin: next,
          });
        }

        return next;
      });
    },
    [navigation],
  );

  const handleBackspace = useCallback(() => {
    setPinValue(prev => prev.slice(0, -1));
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <Ionicons name="wifi-outline" size={40} color={THEME.primary} />
            </View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Enter your PIN to unlock</Text>
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
            <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
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
    backgroundColor: '#1D2330',
    borderWidth: 1,
    borderColor: 'rgba(191, 164, 106, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: THEME.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: THEME.typography.title,
    lineHeight: 30,
    fontWeight: '800',
    color: THEME.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: THEME.typography.subtext,
    color: THEME.foregroundMuted,
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
    borderColor: '#29334A',
  },
  dotFilled: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primaryLight,
  },
  keypadWrapper: {
    marginTop: 8,
  },
});

export default LoginPinScreen;
