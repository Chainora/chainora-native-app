import React, { useMemo } from 'react';
import {
  Pressable,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@hooks/useSettings';
import { ROUTES } from '@navigation/routes/routes';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import {
  createWelcomeStyles,
  getWelcomeScale,
  WELCOME_BACKGROUND,
} from './Welcome.styles';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Welcome>;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { resolvedTheme, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useMemo(() => {
    return getWelcomeScale(width, height);
  }, [height, width]);

  const screenStyles = useMemo(
    () =>
      createWelcomeStyles({
        scale,
        topPadding: Math.max(100 * scale, insets.top + 36 * scale),
        bottomPadding: Math.max(48 * scale, insets.bottom + 14 * scale),
      }),
    [insets.bottom, insets.top, scale],
  );

  return (
    <View style={screenStyles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WELCOME_BACKGROUND}
      />
      <View style={screenStyles.content}>
        <View style={screenStyles.heroBlock}>
          <View style={screenStyles.cardWrap}>
            <View style={screenStyles.cardSurface}>
              <View style={screenStyles.cardGlowPrimary} />
              <View style={screenStyles.cardGlowSecondary} />
              <View style={screenStyles.cardGlowDepth} />
              <View style={screenStyles.cardShine} />

              <View style={screenStyles.cardChip}>
                <View
                  style={[
                    screenStyles.cardChipLine,
                    screenStyles.cardChipLineTop,
                  ]}
                />
                <View style={screenStyles.cardChipLine} />
                <View
                  style={[
                    screenStyles.cardChipLine,
                    screenStyles.cardChipLineBottom,
                  ]}
                />
              </View>

              <View style={screenStyles.brandRow}>
                <View style={screenStyles.brandMark} />
                <Text style={screenStyles.brandName}>CHAINORA</Text>
              </View>

              <Text style={screenStyles.cardAddress}>
                0x4a7f {'\u00b7'} {'\u00b7'} {'\u00b7'} c2e1
              </Text>

              <View style={screenStyles.waveRow}>
                <View
                  style={[screenStyles.waveBar, screenStyles.waveBarShort]}
                />
                <View
                  style={[screenStyles.waveBar, screenStyles.waveBarMedium]}
                />
                <View
                  style={[screenStyles.waveBar, screenStyles.waveBarTall]}
                />
              </View>
            </View>
          </View>

          <View style={screenStyles.heroText}>
            <Text style={screenStyles.heroTag}>
              {t('welcomeDesignHeroTag')}
            </Text>
            <Text style={screenStyles.heroTitle}>
              {t('welcomeDesignTitleLineOne')}
              {'\n'}
              <Text style={screenStyles.heroTitleAccent}>
                {t('welcomeDesignTitleLineTwo')}
              </Text>
            </Text>
          </View>
        </View>

        <View style={screenStyles.actions}>
          <Pressable
            style={({ pressed }) => [
              screenStyles.primaryButton,
              pressed && screenStyles.buttonPressed,
            ]}
            onPress={() => navigation.navigate(ROUTES.LoginPin)}
          >
            <Text style={screenStyles.primaryButtonText}>
              {t('welcomeLoginButton')}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              screenStyles.secondaryButton,
              pressed && screenStyles.buttonPressed,
            ]}
            onPress={() => navigation.navigate(ROUTES.ActivatePin)}
          >
            <Text style={screenStyles.secondaryButtonText}>
              {t('welcomeActivateButton')}
            </Text>
          </Pressable>

          <Text style={screenStyles.legalText}>
            {t('welcomeLegalPrefix')}
            <Text style={screenStyles.legalUnderline}>
              {t('welcomeLegalTerms')}
            </Text>
            {' \u00b7 '}
            <Text style={screenStyles.legalUnderline}>
              {t('welcomeLegalPrivacy')}
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

export default WelcomeScreen;
