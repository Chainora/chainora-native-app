import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { getNetworkConfig } from '@config/network';
import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { WALLET_COLORS } from '@components/ui/walletDesign';
import { styles } from './WalletDetails.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.WalletDetails
>;

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
              <Ionicons
                name="wallet-outline"
                size={22}
                color={WALLET_COLORS.signal}
              />
            </View>
            <Text style={styles.headerTitle}>
              {t('homeWalletDetailsTitle')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t('walletDetailsCardSubtitle')}
            </Text>
          </View>

          <View style={styles.qrCard}>
            <View style={styles.qrMock}>
              <View style={styles.qrCorner} />
              <Ionicons
                name="shield-checkmark-outline"
                size={28}
                color={WALLET_COLORS.text}
              />
            </View>
            <View style={styles.qrText}>
              <Text style={styles.qrTitle}>
                {t('walletDetailsReceiveTitle')}
              </Text>
              <Text style={styles.qrBody}>
                {t('walletDetailsReceiveDescription')}
              </Text>
            </View>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailLabelRow}>
              <Text style={styles.detailLabel}>{t('homeAddressLine')}</Text>
              <Text style={styles.detailBadge}>
                {t('walletDetailsBadgeEvm')}
              </Text>
            </View>
            <Text style={styles.detailValue}>{address}</Text>
            <Pressable
              style={styles.copyChip}
              onPress={() => copyText(address)}
            >
              <Ionicons
                name="copy-outline"
                size={12}
                color={WALLET_COLORS.signal}
              />
              <Text style={styles.copyChipText}>
                {t('homeWalletCopyAddress')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailLabelRow}>
              <Text style={styles.detailLabel}>{t('homePublicKeyLine')}</Text>
              <Text style={styles.detailBadge}>
                {t('walletDetailsBadgeSecp')}
              </Text>
            </View>
            <Text style={styles.detailValue}>
              {publicKeyHex ?? t('homeUnavailable')}
            </Text>
            <Pressable
              style={[
                styles.copyChip,
                !publicKeyHex && styles.copyChipDisabled,
              ]}
              disabled={!publicKeyHex}
              onPress={() => publicKeyHex && copyText(publicKeyHex)}
            >
              <Ionicons
                name="copy-outline"
                size={12}
                color={
                  publicKeyHex ? WALLET_COLORS.signal : WALLET_COLORS.textLow
                }
              />
              <Text
                style={[
                  styles.copyChipText,
                  !publicKeyHex && styles.copyChipTextDisabled,
                ]}
              >
                {t('homeWalletCopyPublicKey')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.networkPill}>
            <Ionicons
              name="globe-outline"
              size={12}
              color={WALLET_COLORS.signal}
            />
            <Text style={styles.networkPillText}>
              {network
                ? `${networkName} · Chain ${network.chainId}`
                : networkName}
            </Text>
          </View>

          <Pressable
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>{t('commonDone')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default WalletDetailsScreen;
