import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  useWalletColors,
  WalletPanel,
  WalletPill,
  WalletTextField,
  WalletTopBar,
  buildWalletScreenStyles,
} from '@components/ui/walletDesign';
import { getNetworkConfig, type WalletHomeNetworkKey } from '@config/network';
import { useNetworkPriceQuotes } from '@hooks/useNetworkPriceQuotes';
import { useSettings } from '@hooks/useSettings';
import { useWalletHomeNetworks } from '@hooks/useWalletHomeNetworks';
import { useWalletHomeVisibility } from '@hooks/useWalletHomeVisibility';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { formatFiatValue } from '@utils/homePortfolio';
import { getAssetSymbol } from '@utils/sendFlowUtils';
import WalletNetworkCoin from '@components/wallet/WalletNetworkCoin';
import { walletFlowStyles as styles } from '@screens/WalletFlow.styles';

type TokenManageProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.TokenManage>;
type FilterKey = 'all' | WalletHomeNetworkKey;
type TokenManageItem = {
  key: WalletHomeNetworkKey;
  enabled: boolean;
};

const TokenManageScreen: React.FC<TokenManageProps> = ({ navigation }) => {
  const { settings, t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const walletHomeNetworkKeys = useMemo(
    () => walletHomeNetworks.map(network => network.key as WalletHomeNetworkKey),
    [walletHomeNetworks],
  );
  const { visibility, updateVisibility } = useWalletHomeVisibility(walletHomeNetworkKeys);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const priceByNetworkKey = useNetworkPriceQuotes(walletHomeNetworks);

  const items = useMemo<TokenManageItem[]>(
    () =>
      walletHomeNetworks.map(network => ({
        key: network.key as WalletHomeNetworkKey,
        enabled: visibility[network.key] !== false,
      })),
    [visibility, walletHomeNetworks],
  );

  const filtered = useMemo(
    () =>
      items.filter(item => {
        const network = getNetworkConfig(item.key);
        const haystack = `${getAssetSymbol(network)} ${network.currencySymbol} ${network.name}`.toLowerCase();
        const matchesQuery = query.trim().length === 0 || haystack.includes(query.trim().toLowerCase());
        const matchesFilter = filter === 'all' || filter === item.key;
        return matchesQuery && matchesFilter;
      }),
    [filter, items, query],
  );

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('walletManageAssetsTitle')}
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton} onPress={() => navigation.navigate(ROUTES.AddToken)}>
                <Ionicons name="add" size={18} color={colors.text} />
              </Pressable>
            }
          />

          <View style={styles.manageControls}>
            <WalletTextField
              style={styles.manageSearchField}
              left={<Ionicons name="search-outline" size={15} color={colors.textSoft} />}
            >
              <TextInput
                placeholder={t('walletManageSearchPlaceholder')}
                placeholderTextColor={colors.textLow}
                value={query}
                onChangeText={setQuery}
                multiline={false}
                style={styles.fieldInput}
              />
            </WalletTextField>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowCompact}>
              <Pressable
                style={[styles.filterChip, filter === 'all' && styles.filterChipOn]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextOn]}>
                  {t('walletFilterAll')}
                </Text>
              </Pressable>
              {walletHomeNetworks.map(network => (
                <Pressable
                  key={network.key}
                  style={[styles.filterChip, filter === network.key && styles.filterChipOn]}
                  onPress={() => setFilter(network.key as WalletHomeNetworkKey)}
                >
                  <WalletNetworkCoin network={network} size={28} />
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.flowScroll}>
            <WalletPanel style={styles.tokenListCard}>
              {filtered.map((item, index) => {
                const network = getNetworkConfig(item.key);

                return (
                  <View key={item.key}>
                    <View style={styles.manageRow}>
                      <WalletNetworkCoin network={network} />
                      <View style={styles.tokenInfo}>
                        <View style={styles.inlineRow}>
                          <Text style={styles.tokenSymbol}>{getAssetSymbol(network)}</Text>
                          <WalletPill style={styles.manageChainPill}>
                            <Text style={styles.manageChainText}>{network.name}</Text>
                          </WalletPill>
                        </View>
                        <Text style={styles.tokenName}>
                          {formatFiatValue(priceByNetworkKey[network.key]?.usdPrice ?? 0, settings.currency)} / {getAssetSymbol(network)}
                          {priceByNetworkKey[network.key] && !priceByNetworkKey[network.key].available
                            ? ` | ${t('homePriceUnavailable')}`
                            : ''}
                        </Text>
                      </View>
                      <Switch
                        value={item.enabled}
                        thumbColor="#FFFFFF"
                        trackColor={{ false: '#27364D', true: colors.signal }}
                        onValueChange={value => {
                          updateVisibility(item.key, value).catch(() => undefined);
                        }}
                      />
                    </View>
                    {index < filtered.length - 1 ? <View style={styles.tokenDivider} /> : null}
                  </View>
                );
              })}
            </WalletPanel>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};


export { TokenManageScreen };
export default TokenManageScreen;
