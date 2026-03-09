import React, { useMemo } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Welcome>;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { animatedStyle: heroAnimation } = useEntranceAnimation({ translateInitial: 40, fadeDuration: 700 });
  const { animatedStyle: buttonsAnimation } = useEntranceAnimation({ translateInitial: 24, delay: 200 });

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
        backgroundColor={themeTokens.background}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Animated.View style={heroAnimation}>
            <View style={styles.cardShell}>
              <View style={styles.cardSurface}>
                <View style={styles.cardChip} />
                <View style={styles.cardWaves} />
              </View>
            </View>

            <View style={styles.textBlock}>
              <Text style={styles.title}>{t('welcomeTitle')}</Text>
              <Text style={styles.subtitle}>
                {t('welcomeSubtitle')}
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.actions, buttonsAnimation]}>
            <AppButton label={t('welcomeLoginButton')} onPress={handleLogin} />
            <View style={styles.spacer} />
            <AppButton label={t('welcomeActivateButton')} onPress={handleActivate} variant="secondary" />
          </Animated.View>
        </View>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  cardShell: {
    alignItems: 'center',
    marginBottom: 32,
  },
  cardSurface: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1.5,
    borderRadius: 28,
    backgroundColor: theme.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    padding: 20,
    justifyContent: 'space-between',
  },
  cardChip: {
    width: 52,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardWaves: {
    alignSelf: 'flex-end',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: theme.primaryLight,
    borderStyle: 'solid',
  },
  textBlock: {
    gap: 12,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: '800',
    color: theme.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: theme.typography.subtext,
    color: theme.foregroundMuted,
    lineHeight: 20,
  },
  actions: {
    width: '100%',
  },
  spacer: {
    height: 14,
  },
});

export default WelcomeScreen;
