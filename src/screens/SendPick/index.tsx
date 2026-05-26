import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  WALLET_COLORS,
  useWalletColors,
  WalletPanel,
  WalletTextField,
  WalletTopBar,
} from '@components/ui/walletDesign';
import type { WalletHomeNetworkKey } from '@config/network';
import { useSettings } from '@hooks/useSettings';
import { useWalletHomeAssets } from '@hooks/useWalletHomeAssets';
import { useWalletHomeNetworks } from '@hooks/useWalletHomeNetworks';
import { useWalletHomeVisibility } from '@hooks/useWalletHomeVisibility';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import {
  formatFiatValue,
  type PortfolioAssetSnapshot,
} from '@utils/homePortfolio';
import { getAssetSymbol } from '@utils/sendFlowUtils';
import WalletNetworkCoin from '@components/wallet/WalletNetworkCoin';
import { createSendPickScreenBase, styles } from './SendPick.styles';

type SendPickProps = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.SendPick
>;
type FilterKey = 'all' | WalletHomeNetworkKey;

const SendPickScreen: React.FC<SendPickProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex } = route.params;
  const { settings, t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => createSendPickScreenBase(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const walletHomeNetworkKeys = useMemo(
    () =>
      walletHomeNetworks.map(network => network.key as WalletHomeNetworkKey),
    [walletHomeNetworks],
  );
  const { visibility } = useWalletHomeVisibility(walletHomeNetworkKeys);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const sendPickListRef = useRef<FlatList<PortfolioAssetSnapshot> | null>(null);
  const shouldResetSendPickScrollRef = useRef(false);
  const assets = useWalletHomeAssets(
    walletHomeNetworks,
    walletAddress,
    visibility,
  );

  const filteredAssets = useMemo(
    () =>
      assets.filter(asset => {
        const haystack = `${asset.network.name} ${getAssetSymbol(
          asset.network,
        )} ${asset.network.currencySymbol}`.toLowerCase();
        const matchesQuery =
          query.trim().length === 0 ||
          haystack.includes(query.trim().toLowerCase());
        const matchesFilter = filter === 'all' || asset.network.key === filter;
        return matchesQuery && matchesFilter;
      }),
    [assets, filter, query],
  );

  const handleSelectFilter = useCallback((next: FilterKey) => {
    shouldResetSendPickScrollRef.current = true;
    setFilter(next);
    requestAnimationFrame(() => {
      sendPickListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, []);

  useEffect(() => {
    shouldResetSendPickScrollRef.current = true;
    sendPickListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, filteredAssets.length]);

  const renderSendPickItem = useCallback(
    ({ item, index }: { item: PortfolioAssetSnapshot; index: number }) => (
      <View>
        <Pressable
          style={styles.tokenRow}
          onPress={() =>
            navigation.navigate(ROUTES.Send, {
              walletAddress,
              publicKeyHex,
              chainKey: item.network.key as WalletHomeNetworkKey,
            })
          }
        >
          <WalletNetworkCoin network={item.network} />
          <View style={styles.tokenInfo}>
            <Text style={styles.tokenSymbol}>
              {getAssetSymbol(item.network)}
            </Text>
            <View style={styles.tokenMetaRow}>
              <Text style={styles.tokenNetworkTag}>{item.network.name}</Text>
            </View>
            <Text style={styles.tokenName}>
              {formatFiatValue(item.usdPrice, settings.currency)} /{' '}
              {getAssetSymbol(item.network)}
            </Text>
          </View>
          <View style={styles.tokenRight}>
            <Text style={styles.tokenValue}>
              {formatFiatValue(item.usdValue, settings.currency)}
            </Text>
            <Text style={styles.tokenBalance}>
              {item.balanceFormatted} {getAssetSymbol(item.network)}
            </Text>
          </View>
        </Pressable>
        {index < filteredAssets.length - 1 ? (
          <View style={styles.tokenDivider} />
        ) : null}
      </View>
    ),
    [
      filteredAssets.length,
      navigation,
      publicKeyHex,
      settings.currency,
      walletAddress,
    ],
  );

  const handleSendPickListContentSizeChange = useCallback(() => {
    if (!shouldResetSendPickScrollRef.current) {
      return;
    }
    shouldResetSendPickScrollRef.current = false;
    sendPickListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('sendTitle')}
            onBack={() => navigation.goBack()}
          />

          <WalletTextField
            style={styles.searchField}
            left={
              <Ionicons
                name="search-outline"
                size={15}
                color={WALLET_COLORS.textSoft}
              />
            }
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('homeSearchPlaceholder')}
              placeholderTextColor={WALLET_COLORS.textLow}
              multiline={false}
              style={styles.fieldInput}
            />
          </WalletTextField>

          <ScrollView
            style={styles.sendPickFilterScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              style={[
                styles.filterChip,
                filter === 'all' && styles.filterChipOn,
              ]}
              onPress={() => handleSelectFilter('all')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === 'all' && styles.filterChipTextOn,
                ]}
              >
                {t('walletFilterAll')}
              </Text>
            </Pressable>
            {walletHomeNetworks
              .filter(network => visibility[network.key] !== false)
              .map(network => (
                <Pressable
                  key={network.key}
                  style={[
                    styles.filterChip,
                    filter === network.key && styles.filterChipOn,
                  ]}
                  onPress={() =>
                    handleSelectFilter(network.key as WalletHomeNetworkKey)
                  }
                >
                  <WalletNetworkCoin network={network} size={28} />
                </Pressable>
              ))}
          </ScrollView>

          <WalletPanel
            style={[styles.tokenListCard, styles.sendPickResultsPanel]}
          >
            <FlatList
              ref={sendPickListRef}
              data={filteredAssets}
              keyExtractor={item => item.network.key}
              renderItem={renderSendPickItem}
              style={styles.sendPickResultsScroll}
              contentContainerStyle={styles.sendPickResultsContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={handleSendPickListContentSizeChange}
            />
          </WalletPanel>
        </View>
      </SafeAreaView>
    </View>
  );
};

export { SendPickScreen };
export default SendPickScreen;
