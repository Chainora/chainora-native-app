import React, { useCallback } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useSettings } from '../features/settings';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { WALLET_COLORS } from '../components/ui/walletDesign';

type Props = NativeStackScreenProps<RootStackParamList, 'WalletDetails'>;

const ACCENT = {
  overlay: 'rgba(3, 5, 9, 0.82)',
  card: '#11161F',
  surface: '#171C27',
  surfaceAlt: '#1E2431',
  border: '#272E3E',
  borderStrong: '#384053',
  text: '#E8ECF3',
  textSecondary: '#B6BDCC',
  textMuted: '#7A829A',
  textLow: '#525B73',
  signal: '#0A7CF2',
  signalBright: '#2897FF',
};

const WalletDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { address, publicKeyHex, networkName } = route.params;
  const { t, resolvedTheme } = useSettings();

  const copyAddress = useCallback(() => {
    Clipboard.setString(address);
  }, [address]);

  const copyPublicKey = useCallback(() => {
    if (!publicKeyHex) {
      return;
    }
    Clipboard.setString(publicKeyHex);
  }, [publicKeyHex]);

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.screenContent}>
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <Pressable style={styles.headerIcon} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={16} color={ACCENT.textSecondary} />
              </Pressable>
              <Text style={styles.headerTitle}>{t('homeWalletDetailsTitle')}</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.head}>
              <View style={styles.iconWrap}>
                <Ionicons name="wallet-outline" size={24} color={ACCENT.signalBright} />
              </View>
              <Text style={styles.subtitle}>{t('walletDetailsCardSubtitle')}</Text>
            </View>

            <View style={styles.qrCard}>
              <View style={styles.qrMock}>
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
              </View>

              <View style={styles.qrTextWrap}>
                <Text style={styles.qrTitle}>{t('walletDetailsReceiveTitle')}</Text>
                <Text style={styles.qrSubtitle}>
                  {t('walletDetailsReceiveDescription')}
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.labelRow}>
                <Text style={styles.labelText}>{t('homeAddressLine')}</Text>
                <Text style={styles.badgeText}>{t('walletDetailsBadgeEvm')}</Text>
              </View>

              <Text style={styles.valueText} selectable>
                {address}
              </Text>

              <Pressable style={styles.copyChip} onPress={copyAddress}>
                <Ionicons name="copy-outline" size={12} color={ACCENT.signalBright} />
                <Text style={styles.copyChipText}>{t('homeWalletCopyAddress')}</Text>
              </Pressable>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.labelRow}>
                <Text style={styles.labelText}>{t('homePublicKeyLine')}</Text>
                <Text style={styles.badgeText}>{t('walletDetailsBadgeSecp')}</Text>
              </View>

              <Text style={styles.valueText} selectable>
                {publicKeyHex ?? t('homeUnavailable')}
              </Text>

              <Pressable
                style={[styles.copyChip, !publicKeyHex && styles.copyChipDisabled]}
                onPress={copyPublicKey}
                disabled={!publicKeyHex}
              >
                <Ionicons
                  name="copy-outline"
                  size={12}
                  color={publicKeyHex ? ACCENT.signalBright : ACCENT.textLow}
                />
                <Text style={[styles.copyChipText, !publicKeyHex && styles.copyChipTextDisabled]}>
                  {t('homeWalletCopyPublicKey')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.networkBadge}>
              <Ionicons name="globe-outline" size={12} color={ACCENT.signalBright} />
              <Text style={styles.networkBadgeText}>{networkName}</Text>
            </View>

            <Pressable style={styles.primaryButton} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryButtonText}>{t('commonDone')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WALLET_COLORS.background,
  },
  screenContent: {
    flex: 1,
    backgroundColor: ACCENT.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    backgroundColor: ACCENT.surfaceAlt,
  },
  headerTitle: {
    flex: 1,
    color: ACCENT.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 30,
    height: 30,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  head: {
    alignItems: 'center',
    paddingTop: 6,
    gap: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  subtitle: {
    color: ACCENT.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  qrCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surface,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qrMock: {
    width: 78,
    height: 78,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: ACCENT.text,
    backgroundColor: '#0A0E17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCornerTL: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 14,
    height: 14,
    borderWidth: 3,
    borderColor: ACCENT.text,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderWidth: 3,
    borderColor: ACCENT.text,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 14,
    height: 14,
    borderWidth: 3,
    borderColor: ACCENT.text,
  },
  qrTextWrap: {
    flex: 1,
    gap: 4,
  },
  qrTitle: {
    color: ACCENT.text,
    fontSize: 14,
    fontWeight: '700',
  },
  qrSubtitle: {
    color: ACCENT.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  detailCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surface,
    padding: 14,
    gap: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  labelText: {
    color: ACCENT.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badgeText: {
    color: ACCENT.textSecondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: ACCENT.surfaceAlt,
  },
  valueText: {
    color: ACCENT.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  copyChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyChipDisabled: {
    opacity: 0.7,
  },
  copyChipText: {
    color: ACCENT.signalBright,
    fontSize: 11,
    fontWeight: '700',
  },
  copyChipTextDisabled: {
    color: ACCENT.textLow,
  },
  networkBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.28)',
    backgroundColor: 'rgba(40, 151, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  networkBadgeText: {
    color: ACCENT.signalBright,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  primaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT.signalBright,
    backgroundColor: ACCENT.signal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT.signalBright,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default WalletDetailsScreen;
