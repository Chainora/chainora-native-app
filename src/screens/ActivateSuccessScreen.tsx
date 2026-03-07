import React from 'react';
import { StatusBar, StyleSheet, Text, View, Animated } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { FloatingOrb } from '../components/ui/animations/FloatingOrb';
import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ActivateSuccess>;

export const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex, mode } = route.params;
  const { animatedStyle: cardAnimation } = useEntranceAnimation({ translateInitial: 32, fadeDuration: 700 });
  const { animatedStyle: buttonAnimation } = useEntranceAnimation({ translateInitial: 20, delay: 200 });

  const shortAddress = ethAddress ? `${ethAddress.slice(0, 6)}...${ethAddress.slice(-4)}` : '';

  const handleGoHome = () => {
    navigation.navigate(ROUTES.Home, {
      ethAddress,
      publicKeyHex,
      mode,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FloatingOrb color={THEME.success} size={320} initial={{ x: -80, y: -80 }} duration={12000} />
        <FloatingOrb color={THEME.primary} size={260} initial={{ x: 220, y: 320 }} duration={14000} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Animated.View style={cardAnimation}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconCheck}>✓</Text>
            </View>

            <Text style={styles.title}>Wallet Activated!</Text>
            <Text style={styles.subtitle}>Your card is ready to use.</Text>

            <View style={styles.cardInfo}>
              <Text style={styles.cardLabel}>Wallet address</Text>
              <Text style={styles.cardValue}>{shortAddress}</Text>
            </View>
          </Animated.View>

          <Animated.View style={buttonAnimation}>
            <AppButton label="Go to Wallet" onPress={handleGoHome} />
          </Animated.View>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#16A34A',
    marginBottom: 24,
  },
  iconCheck: {
    fontSize: THEME.typography.display,
    fontWeight: '800',
    color: '#22C55E',
  },
  title: {
    fontSize: THEME.typography.title,
    fontWeight: '800',
    color: THEME.foreground,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: THEME.typography.subtext,
    color: THEME.foregroundMuted,
    marginBottom: 24,
  },
  cardInfo: {
    backgroundColor: THEME.surfaceHighlight,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardLabel: {
    fontSize: THEME.typography.small,
    fontWeight: '700',
    color: THEME.foregroundMuted,
    marginBottom: 4,
    letterSpacing: 1,
  },
  cardValue: {
    fontSize: THEME.typography.body,
    fontWeight: '600',
    color: THEME.foreground,
  },
});

export default ActivateSuccessScreen;
