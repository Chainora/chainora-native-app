import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { getNetworkConfig } from '../config/network';
import { useSettings } from '../features/settings';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import {
  DISPLAY_FONT,
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
} from '../components/ui/walletDesign';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.WalletDetails>;

const WalletDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { address, publicKeyHex, networkName, networkKey } = route.params;
  const { t } = useSettings();
  const network = networkKey ? getNetworkConfig(networkKey) : null;

  const copyText = useCallback((value: string) => {
    Clipboard.setString(value);
  }, []);

  return (
    <View style={styles.host}>
      <SafeAreaView style={styles.host} edges={['top', 'bottom']}>
        <Pressable style={styles.scrim} onPress={() => navigation.goBack()} />
        <View style={styles.sheet}>
          <View style={styles.grab} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="wallet-outline" size={22} color={WALLET_COLORS.signal} />
            </View>
            <Text style={styles.headerTitle}>{t('homeWalletDetailsTitle')}</Text>
            <Text style={styles.headerSubtitle}>{t('walletDetailsCardSubtitle')}</Text>
          </View>

          <View style={styles.qrCard}>
            <View style={styles.qrMock}>
              <View style={styles.qrCorner} />
              <Ionicons name="shield-checkmark-outline" size={28} color={WALLET_COLORS.text} />
            </View>
            <View style={styles.qrText}>
              <Text style={styles.qrTitle}>{t('walletDetailsReceiveTitle')}</Text>
              <Text style={styles.qrBody}>{t('walletDetailsReceiveDescription')}</Text>
            </View>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailLabelRow}>
              <Text style={styles.detailLabel}>{t('homeAddressLine')}</Text>
              <Text style={styles.detailBadge}>{t('walletDetailsBadgeEvm')}</Text>
            </View>
            <Text style={styles.detailValue}>{address}</Text>
            <Pressable style={styles.copyChip} onPress={() => copyText(address)}>
              <Ionicons name="copy-outline" size={12} color={WALLET_COLORS.signal} />
              <Text style={styles.copyChipText}>{t('homeWalletCopyAddress')}</Text>
            </Pressable>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailLabelRow}>
              <Text style={styles.detailLabel}>{t('homePublicKeyLine')}</Text>
              <Text style={styles.detailBadge}>{t('walletDetailsBadgeSecp')}</Text>
            </View>
            <Text style={styles.detailValue}>{publicKeyHex ?? t('homeUnavailable')}</Text>
            <Pressable
              style={[styles.copyChip, !publicKeyHex && styles.copyChipDisabled]}
              disabled={!publicKeyHex}
              onPress={() => publicKeyHex && copyText(publicKeyHex)}
            >
              <Ionicons name="copy-outline" size={12} color={publicKeyHex ? WALLET_COLORS.signal : WALLET_COLORS.textLow} />
              <Text style={[styles.copyChipText, !publicKeyHex && styles.copyChipTextDisabled]}>
                {t('homeWalletCopyPublicKey')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.networkPill}>
            <Ionicons name="globe-outline" size={12} color={WALLET_COLORS.signal} />
            <Text style={styles.networkPillText}>
              {network ? `${networkName} · Chain ${network.chainId}` : networkName}
            </Text>
          </View>

          <Pressable style={styles.doneButton} onPress={() => navigation.goBack()}>
            <Text style={styles.doneButtonText}>{t('commonDone')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: 'rgba(3, 6, 10, 0.82)',
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: '#11161F',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  grab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.borderStrong,
  },
  header: {
    alignItems: 'center',
    gap: 4,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
  },
  headerSubtitle: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  qrCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qrMock: {
    width: 82,
    height: 82,
    borderRadius: 12,
    backgroundColor: '#F2F5FA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrCorner: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#0E1726',
  },
  qrText: {
    flex: 1,
    gap: 4,
  },
  qrTitle: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
  },
  qrBody: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  detailCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    padding: 14,
    gap: 10,
  },
  detailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  detailBadge: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: WALLET_COLORS.surfaceAlt,
  },
  detailValue: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
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
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyChipDisabled: {
    opacity: 0.6,
  },
  copyChipText: {
    color: WALLET_COLORS.signal,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 11,
  },
  copyChipTextDisabled: {
    color: WALLET_COLORS.textLow,
  },
  networkPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  networkPillText: {
    color: WALLET_COLORS.signal,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
  doneButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signal,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
});

export default WalletDetailsScreen;
