import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, StatusBar, StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { AppButton } from '../components/AppButton';
import { useSettings } from '../features/settings';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ActivateSuccess>;

export const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { ethAddress, publicKeyHex, mode } = route.params;
  const hasNavigatedRef = useRef(false);

  const shortAddress = `${ethAddress.slice(0, 6)}...${ethAddress.slice(-4)}`;

  const goToHome = useCallback(() => {
    if (hasNavigatedRef.current) {
      return;
    }

    hasNavigatedRef.current = true;
    navigation.reset({
      index: 0,
      routes: [
        {
          name: ROUTES.Home,
          params: {
            ethAddress,
            publicKeyHex,
            mode,
          },
        },
      ],
    });
  }, [ethAddress, mode, navigation, publicKeyHex]);

  const handleCopyPress = useCallback(() => {
    Alert.alert(t('activateSuccessWalletAddressTitle'), ethAddress);
  }, [ethAddress, t]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.frame}>
          <ScrollView
            contentContainerStyle={styles.frameContent}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <View style={styles.centerGroup}>
              <View style={styles.successOuter}>
                <View style={styles.successInner}>
                  <Ionicons name="checkmark-circle-outline" size={44} color={themeTokens.success} />
                </View>
              </View>
              <Text style={styles.title}>{t('activateSuccessWalletActivated')}</Text>
              <Text style={styles.subtitle}>{t('activateSuccessCardReady')}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.walletCard}>
              <View style={styles.cardTapIconWrap}>
                <Ionicons name="wifi-outline" size={21} color={themeTokens.foregroundMuted} style={styles.cardTapIcon} />
              </View>
              <View style={styles.chip} />
              <Text style={styles.brand}>CHAINORA</Text>
              <Text style={styles.shortAddress}>{shortAddress}</Text>
            </View>

            <View style={styles.addressBox}>
              <View style={styles.addressTextWrap}>
                <Text style={styles.addressLabel}>{t('activateSuccessAddressLabel')}</Text>
                <Text style={styles.addressValue}>{ethAddress}</Text>
              </View>
              <Pressable style={styles.copyButton} accessibilityRole="button" onPress={handleCopyPress}>
                <Ionicons name="copy-outline" size={22} color={themeTokens.foregroundMuted} />
              </Pressable>
            </View>

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                {t('activateSuccessShareNote')}
              </Text>
            </View>

            <View style={styles.footerActions}>
              <AppButton label={t('commonDone')} onPress={goToHome} />
            </View>

            <Text style={styles.footerBrand}>chainora</Text>
          </ScrollView>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  frame: {
    flex: 1,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  frameContent: {
    paddingBottom: 8,
  },
  centerGroup: {
    alignItems: 'center',
  },
  successOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.glow,
    borderWidth: 1,
    borderColor: theme.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  successInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
    color: theme.foreground,
    textAlign: 'center',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500',
    color: theme.foregroundMuted,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginTop: 34,
  },
  walletCard: {
    marginTop: 24,
    borderRadius: 18,
    minHeight: 160,
    padding: 16,
    backgroundColor: theme.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTapIconWrap: {
    alignItems: 'flex-end',
    marginBottom: 26,
  },
  cardTapIcon: {
    transform: [{ rotate: '-90deg' }],
  },
  chip: {
    width: 56,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    marginBottom: 20,
  },
  brand: {
    color: theme.foregroundMuted,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  shortAddress: {
    marginTop: 8,
    color: theme.foregroundMuted,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500',
    letterSpacing: -0.8,
  },
  addressBox: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceHighlight,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addressTextWrap: {
    flex: 1,
  },
  addressLabel: {
    color: theme.foregroundMuted,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  addressValue: {
    color: theme.foreground,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  copyButton: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  noteText: {
    textAlign: 'center',
    color: theme.foregroundMuted,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  footerActions: {
    marginTop: 16,
    width: '100%',
  },
  footerBrand: {
    marginTop: 14,
    color: theme.foregroundMuted,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});

export default ActivateSuccessScreen;
