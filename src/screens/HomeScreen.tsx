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
  WALLET_COLORS,
  WalletPill,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';
import {
  WALLET_HOME_NETWORK_KEYS,
  type WalletHomeNetworkKey,
} from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import {
  buildDefaultWalletHomeVisibility,
  getWalletHomeVisibility,
  syncPortfolioDailySnapshot,
} from '../features/wallet/walletHomePreferences';
import {
  buildPortfolioAssetSnapshot,
  calculatePortfolioDayChange,
  formatSignedPercentDelta,
  formatSignedUsdDelta,
  formatUsdValue,
  getWalletHomeAssetConfigs,
  mergePortfolioActivities,
  sortPortfolioAssets,
  sumPortfolioUsdValue,
  type PortfolioAssetSnapshot,
} from '../features/wallet/homePortfolio';
import {
  getRecentActivitiesByWalletAcrossNetworks,
  type RecentActivity,
} from '../features/wallet/recentActivityStorage';
import type { LocaleKey } from '../locales';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { getNetworkLogoSource } from '../config/networkLogos';
import { syncWalletActivities } from '../services/activitySyncService';
import { fetchWalletBalance } from '../services/balanceService';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Home>;
type TabKey = 'assets' | 'activity';

const BALANCE_POLL_INTERVAL_MS = 15_000;
const ACTIVITY_POLL_INTERVAL_MS = 30_000;
const ACTIVITY_SYNC_DEBOUNCE_MS = 800;

const screenBase = buildWalletScreenStyles();
const walletHomeNetworks = getWalletHomeAssetConfigs();
const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const truncateAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
const buildAssetSignature = (assets: PortfolioAssetSnapshot[]) =>
  assets
    .map(asset => `${asset.network.key}:${asset.balanceFormatted}:${asset.usdValue}:${asset.error ?? ''}`)
    .join('|');
const buildActivitySignature = (items: RecentActivity[]) => items.map(item => item.id).join('|');

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
  const { resolvedTheme, t } = useSettings();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [assets, setAssets] = useState<PortfolioAssetSnapshot[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [visibility, setVisibility] = useState(buildDefaultWalletHomeVisibility());
  const [prefsReady, setPrefsReady] = useState(false);
  const [dayChangeLabel, setDayChangeLabel] = useState({
    text: `${formatSignedPercentDelta(0)} | ${formatSignedUsdDelta(0)}`,
    direction: 'flat' as 'up' | 'down' | 'flat',
  });

  const mountedRef = useRef(true);
  const wasAppActiveRef = useRef(isAppActive);
  const assetSignatureRef = useRef('');
  const activitySignatureRef = useRef('');
  const activityInFlightRef = useRef(false);
  const activityQueuedRef = useRef(false);
  const activitySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAssetsIfChanged = useCallback((next: PortfolioAssetSnapshot[]) => {
    const signature = buildAssetSignature(next);
    if (assetSignatureRef.current === signature) {
      return;
    }
    assetSignatureRef.current = signature;
    setAssets(next);
  }, []);

  const setActivitiesIfChanged = useCallback((next: RecentActivity[]) => {
    const signature = buildActivitySignature(next);
    if (activitySignatureRef.current === signature) {
      return;
    }
    activitySignatureRef.current = signature;
    setActivities(next);
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const nextVisibility = await getWalletHomeVisibility();
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
  }, []);

  const refreshPortfolio = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const results = await Promise.allSettled(
        walletHomeNetworks.map(async network => {
          const balance = await fetchWalletBalance(ethAddress, network);
          return buildPortfolioAssetSnapshot({
            network,
            balanceFormatted: balance.formatted,
            balanceWei: balance.wei,
          });
        }),
      );

      const nextAssets = results.map((result, index) => {
        const network = walletHomeNetworks[index];
        if (result.status === 'fulfilled') {
          return result.value;
        }

        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        return buildPortfolioAssetSnapshot({
          network,
          balanceFormatted: '0.0000',
          error: message,
        });
      });

      if (mountedRef.current) {
        setAssetsIfChanged(sortPortfolioAssets(nextAssets));
      }
    } catch (error) {
      console.warn('[Home] Failed to refresh portfolio', error);
    } finally {
      if (mountedRef.current) {
        setAssetsLoading(false);
      }
    }
  }, [ethAddress, setAssetsIfChanged]);

  const loadRecentActivity = useCallback(async () => {
    if (activityInFlightRef.current) {
      activityQueuedRef.current = true;
      return;
    }

    activityInFlightRef.current = true;

    try {
      const cached = await getRecentActivitiesByWalletAcrossNetworks(ethAddress, [...WALLET_HOME_NETWORK_KEYS]);
      if (mountedRef.current) {
        setActivitiesIfChanged(mergePortfolioActivities(cached));
      }

      await Promise.allSettled(walletHomeNetworks.map(network => syncWalletActivities(ethAddress, network)));
      const next = await getRecentActivitiesByWalletAcrossNetworks(ethAddress, [...WALLET_HOME_NETWORK_KEYS]);
      if (mountedRef.current) {
        setActivitiesIfChanged(mergePortfolioActivities(next));
      }
    } catch (error) {
      console.warn('[Home] Failed to load recent activity', error);
    } finally {
      activityInFlightRef.current = false;
      if (activityQueuedRef.current) {
        activityQueuedRef.current = false;
        setTimeout(() => {
          loadRecentActivity().catch(nextError => {
            console.warn('[Home] Queued activity sync failed', nextError);
          });
        }, 0);
      }
    }
  }, [ethAddress, setActivitiesIfChanged]);

  const scheduleActivitySync = useCallback(() => {
    if (activitySyncTimerRef.current) {
      clearTimeout(activitySyncTimerRef.current);
    }

    activitySyncTimerRef.current = setTimeout(() => {
      loadRecentActivity().catch(error => {
        console.warn('[Home] Scheduled activity sync failed', error);
      });
    }, ACTIVITY_SYNC_DEBOUNCE_MS);
  }, [loadRecentActivity]);

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
    refreshPortfolio().catch(error => {
      console.warn('[Home] Initial portfolio refresh failed', error);
    });
    loadRecentActivity().catch(error => {
      console.warn('[Home] Initial activity refresh failed', error);
    });
  }, [loadPreferences, loadRecentActivity, refreshPortfolio]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (activitySyncTimerRef.current) {
        clearTimeout(activitySyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const balanceIntervalId = setInterval(() => {
      refreshPortfolio().catch(error => {
        console.warn('[Home] Interval portfolio refresh failed', error);
      });
    }, BALANCE_POLL_INTERVAL_MS);

    const activityIntervalId = setInterval(() => {
      scheduleActivitySync();
    }, ACTIVITY_POLL_INTERVAL_MS);

    return () => {
      clearInterval(balanceIntervalId);
      clearInterval(activityIntervalId);
    };
  }, [isAppActive, isFocused, refreshPortfolio, scheduleActivitySync]);

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
        assets.filter(asset => visibility[asset.network.key as WalletHomeNetworkKey]),
      ),
    [assets, visibility],
  );
  const totalUsdValue = useMemo(() => sumPortfolioUsdValue(visibleAssets), [visibleAssets]);
  const totalUsdNumber = useMemo(() => usdFormatter.format(totalUsdValue), [totalUsdValue]);
  const primaryWalletNetwork =
    visibleAssets[0]?.network ?? walletHomeNetworks[0];

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
          text: `${formatSignedPercentDelta(nextDayChange.percent)} | ${formatSignedUsdDelta(nextDayChange.amountUsd)}`,
          direction: nextDayChange.direction,
        });
      })
      .catch(error => {
        console.warn('[Home] Failed to sync portfolio snapshot', error);
      });
  }, [ethAddress, prefsReady, totalUsdValue]);

  const openSendPick = useCallback(() => {
    navigation.navigate(ROUTES.SendPick, {
      walletAddress: ethAddress,
      publicKeyHex,
    });
  }, [ethAddress, navigation, publicKeyHex]);

  const openReceive = useCallback((chainKey?: WalletHomeNetworkKey) => {
    navigation.navigate(ROUTES.Receive, {
      walletAddress: ethAddress,
      chainKey: chainKey ?? (primaryWalletNetwork.key as WalletHomeNetworkKey),
    });
  }, [ethAddress, navigation, primaryWalletNetwork.key]);

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

  const dayChangePillStyle = useMemo(() => {
    if (dayChangeLabel.direction === 'up') {
      return styles.balanceDeltaPositive;
    }
    if (dayChangeLabel.direction === 'down') {
      return styles.balanceDeltaNegative;
    }
    return styles.balanceDeltaNeutral;
  }, [dayChangeLabel.direction]);

  const listScrollContentStyle = useMemo(
    () => [styles.listScrollContent, { paddingBottom: 126 + insets.bottom }],
    [insets.bottom],
  );

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={styles.shell}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={WALLET_COLORS.text} />
            </Pressable>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerTitle}>Home</Text>
            </View>

            <Pressable style={styles.iconButton} onPress={handleScanQr}>
              <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.walletBar}>
            <Pressable style={styles.walletPill} onPress={copyAddress}>
              <View style={styles.walletDot} />
              <Text style={styles.walletName}>{t('homePrimaryWallet')}</Text>
              <Text style={styles.walletAddress}>{truncateAddress(ethAddress)}</Text>
              <View style={styles.walletCopy}>
                <Ionicons name="copy-outline" size={11} color={WALLET_COLORS.textMuted} />
              </View>
            </Pressable>
          </View>

          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>{t('homeTotalBalance')}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{totalUsdNumber}</Text>
              <Text style={styles.balanceUnit}>$</Text>
            </View>
            <WalletPill style={[styles.balanceDelta, dayChangePillStyle]}>
              <Text style={styles.balanceDeltaText}>{dayChangeLabel.text}</Text>
            </WalletPill>
          </View>

          <View style={styles.quickActions}>
            <Pressable style={[styles.quickAction, styles.quickActionPrimary]} onPress={openSendPick}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-up-outline" size={18} color={WALLET_COLORS.signal} />
              </View>
              <Text style={[styles.quickLabel, styles.quickLabelPrimary]}>{t('homeSendEth')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={() => openReceive()}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-down-outline" size={18} color={WALLET_COLORS.signal} />
              </View>
              <Text style={styles.quickLabel}>{t('homeReceive')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={handleScanQr}>
              <View style={styles.quickIcon}>
                <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.signal} />
              </View>
              <Text style={styles.quickLabel}>{t('homeScanQrTitle')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={() => setActiveTab('activity')}>
              <View style={styles.quickIcon}>
                <Ionicons name="time-outline" size={18} color={WALLET_COLORS.signal} />
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
              style={[styles.tabIconButton, assetsLoading && styles.tabIconButtonBusy]}
              disabled={assetsLoading}
              onPress={() => refreshPortfolio().catch(() => undefined)}
            >
              <Ionicons name="refresh-outline" size={15} color={WALLET_COLORS.textSoft} />
            </Pressable>
            <Pressable style={styles.tabIconButton} onPress={openManageTokens}>
              <Ionicons name="options-outline" size={15} color={WALLET_COLORS.textSoft} />
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
                                <Text style={styles.assetSymbol}>{asset.network.currencySymbol}</Text>
                                <Text style={styles.assetTag}>{asset.network.name}</Text>
                              </View>
                              <Text style={styles.assetBottomLine}>
                                {asset.error
                                  ? `${formatUsdValue(asset.usdPrice)} / ${asset.network.currencySymbol} | ${t('homeSyncDelayed')}`
                                  : `${formatUsdValue(asset.usdPrice)} / ${asset.network.currencySymbol}`}
                              </Text>
                            </View>
                            <View style={styles.assetRight}>
                              <Text style={styles.assetBalance}>{asset.balanceFormatted}</Text>
                              <Text style={styles.assetQuote}>{formatUsdValue(asset.usdValue)}</Text>
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
                            <Ionicons name="arrow-up-outline" size={16} color={WALLET_COLORS.text} />
                          </Pressable>
                        </View>
                        {index < visibleAssets.length - 1 ? <View style={styles.assetDivider} /> : null}
                      </View>
                    );
                  })}

                  <Pressable style={styles.manageRow} onPress={openManageTokens}>
                    <View style={[styles.coinBadge, styles.coinBadgeSoft]}>
                      <Ionicons name="grid-outline" size={18} color={WALLET_COLORS.text} />
                    </View>
                    <View style={styles.assetInfo}>
                      <Text style={styles.assetSymbol}>{t('homeManageAssets')}</Text>
                      <Text style={styles.assetBottomLine}>{t('homeManageAssetsBody')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={WALLET_COLORS.textSoft} />
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
                        <Ionicons name="time-outline" size={20} color={WALLET_COLORS.textSoft} />
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
                color={activeTab === 'assets' ? WALLET_COLORS.text : WALLET_COLORS.textSoft}
              />
              <Text style={[styles.bottomLabel, activeTab === 'assets' && styles.bottomLabelActive]}>
                {t('homeBottomHome')}
              </Text>
            </Pressable>

            <Pressable style={styles.bottomItem} onPress={() => setActiveTab('activity')}>
              <Ionicons
                name="time-outline"
                size={18}
                color={activeTab === 'activity' ? WALLET_COLORS.text : WALLET_COLORS.textSoft}
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
              <Ionicons name="gift-outline" size={18} color={WALLET_COLORS.textSoft} />
              <Text style={styles.bottomLabel}>{t('homeBottomCollect')}</Text>
            </Pressable>

            <Pressable style={styles.bottomItem} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={WALLET_COLORS.textSoft} />
              <Text style={styles.bottomLabel}>{t('homeBottomSettings')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 56,
    right: 56,
    alignItems: 'center',
  },
  headerTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletBar: {
    alignItems: 'center',
    marginTop: 10,
  },
  walletPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: WALLET_COLORS.signal,
  },
  walletName: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  walletAddress: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  walletCopy: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBlock: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 14,
  },
  balanceLabel: {
    color: '#62BBFF',
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  balanceValue: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -2.4,
  },
  balanceUnit: {
    color: WALLET_COLORS.textSoft,
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 28,
    marginBottom: 7,
  },
  balanceDelta: {
    minHeight: 30,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  balanceDeltaNeutral: {
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderColor: WALLET_COLORS.borderStrong,
  },
  balanceDeltaPositive: {
    backgroundColor: WALLET_COLORS.successSoft,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  balanceDeltaNegative: {
    backgroundColor: WALLET_COLORS.dangerSoft,
    borderColor: 'rgba(255, 122, 122, 0.35)',
  },
  balanceDeltaText: {
    color: WALLET_COLORS.text,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },
  quickAction: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  quickActionPrimary: {
    borderColor: WALLET_COLORS.signalBorder,
    backgroundColor: WALLET_COLORS.signalSoft,
  },
  quickIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    color: WALLET_COLORS.textMuted,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 12,
  },
  quickLabelPrimary: {
    color: WALLET_COLORS.text,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: WALLET_COLORS.border,
  },
  tabItem: {
    gap: 8,
  },
  tabText: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
  },
  tabTextActive: {
    color: WALLET_COLORS.text,
  },
  tabIndicator: {
    height: 3,
    borderRadius: 999,
    backgroundColor: WALLET_COLORS.signal,
  },
  tabsSpacer: {
    flex: 1,
  },
  tabIconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconButtonBusy: {
    opacity: 0.45,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    paddingBottom: 0,
  },
  listCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    overflow: 'hidden',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  assetTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coinBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBadgeSoft: {
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderColor: WALLET_COLORS.border,
  },
  coinBadgeText: {
    color: '#F8FBFF',
    fontFamily: DISPLAY_FONT,
    fontSize: 14,
    letterSpacing: -0.4,
  },
  coinBadgeLogo: {
    width: 26,
    height: 26,
    borderRadius: 999,
  },
  assetInfo: {
    flex: 1,
  },
  assetTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assetSymbol: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
  },
  assetTag: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  assetBottomLine: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  assetRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  assetBalance: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
  },
  assetQuote: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 12,
  },
  assetIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetDivider: {
    height: 1,
    backgroundColor: '#203149',
    marginHorizontal: 16,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 15,
    marginTop: 14,
  },
  emptyBody: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  activityIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconSend: {
    backgroundColor: WALLET_COLORS.dangerSoft,
  },
  activityIconReceive: {
    backgroundColor: WALLET_COLORS.successSoft,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 14,
  },
  activitySubtitle: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT,
    fontSize: 12,
    marginTop: 4,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  activityAmount: {
    color: WALLET_COLORS.text,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 13,
  },
  activityTime: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
  },
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
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  bottomItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomCenterBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: WALLET_COLORS.signal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  bottomLabel: {
    color: WALLET_COLORS.textSoft,
    fontFamily: SANS_FONT_SEMIBOLD,
    fontSize: 10,
  },
  bottomLabelActive: {
    color: WALLET_COLORS.text,
  },
  bottomCenterLabel: {
    color: '#8FD1FF',
  },
});

export default HomeScreen;
