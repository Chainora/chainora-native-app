import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { encodeFunctionData, erc20Abi, getAddress } from 'viem';

import {
  DISPLAY_FONT,
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
  useWalletColors,
  WalletAuras,
  WalletButton,
  WalletPanel,
  WalletPill,
  WalletSectionLabel,
  WalletTextField,
  WalletTopBar,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';
import {
  getNetworkConfig,
  type NetworkConfig,
  type WalletHomeNetworkKey,
} from '../config/network';
import { getNetworkLogoSource } from '../config/networkLogos';
import { useNfcEnabled } from '../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../features/settings';
import {
  buildDefaultWalletHomeVisibility,
  getWalletHomeVisibility,
  setWalletHomeAssetEnabled,
} from '../features/wallet/walletHomePreferences';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import { addRecentActivity } from '../features/wallet/recentActivityStorage';
import {
  buildPortfolioAssetSnapshot,
  formatFiatValue,
  sortPortfolioAssets,
  type PortfolioAssetSnapshot,
} from '../features/wallet/homePortfolio';
import { useWalletHomeNetworks } from '../features/wallet/useWalletHomeNetworks';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { fetchWalletBalance } from '../services/balanceService';
import { getUsdPriceForNetwork } from '../services/priceService';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';
import {
  fetchSuggestedGasPriceWei,
  parseEther,
  sendEthTransaction,
  type SendEthResult,
} from '../services/transactionService';
import { detectChainIdFromRpc, saveImportedNetwork } from '../features/wallet/importedNetworkStorage';

type SendPickProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.SendPick>;
type SendProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Send>;
type ReceiveProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Receive>;
type TouchSignProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.TouchSign>;
type TokenManageProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.TokenManage>;
type AddTokenProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.AddToken>;

type FilterKey = 'all' | WalletHomeNetworkKey;
type TokenManageItem = {
  key: WalletHomeNetworkKey;
  enabled: boolean;
};

const PIN_LENGTH = 4;
const DEFAULT_GAS_LIMIT = '21000';

const truncateAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
const getAssetSymbol = (network: NetworkConfig): string => network.portfolioTokenSymbol ?? network.currencySymbol;
const getAssetDecimals = (network: NetworkConfig): number => network.portfolioTokenDecimals ?? 18;

const parseAmountToUnits = (value: string, decimals: number): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive decimal number');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`);
  }

  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * base;
  const fractionPadded = `${fraction}${'0'.repeat(decimals)}`.slice(0, decimals);
  const fractionUnits = fractionPadded ? BigInt(fractionPadded) : 0n;
  return wholeUnits + fractionUnits;
};

const parseTransferAmount = (network: NetworkConfig, amount: string): bigint => {
  if (network.portfolioTokenAddress) {
    return parseAmountToUnits(amount, getAssetDecimals(network));
  }
  return parseEther(amount);
};

const buildTransferPayload = (network: NetworkConfig, recipient: string, amount: string) => {
  if (!network.portfolioTokenAddress) {
    return {
      to: recipient.trim(),
      valueWei: parseTransferAmount(network, amount),
      dataHex: undefined as string | undefined,
    };
  }

  const recipientAddress = getAddress(recipient.trim());
  const amountUnits = parseTransferAmount(network, amount);
  const dataHex = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipientAddress, amountUnits],
  });

  return {
    to: network.portfolioTokenAddress,
    valueWei: 0n,
    dataHex,
  };
};

const parseGwei = (value: string): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid gas price');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const wholeWei = BigInt(whole) * 1_000_000_000n;
  const fractionPadded = (fraction + '000000000').slice(0, 9);
  return wholeWei + BigInt(fractionPadded);
};

const formatGweiFromWei = (wei: bigint): string => {
  const whole = wei / 1_000_000_000n;
  const fraction = (wei % 1_000_000_000n).toString().padStart(9, '0').slice(0, 2);
  return `${whole.toString()}.${fraction}`;
};

const formatFeeNative = (gasLimit: string, gasPriceGwei?: string): string | null => {
  if (!gasPriceGwei || !/^\d+$/.test(gasLimit)) {
    return null;
  }
  const gasPriceWei = parseGwei(gasPriceGwei);
  const feeWei = BigInt(gasLimit) * gasPriceWei;
  const whole = feeWei / 1_000_000_000_000_000_000n;
  const fraction = (feeWei % 1_000_000_000_000_000_000n).toString().padStart(18, '0').slice(0, 6);
  return `${whole.toString()}.${fraction}`;
};

const isValidEvmAddress = (value: string): boolean => {
  try {
    getAddress(value.trim());
    return true;
  } catch {
    return false;
  }
};

const renderNetworkCoin = (network: NetworkConfig, size = 42) => {
  const logoSource = getNetworkLogoSource(network.key);
  return (
    <View
      style={[
        styles.coin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: network.iconBackground,
          borderColor: network.iconBorder,
        },
      ]}
    >
      {logoSource ? (
        <Image
          source={logoSource}
          style={[styles.coinLogo, { width: size * 0.62, height: size * 0.62 }]}
          resizeMode="contain"
        />
      ) : (
        <Text style={[styles.coinText, { fontSize: size * 0.34 }]}>{network.glyph}</Text>
      )}
    </View>
  );
};

const useWalletHomeVisibility = (networkKeys: WalletHomeNetworkKey[]) => {
  const [visibility, setVisibility] = useState(() => buildDefaultWalletHomeVisibility(networkKeys));

  useEffect(() => {
    let mounted = true;

    getWalletHomeVisibility(networkKeys)
      .then(next => {
        if (mounted) {
          setVisibility(next);
        }
      })
      .catch(error => {
        console.warn('[WalletFlow] Failed to load visibility', error);
      });

    return () => {
      mounted = false;
    };
  }, [networkKeys]);

  const updateVisibility = useCallback(async (key: WalletHomeNetworkKey, enabled: boolean) => {
    setVisibility(prev => ({ ...prev, [key]: enabled }));
    try {
      const next = await setWalletHomeAssetEnabled(key, enabled, networkKeys);
      setVisibility(next);
    } catch (error) {
      console.warn('[WalletFlow] Failed to persist visibility', error);
    }
  }, [networkKeys]);

  return { visibility, updateVisibility };
};

const useWalletHomeAssets = (
  networks: NetworkConfig[],
  walletAddress: string,
  visibility?: Partial<Record<WalletHomeNetworkKey, boolean>>,
) => {
  const [assets, setAssets] = useState<PortfolioAssetSnapshot[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const nextAssets = await Promise.all(
        networks.map(async network => {
          const [balanceResult, priceResult] = await Promise.allSettled([
            fetchWalletBalance(walletAddress, network),
            getUsdPriceForNetwork(network),
          ]);

          const priceQuote = priceResult.status === 'fulfilled'
            ? priceResult.value
            : { usdPrice: 0, available: false };

          if (balanceResult.status === 'fulfilled') {
            return buildPortfolioAssetSnapshot({
              network,
              balanceFormatted: balanceResult.value.formatted,
              balanceWei: balanceResult.value.wei,
              usdPrice: priceQuote.usdPrice,
              priceUnavailable: !priceQuote.available,
            });
          }

          return buildPortfolioAssetSnapshot({
            network,
            balanceFormatted: '0.0000',
            usdPrice: priceQuote.usdPrice,
            priceUnavailable: !priceQuote.available,
            error:
              balanceResult.reason instanceof Error
                ? balanceResult.reason.message
                : String(balanceResult.reason),
          });
        }),
      );

      if (!mounted) {
        return;
      }

      const filteredAssets = visibility
        ? nextAssets.filter(asset => visibility[asset.network.key] !== false)
        : nextAssets;
      setAssets(sortPortfolioAssets(filteredAssets));
    };

    load().catch(error => {
      console.warn('[WalletFlow] Failed to load assets', error);
    });

    return () => {
      mounted = false;
    };
  }, [networks, visibility, walletAddress]);

  return assets;
};

export const SendPickScreen: React.FC<SendPickProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex } = route.params;
  const { settings, t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const walletHomeNetworkKeys = useMemo(
    () => walletHomeNetworks.map(network => network.key as WalletHomeNetworkKey),
    [walletHomeNetworks],
  );
  const { visibility } = useWalletHomeVisibility(walletHomeNetworkKeys);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const sendPickListRef = useRef<FlatList<PortfolioAssetSnapshot> | null>(null);
  const shouldResetSendPickScrollRef = useRef(false);
  const assets = useWalletHomeAssets(walletHomeNetworks, walletAddress, visibility);

  const filteredAssets = useMemo(
    () =>
      assets.filter(asset => {
        const haystack = `${asset.network.name} ${getAssetSymbol(asset.network)} ${asset.network.currencySymbol}`.toLowerCase();
        const matchesQuery = query.trim().length === 0 || haystack.includes(query.trim().toLowerCase());
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
          {renderNetworkCoin(item.network)}
          <View style={styles.tokenInfo}>
            <Text style={styles.tokenSymbol}>{getAssetSymbol(item.network)}</Text>
            <View style={styles.tokenMetaRow}>
              <Text style={styles.tokenNetworkTag}>{item.network.name}</Text>
            </View>
            <Text style={styles.tokenName}>
              {formatFiatValue(item.usdPrice, settings.currency)} / {getAssetSymbol(item.network)}
            </Text>
          </View>
          <View style={styles.tokenRight}>
            <Text style={styles.tokenValue}>{formatFiatValue(item.usdValue, settings.currency)}</Text>
            <Text style={styles.tokenBalance}>
              {item.balanceFormatted} {getAssetSymbol(item.network)}
            </Text>
          </View>
        </Pressable>
        {index < filteredAssets.length - 1 ? <View style={styles.tokenDivider} /> : null}
      </View>
    ),
    [filteredAssets.length, navigation, publicKeyHex, settings.currency, walletAddress],
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
          <WalletTopBar title={t('sendTitle')} onBack={() => navigation.goBack()} />

          <WalletTextField
            style={styles.searchField}
            left={<Ionicons name="search-outline" size={15} color={WALLET_COLORS.textSoft} />}
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
              style={[styles.filterChip, filter === 'all' && styles.filterChipOn]}
              onPress={() => handleSelectFilter('all')}
            >
              <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextOn]}>
                {t('walletFilterAll')}
              </Text>
            </Pressable>
            {walletHomeNetworks
              .filter(network => visibility[network.key] !== false)
              .map(network => (
                <Pressable
                  key={network.key}
                  style={[styles.filterChip, filter === network.key && styles.filterChipOn]}
                  onPress={() => handleSelectFilter(network.key as WalletHomeNetworkKey)}
                >
                  {renderNetworkCoin(network, 28)}
                </Pressable>
              ))}
          </ScrollView>

          <WalletPanel style={[styles.tokenListCard, styles.sendPickResultsPanel]}>
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

export const SendScreen: React.FC<SendProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex, chainKey, result } = route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const network = getNetworkConfig(chainKey);
  const balanceState = useWalletBalance(walletAddress, network);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [gasPriceGwei, setGasPriceGwei] = useState('');
  const [gasLimit, _setGasLimit] = useState(DEFAULT_GAS_LIMIT);

  useEffect(() => {
    let mounted = true;

    fetchSuggestedGasPriceWei(network)
      .then(value => {
        if (mounted) {
          setGasPriceGwei(formatGweiFromWei(value));
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [network]);

  const feeNative = useMemo(
    () => (network.portfolioTokenAddress ? null : formatFeeNative(gasLimit, gasPriceGwei)),
    [gasLimit, gasPriceGwei, network.portfolioTokenAddress],
  );

  const openReview = useCallback(() => {
    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();

    if (!isValidEvmAddress(trimmedRecipient)) {
      setError(t('sendErrorInvalidAddress'));
      return;
    }

    if (!trimmedAmount) {
      setError(t('sendErrorAmountRequired'));
      return;
    }

    try {
      if (parseTransferAmount(network, trimmedAmount) <= 0n) {
        setError(t('sendErrorAmountPositive'));
        return;
      }
    } catch {
      setError(t('sendErrorAmountPositive'));
      return;
    }

    setError(null);
    setShowReview(true);
  }, [amount, network, recipient, t]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar title={t('sendTitle')} onBack={() => navigation.goBack()} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            <View style={styles.networkHero}>
              {renderNetworkCoin(network, 52)}
              <View style={styles.networkHeroText}>
                <Text style={styles.networkHeroTitle}>{network.name}</Text>
                <Text style={styles.networkHeroSub}>
                  {balanceState.formatted ?? '0.0000'} {getAssetSymbol(network)}
                </Text>
              </View>
              <WalletPill style={styles.networkBadge}>
                <Text style={styles.networkBadgeText}>Chain {network.chainId}</Text>
              </WalletPill>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label={t('sendRecipientLabel')} />
              <WalletTextField
                right={
                  <View style={styles.fieldActions}>
                    <Pressable onPress={async () => setRecipient((await Clipboard.getString()).trim())}>
                      <Text style={styles.fieldActionText}>{t('commonPaste')}</Text>
                    </Pressable>
                    <Pressable onPress={() => navigation.navigate(ROUTES.QRScanner, { ethAddress: walletAddress })}>
                      <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.text} />
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder={t('sendRecipientPlaceholder')}
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  style={styles.fieldInput}
                />
              </WalletTextField>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label={t('sendAmountLabel')} />
              <WalletTextField
                large
                right={
                  <View style={styles.fieldActions}>
                    <WalletPill style={styles.amountTag}>
                      <Text style={styles.amountTagText}>{getAssetSymbol(network)}</Text>
                    </WalletPill>
                    <Pressable onPress={() => setAmount(balanceState.formatted ?? '0.0000')}>
                      <Text style={styles.fieldActionText}>{t('commonMax')}</Text>
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder={t('sendAmountPlaceholder')}
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={[styles.fieldInput, styles.fieldInputLarge]}
                />
              </WalletTextField>
              {feeNative ? (
                <Text style={styles.approxText}>
                  {t('sendNetworkFeeLabel')}: {feeNative} {network.currencySymbol}
                </Text>
              ) : null}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <WalletButton label={t('sendContinue')} onPress={openReview} />
        </View>

        {showReview ? (
          <View style={styles.sheetHost}>
            <Pressable style={styles.sheetScrim} onPress={() => setShowReview(false)} />
            <View style={styles.sheetCard}>
              <View style={styles.sheetGrab} />
              <View style={styles.sheetHeader}>
                <Pressable style={styles.sheetIcon} onPress={() => setShowReview(false)}>
                  <Ionicons name="chevron-back" size={14} color={WALLET_COLORS.textMuted} />
                </Pressable>
                <Text style={styles.sheetTitle}>{t('sendReviewTitle')}</Text>
                <Text style={styles.sheetStep}>2/3</Text>
              </View>

              <View style={styles.reviewAmountWrap}>
                <Text style={styles.reviewAmount}>
                  {amount || '0'} <Text style={styles.reviewAmountUnit}>{getAssetSymbol(network)}</Text>
                </Text>
                <Text style={styles.reviewUsd}>{network.name}</Text>
              </View>

              <View style={styles.reviewCard}>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{t('sendFromLabel')}</Text>
                  <Text style={styles.reviewValue}>{truncateAddress(walletAddress)}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{t('sendToLabel')}</Text>
                  <Text style={styles.reviewValue}>{truncateAddress(recipient)}</Text>
                </View>
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{t('sendNetworkLabel')}</Text>
                  <Text style={styles.reviewValue}>{network.name}</Text>
                </View>
                <View style={[styles.reviewRow, styles.reviewRowLast]}>
                  <Text style={styles.reviewLabel}>{t('sendNetworkFeeLabel')}</Text>
                  <Text style={styles.reviewValue}>
                    {feeNative ? `${feeNative} ${network.currencySymbol}` : t('sendFeeEstimatePending')}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <WalletSectionLabel label={t('sendPinTitle')} />
                <WalletTextField>
                  <TextInput
                    value={pin}
                    onChangeText={text => {
                      setPin(text.replace(/[^\d]/g, '').slice(0, PIN_LENGTH));
                      if (error) {
                        setError(null);
                      }
                    }}
                    placeholder="0000"
                    placeholderTextColor={WALLET_COLORS.textLow}
                    keyboardType="number-pad"
                    secureTextEntry
                    style={[styles.fieldInput, styles.fieldInputLarge]}
                  />
                </WalletTextField>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.sheetActions}>
                <WalletButton
                  label={t('sendConfirm')}
                  onPress={() => {
                    if (pin.length !== PIN_LENGTH) {
                      setError(t('sendErrorPinLength'));
                      return;
                    }

                    setShowReview(false);
                    navigation.navigate(ROUTES.TouchSign, {
                      walletAddress,
                      publicKeyHex,
                      chainKey,
                      recipient,
                      amount,
                      pin,
                      gasPriceGwei,
                      gasLimit,
                    });
                  }}
                />
                <WalletButton label={t('commonCancel')} variant="secondary" onPress={() => setShowReview(false)} />
              </View>
            </View>
          </View>
        ) : null}

        {result ? (
          <View style={styles.sheetHost}>
            <View style={styles.sheetScrim} />
            <View style={styles.sheetCard}>
              <View style={styles.sheetGrab} />
              <View style={styles.resultIcon}>
                <Ionicons name="checkmark" size={30} color={WALLET_COLORS.success} />
              </View>
              <Text style={styles.resultTitle}>{t('sendTransactionSent')}</Text>
              <Text style={styles.resultBody}>{t('sendStatusSuccess')}</Text>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{t('sendTxHash')}</Text>
                <Text style={styles.resultHash}>{result.transactionHash}</Text>
                <Text style={styles.resultMeta}>
                  {amount || result.amount} {getAssetSymbol(network)} | {result.gasLimit} gas
                </Text>
              </View>
              <WalletButton label={t('commonDone')} onPress={() => navigation.goBack()} />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
};

export const ReceiveScreen: React.FC<ReceiveProps> = ({ navigation, route }) => {
  const { walletAddress, chainKey } = route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const [selectedChainKey, setSelectedChainKey] = useState<WalletHomeNetworkKey | null>(
    (chainKey ?? (walletHomeNetworks[0]?.key as WalletHomeNetworkKey)) ?? null,
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

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('homeReceive')}
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              </Pressable>
            }
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.receiveScroll}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {walletHomeNetworks.map(candidate => (
                <Pressable
                  key={candidate.key}
                  style={[styles.filterChip, selectedChainKey === candidate.key && styles.filterChipOn]}
                  onPress={() => setSelectedChainKey(candidate.key as WalletHomeNetworkKey)}
                >
                  {renderNetworkCoin(candidate, 28)}
                </Pressable>
              ))}
            </ScrollView>

            <WalletPanel style={styles.warningCard}>
              <View style={styles.warningIcon}>
                <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
              </View>
              <Text style={styles.warningText}>
                {t('walletReceiveWarning')
                  .replace('{SYMBOL}', getAssetSymbol(network))
                  .replace('{NETWORK}', network.name)}
              </Text>
            </WalletPanel>

            <View style={styles.receiveCoinHead}>
              {renderNetworkCoin(network, 30)}
              <Text style={styles.receiveCoinText}>{getAssetSymbol(network)}</Text>
              <WalletPill style={styles.receiveBadge}>
                <Text style={styles.receiveBadgeText}>{network.name}</Text>
              </WalletPill>
            </View>

            <WalletPanel style={styles.qrCard}>
              <View style={styles.qrMock}>
                <View style={styles.qrCornerTL} />
                <View style={styles.qrCornerTR} />
                <View style={styles.qrCornerBL} />
                <View style={styles.qrBrand}>
                  <Ionicons name="shield-checkmark-outline" size={28} color={colors.text} />
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
                <Text style={styles.receiveActionLabel}>{t('homeWalletCopyAddress')}</Text>
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
                  <Ionicons name="share-social-outline" size={18} color={colors.text} />
                </View>
                <Text style={styles.receiveActionLabel}>{t('homeReceiveShare')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

export const TouchSignScreen: React.FC<TouchSignProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex, chainKey, recipient, amount, pin, gasPriceGwei, gasLimit } = route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const { isEnabled } = useNfcEnabled();
  const network = getNetworkConfig(chainKey);
  const pendingResultRef = useRef<SendEthResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startTouchSign = useCallback(() => {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    const flowId = registerScanCardFlow({
      isNfcEnabled: isEnabled,
      flowType: 'flow',
      prefilledPin: pin,
      onFlowScan: async () => {
        try {
          const transferPayload = buildTransferPayload(network, recipient, amount);
          const outcome = await sendEthTransaction({
            from: walletAddress,
            to: transferPayload.to,
            valueWei: transferPayload.valueWei,
            dataHex: transferPayload.dataHex,
            pin,
            network,
            gasPriceWei: gasPriceGwei ? parseGwei(gasPriceGwei) : undefined,
            gasLimitWei: network.portfolioTokenAddress
              ? undefined
              : gasLimit ? BigInt(gasLimit) : undefined,
          });

          pendingResultRef.current = outcome;
          return {
            ok: true,
            message: t('sendStatusSuccess'),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            ok: false,
            message,
          };
        }
      },
      onSuccess: async () => {
        const outcome = pendingResultRef.current;
        setSubmitting(false);

        if (!outcome) {
          throw new Error(t('sendErrorMissingDetails'));
        }

        await addRecentActivity({
          transactionHash: outcome.transactionHash,
          networkKey: network.key,
          fromAddress: walletAddress,
          toAddress: recipient.trim(),
          amountDisplay: amount.trim(),
          currencySymbol: getAssetSymbol(network),
          networkName: network.name,
        });

        navigation.replace(ROUTES.Send, {
          walletAddress,
          publicKeyHex,
          chainKey,
          result: {
            transactionHash: outcome.transactionHash,
            amount,
            gasLimit: outcome.gasLimitWei.toString(),
            gasPriceGwei: formatGweiFromWei(outcome.gasPriceWei),
          },
        });
      },
      onClose: async () => {
        setSubmitting(false);
      },
    });

    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [
    amount,
    chainKey,
    gasLimit,
    gasPriceGwei,
    isEnabled,
    navigation,
    network,
    pin,
    publicKeyHex,
    recipient,
    submitting,
    t,
    walletAddress,
  ]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar title={t('touchSignTitle')} onBack={() => navigation.goBack()} />

          <View style={styles.touchBody}>
            <WalletPill style={styles.scanFlag}>
              <View style={styles.scanFlagDot} />
              <Text style={styles.scanFlagText}>{network.name}</Text>
            </WalletPill>

            <View style={styles.touchStage}>
              <View style={styles.touchRingOne} />
              <View style={styles.touchRingTwo} />
              <View style={styles.touchRingThree} />
              <View style={styles.touchCore}>
                <Ionicons name="phone-portrait-outline" size={30} color={WALLET_COLORS.signal} />
              </View>
            </View>

            <Text style={styles.touchTitle}>{t('touchSignTitle')}</Text>
            <Text style={styles.touchBodyText}>{t('touchSignBody')}</Text>

            <WalletPanel style={styles.resultCard}>
              <Text style={styles.resultLabel}>{t('sendNetworkLabel')}</Text>
              <Text style={styles.resultHash}>{network.name}</Text>
              <Text style={styles.resultMeta}>
                {amount} {getAssetSymbol(network)} | {truncateAddress(recipient)}
              </Text>
            </WalletPanel>
          </View>

          <View style={styles.sheetActions}>
            <WalletButton
              label={submitting ? t('sendScanning') : t('sendStartScan')}
              disabled={submitting}
              onPress={startTouchSign}
            />
            <WalletButton label={t('commonCancel')} variant="secondary" onPress={() => navigation.goBack()} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export const TokenManageScreen: React.FC<TokenManageProps> = ({ navigation }) => {
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
  const [priceByNetworkKey, setPriceByNetworkKey] = useState<Record<string, { usdPrice: number; available: boolean }>>({});

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

  useEffect(() => {
    let mounted = true;

    Promise.all(
      walletHomeNetworks.map(async network => ({
        networkKey: network.key,
        quote: await getUsdPriceForNetwork(network),
      })),
    )
      .then(results => {
        if (!mounted) {
          return;
        }

        const next = results.reduce<Record<string, { usdPrice: number; available: boolean }>>((result, item) => {
          result[item.networkKey] = {
            usdPrice: item.quote.usdPrice,
            available: item.quote.available,
          };
          return result;
        }, {});

        setPriceByNetworkKey(next);
      })
      .catch(error => {
        console.warn('[WalletFlow] Failed to load token prices', error);
      });

    return () => {
      mounted = false;
    };
  }, [walletHomeNetworks]);

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
                  {renderNetworkCoin(network, 28)}
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
                      {renderNetworkCoin(network)}
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

export const AddTokenScreen: React.FC<AddTokenProps> = ({ navigation }) => {
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const [tab, setTab] = useState<'token' | 'network'>('token');
  const [selectedTokenNetworkKey, setSelectedTokenNetworkKey] = useState<WalletHomeNetworkKey | null>(
    walletHomeNetworks[0]?.key as WalletHomeNetworkKey,
  );
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [networkSymbol, setNetworkSymbol] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = tab === 'token'
    ? Boolean(address && name && symbol && decimals)
    : Boolean(networkName && rpcUrl && networkSymbol && !saving);

  useEffect(() => {
    if (walletHomeNetworks.length === 0) {
      return;
    }

    if (!selectedTokenNetworkKey || !walletHomeNetworks.some(network => network.key === selectedTokenNetworkKey)) {
      setSelectedTokenNetworkKey(walletHomeNetworks[0].key as WalletHomeNetworkKey);
    }
  }, [selectedTokenNetworkKey, walletHomeNetworks]);

  const handleSave = useCallback(() => {
    if (!canSave) {
      return;
    }

    if (tab === 'token') {
      Alert.alert(t('walletImportTokenSavedTitle'), t('walletImportTokenSavedBody'));
      return;
    }

    setSaving(true);
    detectChainIdFromRpc(rpcUrl)
      .then(chainId =>
        saveImportedNetwork({
          name: networkName,
          rpcUrl,
          currencySymbol: networkSymbol,
          chainId,
        }),
      )
      .then(() => {
        Alert.alert(t('walletImportNetworkSavedTitle'), t('walletImportNetworkSavedBody'));
        navigation.goBack();
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        Alert.alert(t('walletImportNetworkSaveFailedTitle'), message);
      })
      .finally(() => {
        setSaving(false);
      });
  }, [canSave, navigation, networkName, networkSymbol, rpcUrl, t, tab]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar title={t('walletImportTitle')} onBack={() => navigation.goBack()} />

          <View style={styles.tabSwitch}>
            {(['token', 'network'] as const).map(option => (
              <Pressable key={option} style={styles.tabSwitchItem} onPress={() => setTab(option)}>
                <Text style={[styles.tabSwitchText, tab === option && styles.tabSwitchTextOn]}>
                  {option === 'token' ? t('walletImportTabToken') : t('walletImportTabNetwork')}
                </Text>
                {tab === option ? <View style={styles.tabSwitchIndicator} /> : null}
              </Pressable>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            <WalletPanel style={styles.warningCard}>
              <View style={[styles.warningIcon, styles.warningIconAmber]}>
                <Ionicons name="warning-outline" size={14} color={colors.warning} />
              </View>
              <Text style={styles.warningText}>{t('walletImportWarningBody')}</Text>
            </WalletPanel>

            {tab === 'token' ? (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNetworkLabel')} />
                  <WalletTextField left={selectedTokenNetworkKey ? renderNetworkCoin(getNetworkConfig(selectedTokenNetworkKey), 20) : null}>
                    <Text style={styles.networkPillText}>
                      {selectedTokenNetworkKey ? getNetworkConfig(selectedTokenNetworkKey).name : '-'}
                    </Text>
                  </WalletTextField>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowCompact}>
                    {walletHomeNetworks.map(network => (
                      <Pressable
                        key={network.key}
                        style={[styles.filterChip, selectedTokenNetworkKey === network.key && styles.filterChipOn]}
                        onPress={() => setSelectedTokenNetworkKey(network.key as WalletHomeNetworkKey)}
                      >
                        {renderNetworkCoin(network, 28)}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportContractAddressLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder="0x..."
                      placeholderTextColor={colors.textLow}
                      value={address}
                      onChangeText={setAddress}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNameLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNamePlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={name}
                      onChangeText={setName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportTickerLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportTickerPlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={symbol}
                      onChangeText={text => setSymbol(text.toUpperCase())}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportDecimalsLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder="18"
                      placeholderTextColor={colors.textLow}
                      value={decimals}
                      onChangeText={text => setDecimals(text.replace(/[^\d]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNetworkNameLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNetworkNamePlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={networkName}
                      onChangeText={setNetworkName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportNetworkSymbolLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder={t('walletImportNetworkSymbolPlaceholder')}
                      placeholderTextColor={colors.textLow}
                      value={networkSymbol}
                      onChangeText={text => setNetworkSymbol(text.toUpperCase())}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label={t('walletImportRpcUrlLabel')} />
                  <WalletTextField>
                    <TextInput
                      placeholder="https://..."
                      placeholderTextColor={colors.textLow}
                      value={rpcUrl}
                      onChangeText={setRpcUrl}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
              </>
            )}
          </ScrollView>

          <WalletButton
            label={saving ? t('walletImportSaving') : t('walletImportSave')}
            disabled={!canSave}
            onPress={handleSave}
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  flowScroll: {
    paddingBottom: 24,
    gap: 14,
  },
  sendPickResultsScroll: {
    flex: 1,
    minHeight: 0,
  },
  sendPickResultsPanel: {
    flex: 1,
  },
  sendPickResultsContent: {
    paddingBottom: 24,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  formScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  receiveScroll: {
    paddingVertical: 16,
    gap: 18,
  },
  searchField: {
    marginTop: 12,
    width: '100%',
    minHeight: 56,
    alignSelf: 'stretch',
  },
  manageControls: {
    gap: 12,
    marginTop: 12,
  },
  manageSearchField: {
    width: '100%',
    minHeight: 56,
    alignSelf: 'stretch',
  },
  sendPickFilterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 66,
  },
  chipRow: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  chipRowCompact: {
    gap: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  filterChip: {
    minWidth: 52,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterChipOn: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  filterChipText: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  filterChipTextOn: {
    color: WALLET_COLORS.text,
  },
  tokenListCard: {
    marginTop: 4,
  },
  tokenRow: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tokenDivider: {
    height: 1,
    backgroundColor: '#203149',
    marginLeft: 66,
    marginRight: 12,
  },
  coin: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: {
    color: '#FFFFFF',
    fontFamily: DISPLAY_FONT,
  },
  coinLogo: {
    borderRadius: 999,
  },
  tokenInfo: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 6,
  },
  tokenSymbol: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  tokenNetworkTag: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    borderRadius: 6,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tokenName: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    textAlign: 'left',
  },
  tokenRight: {
    width: 132,
    flexShrink: 0,
    marginLeft: 'auto',
    alignItems: 'flex-end',
    gap: 4,
  },
  tokenValue: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
    width: '100%',
    textAlign: 'right',
  },
  tokenBalance: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
    width: '100%',
    textAlign: 'right',
  },
  networkHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
  },
  networkHeroText: {
    flex: 1,
  },
  networkHeroTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 20,
  },
  networkHeroSub: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  networkBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  networkBadgeText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT,
    fontSize: 14,
    padding: 0,
  },
  fieldInputLarge: {
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
    letterSpacing: -0.8,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldActionText: {
    color: WALLET_COLORS.signal,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  amountTag: {
    minHeight: 30,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  amountTagText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  approxText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: WALLET_COLORS.danger,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  sheetHost: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 6, 10, 0.82)',
  },
  sheetCard: {
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
  sheetGrab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 16,
    textAlign: 'center',
  },
  sheetStep: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  reviewAmountWrap: {
    alignItems: 'center',
    gap: 4,
  },
  reviewAmount: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 34,
    letterSpacing: -1.2,
  },
  reviewAmountUnit: {
    color: WALLET_COLORS.textSoft,
    fontFamily: DISPLAY_FONT,
    fontSize: 18,
  },
  reviewUsd: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
  },
  reviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  reviewLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  reviewValue: {
    flex: 1,
    textAlign: 'right',
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  sheetActions: {
    gap: 10,
  },
  resultIcon: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: WALLET_COLORS.success,
    backgroundColor: WALLET_COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
    textAlign: 'center',
  },
  resultBody: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    padding: 14,
    gap: 8,
  },
  resultLabel: {
    color: WALLET_COLORS.textLow,
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  resultHash: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 18,
  },
  resultMeta: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 11,
  },
  warningCard: {
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  warningIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  warningIconAmber: {
    backgroundColor: WALLET_COLORS.warningSoft,
  },
  warningText: {
    flex: 1,
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT,
    fontSize: 12.5,
    lineHeight: 18,
  },
  warningStrong: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
  },
  receiveCoinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  receiveCoinText: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
  },
  receiveBadge: {
    minHeight: 28,
    paddingHorizontal: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  receiveBadgeText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  qrCard: {
    padding: 18,
    alignItems: 'center',
    gap: 16,
  },
  qrMock: {
    width: 238,
    height: 238,
    borderRadius: 22,
    backgroundColor: '#F2F5FA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrCornerTL: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 42,
    height: 42,
    borderTopWidth: 8,
    borderLeftWidth: 8,
    borderColor: '#0E1726',
    borderTopLeftRadius: 16,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 42,
    height: 42,
    borderTopWidth: 8,
    borderRightWidth: 8,
    borderColor: '#0E1726',
    borderTopRightRadius: 16,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 42,
    height: 42,
    borderBottomWidth: 8,
    borderLeftWidth: 8,
    borderColor: '#0E1726',
    borderBottomLeftRadius: 16,
  },
  qrBrand: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0E1726',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveAddress: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  receiveActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  receiveAction: {
    alignItems: 'center',
    gap: 8,
  },
  receiveActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveActionLabel: {
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  touchBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  scanFlag: {
    minHeight: 30,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: WALLET_COLORS.signalSoft,
    borderColor: WALLET_COLORS.signalBorder,
  },
  scanFlagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: WALLET_COLORS.signal,
  },
  scanFlagText: {
    color: '#8CD0FF',
    fontFamily: MONO_FONT,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  touchStage: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 26,
  },
  touchRingOne: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.12)',
  },
  touchRingTwo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.2)',
  },
  touchRingThree: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.32)',
  },
  touchCore: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 26,
    lineHeight: 30,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  touchBodyText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 18,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  manageChainPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  manageChainText: {
    color: WALLET_COLORS.textMuted,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
  tabSwitch: {
    flexDirection: 'row',
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  tabSwitchItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tabSwitchText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  tabSwitchTextOn: {
    color: WALLET_COLORS.text,
  },
  tabSwitchIndicator: {
    height: 3,
    width: 80,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.signal,
  },
  networkPillText: {
    flex: 1,
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
