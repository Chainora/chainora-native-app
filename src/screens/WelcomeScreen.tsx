import React, { useMemo } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  Animated,
  Pressable,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Welcome>;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);
  const { animatedStyle: heroAnimation } = useEntranceAnimation({
    translateInitial: 34,
    fadeDuration: 700,
  });
  const { animatedStyle: buttonsAnimation } = useEntranceAnimation({
    translateInitial: 22,
    delay: 170,
  });

  const handleLogin = () => {
    navigation.navigate(ROUTES.LoginPin);
  };

  const handleActivate = () => {
    navigation.navigate(ROUTES.ActivatePin);
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={styles.container.backgroundColor}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.bgAuraLeft} />
        <View style={styles.bgAuraRight} />

        <View style={styles.content}>
          <Animated.View style={[styles.heroArea, heroAnimation]}>
            <View style={styles.cardWrap}>
              <View style={styles.cardShadow} />
              <View style={styles.cardSurface}>
                <View style={styles.cardChip} />

                <View style={styles.cardBrandRow}>
                  <View style={styles.cardBrandDot} />
                  <Text style={styles.cardBrand}>CHAINORA</Text>
                </View>

                <Text style={styles.cardAddress}>0x4a7f · · · c2e1</Text>

                <View style={styles.cardWaveOne} />
                <View style={styles.cardWaveTwo} />
                <View style={styles.cardWaveThree} />
                <View style={styles.cardShine} />
              </View>
            </View>

            <View style={styles.heroText}>
              <Text style={styles.heroTag}>{t('welcomeHeroTag')}</Text>
              <Text style={styles.heroTitle}>{t('welcomeTitle')}</Text>
              <Text style={styles.heroSubtitle}>{t('welcomeSubtitle')}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.actionsArea, buttonsAnimation]}>
            <Pressable style={styles.primaryButton} onPress={handleLogin}>
              <Text style={styles.primaryButtonText}>{t('welcomeLoginButton')}</Text>
              <Ionicons name="arrow-forward" size={16} color="#EAF4FF" />
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={handleActivate}>
              <Text style={styles.secondaryButtonText}>{t('welcomeActivateButton')}</Text>
            </Pressable>

            <Text style={styles.legalText}>
              {t('welcomeLegalText')}
            </Text>
          </Animated.View>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },
  bgAuraLeft: {
    position: 'absolute',
    left: -120,
    top: -80,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(40, 151, 255, 0.18)',
  },
  bgAuraRight: {
    position: 'absolute',
    right: -140,
    bottom: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
  },
  heroArea: {
    marginTop: 4,
  },
  cardWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
  cardShadow: {
    position: 'absolute',
    bottom: -18,
    width: '92%',
    height: 42,
    borderRadius: 26,
    backgroundColor: 'rgba(15, 30, 60, 0.45)',
  },
  cardSurface: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1.58,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(90, 161, 255, 0.38)',
    backgroundColor: '#0D1320',
    padding: 20,
    overflow: 'hidden',
  },
  cardChip: {
    width: 54,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(96, 129, 179, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(137, 177, 235, 0.5)',
  },
  cardBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    gap: 8,
  },
  cardBrandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4FB4FF',
    shadowColor: '#4FB4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 7,
    elevation: 3,
  },
  cardBrand: {
    color: '#D8E8FF',
    fontSize: 12,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  cardAddress: {
    marginTop: 10,
    color: '#93AACD',
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  cardWaveOne: {
    position: 'absolute',
    right: -36,
    bottom: -36,
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.26)',
  },
  cardWaveTwo: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.28)',
  },
  cardWaveThree: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.36)',
  },
  cardShine: {
    position: 'absolute',
    right: -34,
    top: -18,
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(79, 180, 255, 0.14)',
  },
  heroText: {
    gap: 11,
  },
  heroTag: {
    color: '#62BBFF',
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  heroTitle: {
    color: '#E7EEFA',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  heroSubtitle: {
    color: '#9AA7BE',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  actionsArea: {
    gap: 12,
  },
  primaryButton: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: '#2897FF',
    borderWidth: 1,
    borderColor: 'rgba(128, 204, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#2897FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 22,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#EAF4FF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  secondaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#111826',
    borderWidth: 1,
    borderColor: '#243244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#D3DEEE',
    fontSize: 15,
    fontWeight: '600',
  },
  legalText: {
    marginTop: 2,
    color: '#6E7E98',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});

export default WelcomeScreen;
