import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { WalletPill, useWalletColors } from '@components/ui/walletDesign';
import { type WalletHomeNetworkKey } from '@config/network';
import { getNetworkLogoSource } from '@config/networkLogos';
import { useAuth } from '@hooks/useAuth';
import { useSettings } from '@hooks/useSettings';
import {
  formatFiatAmount,
  formatFiatValue,
  getFiatUnit,
  sortPortfolioAssets,
  sumPortfolioUsdValue,
} from '@utils/homePortfolio';
import type { RecentActivity } from '@app-types/wallet';
import { useWalletHomeNetworks } from '@hooks/useWalletHomeNetworks';
import type { LocaleKey } from '@locales';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { useHomeActivityPolling } from '@hooks/useHomeActivityPolling';
import { useHomePortfolioPolling } from '@hooks/useHomePortfolioPolling';
import {
  useHomePortfolioDayChange,
  useWalletHomePreferences,
} from '@hooks/useWalletHomePreferences';
import { useWalletRelayActiveAccount } from '@hooks/useWalletRelayRequest';
import { truncateAddress } from '@utils/sendFlowUtils';

import { createHomeScreenBase, createHomeStyles } from './Home.styles';
type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Home>;
type TabKey = 'assets' | 'activity';

const BALANCE_POLL_INTERVAL_MS = 5_000;
const ACTIVITY_POLL_INTERVAL_MS = 5_000;
const ACTIVITY_SYNC_DEBOUNCE_MS = 800;

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const getAssetSymbol = (
  currencySymbol: string,
  portfolioTokenSymbol?: string,
): string => portfolioTokenSymbol ?? currencySymbol;

const getActivityHeadline = (
  item: RecentActivity,
  t: (key: LocaleKey) => string,
) => (item.kind === 'send' ? t('homeActivitySent') : t('homeActivityReceived'));

const getActivityCounterpartyLine = (
  item: RecentActivity,
  t: (key: LocaleKey) => string,
) => {
  const label =
    item.kind === 'send' ? t('homeActivityTo') : t('homeActivityFrom');
  const address = item.kind === 'send' ? item.toAddress : item.fromAddress;
  return `${label} ${truncateAddress(address)}`;
};

const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { initializeSession } = useAuth();
  const { settings, resolvedTheme, t } = useSettings();
  const colors = useWalletColors();
  const screenStyles = useMemo(() => createHomeStyles(colors), [colors]);
  const screenBase = useMemo(() => createHomeScreenBase(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const walletHomeNetworkKeys = useMemo(
    () =>
      walletHomeNetworks.map(network => network.key as WalletHomeNetworkKey),
    [walletHomeNetworks],
  );
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === 'active',
  );
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const mountedRef = useRef(true);
  const wasAppActiveRef = useRef(isAppActive);
  const { visibility, prefsReady, loadPreferences } = useWalletHomePreferences(
    walletHomeNetworkKeys,
  );
  const { assets, assetsLoading, refreshPortfolio } = useHomePortfolioPolling({
    ethAddress,
    isAppActive,
    isFocused,
    networks: walletHomeNetworks,
    pollIntervalMs: BALANCE_POLL_INTERVAL_MS,
  });
  const { activities, loadRecentActivity, scheduleActivitySync } =
    useHomeActivityPolling({
      ethAddress,
      isAppActive,
      isFocused,
      networkKeys: walletHomeNetworkKeys,
      networks: walletHomeNetworks,
      pollIntervalMs: ACTIVITY_POLL_INTERVAL_MS,
      syncDebounceMs: ACTIVITY_SYNC_DEBOUNCE_MS,
    });

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  useWalletRelayActiveAccount(ethAddress);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      setIsAppActive(nextState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    loadPreferences().catch(() => undefined);
  }, [loadPreferences]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      wasAppActiveRef.current = isAppActive;
      return;
    }

    loadPreferences().catch(() => undefined);

    const becameActive = !wasAppActiveRef.current && isAppActive;
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) {
      return;
    }

    refreshPortfolio().catch(error => {
      console.warn('[Home] App active portfolio refresh failed', error);
    });
    scheduleActivitySync();
  }, [
    isAppActive,
    isFocused,
    loadPreferences,
    refreshPortfolio,
    scheduleActivitySync,
  ]);

  const visibleAssets = useMemo(
    () =>
      sortPortfolioAssets(
        assets.filter(asset => visibility[asset.network.key] !== false),
      ),
    [assets, visibility],
  );
  const totalUsdValue = useMemo(
    () => sumPortfolioUsdValue(visibleAssets),
    [visibleAssets],
  );
  const totalBalanceAmount = useMemo(
    () => formatFiatAmount(totalUsdValue, settings.currency),
    [settings.currency, totalUsdValue],
  );
  const totalBalanceUnit = getFiatUnit(settings.currency);
  const primaryWalletNetwork =
    visibleAssets[0]?.network ?? walletHomeNetworks[0] ?? null;
  const dayChangeLabel = useHomePortfolioDayChange({
    currency: settings.currency,
    ethAddress,
    prefsReady,
    totalUsdValue,
  });

  const openSendPick = useCallback(() => {
    navigation.navigate(ROUTES.SendPick, {
      walletAddress: ethAddress,
      publicKeyHex,
    });
  }, [ethAddress, navigation, publicKeyHex]);

  const openReceive = useCallback(
    (chainKey?: WalletHomeNetworkKey) => {
      navigation.navigate(ROUTES.Receive, {
        walletAddress: ethAddress,
        chainKey:
          chainKey ??
          (primaryWalletNetwork?.key as WalletHomeNetworkKey | undefined),
      });
    },
    [ethAddress, navigation, primaryWalletNetwork],
  );

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
  }, [ethAddress, t]);

  const handleScanQr = useCallback(() => {
    navigation.navigate(ROUTES.QRScanner, {
      walletAddress: ethAddress,
      publicKeyHex,
      fallbackChainKey: primaryWalletNetwork?.key,
    });
  }, [ethAddress, navigation, primaryWalletNetwork, publicKeyHex]);

  const openSettings = useCallback(() => {
    navigation.navigate(ROUTES.Settings);
  }, [navigation]);

  const openManageTokens = useCallback(() => {
    navigation.navigate(ROUTES.TokenManage, { walletAddress: ethAddress });
  }, [ethAddress, navigation]);

  const handleManualRefresh = useCallback(() => {
    if (isManualRefreshing) {
      return;
    }

    setIsManualRefreshing(true);
    Promise.all([refreshPortfolio(), loadRecentActivity()])
      .catch(error => {
        console.warn('[Home] Manual refresh failed', error);
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsManualRefreshing(false);
        }
      });
  }, [isManualRefreshing, loadRecentActivity, refreshPortfolio]);

  const dayChangePillStyle = useMemo(() => {
    if (dayChangeLabel.direction === 'up') {
      return screenStyles.balanceDeltaPositive;
    }
    if (dayChangeLabel.direction === 'down') {
      return screenStyles.balanceDeltaNegative;
    }
    return screenStyles.balanceDeltaNeutral;
  }, [
    dayChangeLabel.direction,
    screenStyles.balanceDeltaNegative,
    screenStyles.balanceDeltaNeutral,
    screenStyles.balanceDeltaPositive,
  ]);

  const listScrollContentStyle = useMemo(
    () => [
      screenStyles.listScrollContent,
      { paddingBottom: 126 + insets.bottom },
    ],
    [insets.bottom, screenStyles.listScrollContent],
  );

  const refreshBusy = assetsLoading || isManualRefreshing;

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenStyles.shell}>
          <View style={screenStyles.header}>
            <Pressable style={screenStyles.iconButton} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </Pressable>
            <View style={screenStyles.headerTitleWrap} pointerEvents="none">
              <Text style={screenStyles.headerTitle}>
                {t('homeBottomHome')}
              </Text>
            </View>

            <Pressable style={screenStyles.iconButton} onPress={handleScanQr}>
              <Ionicons name="scan-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={screenStyles.walletBar}>
            <Pressable style={screenStyles.walletPill} onPress={copyAddress}>
              <View style={screenStyles.walletDot} />
              <Text style={screenStyles.walletName} numberOfLines={1}>
                {t('homePrimaryWallet')}
              </Text>
              <Text
                style={screenStyles.walletAddress}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {truncateAddress(ethAddress)}
              </Text>
              <View style={screenStyles.walletCopy}>
                <Ionicons
                  name="copy-outline"
                  size={11}
                  color={colors.textMuted}
                />
              </View>
            </Pressable>
          </View>

          <View style={screenStyles.balanceBlock}>
            <Text style={screenStyles.balanceLabel}>
              {t('homeTotalBalance')}
            </Text>
            <View style={screenStyles.balanceRow}>
              <Text style={screenStyles.balanceValue}>
                {totalBalanceAmount}
              </Text>
              <Text style={screenStyles.balanceUnit}>{totalBalanceUnit}</Text>
            </View>
            <WalletPill style={[screenStyles.balanceDelta, dayChangePillStyle]}>
              <Text style={screenStyles.balanceDeltaText}>
                {dayChangeLabel.text}
              </Text>
            </WalletPill>
          </View>

          <View style={screenStyles.quickActions}>
            <Pressable
              style={[
                screenStyles.quickAction,
                screenStyles.quickActionPrimary,
              ]}
              onPress={openSendPick}
            >
              <View style={screenStyles.quickIcon}>
                <Ionicons
                  name="arrow-up-outline"
                  size={18}
                  color={colors.signal}
                />
              </View>
              <Text
                style={[
                  screenStyles.quickLabel,
                  screenStyles.quickLabelPrimary,
                ]}
              >
                {t('homeSendEth')}
              </Text>
            </Pressable>

            <Pressable
              style={screenStyles.quickAction}
              onPress={() => openReceive()}
            >
              <View style={screenStyles.quickIcon}>
                <Ionicons
                  name="arrow-down-outline"
                  size={18}
                  color={colors.signal}
                />
              </View>
              <Text style={screenStyles.quickLabel}>{t('homeReceive')}</Text>
            </Pressable>

            <Pressable style={screenStyles.quickAction} onPress={handleScanQr}>
              <View style={screenStyles.quickIcon}>
                <Ionicons name="scan-outline" size={18} color={colors.signal} />
              </View>
              <Text style={screenStyles.quickLabel}>
                {t('homeScanQrTitle')}
              </Text>
            </Pressable>

            <Pressable
              style={screenStyles.quickAction}
              onPress={() => setActiveTab('activity')}
            >
              <View style={screenStyles.quickIcon}>
                <Ionicons name="time-outline" size={18} color={colors.signal} />
              </View>
              <Text style={screenStyles.quickLabel}>{t('homeHistory')}</Text>
            </Pressable>
          </View>

          <View style={screenStyles.tabsRow}>
            <Pressable
              style={screenStyles.tabItem}
              onPress={() => setActiveTab('assets')}
            >
              <Text
                style={[
                  screenStyles.tabText,
                  activeTab === 'assets' && screenStyles.tabTextActive,
                ]}
              >
                {t('homeTabAssets')}
              </Text>
              {activeTab === 'assets' ? (
                <View style={screenStyles.tabIndicator} />
              ) : null}
            </Pressable>
            <Pressable
              style={screenStyles.tabItem}
              onPress={() => setActiveTab('activity')}
            >
              <Text
                style={[
                  screenStyles.tabText,
                  activeTab === 'activity' && screenStyles.tabTextActive,
                ]}
              >
                {t('homeTabActivity')}
              </Text>
              {activeTab === 'activity' ? (
                <View style={screenStyles.tabIndicator} />
              ) : null}
            </Pressable>
            <View style={screenStyles.tabsSpacer} />
            <Pressable
              style={[
                screenStyles.tabIconButton,
                refreshBusy && screenStyles.tabIconButtonBusy,
              ]}
              disabled={refreshBusy}
              onPress={handleManualRefresh}
            >
              <Ionicons
                name="refresh-outline"
                size={15}
                color={colors.textSoft}
              />
            </Pressable>
            <Pressable
              style={screenStyles.tabIconButton}
              onPress={openManageTokens}
            >
              <Ionicons
                name="options-outline"
                size={15}
                color={colors.textSoft}
              />
            </Pressable>
          </View>

          <View style={screenStyles.listWrap}>
            {activeTab === 'assets' ? (
              <ScrollView
                style={screenStyles.listScroll}
                contentContainerStyle={listScrollContentStyle}
                showsVerticalScrollIndicator={false}
              >
                <View style={screenStyles.listCard}>
                  {visibleAssets.map((asset, index) => {
                    const assetLogoSource = getNetworkLogoSource(
                      asset.network.key,
                    );
                    const assetSymbol = getAssetSymbol(
                      asset.network.currencySymbol,
                      asset.network.portfolioTokenSymbol,
                    );
                    const priceLine = `${formatFiatValue(
                      asset.usdPrice,
                      settings.currency,
                    )} / ${assetSymbol}`;
                    const statusParts = [priceLine];
                    if (asset.error) {
                      statusParts.push(t('homeSyncDelayed'));
                    }
                    if (asset.priceUnavailable) {
                      statusParts.push(t('homePriceUnavailable'));
                    }

                    return (
                      <View key={asset.network.key}>
                        <View style={screenStyles.assetRow}>
                          <Pressable
                            style={screenStyles.assetTapArea}
                            onPress={() =>
                              openReceive(
                                asset.network.key as WalletHomeNetworkKey,
                              )
                            }
                          >
                            <View
                              style={[
                                screenStyles.coinBadge,
                                {
                                  backgroundColor: asset.network.iconBackground,
                                  borderColor: asset.network.iconBorder,
                                },
                              ]}
                            >
                              {assetLogoSource ? (
                                <Image
                                  source={assetLogoSource}
                                  style={screenStyles.coinBadgeLogo}
                                  resizeMode="contain"
                                />
                              ) : (
                                <Text style={screenStyles.coinBadgeText}>
                                  {asset.network.glyph}
                                </Text>
                              )}
                            </View>
                            <View style={screenStyles.assetInfo}>
                              <View style={screenStyles.assetTopLine}>
                                <Text style={screenStyles.assetSymbol}>
                                  {assetSymbol}
                                </Text>
                                <Text style={screenStyles.assetTag}>
                                  {asset.network.name}
                                </Text>
                              </View>
                              <Text style={screenStyles.assetBottomLine}>
                                {statusParts.join(' | ')}
                              </Text>
                            </View>
                            <View style={screenStyles.assetRight}>
                              <Text style={screenStyles.assetBalance}>
                                {asset.balanceFormatted}
                              </Text>
                              <Text style={screenStyles.assetQuote}>
                                {formatFiatValue(
                                  asset.usdValue,
                                  settings.currency,
                                )}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            style={screenStyles.assetIconButton}
                            onPress={() =>
                              navigation.navigate(ROUTES.Send, {
                                walletAddress: ethAddress,
                                publicKeyHex,
                                chainKey: asset.network
                                  .key as WalletHomeNetworkKey,
                              })
                            }
                          >
                            <Ionicons
                              name="arrow-up-outline"
                              size={16}
                              color={colors.text}
                            />
                          </Pressable>
                        </View>
                        {index < visibleAssets.length - 1 ? (
                          <View style={screenStyles.assetDivider} />
                        ) : null}
                      </View>
                    );
                  })}

                  <Pressable
                    style={screenStyles.manageRow}
                    onPress={openManageTokens}
                  >
                    <View
                      style={[
                        screenStyles.coinBadge,
                        screenStyles.coinBadgeSoft,
                      ]}
                    >
                      <Ionicons
                        name="grid-outline"
                        size={18}
                        color={colors.text}
                      />
                    </View>
                    <View style={screenStyles.assetInfo}>
                      <Text style={screenStyles.assetSymbol}>
                        {t('homeManageAssets')}
                      </Text>
                      <Text style={screenStyles.assetBottomLine}>
                        {t('homeManageAssetsBody')}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={colors.textSoft}
                    />
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                style={screenStyles.listScroll}
                contentContainerStyle={listScrollContentStyle}
                showsVerticalScrollIndicator={false}
              >
                <View style={screenStyles.listCard}>
                  {activities.length === 0 ? (
                    <View style={screenStyles.emptyState}>
                      <View style={screenStyles.emptyIconWrap}>
                        <Ionicons
                          name="time-outline"
                          size={20}
                          color={colors.textSoft}
                        />
                      </View>
                      <Text style={screenStyles.emptyTitle}>
                        {t('homeNoTransactions')}
                      </Text>
                      <Text style={screenStyles.emptyBody}>
                        {t('homeNoTransactionsDesc')}
                      </Text>
                    </View>
                  ) : (
                    activities.map((item, index) => (
                      <View key={item.id}>
                        <View style={screenStyles.activityRow}>
                          <View
                            style={[
                              screenStyles.activityIconWrap,
                              item.kind === 'send'
                                ? screenStyles.activityIconSend
                                : screenStyles.activityIconReceive,
                            ]}
                          >
                            <Ionicons
                              name={
                                item.kind === 'send'
                                  ? 'arrow-up-outline'
                                  : 'arrow-down-outline'
                              }
                              size={16}
                              color={
                                item.kind === 'send' ? '#FFB7B7' : '#9CE8C5'
                              }
                            />
                          </View>
                          <View style={screenStyles.activityInfo}>
                            <View style={screenStyles.assetTopLine}>
                              <Text style={screenStyles.activityTitle}>
                                {getActivityHeadline(item, t)}
                              </Text>
                              <Text style={screenStyles.assetTag}>
                                {item.networkName}
                              </Text>
                            </View>
                            <Text style={screenStyles.activitySubtitle}>
                              {getActivityCounterpartyLine(item, t)}
                            </Text>
                          </View>
                          <View style={screenStyles.activityRight}>
                            <Text style={screenStyles.activityAmount}>
                              {item.kind === 'send' ? '-' : '+'}
                              {item.amountDisplay} {item.currencySymbol}
                            </Text>
                            <Text style={screenStyles.activityTime}>
                              {timeFormatter.format(new Date(item.createdAt))}
                            </Text>
                          </View>
                        </View>
                        {index < activities.length - 1 ? (
                          <View style={screenStyles.assetDivider} />
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>

        <View style={screenStyles.bottomDock}>
          <View style={screenStyles.bottomDockInner}>
            <Pressable
              style={screenStyles.bottomItem}
              onPress={() => setActiveTab('assets')}
            >
              <Ionicons
                name="home-outline"
                size={18}
                color={activeTab === 'assets' ? colors.text : colors.textSoft}
              />
              <Text
                style={[
                  screenStyles.bottomLabel,
                  activeTab === 'assets' && screenStyles.bottomLabelActive,
                ]}
              >
                {t('homeBottomHome')}
              </Text>
            </Pressable>

            <Pressable
              style={screenStyles.bottomItem}
              onPress={() => setActiveTab('activity')}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={activeTab === 'activity' ? colors.text : colors.textSoft}
              />
              <Text
                style={[
                  screenStyles.bottomLabel,
                  activeTab === 'activity' && screenStyles.bottomLabelActive,
                ]}
              >
                {t('homeBottomActivity')}
              </Text>
            </Pressable>

            <Pressable style={screenStyles.bottomCenter} onPress={handleScanQr}>
              <View style={screenStyles.bottomCenterBubble}>
                <Ionicons name="scan-outline" size={20} color="#F3F9FF" />
              </View>
              <Text
                style={[
                  screenStyles.bottomLabel,
                  screenStyles.bottomCenterLabel,
                ]}
              >
                {t('homeBottomScan')}
              </Text>
            </Pressable>

            <Pressable style={screenStyles.bottomItem}>
              <Ionicons name="gift-outline" size={18} color={colors.textSoft} />
              <Text style={screenStyles.bottomLabel}>
                {t('homeBottomCollect')}
              </Text>
            </Pressable>

            <Pressable style={screenStyles.bottomItem} onPress={openSettings}>
              <Ionicons
                name="settings-outline"
                size={18}
                color={colors.textSoft}
              />
              <Text style={screenStyles.bottomLabel}>
                {t('homeBottomSettings')}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;
