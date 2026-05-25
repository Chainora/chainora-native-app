import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { getAddress } from 'viem';

import {
  DISPLAY_FONT,
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  WALLET_COLORS,
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
  getWalletHomeNetworks,
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
  formatUsdValue,
  getUsdPriceForNetwork,
  sortPortfolioAssets,
  type PortfolioAssetSnapshot,
} from '../features/wallet/homePortfolio';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { fetchWalletBalance } from '../services/balanceService';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';
import {
  fetchSuggestedGasPriceWei,
  parseEther,
  sendEthTransaction,
  type SendEthResult,
} from '../services/transactionService';

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
const walletHomeNetworks = getWalletHomeNetworks() as NetworkConfig[];
const screenBase = buildWalletScreenStyles();

const truncateAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

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

const useWalletHomeVisibility = () => {
  const [visibility, setVisibility] = useState(buildDefaultWalletHomeVisibility());

  useEffect(() => {
    let mounted = true;

    getWalletHomeVisibility()
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
  }, []);

  const updateVisibility = useCallback(async (key: WalletHomeNetworkKey, enabled: boolean) => {
    setVisibility(prev => ({ ...prev, [key]: enabled }));
    try {
      const next = await setWalletHomeAssetEnabled(key, enabled);
      setVisibility(next);
    } catch (error) {
      console.warn('[WalletFlow] Failed to persist visibility', error);
    }
  }, []);

  return { visibility, updateVisibility };
};

const useWalletHomeAssets = (
  walletAddress: string,
  visibility?: Partial<Record<WalletHomeNetworkKey, boolean>>,
) => {
  const [assets, setAssets] = useState<PortfolioAssetSnapshot[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const results = await Promise.allSettled(
        walletHomeNetworks.map(async network => {
          const balance = await fetchWalletBalance(walletAddress, network);
          return buildPortfolioAssetSnapshot({
            network,
            balanceFormatted: balance.formatted,
            balanceWei: balance.wei,
          });
        }),
      );

      if (!mounted) {
        return;
      }

      const nextAssets = results.map((result, index) => {
        const network = walletHomeNetworks[index];
        if (result.status === 'fulfilled') {
          return result.value;
        }

        return buildPortfolioAssetSnapshot({
          network,
          balanceFormatted: '0.0000',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });

      const filteredAssets = visibility
        ? nextAssets.filter(asset => visibility[asset.network.key as WalletHomeNetworkKey] !== false)
        : nextAssets;
      setAssets(sortPortfolioAssets(filteredAssets));
    };

    load().catch(error => {
      console.warn('[WalletFlow] Failed to load assets', error);
    });

    return () => {
      mounted = false;
    };
  }, [visibility, walletAddress]);

  return assets;
};

export const SendPickScreen: React.FC<SendPickProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex } = route.params;
  const { t } = useSettings();
  const { visibility } = useWalletHomeVisibility();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const assets = useWalletHomeAssets(walletAddress, visibility);

  const filteredAssets = useMemo(
    () =>
      assets.filter(asset => {
        const haystack = `${asset.network.name} ${asset.network.currencySymbol}`.toLowerCase();
        const matchesQuery = query.trim().length === 0 || haystack.includes(query.trim().toLowerCase());
        const matchesFilter = filter === 'all' || asset.network.key === filter;
        return matchesQuery && matchesFilter;
      }),
    [assets, filter, query],
  );

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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable
              style={[styles.filterChip, filter === 'all' && styles.filterChipOn]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextOn]}>All</Text>
            </Pressable>
            {walletHomeNetworks
              .filter(network => visibility[network.key as WalletHomeNetworkKey] !== false)
              .map(network => (
                <Pressable
                  key={network.key}
                  style={[styles.filterChip, filter === network.key && styles.filterChipOn]}
                  onPress={() => setFilter(network.key as WalletHomeNetworkKey)}
                >
                  {renderNetworkCoin(network, 28)}
                </Pressable>
              ))}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.flowScroll}>
            <WalletPanel style={styles.tokenListCard}>
              {filteredAssets.map((asset, index) => (
                <View key={asset.network.key}>
                  <Pressable
                    style={styles.tokenRow}
                    onPress={() =>
                      navigation.navigate(ROUTES.Send, {
                        walletAddress,
                        publicKeyHex,
                        chainKey: asset.network.key as WalletHomeNetworkKey,
                      })
                    }
                  >
                    {renderNetworkCoin(asset.network)}
                    <View style={styles.tokenInfo}>
                      <Text style={styles.tokenSymbol}>{asset.network.currencySymbol}</Text>
                      <View style={styles.tokenMetaRow}>
                        <Text style={styles.tokenNetworkTag}>{asset.network.name}</Text>
                      </View>
                      <Text style={styles.tokenName}>
                        {formatUsdValue(asset.usdPrice)} / {asset.network.currencySymbol}
                      </Text>
                    </View>
                    <View style={styles.tokenRight}>
                      <Text style={styles.tokenValue}>{formatUsdValue(asset.usdValue)}</Text>
                      <Text style={styles.tokenBalance}>
                        {asset.balanceFormatted} {asset.network.currencySymbol}
                      </Text>
                    </View>
                  </Pressable>
                  {index < filteredAssets.length - 1 ? <View style={styles.tokenDivider} /> : null}
                </View>
              ))}
            </WalletPanel>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

export const SendScreen: React.FC<SendProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex, chainKey, result } = route.params;
  const { t } = useSettings();
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

  const feeNative = useMemo(() => formatFeeNative(gasLimit, gasPriceGwei), [gasLimit, gasPriceGwei]);

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
      if (parseEther(trimmedAmount) <= 0n) {
        setError(t('sendErrorAmountPositive'));
        return;
      }
    } catch {
      setError(t('sendErrorAmountPositive'));
      return;
    }

    setError(null);
    setShowReview(true);
  }, [amount, recipient, t]);

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
                  {balanceState.formatted ?? '0.0000'} {network.currencySymbol}
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
                      <Text style={styles.amountTagText}>{network.currencySymbol}</Text>
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
                  {amount || '0'} <Text style={styles.reviewAmountUnit}>{network.currencySymbol}</Text>
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
                  {amount || result.amount} {network.currencySymbol} | {result.gasLimit} gas
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
  const [selectedChainKey, setSelectedChainKey] = useState<WalletHomeNetworkKey>(chainKey ?? 'ethMainnet');
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
                <Ionicons name="information-circle-outline" size={18} color={WALLET_COLORS.textMuted} />
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
                <Ionicons name="information-circle-outline" size={14} color={WALLET_COLORS.warning} />
              </View>
              <Text style={styles.warningText}>
                Only send <Text style={styles.warningStrong}>{network.currencySymbol}</Text> on {network.name} to this
                address.
              </Text>
            </WalletPanel>

            <View style={styles.receiveCoinHead}>
              {renderNetworkCoin(network, 30)}
              <Text style={styles.receiveCoinText}>{network.currencySymbol}</Text>
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
                  <Ionicons name="shield-checkmark-outline" size={28} color={WALLET_COLORS.text} />
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
                  <Ionicons name="copy-outline" size={18} color={WALLET_COLORS.text} />
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
                  <Ionicons name="share-social-outline" size={18} color={WALLET_COLORS.text} />
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
          const outcome = await sendEthTransaction({
            from: walletAddress,
            to: recipient.trim(),
            valueWei: parseEther(amount.trim()),
            pin,
            network,
            gasPriceWei: gasPriceGwei ? parseGwei(gasPriceGwei) : undefined,
            gasLimitWei: gasLimit ? BigInt(gasLimit) : undefined,
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
          currencySymbol: network.currencySymbol,
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
                {amount} {network.currencySymbol} | {truncateAddress(recipient)}
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
  const { visibility, updateVisibility } = useWalletHomeVisibility();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const items = useMemo<TokenManageItem[]>(
    () =>
      walletHomeNetworks.map(network => ({
        key: network.key as WalletHomeNetworkKey,
        enabled: visibility[network.key as WalletHomeNetworkKey] !== false,
      })),
    [visibility],
  );

  const filtered = useMemo(
    () =>
      items.filter(item => {
        const network = getNetworkConfig(item.key);
        const haystack = `${network.currencySymbol} ${network.name}`.toLowerCase();
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
            title="Manage Assets"
            onBack={() => navigation.goBack()}
            right={
              <Pressable style={styles.iconButton} onPress={() => navigation.navigate(ROUTES.AddToken)}>
                <Ionicons name="add" size={18} color={WALLET_COLORS.text} />
              </Pressable>
            }
          />

          <View style={styles.manageControls}>
            <WalletTextField
              style={styles.manageSearchField}
              left={<Ionicons name="search-outline" size={15} color={WALLET_COLORS.textSoft} />}
            >
              <TextInput
                placeholder="Search network..."
                placeholderTextColor={WALLET_COLORS.textLow}
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
                <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextOn]}>All</Text>
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
                          <Text style={styles.tokenSymbol}>{network.currencySymbol}</Text>
                          <WalletPill style={styles.manageChainPill}>
                            <Text style={styles.manageChainText}>{network.name}</Text>
                          </WalletPill>
                        </View>
                        <Text style={styles.tokenName}>
                          {formatUsdValue(getUsdPriceForNetwork(network.key as WalletHomeNetworkKey))} / {network.currencySymbol}
                        </Text>
                      </View>
                      <Switch
                        value={item.enabled}
                        thumbColor="#FFFFFF"
                        trackColor={{ false: '#27364D', true: WALLET_COLORS.signal }}
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
  const [tab, setTab] = useState<'token' | 'network'>('token');
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [rpcUrl, setRpcUrl] = useState('');

  const canSave = tab === 'token'
    ? Boolean(address && name && symbol && decimals)
    : Boolean(networkName && rpcUrl);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar title="Import Token" onBack={() => navigation.goBack()} />

          <View style={styles.tabSwitch}>
            {(['token', 'network'] as const).map(option => (
              <Pressable key={option} style={styles.tabSwitchItem} onPress={() => setTab(option)}>
                <Text style={[styles.tabSwitchText, tab === option && styles.tabSwitchTextOn]}>
                  {option === 'token' ? 'Token' : 'Network'}
                </Text>
                {tab === option ? <View style={styles.tabSwitchIndicator} /> : null}
              </Pressable>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
            <WalletPanel style={styles.warningCard}>
              <View style={[styles.warningIcon, styles.warningIconAmber]}>
                <Ionicons name="warning-outline" size={14} color={WALLET_COLORS.warning} />
              </View>
              <Text style={styles.warningText}>
                Only add assets and networks you trust. A malicious RPC or fake token can mislead balances.
              </Text>
            </WalletPanel>

            {tab === 'token' ? (
              <>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Network" />
                  <WalletTextField left={renderNetworkCoin(walletHomeNetworks[0], 20)}>
                    <Text style={styles.networkPillText}>Ethereum</Text>
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Contract Address" />
                  <WalletTextField>
                    <TextInput
                      placeholder="0x..."
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={address}
                      onChangeText={setAddress}
                      autoCapitalize="none"
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Name" />
                  <WalletTextField>
                    <TextInput
                      placeholder="Example: Pepe"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={name}
                      onChangeText={setName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Ticker" />
                  <WalletTextField>
                    <TextInput
                      placeholder="PEPE"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={symbol}
                      onChangeText={text => setSymbol(text.toUpperCase())}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>

                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="Decimals" />
                  <WalletTextField>
                    <TextInput
                      placeholder="18"
                      placeholderTextColor={WALLET_COLORS.textLow}
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
                  <WalletSectionLabel label="Network Name" />
                  <WalletTextField>
                    <TextInput
                      placeholder="Example: Base Mainnet"
                      placeholderTextColor={WALLET_COLORS.textLow}
                      value={networkName}
                      onChangeText={setNetworkName}
                      style={styles.fieldInput}
                    />
                  </WalletTextField>
                </View>
                <View style={styles.fieldGroup}>
                  <WalletSectionLabel label="RPC URL" />
                  <WalletTextField>
                    <TextInput
                      placeholder="https://..."
                      placeholderTextColor={WALLET_COLORS.textLow}
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

          <WalletButton label="Save" disabled={!canSave} />
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
