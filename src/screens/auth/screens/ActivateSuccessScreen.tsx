import React, { useCallback, useRef } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useSettings } from '../../../features/settings';
import type { RootStackParamList } from '../../../navigation/routes/rootStackParamList';
import { ROUTES } from '../../../navigation/routes/routes';
import {
  DISPLAY_FONT,
  WALLET_COLORS,
  WalletAuras,
  WalletButton,
  WalletHeroCard,
  WalletPanel,
  buildWalletScreenStyles,
} from '../../../components/ui/walletDesign';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ActivateSuccess>;

const screenBase = buildWalletScreenStyles();

const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { resolvedTheme, t } = useSettings();
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

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successBadgeWrap}>
            <View style={styles.successBadgeRing}>
              <View style={styles.successBadgeCore}>
                <Ionicons name="checkmark" size={34} color={WALLET_COLORS.success} />
              </View>
            </View>
          </View>

          <Text style={styles.title}>{t('activateSuccessWalletActivated')}</Text>
          <Text style={styles.subtitle}>{t('activateSuccessCardReady')}</Text>

          <WalletHeroCard addressText={shortAddress} style={styles.heroCard} />

          <WalletPanel style={styles.addressCard}>
            <Text style={styles.addressLabel}>{t('activateSuccessAddressLabel')}</Text>
            <Text style={styles.addressValue}>{ethAddress}</Text>
            <Pressable
              style={styles.copyButton}
              onPress={() => Alert.alert(t('activateSuccessWalletAddressTitle'), ethAddress)}
            >
              <Ionicons name="copy-outline" size={16} color={WALLET_COLORS.text} />
              <Text style={styles.copyButtonText}>View</Text>
            </Pressable>
          </WalletPanel>

          <WalletPanel style={styles.noteCard}>
            <Text style={styles.noteText}>{t('activateSuccessShareNote')}</Text>
          </WalletPanel>

          <View style={styles.actions}>
            <WalletButton label={t('commonDone')} onPress={goToHome} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 24,
    gap: 18,
  },
  successBadgeWrap: {
    alignItems: 'center',
  },
  successBadgeRing: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.28)',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadgeCore: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.38)',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: WALLET_COLORS.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: WALLET_COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  heroCard: {
    marginTop: 8,
  },
  addressCard: {
    padding: 16,
    gap: 10,
  },
  addressLabel: {
    color: WALLET_COLORS.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  addressValue: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  copyButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  copyButtonText: {
    color: WALLET_COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  noteCard: {
    padding: 16,
  },
  noteText: {
    color: WALLET_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    marginTop: 6,
  },
});

export default ActivateSuccessScreen;
