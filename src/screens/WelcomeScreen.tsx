import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const MIN_SCALE = 0.92;
const MAX_SCALE = 1.08;
const DISPLAY_FONT_BOLD = Platform.select({
  ios: 'Unbounded-ExtraBold',
  android: 'Unbounded-ExtraBold',
  default: 'System',
});
const DISPLAY_FONT_MEDIUM = Platform.select({
  ios: 'Unbounded-Medium',
  android: 'Unbounded-Medium',
  default: 'System',
});
const SANS_FONT = Platform.select({
  ios: 'Geist-Regular',
  android: 'Geist-Regular',
  default: 'System',
});
const SANS_FONT_SEMIBOLD = Platform.select({
  ios: 'Geist-SemiBold',
  android: 'Geist-SemiBold',
  default: 'System',
});
const MONO_FONT = Platform.select({
  ios: 'GeistMono-Regular',
  android: 'GeistMono-Regular',
  default: 'monospace',
});

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Welcome>;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { resolvedTheme, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useMemo(() => {
    const next = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }, [height, width]);

  const styles = useMemo(
    () =>
      createStyles({
        scale,
        topPadding: Math.max(100 * scale, insets.top + 36 * scale),
        bottomPadding: Math.max(48 * scale, insets.bottom + 14 * scale),
      }),
    [insets.bottom, insets.top, scale],
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor="#08111B"
      />
      <View style={styles.content}>
        <View style={styles.heroBlock}>
          <View style={styles.cardWrap}>
            <View style={styles.cardSurface}>
              <View style={styles.cardGlowPrimary} />
              <View style={styles.cardGlowSecondary} />
              <View style={styles.cardGlowDepth} />
              <View style={styles.cardShine} />

              <View style={styles.cardChip}>
                <View style={[styles.cardChipLine, styles.cardChipLineTop]} />
                <View style={styles.cardChipLine} />
                <View style={[styles.cardChipLine, styles.cardChipLineBottom]} />
              </View>

              <View style={styles.brandRow}>
                <View style={styles.brandMark} />
                <Text style={styles.brandName}>CHAINORA</Text>
              </View>

              <Text style={styles.cardAddress}>
                0x4a7f {'\u00b7'} {'\u00b7'} {'\u00b7'} c2e1
              </Text>

              <View style={styles.waveRow}>
                <View style={[styles.waveBar, styles.waveBarShort]} />
                <View style={[styles.waveBar, styles.waveBarMedium]} />
                <View style={[styles.waveBar, styles.waveBarTall]} />
              </View>
            </View>
          </View>

          <View style={styles.heroText}>
            <Text style={styles.heroTag}>{t('welcomeDesignHeroTag')}</Text>
            <Text style={styles.heroTitle}>
              {t('welcomeDesignTitleLineOne')}
              {'\n'}
              <Text style={styles.heroTitleAccent}>{t('welcomeDesignTitleLineTwo')}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            onPress={() => navigation.navigate(ROUTES.LoginPin)}
          >
            <Text style={styles.primaryButtonText}>{t('welcomeLoginButton')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            onPress={() => navigation.navigate(ROUTES.ActivatePin)}
          >
            <Text style={styles.secondaryButtonText}>{t('welcomeActivateButton')}</Text>
          </Pressable>

          <Text style={styles.legalText}>
            {t('welcomeLegalPrefix')}
            <Text style={styles.legalUnderline}>{t('welcomeLegalTerms')}</Text>
            {' \u00b7 '}
            <Text style={styles.legalUnderline}>{t('welcomeLegalPrivacy')}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = ({
  scale,
  topPadding,
  bottomPadding,
}: {
  scale: number;
  topPadding: number;
  bottomPadding: number;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#08111B',
      overflow: 'hidden',
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
    },
    heroBlock: {
      alignItems: 'center',
      paddingTop: topPadding,
      paddingHorizontal: 28 * scale,
      gap: 44 * scale,
    },
    cardWrap: {
      width: 260 * scale,
      height: 160 * scale,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    cardSurface: {
      width: 260 * scale,
      height: 160 * scale,
      borderRadius: 20 * scale,
      borderWidth: 1,
      borderColor: 'rgba(40, 151, 255, 0.35)',
      backgroundColor: '#07111F',
      padding: 18 * scale,
      overflow: 'hidden',
      transform: [{ rotate: '-7deg' }, { translateY: -4 * scale }],
      shadowColor: '#2897FF',
      shadowOffset: { width: 0, height: 30 * scale },
      shadowOpacity: 0.48,
      shadowRadius: 40 * scale,
      elevation: 14,
    },
    cardGlowPrimary: {
      position: 'absolute',
      top: -54 * scale,
      left: -36 * scale,
      width: 220 * scale,
      height: 136 * scale,
      borderRadius: 999,
      backgroundColor: 'rgba(67, 146, 255, 0.24)',
      transform: [{ rotate: '-10deg' }, { scaleX: 1.18 }],
    },
    cardGlowSecondary: {
      position: 'absolute',
      top: 6 * scale,
      left: 54 * scale,
      width: 150 * scale,
      height: 110 * scale,
      borderRadius: 999,
      backgroundColor: 'rgba(12, 32, 63, 0.76)',
      transform: [{ rotate: '12deg' }],
    },
    cardGlowDepth: {
      position: 'absolute',
      right: -18 * scale,
      bottom: -20 * scale,
      width: 150 * scale,
      height: 110 * scale,
      borderRadius: 75 * scale,
      backgroundColor: 'rgba(4, 8, 16, 0.94)',
    },
    cardShine: {
      position: 'absolute',
      top: -42 * scale,
      right: 24 * scale,
      width: 34 * scale,
      height: 250 * scale,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      transform: [{ rotate: '35deg' }],
    },
    cardChip: {
      width: 40 * scale,
      height: 28 * scale,
      borderRadius: 6 * scale,
      backgroundColor: '#D9B251',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 * scale },
      shadowOpacity: 0.28,
      shadowRadius: 4 * scale,
      elevation: 4,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cardChipLine: {
      marginHorizontal: 4 * scale,
      height: StyleSheet.hairlineWidth + 0.5,
      backgroundColor: 'rgba(0, 0, 0, 0.28)',
    },
    cardChipLineTop: {
      marginBottom: 4 * scale,
    },
    cardChipLineBottom: {
      marginTop: 4 * scale,
    },
    brandRow: {
      position: 'absolute',
      top: 18 * scale,
      right: 18 * scale,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6 * scale,
    },
    brandMark: {
      width: 14 * scale,
      height: 14 * scale,
      borderRadius: 7 * scale,
      backgroundColor: '#4FB4FF',
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.26)',
      shadowColor: '#4FB4FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 8 * scale,
      elevation: 4,
    },
    brandName: {
      color: '#EAF0FB',
      fontSize: 11 * scale,
      letterSpacing: 1.9 * scale,
      fontFamily: DISPLAY_FONT_BOLD,
    },
    cardAddress: {
      position: 'absolute',
      left: 18 * scale,
      bottom: 44 * scale,
      color: '#C6D3E8',
      fontSize: 13 * scale,
      letterSpacing: 1.2 * scale,
      fontFamily: MONO_FONT,
    },
    waveRow: {
      position: 'absolute',
      right: 16 * scale,
      bottom: 14 * scale,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3 * scale,
    },
    waveBar: {
      width: 3 * scale,
      borderRadius: 99,
      backgroundColor: '#2897FF',
    },
    waveBarShort: {
      height: 10 * scale,
    },
    waveBarMedium: {
      height: 16 * scale,
    },
    waveBarTall: {
      height: 22 * scale,
    },
    heroText: {
      alignItems: 'center',
      paddingHorizontal: 10 * scale,
    },
    heroTag: {
      marginBottom: 12 * scale,
      color: '#62BBFF',
      fontSize: 10 * scale,
      letterSpacing: 1.8 * scale,
      textTransform: 'uppercase',
      fontFamily: MONO_FONT,
    },
    heroTitle: {
      color: '#EAF0FB',
      textAlign: 'center',
      fontSize: 34 * scale,
      lineHeight: 34 * scale,
      letterSpacing: -1.53 * scale,
      fontFamily: DISPLAY_FONT_BOLD,
      includeFontPadding: false,
    },
    heroTitleAccent: {
      color: '#62BBFF',
      fontFamily: DISPLAY_FONT_MEDIUM,
    },
    actions: {
      paddingHorizontal: 20 * scale,
      paddingBottom: bottomPadding,
      gap: 10 * scale,
    },
    primaryButton: {
      height: 52 * scale,
      borderRadius: 16 * scale,
      borderWidth: 1,
      borderColor: '#4FB4FF',
      backgroundColor: '#2897FF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8 * scale,
      shadowColor: '#2897FF',
      shadowOffset: { width: 0, height: 16 * scale },
      shadowOpacity: 0.34,
      shadowRadius: 20 * scale,
      elevation: 10,
    },
    secondaryButton: {
      height: 52 * scale,
      borderRadius: 16 * scale,
      borderWidth: 1,
      borderColor: '#243248',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPressed: {
      opacity: 0.94,
      transform: [{ translateY: 1 }],
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15 * scale,
      letterSpacing: -0.2 * scale,
      fontFamily: SANS_FONT_SEMIBOLD,
    },
    secondaryButtonText: {
      color: '#EAF0FB',
      fontSize: 15 * scale,
      letterSpacing: -0.15 * scale,
      fontFamily: SANS_FONT_SEMIBOLD,
    },
    legalText: {
      marginTop: 8 * scale,
      textAlign: 'center',
      color: '#7F90AC',
      fontSize: 11 * scale,
      lineHeight: 16 * scale,
      fontFamily: SANS_FONT,
    },
    legalUnderline: {
      color: '#A7B6CD',
      textDecorationLine: 'underline',
      textDecorationColor: '#243248',
    },
  });

export default WelcomeScreen;
