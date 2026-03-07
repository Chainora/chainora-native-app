import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  Animated,
  Dimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { FloatingOrb } from '../components/ui/animations/FloatingOrb';
import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Welcome>;

const { width, height } = Dimensions.get('window');

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
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
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />

      {/* Ambient background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FloatingOrb
          color={THEME.primary}
          size={360}
          initial={{ x: -80, y: -80 }}
          duration={12000}
        />
        <FloatingOrb
          color="#2A3140"
          size={260}
          initial={{ x: width - 220, y: height / 3 }}
          duration={14000}
          drift={{ x: 40, y: -30 }}
        />
        <FloatingOrb
          color="#1E232B"
          size={240}
          initial={{ x: 40, y: height - 260 }}
          duration={11000}
          drift={{ x: -32, y: 24 }}
        />
      </View>

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
              <Text style={styles.title}>Your keys,{"\n"}on the card.</Text>
              <Text style={styles.subtitle}>
                Chainora keeps your private key locked inside a physical smart card — never on your phone, never in the cloud.
              </Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.actions, buttonsAnimation]}>
            <AppButton label="Log In" onPress={handleLogin} />
            <View style={styles.spacer} />
            <AppButton label="Activate New Card" onPress={handleActivate} variant="secondary" />
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
  cardShell: {
    alignItems: 'center',
    marginBottom: 32,
  },
  cardSurface: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1.5,
    borderRadius: 28,
    backgroundColor: THEME.surfaceHighlight,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
    padding: 20,
    justifyContent: 'space-between',
  },
  cardChip: {
    width: 52,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1B222C',
    borderWidth: 1,
    borderColor: '#3B4454',
  },
  cardWaves: {
    alignSelf: 'flex-end',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(191, 164, 106, 0.5)',
    borderStyle: 'solid',
  },
  textBlock: {
    gap: 12,
  },
  title: {
    fontSize: THEME.typography.title,
    fontWeight: '800',
    color: THEME.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: THEME.typography.subtext,
    color: THEME.foregroundMuted,
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
