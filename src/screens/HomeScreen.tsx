import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { RecentActivitySection } from '../components/home/RecentActivitySection';
import {
  DISPLAY_FONT,
  MONO_FONT,
  WALLET_COLORS,
  WalletAuras,
  WalletPanel,
  WalletPill,
  buildWalletScreenStyles,
} from '../components/ui/walletDesign';
import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import {
  getRecentActivitiesByWallet,
  type RecentActivity,
} from '../features/wallet/recentActivityStorage';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import { syncWalletActivities } from '../services/activitySyncService';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Home>;
type TabKey = 'assets' | 'activity';

const BALANCE_POLL_INTERVAL_MS = 15_000;
const ACTIVITY_POLL_INTERVAL_MS = 30_000;
const POST_SEND_BALANCE_REFETCH_DELAY_MS = 3_500;
const POST_SEND_ACTIVITY_REFETCH_DELAY_MS = 3_500;
const ACTIVITY_SYNC_DEBOUNCE_MS = 800;

const STATIC_TOKENS = [
  { sym: 'BTC', network: 'Bitcoin', name: 'Bitcoin', balance: '0.001439', value: '111.90', glyph: 'B' },
  { sym: 'BNB', network: 'BNB Smart Chain', name: 'BNB Smart Chain', balance: '0.072958', value: '46.30', glyph: 'B' },
  { sym: 'SOL', network: 'Solana', name: 'Solana', balance: '0.532024', value: '45.76', glyph: 'S' },
];

const screenBase = buildWalletScreenStyles();

const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const coinColors: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  BNB: '#F3BA2F',
  SOL: '#9945FF',
};

const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { initializeSession } = useAuth();
  const { resolvedTheme, t } = useSettings();
  const isFocused = useIsFocused();
  const balanceState = useWalletBalance(ethAddress);
  const refreshBalanceFn = balanceState.refresh;
  const network = getActiveNetwork();

  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [activities, setActivities] = useState<RecentActivity[]>([]);

  const wasAppActiveRef = useRef(isAppActive);
  const lastNetworkKeyRef = useRef(network.key);
  const activityInFlightRef = useRef(false);
  const activityQueuedRef = useRef(false);
  const activitySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activitySignatureRef = useRef('');
  const postSendBalanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSendActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (postSendBalanceTimeoutRef.current) {
        clearTimeout(postSendBalanceTimeoutRef.current);
      }
      if (postSendActivityTimeoutRef.current) {
        clearTimeout(postSendActivityTimeoutRef.current);
      }
      if (activitySyncTimerRef.current) {
        clearTimeout(activitySyncTimerRef.current);
      }
    };
  }, []);

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

  const setActivitiesIfChanged = useCallback((next: RecentActivity[]) => {
    const signature = next.map(item => item.id).join('|');
    if (activitySignatureRef.current === signature) {
      return;
    }
    activitySignatureRef.current = signature;
    setActivities(next);
  }, []);

  const loadRecentActivity = useCallback(async () => {
    if (activityInFlightRef.current) {
      activityQueuedRef.current = true;
      return;
    }

    activityInFlightRef.current = true;

    try {
      const cached = await getRecentActivitiesByWallet(ethAddress);
      if (mountedRef.current) {
        setActivitiesIfChanged(cached);
      }

      await syncWalletActivities(ethAddress);
      const next = await getRecentActivitiesByWallet(ethAddress);
      if (mountedRef.current) {
        setActivitiesIfChanged(next);
      }
    } catch (error) {
      console.warn('[Home] Failed to load recent activity', error);
    } finally {
      activityInFlightRef.current = false;
      if (activityQueuedRef.current) {
        activityQueuedRef.current = false;
        setTimeout(() => {
          loadRecentActivity().catch(err => {
            console.warn('[Home] Queued activity sync failed', err);
          });
        }, 0);
      }
    }
  }, [ethAddress, setActivitiesIfChanged]);

  const scheduleActivitySync = useCallback(
    (reason: string) => {
      if (activitySyncTimerRef.current) {
        clearTimeout(activitySyncTimerRef.current);
      }

      activitySyncTimerRef.current = setTimeout(() => {
        loadRecentActivity().catch(error => {
          console.warn('[Home] Scheduled activity sync failed', reason, error);
        });
      }, ACTIVITY_SYNC_DEBOUNCE_MS);
    },
    [loadRecentActivity],
  );

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const balanceIntervalId = setInterval(() => {
      refreshBalanceFn();
    }, BALANCE_POLL_INTERVAL_MS);

    const activityIntervalId = setInterval(() => {
      scheduleActivitySync('interval');
    }, ACTIVITY_POLL_INTERVAL_MS);

    return () => {
      clearInterval(balanceIntervalId);
      clearInterval(activityIntervalId);
    };
  }, [isAppActive, isFocused, refreshBalanceFn, scheduleActivitySync]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    scheduleActivitySync('focus');
  }, [isFocused, scheduleActivitySync]);

  useEffect(() => {
    if (!isFocused) {
      wasAppActiveRef.current = isAppActive;
      return;
    }

    const becameActive = !wasAppActiveRef.current && isAppActive;
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) {
      return;
    }

    refreshBalanceFn();
    scheduleActivitySync('app-active');
  }, [isAppActive, isFocused, refreshBalanceFn, scheduleActivitySync]);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    if (lastNetworkKeyRef.current === network.key) {
      return;
    }

    lastNetworkKeyRef.current = network.key;
    refreshBalanceFn();
    scheduleActivitySync('network-change');
  }, [isAppActive, isFocused, network.key, refreshBalanceFn, scheduleActivitySync]);

  useEffect(() => {
    if (!isFocused || !isAppActive || !balanceState.formatted) {
      return;
    }
    scheduleActivitySync('balance-updated');
  }, [balanceState.formatted, isAppActive, isFocused, scheduleActivitySync]);

  const balanceValue = useMemo(() => balanceState.formatted || '0.0000', [balanceState.formatted]);

  const openSendScreen = useCallback(() => {
    navigation.navigate(ROUTES.SendTransaction, {
      fromAddress: ethAddress,
      availableAmount: balanceValue,
    });
  }, [balanceValue, ethAddress, navigation]);

  const openWalletDetails = useCallback(() => {
    navigation.navigate(ROUTES.WalletDetails, {
      address: ethAddress,
      publicKeyHex,
      networkName: network.name,
    });
  }, [ethAddress, navigation, network.name, publicKeyHex]);

  const openSettings = useCallback(() => {
    navigation.navigate(ROUTES.Settings);
  }, [navigation]);

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
  }, [ethAddress, t]);

  const handleScanQr = useCallback(() => {
    navigation.navigate(ROUTES.QRScanner, { ethAddress });
  }, [ethAddress, navigation]);

  const activitySummary = useMemo(() => {
    if (balanceState.loading) {
      return t('homeUpdating');
    }
    if (balanceState.error) {
      return t('homeSyncDelayed');
    }
    return network.name;
  }, [balanceState.error, balanceState.loading, network.name, t]);

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color={WALLET_COLORS.text} />
            </Pressable>

            <WalletPill style={styles.searchPill}>
              <Ionicons name="search-outline" size={14} color={WALLET_COLORS.textSoft} />
              <Text style={styles.searchText}>{t('homeSearchPlaceholder')}</Text>
            </WalletPill>

            <Pressable style={styles.iconButton} onPress={handleScanQr}>
              <Ionicons name="scan-outline" size={18} color={WALLET_COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.walletBar}>
            <WalletPill style={styles.walletPill}>
              <View style={styles.walletDot} />
              <Pressable style={styles.walletPillContent} onPress={copyAddress} onLongPress={openWalletDetails}>
                <Text style={styles.walletName}>{t('homePrimaryWallet')}</Text>
                <Text style={styles.walletAddress}>{truncateAddress(ethAddress)}</Text>
              </Pressable>
              <Pressable style={styles.walletCopy} onPress={openWalletDetails}>
                <Ionicons name="copy-outline" size={11} color={WALLET_COLORS.textMuted} />
              </Pressable>
            </WalletPill>
          </View>

          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>{t('homeTotalBalance')}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{balanceValue}</Text>
              <Text style={styles.balanceUnit}>{network.currencySymbol}</Text>
            </View>
            <WalletPill style={styles.balanceDelta}>
              <Text style={styles.balanceDeltaText}>{activitySummary}</Text>
            </WalletPill>
          </View>

          <View style={styles.quickActions}>
            <Pressable style={[styles.quickAction, styles.quickActionPrimary]} onPress={() => navigation.navigate(ROUTES.SendPick)} onLongPress={openSendScreen}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-up-outline" size={18} color={WALLET_COLORS.signal} />
              </View>
              <Text style={[styles.quickLabel, styles.quickLabelPrimary]}>{t('homeSendEth')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={() => navigation.navigate(ROUTES.Receive)} onLongPress={openWalletDetails}>
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

            <Pressable style={styles.quickAction} onPress={() => navigation.navigate(ROUTES.TokenManage)}>
              <View style={styles.quickIcon}>
                <Ionicons name="options-outline" size={18} color={WALLET_COLORS.signal} />
              </View>
              <Text style={styles.quickLabel}>Manage</Text>
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('assets')}>
              <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>{t('homeTabAssets')}</Text>
              {activeTab === 'assets' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
            <Pressable style={styles.tabItem} onPress={() => setActiveTab('activity')}>
              <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>{t('homeTabActivity')}</Text>
              {activeTab === 'activity' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
            <View style={styles.tabsSpacer} />
            <Pressable style={styles.tabIconButton} onPress={refreshBalanceFn}>
              <Ionicons name="refresh-outline" size={15} color={WALLET_COLORS.textSoft} />
            </Pressable>
            <Pressable style={styles.tabIconButton} onPress={() => navigation.navigate(ROUTES.TokenManage)}>
              <Ionicons name="ellipsis-horizontal" size={15} color={WALLET_COLORS.textSoft} />
            </Pressable>
          </View>

          {activeTab === 'assets' ? (
            <WalletPanel style={styles.assetsCard}>
              <View style={styles.assetRow}>
                <View style={[styles.coinBadge, { backgroundColor: coinColors[network.currencySymbol.toUpperCase()] ?? '#254266' }]}>
                  <Text style={styles.coinBadgeText}>{network.currencySymbol.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Pressable style={styles.assetInfo} onPress={openWalletDetails}>
                  <View style={styles.assetTopLine}>
                    <Text style={styles.assetSymbol}>{network.currencySymbol.toUpperCase()}</Text>
                    <Text style={styles.assetTag}>{network.name}</Text>
                  </View>
                  <Text style={styles.assetBottomLine}>{t('homeOnchainBalanceLive')}</Text>
                </Pressable>
                <View style={styles.assetRight}>
                  <Text style={styles.assetBalance}>{balanceValue}</Text>
                  <Text style={styles.assetQuote}>{network.currencySymbol}</Text>
                </View>
                <Pressable style={styles.assetIconButton} onPress={openSendScreen}>
                  <Ionicons name="arrow-up-outline" size={16} color={WALLET_COLORS.text} />
                </Pressable>
              </View>

              <View style={styles.assetDivider} />

              {STATIC_TOKENS.map(item => (
                <View key={item.sym}>
                  <View style={styles.assetRow}>
                    <View style={[styles.coinBadge, { backgroundColor: coinColors[item.sym] ?? '#254266' }]}>
                      <Text style={styles.coinBadgeText}>{item.glyph}</Text>
                    </View>
                    <View style={styles.assetInfo}>
                      <View style={styles.assetTopLine}>
                        <Text style={styles.assetSymbol}>{item.sym}</Text>
                        <Text style={styles.assetTag}>{item.network}</Text>
                      </View>
                      <Text style={styles.assetBottomLine}>{item.name}</Text>
                    </View>
                    <View style={styles.assetRight}>
                      <Text style={styles.assetBalance}>{item.balance}</Text>
                      <Text style={styles.assetQuote}>${item.value}</Text>
                    </View>
                  </View>
                  <View style={styles.assetDivider} />
                </View>
              ))}

              <Pressable style={styles.manageRow} onPress={() => navigation.navigate(ROUTES.TokenManage)}>
                <View style={[styles.coinBadge, styles.coinBadgeSoft]}>
                  <Ionicons name="grid-outline" size={18} color={WALLET_COLORS.text} />
                </View>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetSymbol}>Token list</Text>
                  <Text style={styles.assetBottomLine}>Enable, disable, import assets</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={WALLET_COLORS.textSoft} />
              </Pressable>
            </WalletPanel>
          ) : (
            <RecentActivitySection activities={activities} />
          )}
        </ScrollView>

        <View style={styles.bottomDock} pointerEvents="none">
          <View style={styles.bottomDockInner}>
            {[
              { label: 'Wallet', icon: 'home-outline', active: true },
              { label: 'Activity', icon: 'time-outline' },
              { label: 'Scan', icon: 'scan-outline', center: true },
              { label: 'Collect', icon: 'gift-outline' },
              { label: 'Settings', icon: 'settings-outline' },
            ].map(item => (
              <View key={item.label} style={item.center ? styles.bottomCenter : styles.bottomItem}>
                {item.center ? (
                  <View style={styles.bottomCenterBubble}>
                    <Ionicons name={item.icon as never} size={20} color="#F3F9FF" />
                  </View>
                ) : (
                  <Ionicons
                    name={item.icon as never}
                    size={18}
                    color={item.active ? WALLET_COLORS.text : WALLET_COLORS.textSoft}
                  />
                )}
                <Text style={[styles.bottomLabel, item.active && styles.bottomLabelActive, item.center && styles.bottomCenterLabel]}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 160,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  searchPill: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    gap: 7,
  },
  searchText: {
    color: WALLET_COLORS.textSoft,
    fontSize: 13,
  },
  walletBar: {
    alignItems: 'center',
    marginTop: 10,
  },
  walletPill: {
    minHeight: 36,
    paddingHorizontal: 12,
    gap: 8,
  },
  walletPillContent: {
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
    fontSize: 13,
    fontWeight: '600',
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
    marginBottom: 12,
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
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
    letterSpacing: -1.2,
  },
  balanceUnit: {
    color: WALLET_COLORS.textSoft,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  balanceDelta: {
    minHeight: 30,
    marginTop: 10,
    paddingHorizontal: 12,
    backgroundColor: WALLET_COLORS.signalSoft,
    borderColor: WALLET_COLORS.signalBorder,
  },
  balanceDeltaText: {
    color: '#8CD0FF',
    fontSize: 11,
    fontWeight: '700',
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
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 14,
    fontWeight: '700',
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
  assetsCard: {
    overflow: 'hidden',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  coinBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBadgeSoft: {
    backgroundColor: WALLET_COLORS.surfaceSoft,
  },
  coinBadgeText: {
    color: '#F8FBFF',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: DISPLAY_FONT,
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
    fontSize: 15,
    fontWeight: '700',
  },
  assetTag: {
    color: WALLET_COLORS.textSoft,
    fontSize: 10,
    backgroundColor: WALLET_COLORS.surfaceSoft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  assetBottomLine: {
    color: WALLET_COLORS.textSoft,
    fontSize: 12,
    marginTop: 4,
  },
  assetRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  assetBalance: {
    color: WALLET_COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  assetQuote: {
    color: WALLET_COLORS.textSoft,
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
    fontSize: 10,
    fontWeight: '600',
  },
  bottomLabelActive: {
    color: WALLET_COLORS.text,
  },
  bottomCenterLabel: {
    color: '#8FD1FF',
  },
});

export default HomeScreen;
