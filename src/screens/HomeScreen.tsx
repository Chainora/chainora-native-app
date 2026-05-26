import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  DISPLAY_FONT,
  DISPLAY_FONT_MEDIUM,
  MONO_FONT,
  SANS_FONT,
  SANS_FONT_SEMIBOLD,
  type WalletColors,
  WalletPill,
  buildWalletScreenStyles,
  useWalletColors,
} from '../components/ui/walletDesign';
import { type WalletHomeNetworkKey } from '../config/network';
import { getNetworkLogoSource } from '../config/networkLogos';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import {
  buildDefaultWalletHomeVisibility,
  getWalletHomeVisibility,
  syncPortfolioDailySnapshot,
  type WalletHomeVisibilityMap,
} from '../features/wallet/walletHomePreferences';
import {
  calculatePortfolioDayChange,
  formatFiatAmount,
  formatFiatValue,
  formatSignedFiatDelta,
  formatSignedPercentDelta,
  getFiatUnit,
  sortPortfolioAssets,
  sumPortfolioUsdValue,
} from '../features/wallet/homePortfolio';
import {
  type RecentActivity,
} from '../features/wallet/recentActivityStorage';
import { useWalletHomeNetworks } from '../features/wallet/useWalletHomeNetworks';
import type { LocaleKey } from '../locales';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';
import { useHomeActivityPolling } from './wallet/hooks/useHomeActivityPolling';
import { useHomePortfolioPolling } from './wallet/hooks/useHomePortfolioPolling';
import { truncateAddress } from './wallet/utils/sendFlowUtils';

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

const getAssetSymbol = (currencySymbol: string, portfolioTokenSymbol?: string): string =>
  portfolioTokenSymbol ?? currencySymbol;

const getActivityHeadline = (item: RecentActivity, t: (key: LocaleKey) => string) =>
  item.kind === 'send' ? t('homeActivitySent') : t('homeActivityReceived');

const getActivityCounterpartyLine = (
  item: RecentActivity,
  t: (key: LocaleKey) => string,
) => {
  const label = item.kind === 'send' ? t('homeActivityTo') : t('homeActivityFrom');
  const address = item.kind === 'send' ? item.toAddress : item.fromAddress;
  return `${label} ${truncateAddress(address)}`;
};

const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { initializeSession } = useAuth();
  const { settings, resolvedTheme, t } = useSettings();
  const colors = useWalletColors();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const screenBase = useMemo(() => buildWalletScreenStyles(colors), [colors]);
  const walletHomeNetworks = useWalletHomeNetworks();
  const walletHomeNetworkKeys = useMemo(
    () => walletHomeNetworks.map(network => network.key as WalletHomeNetworkKey),
    [walletHomeNetworks],
  );
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [visibility, setVisibility] = useState<WalletHomeVisibilityMap>(() =>
    buildDefaultWalletHomeVisibility(walletHomeNetworkKeys),
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [dayChangeLabel, setDayChangeLabel] = useState({
    text: `${formatSignedPercentDelta(0)} | ${formatSignedFiatDelta(0, settings.currency)}`,
    direction: 'flat' as 'up' | 'down' | 'flat',
  });

  const mountedRef = useRef(true);
  const wasAppActiveRef = useRef(isAppActive);
  const {
    assets,
    assetsLoading,
    refreshPortfolio,
  } = useHomePortfolioPolling({
    ethAddress,
    isAppActive,
    isFocused,
    networks: walletHomeNetworks,
    pollIntervalMs: BALANCE_POLL_INTERVAL_MS,
  });
  const {
    activities,
    loadRecentActivity,
    scheduleActivitySync,
  } = useHomeActivityPolling({
    ethAddress,
    isAppActive,
    isFocused,
    networkKeys: walletHomeNetworkKeys,
    networks: walletHomeNetworks,
    pollIntervalMs: ACTIVITY_POLL_INTERVAL_MS,
    syncDebounceMs: ACTIVITY_SYNC_DEBOUNCE_MS,
  });

  const loadPreferences = useCallback(async () => {
    try {
      const nextVisibility = await getWalletHomeVisibility(walletHomeNetworkKeys);
      if (!mountedRef.current) {
        return;
      }
      setVisibility(nextVisibility);
      setPrefsReady(true);
    } catch (error) {
      console.warn('[Home] Failed to load wallet home preferences', error);
      if (mountedRef.current) {
        setPrefsReady(true);
      }
    }
  }, [walletHomeNetworkKeys]);

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  useEffect(() => {
    walletRelaySessionManager.setActiveAccount(ethAddress);
  }, [ethAddress]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      setIsAppActive(nextState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    loadPreferences().catch(error => {
      console.warn('[Home] Initial preferences load failed', error);
    });
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

    loadPreferences().catch(error => {
      console.warn('[Home] Focus preferences refresh failed', error);
    });

    const becameActive = !wasAppActiveRef.current && isAppActive;
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) {
      return;
    }

    refreshPortfolio().catch(error => {
      console.warn('[Home] App active portfolio refresh failed', error);
    });
    scheduleActivitySync();
  }, [isAppActive, isFocused, loadPreferences, refreshPortfolio, scheduleActivitySync]);

  const visibleAssets = useMemo(
    () =>
      sortPortfolioAssets(
        assets.filter(asset => visibility[asset.network.key] !== false),
      ),
    [assets, visibility],
  );
  const totalUsdValue = useMemo(() => sumPortfolioUsdValue(visibleAssets), [visibleAssets]);
  const totalBalanceAmount = useMemo(
    () => formatFiatAmount(totalUsdValue, settings.currency),
    [settings.currency, totalUsdValue],
  );
  const totalBalanceUnit = getFiatUnit(settings.currency);
  const primaryWalletNetwork = visibleAssets[0]?.network ?? walletHomeNetworks[0] ?? null;

  useEffect(() => {
    if (!prefsReady) {
      return;
    }

    syncPortfolioDailySnapshot(ethAddress, totalUsdValue)
      .then(previousTotal => {
        if (!mountedRef.current) {
          return;
        }

        const nextDayChange = calculatePortfolioDayChange(totalUsdValue, previousTotal ?? totalUsdValue);
        setDayChangeLabel({
          text: `${formatSignedPercentDelta(nextDayChange.percent)} | ${formatSignedFiatDelta(nextDayChange.amountUsd, settings.currency)}`,
          direction: nextDayChange.direction,
        });
      })
      .catch(error => {
        console.warn('[Home] Failed to sync portfolio snapshot', error);
      });
  }, [ethAddress, prefsReady, settings.currency, totalUsdValue]);

  const openSendPick = useCallback(() => {
    navigation.navigate(ROUTES.SendPick, {
      walletAddress: ethAddress,
      publicKeyHex,
    });
  }, [ethAddress, navigation, publicKeyHex]);

  const openReceive = useCallback((chainKey?: WalletHomeNetworkKey) => {
    navigation.navigate(ROUTES.Receive, {
      walletAddress: ethAddress,
      chainKey: chainKey ?? (primaryWalletNetwork?.key as WalletHomeNetworkKey | undefined),
    });
  }, [ethAddress, navigation, primaryWalletNetwork]);

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
  }, [ethAddress, t]);

  const handleScanQr = useCallback(() => {
    navigation.navigate(ROUTES.QRScanner, { ethAddress });
  }, [ethAddress, navigation]);

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
    Promise.all([
      refreshPortfolio(),
      loadRecentActivity(),
    ])
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
      return styles.balanceDeltaPositive;
    }
    if (dayChangeLabel.direction === 'down') {
      return styles.balanceDeltaNegative;
    }
    return styles.balanceDeltaNeutral;
  }, [dayChangeLabel.direction, styles.balanceDeltaNegative, styles.balanceDeltaNeutral, styles.balanceDeltaPositive]);

  const listScrollContentStyle = useMemo(
    () => [styles.listScrollContent, { paddingBottom: 126 + insets.bottom }],
    [insets.bottom, styles.listScrollContent],
  );

  const refreshBusy = assetsLoading || isManualRefreshing;

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={styles.shell}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitle}>{t('homeBottomHome')}</Text>
            </View>

            <Pressable style={styles.iconButton} onPress={handleScanQr}>
              <Ionicons name="scan-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.walletBar}>
            <Pressable style={styles.walletPill} onPress={copyAddress}>
              <View style={styles.walletDot} />
              <Text style={styles.walletName} numberOfLines={1}>{t('homePrimaryWallet')}</Text>
              <Text style={styles.walletAddress} numberOfLines={1} ellipsizeMode="middle">
                {truncateAddress(ethAddress)}
              </Text>
              <View style={styles.walletCopy}>
                <Ionicons name="copy-outline" size={11} color={colors.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>{t('homeTotalBalance')}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{totalBalanceAmount}</Text>
              <Text style={styles.balanceUnit}>{totalBalanceUnit}</Text>
            </View>
            <WalletPill style={[styles.balanceDelta, dayChangePillStyle]}>
              <Text style={styles.balanceDeltaText}>{dayChangeLabel.text}</Text>
            </WalletPill>
          </View>

          <View style={styles.quickActions}>
            <Pressable style={[styles.quickAction, styles.quickActionPrimary]} onPress={openSendPick}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-up-outline" size={18} color={colors.signal} />
              </View>
              <Text style={[styles.quickLabel, styles.quickLabelPrimary]}>{t('homeSendEth')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={() => openReceive()}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-down-outline" size={18} color={colors.signal} />
              </View>
              <Text style={styles.quickLabel}>{t('homeReceive')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={handleScanQr}>
              <View style={styles.quickIcon}>
                <Ionicons name="scan-outline" size={18} color={colors.signal} />
              </View>
              <Text style={styles.quickLabel}>{t('homeScanQrTitle')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={() => setActiveTab('activity')}>
              <View style={styles.quickIcon}>
                <Ionicons name="time-outline" size={18} color={colors.signal} />
              </View>
              <Text style={styles.quickLabel}>{t('homeHistory')}</Text>
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('assets')}>
              <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>
                {t('homeTabAssets')}
              </Text>
              {activeTab === 'assets' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('activity')}>
              <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>
                {t('homeTabActivity')}
              </Text>
              {activeTab === 'activity' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
            <View style={styles.tabsSpacer} />
            <Pressable
              style={[styles.tabIconButton, refreshBusy && styles.tabIconButtonBusy]}
              disabled={refreshBusy}
              onPress={handleManualRefresh}
            >
              <Ionicons name="refresh-outline" size={15} color={colors.textSoft} />
            </Pressable>
            <Pressable style={styles.tabIconButton} onPress={openManageTokens}>
              <Ionicons name="options-outline" size={15} color={colors.textSoft} />
            </Pressable>
          </View>

          <View style={styles.listWrap}>
            {activeTab === 'assets' ? (
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={listScrollContentStyle}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.listCard}>
                  {visibleAssets.map((asset, index) => {
                    const assetLogoSource = getNetworkLogoSource(asset.network.key);
                    const assetSymbol = getAssetSymbol(asset.network.currencySymbol, asset.network.portfolioTokenSymbol);
                    const priceLine = `${formatFiatValue(asset.usdPrice, settings.currency)} / ${assetSymbol}`;
                    const statusParts = [priceLine];
                    if (asset.error) {
                      statusParts.push(t('homeSyncDelayed'));
                    }
                    if (asset.priceUnavailable) {
                      statusParts.push(t('homePriceUnavailable'));
                    }

                    return (
                      <View key={asset.network.key}>
                        <View style={styles.assetRow}>
                          <Pressable
                            style={styles.assetTapArea}
                            onPress={() => openReceive(asset.network.key as WalletHomeNetworkKey)}
                          >
                            <View
                              style={[
                                styles.coinBadge,
                                {
                                  backgroundColor: asset.network.iconBackground,
                                  borderColor: asset.network.iconBorder,
                                },
                              ]}
                            >
                              {assetLogoSource ? (
                                <Image source={assetLogoSource} style={styles.coinBadgeLogo} resizeMode="contain" />
                              ) : (
                                <Text style={styles.coinBadgeText}>{asset.network.glyph}</Text>
                              )}
                            </View>
                            <View style={styles.assetInfo}>
                              <View style={styles.assetTopLine}>
                                <Text style={styles.assetSymbol}>{assetSymbol}</Text>
                                <Text style={styles.assetTag}>{asset.network.name}</Text>
                              </View>
                              <Text style={styles.assetBottomLine}>{statusParts.join(' | ')}</Text>
                            </View>
                            <View style={styles.assetRight}>
                              <Text style={styles.assetBalance}>{asset.balanceFormatted}</Text>
                              <Text style={styles.assetQuote}>{formatFiatValue(asset.usdValue, settings.currency)}</Text>
                            </View>
                          </Pressable>
                          <Pressable
                            style={styles.assetIconButton}
                            onPress={() =>
                              navigation.navigate(ROUTES.Send, {
                                walletAddress: ethAddress,
                                publicKeyHex,
                                chainKey: asset.network.key as WalletHomeNetworkKey,
                              })
                            }
                          >
                            <Ionicons name="arrow-up-outline" size={16} color={colors.text} />
                          </Pressable>
                        </View>
                        {index < visibleAssets.length - 1 ? <View style={styles.assetDivider} /> : null}
                      </View>
                    );
                  })}

                  <Pressable style={styles.manageRow} onPress={openManageTokens}>
                    <View style={[styles.coinBadge, styles.coinBadgeSoft]}>
                      <Ionicons name="grid-outline" size={18} color={colors.text} />
                    </View>
                    <View style={styles.assetInfo}>
                      <Text style={styles.assetSymbol}>{t('homeManageAssets')}</Text>
                      <Text style={styles.assetBottomLine}>{t('homeManageAssetsBody')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.textSoft} />
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={listScrollContentStyle}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.listCard}>
                  {activities.length === 0 ? (
                    <View style={styles.emptyState}>
                      <View style={styles.emptyIconWrap}>
                        <Ionicons name="time-outline" size={20} color={colors.textSoft} />
                      </View>
                      <Text style={styles.emptyTitle}>{t('homeNoTransactions')}</Text>
                      <Text style={styles.emptyBody}>{t('homeNoTransactionsDesc')}</Text>
                    </View>
                  ) : (
                    activities.map((item, index) => (
                      <View key={item.id}>
                        <View style={styles.activityRow}>
                          <View
                            style={[
                              styles.activityIconWrap,
                              item.kind === 'send' ? styles.activityIconSend : styles.activityIconReceive,
                            ]}
                          >
                            <Ionicons
                              name={item.kind === 'send' ? 'arrow-up-outline' : 'arrow-down-outline'}
                              size={16}
                              color={item.kind === 'send' ? '#FFB7B7' : '#9CE8C5'}
                            />
                          </View>
                          <View style={styles.activityInfo}>
                            <View style={styles.assetTopLine}>
                              <Text style={styles.activityTitle}>{getActivityHeadline(item, t)}</Text>
                              <Text style={styles.assetTag}>{item.networkName}</Text>
                            </View>
                            <Text style={styles.activitySubtitle}>{getActivityCounterpartyLine(item, t)}</Text>
                          </View>
                          <View style={styles.activityRight}>
                            <Text style={styles.activityAmount}>
                              {item.kind === 'send' ? '-' : '+'}
                              {item.amountDisplay} {item.currencySymbol}
                            </Text>
                            <Text style={styles.activityTime}>{timeFormatter.format(new Date(item.createdAt))}</Text>
                          </View>
                        </View>
                        {index < activities.length - 1 ? <View style={styles.assetDivider} /> : null}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.bottomDock}>
          <View style={styles.bottomDockInner}>
            <Pressable style={styles.bottomItem} onPress={() => setActiveTab('assets')}>
              <Ionicons
                name="home-outline"
                size={18}
                color={activeTab === 'assets' ? colors.text : colors.textSoft}
              />
              <Text style={[styles.bottomLabel, activeTab === 'assets' && styles.bottomLabelActive]}>
                {t('homeBottomHome')}
              </Text>
            </Pressable>

            <Pressable style={styles.bottomItem} onPress={() => setActiveTab('activity')}>
              <Ionicons
                name="time-outline"
                size={18}
                color={activeTab === 'activity' ? colors.text : colors.textSoft}
              />
              <Text style={[styles.bottomLabel, activeTab === 'activity' && styles.bottomLabelActive]}>
                {t('homeBottomActivity')}
              </Text>
            </Pressable>

            <Pressable style={styles.bottomCenter} onPress={handleScanQr}>
              <View style={styles.bottomCenterBubble}>
                <Ionicons name="scan-outline" size={20} color="#F3F9FF" />
              </View>
              <Text style={[styles.bottomLabel, styles.bottomCenterLabel]}>{t('homeBottomScan')}</Text>
            </Pressable>

            <Pressable style={styles.bottomItem}>
              <Ionicons name="gift-outline" size={18} color={colors.textSoft} />
              <Text style={styles.bottomLabel}>{t('homeBottomCollect')}</Text>
            </Pressable>

            <Pressable style={styles.bottomItem} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={colors.textSoft} />
              <Text style={styles.bottomLabel}>{t('homeBottomSettings')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const buildStyles = (colors: WalletColors) => StyleSheet.create({
  shell: { flex: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative' },
  headerTitleWrap: { position: 'absolute', left: 56, right: 56, alignItems: 'center' },
  headerTitle: { color: colors.text, fontFamily: DISPLAY_FONT_MEDIUM, fontSize: 17, letterSpacing: -0.2 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletBar: { alignItems: 'center', marginTop: 10 },
  walletPill: {
    minHeight: 34,
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signal },
  walletName: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 13 },
  walletAddress: { color: colors.textSoft, fontFamily: MONO_FONT, fontSize: 11, flexShrink: 1 },
  walletCopy: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBlock: { alignItems: 'center', marginTop: 16, marginBottom: 14 },
  balanceLabel: {
    color: '#62BBFF',
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  balanceValue: { color: colors.text, fontFamily: DISPLAY_FONT, fontSize: 52, lineHeight: 56, letterSpacing: -2.4 },
  balanceUnit: { color: colors.textSoft, fontFamily: DISPLAY_FONT_MEDIUM, fontSize: 28, marginBottom: 7 },
  balanceDelta: { minHeight: 30, marginTop: 10, paddingHorizontal: 12 },
  balanceDeltaNeutral: { backgroundColor: colors.surfaceSoft, borderColor: colors.borderStrong },
  balanceDeltaPositive: { backgroundColor: colors.successSoft, borderColor: 'rgba(52, 211, 153, 0.35)' },
  balanceDeltaNegative: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(255, 122, 122, 0.35)' },
  balanceDeltaText: { color: colors.text, fontFamily: MONO_FONT, fontSize: 11 },
  quickActions: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  quickAction: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  quickActionPrimary: { borderColor: colors.signalBorder, backgroundColor: colors.signalSoft },
  quickIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { color: colors.textMuted, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 12 },
  quickLabelPrimary: { color: colors.text },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: { gap: 8 },
  tabText: { color: colors.textSoft, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 14 },
  tabTextActive: { color: colors.text },
  tabIndicator: { height: 3, borderRadius: 999, backgroundColor: colors.signal },
  tabsSpacer: { flex: 1 },
  tabIconButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabIconButtonBusy: { opacity: 0.45 },
  listWrap: { flex: 1, minHeight: 0 },
  listScroll: { flex: 1 },
  listScrollContent: { paddingBottom: 0 },
  listCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 13 },
  assetTapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  coinBadge: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  coinBadgeSoft: { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
  coinBadgeText: { color: '#F8FBFF', fontFamily: DISPLAY_FONT, fontSize: 14, letterSpacing: -0.4 },
  coinBadgeLogo: { width: 26, height: 26, borderRadius: 999 },
  assetInfo: { flex: 1 },
  assetTopLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assetSymbol: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 15 },
  assetTag: {
    color: colors.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  assetBottomLine: { color: colors.textSoft, fontFamily: SANS_FONT, fontSize: 12, marginTop: 4 },
  assetRight: { alignItems: 'flex-end', gap: 4 },
  assetBalance: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 14 },
  assetQuote: { color: colors.textSoft, fontFamily: MONO_FONT, fontSize: 12 },
  assetIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetDivider: { height: 1, backgroundColor: '#203149', marginHorizontal: 16 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14 },
  emptyState: { alignItems: 'center', paddingHorizontal: 22, paddingVertical: 28 },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 15, marginTop: 14 },
  emptyBody: {
    color: colors.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 13 },
  activityIconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  activityIconSend: { backgroundColor: colors.dangerSoft },
  activityIconReceive: { backgroundColor: colors.successSoft },
  activityInfo: { flex: 1 },
  activityTitle: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 14 },
  activitySubtitle: { color: colors.textSoft, fontFamily: SANS_FONT, fontSize: 12, marginTop: 4 },
  activityRight: { alignItems: 'flex-end', gap: 4 },
  activityAmount: { color: colors.text, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 13 },
  activityTime: { color: colors.textSoft, fontFamily: MONO_FONT, fontSize: 10 },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 8,
    paddingTop: 10,
    backgroundColor: 'rgba(5, 7, 13, 0.92)',
  },
  bottomDockInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomCenterBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  bottomLabel: { color: colors.textSoft, fontFamily: SANS_FONT_SEMIBOLD, fontSize: 10 },
  bottomLabelActive: { color: colors.text },
  bottomCenterLabel: { color: '#8FD1FF' },
});

export default HomeScreen;
