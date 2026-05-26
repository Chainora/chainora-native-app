import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import QRCode from 'react-native-qrcode-svg';

import {
  useWalletColors,
  WalletPanel,
  WalletPill,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { getNetworkConfig, type WalletHomeNetworkKey } from '@config/network';
import { useSettings } from '@hooks/useSettings';
import { useWalletHomeNetworks } from '@hooks/useWalletHomeNetworks';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { buildReceiveQrUri } from '@utils/evmQr';
import { getAssetSymbol } from '@utils/sendFlowUtils';
import WalletNetworkCoin from '@components/wallet/WalletNetworkCoin';
import { createReceiveScreenBase, styles } from './Receive.styles';

type ReceiveProps = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.Receive
>;

const ReceiveScreen: React.FC<ReceiveProps> = ({ navigation, route }) => {
  const { walletAddress, chainKey } = route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => createReceiveScreenBase(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const [selectedChainKey, setSelectedChainKey] =
    useState<WalletHomeNetworkKey | null>(
      chainKey ?? (walletHomeNetworks[0]?.key as WalletHomeNetworkKey) ?? null,
    );

  useEffect(() => {
    if (selectedChainKey) {
      return;
    }
    if (walletHomeNetworks.length > 0) {
      setSelectedChainKey(walletHomeNetworks[0].key as WalletHomeNetworkKey);
    }
  }, [selectedChainKey, walletHomeNetworks]);

  if (!selectedChainKey) {
    return null;
  }

  const network = getNetworkConfig(selectedChainKey);
  const receiveQrUri = buildReceiveQrUri(walletAddress, network.chainId);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('homeReceive')}
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.receiveScroll}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {walletHomeNetworks.map(candidate => (
                <Pressable
                  key={candidate.key}
                  style={[
                    styles.filterChip,
                    selectedChainKey === candidate.key && styles.filterChipOn,
                  ]}
                  onPress={() =>
                    setSelectedChainKey(candidate.key as WalletHomeNetworkKey)
                  }
                >
                  <WalletNetworkCoin network={candidate} size={28} />
                </Pressable>
              ))}
            </ScrollView>

            <WalletPanel style={styles.warningCard}>
              <View style={styles.warningIcon}>
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.warning}
                />
              </View>
              <Text style={styles.warningText}>
                {t('walletReceiveWarning')
                  .replace('{SYMBOL}', getAssetSymbol(network))
                  .replace('{NETWORK}', network.name)}
              </Text>
            </WalletPanel>

            <View style={styles.receiveCoinHead}>
              <WalletNetworkCoin network={network} size={30} />
              <Text style={styles.receiveCoinText}>
                {getAssetSymbol(network)}
              </Text>
              <WalletPill style={styles.receiveBadge}>
                <Text style={styles.receiveBadgeText}>{network.name}</Text>
              </WalletPill>
            </View>

            <WalletPanel style={styles.qrCard}>
              <View style={styles.qrMock}>
                <QRCode
                  value={receiveQrUri}
                  size={218}
                  color={'#0E1726'}
                  backgroundColor={'#F2F5FA'}
                  quietZone={10}
                  ecl={'M'}
                />
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
                <View style={styles.qrBrand}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={28}
                    color={colors.text}
                  />
                </View>
              </View>
              <Text style={styles.receiveAddress}>{walletAddress}</Text>
            </WalletPanel>

            <View style={styles.receiveActions}>
              <Pressable
                style={styles.receiveAction}
                onPress={() => {
                  Clipboard.setString(walletAddress);
                  Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
                }}
              >
                <View style={styles.receiveActionIcon}>
                  <Ionicons name="copy-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.receiveActionLabel}>
                  {t('homeWalletCopyAddress')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.receiveAction}
                onPress={() => {
                  Share.share({
                    message: `${network.name}\n${walletAddress}`,
                  }).catch(() => undefined);
                }}
              >
                <View style={styles.receiveActionIcon}>
                  <Ionicons
                    name="share-social-outline"
                    size={18}
                    color={colors.text}
                  />
                </View>
                <Text style={styles.receiveActionLabel}>
                  {t('homeReceiveShare')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

export { ReceiveScreen };
export default ReceiveScreen;
