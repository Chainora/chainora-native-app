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
import { SendTransactionDialog } from '../components/ui/SendTransactionDialog';
import { WalletDetailsDialog } from '../components/ui/WalletDetailsDialog';
import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import {
  addRecentActivity,
  getRecentActivitiesByWallet,
  type RecentActivity,
} from '../features/wallet/recentActivityStorage';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { SendTransactionSuccessPayload } from '../components/ui/SendTransactionDialog';
import { syncWalletActivities } from '../services/activitySyncService';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
const BALANCE_POLL_INTERVAL_MS = 15_000;
const ACTIVITY_POLL_INTERVAL_MS = 30_000;
const POST_SEND_BALANCE_REFETCH_DELAY_MS = 3_500;
const POST_SEND_ACTIVITY_REFETCH_DELAY_MS = 3_500;
const ACTIVITY_SYNC_DEBOUNCE_MS = 800;

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

type TabKey = 'assets' | 'activity';

export const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { resolvedTheme, t } = useSettings();
  const styles = useMemo(() => createStyles(), []);
  const isFocused = useIsFocused();
  const { initializeSession } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  const refreshBalanceFn = balanceState.refresh;
  const network = getActiveNetwork();
  const [activeTab, setActiveTab] = useState<TabKey>('assets');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const wasAppActiveRef = useRef(isAppActive);
  const lastNetworkKeyRef = useRef(network.key);
  const activityInFlightRef = useRef(false);
  const activityQueuedRef = useRef(false);
  const activitySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activitySignatureRef = useRef('');
  const postSendBalanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSendActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [dialogState, setDialogState] = useState({ send: false, walletDetails: false });
  const [activities, setActivities] = useState<RecentActivity[]>([]);

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

  const setActivitiesIfChanged = useCallback((next: RecentActivity[]) => {
    const signature = next.map(item => item.id).join('|');
    if (activitySignatureRef.current === signature) {
      return;
    }
    activitySignatureRef.current = signature;
    setActivities(next);
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
    const subscription = AppState.addEventListener('change', nextAppState => {
      setIsAppActive(nextAppState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadRecentActivity = useCallback(async () => {
    if (activityInFlightRef.current) {
      activityQueuedRef.current = true;
      return;
    }

    activityInFlightRef.current = true;

    try {
      // Render cached local activity first for instant UI response after login.
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

  const scheduleActivitySync = useCallback((reason: string) => {
    if (activitySyncTimerRef.current) {
      clearTimeout(activitySyncTimerRef.current);
    }

    activitySyncTimerRef.current = setTimeout(() => {
      loadRecentActivity().catch(error => {
        console.warn('[Home] Scheduled activity sync failed', reason, error);
      });
    }, ACTIVITY_SYNC_DEBOUNCE_MS);
  }, [loadRecentActivity]);

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
  }, [refreshBalanceFn, scheduleActivitySync, isAppActive, isFocused]);

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

    // Single refresh pass when app returns from background.
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

    // Refresh immediately after switching network so displayed balance matches selected chain.
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

  const balanceValue = useMemo(
    () => balanceState.formatted || '0.0000',
    [balanceState.formatted],
  );

  const openSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: true }));
  }, []);

  const closeSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: false }));
  }, []);

  const handleSendSuccess = useCallback(async (payload: SendTransactionSuccessPayload) => {
    balanceState.refresh();

    if (postSendBalanceTimeoutRef.current) {
      clearTimeout(postSendBalanceTimeoutRef.current);
    }
    postSendBalanceTimeoutRef.current = setTimeout(() => {
      balanceState.refresh();
    }, POST_SEND_BALANCE_REFETCH_DELAY_MS);

    try {
      await addRecentActivity({
        transactionHash: payload.result.transactionHash,
        networkKey: network.key,
        fromAddress: ethAddress,
        toAddress: payload.recipient,
        amountDisplay: payload.amountDisplay,
        currencySymbol: payload.currencySymbol,
        networkName: payload.networkName,
      });
      const next = await getRecentActivitiesByWallet(ethAddress);
      if (mountedRef.current) {
        setActivitiesIfChanged(next);
      }

      if (postSendActivityTimeoutRef.current) {
        clearTimeout(postSendActivityTimeoutRef.current);
      }
      postSendActivityTimeoutRef.current = setTimeout(() => {
        scheduleActivitySync('post-send');
      }, POST_SEND_ACTIVITY_REFETCH_DELAY_MS);
    } catch (error) {
      console.warn('[Home] Failed to persist recent activity', error);
    }
  }, [balanceState, ethAddress, network.key, scheduleActivitySync, setActivitiesIfChanged]);

  const refreshBalance = useCallback(() => {
    balanceState.refresh();
  }, [balanceState]);

  const openWalletDetails = useCallback(() => {
    setDialogState(prev => ({ ...prev, walletDetails: true }));
  }, []);

  const closeWalletDetails = useCallback(() => {
    setDialogState(prev => ({ ...prev, walletDetails: false }));
  }, []);

  const openSettings = useCallback(() => {
    navigation.navigate(ROUTES.Settings);
  }, [navigation]);

  const handleScanQr = useCallback(() => {
    navigation.navigate(ROUTES.QRScanner, { ethAddress });
  }, [ethAddress, navigation]);

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
  }, [ethAddress, t]);

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
    <View style={styles.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor="#05070D"
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.bgAuraLeft} />
        <View style={styles.bgAuraRight} />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={openSettings}>
              <Ionicons name="settings-outline" size={18} color="#C7D4E8" />
            </Pressable>

            <View style={styles.searchPill}>
              <Ionicons name="search-outline" size={14} color="#7F90AC" />
              <Text style={styles.searchText}>{t('homeSearchPlaceholder')}</Text>
            </View>

            <Pressable style={styles.iconButton} onPress={handleScanQr}>
              <Ionicons name="qr-code-outline" size={18} color="#C7D4E8" />
            </Pressable>
          </View>

          <View style={styles.walletBar}>
            <Pressable style={styles.walletPill} onPress={copyAddress}>
              <View style={styles.walletDot} />
              <Text style={styles.walletName}>{t('homePrimaryWallet')}</Text>
              <Text style={styles.walletAddress}>{truncateAddress(ethAddress)}</Text>
              <View style={styles.walletCopy}>
                <Ionicons name="copy-outline" size={10} color="#A6B6D0" />
              </View>
            </Pressable>
          </View>

          <View style={styles.balanceBlock}>
            <Text style={styles.balanceLabel}>{t('homeTotalBalance')}</Text>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{balanceValue}</Text>
              <Text style={styles.balanceUnit}>{network.currencySymbol}</Text>
            </View>
            <View style={styles.balanceDelta}>
              <Text style={styles.balanceDeltaText}>
                {activities.length > 0 ? '▲' : '•'} {activitySummary}
              </Text>
            </View>
          </View>

          <View style={styles.quickActions}>
            <Pressable style={styles.quickAction} onPress={openSendDialog}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-up" size={18} color="#4FB4FF" />
              </View>
              <Text style={styles.quickLabel}>{t('homeSendEth')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={openWalletDetails}>
              <View style={styles.quickIcon}>
                <Ionicons name="arrow-down" size={18} color="#4FB4FF" />
              </View>
              <Text style={styles.quickLabel}>{t('homeReceive')}</Text>
            </Pressable>

            <Pressable style={[styles.quickAction, styles.quickActionPrimary]} onPress={handleScanQr}>
              <View style={styles.quickIcon}>
                <Ionicons name="swap-horizontal" size={20} color="#4FB4FF" />
              </View>
              <Text style={[styles.quickLabel, styles.quickLabelPrimary]}>{t('homeSwap')}</Text>
            </Pressable>

            <Pressable style={styles.quickAction} onPress={openSettings}>
              <View style={styles.quickIcon}>
                <Ionicons name="add-outline" size={20} color="#4FB4FF" />
              </View>
              <Text style={styles.quickLabel}>{t('homeBuy')}</Text>
            </Pressable>
          </View>

          <View style={styles.tabsRow}>
            <Pressable onPress={() => setActiveTab('assets')}>
              <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>
                {t('homeTabAssets')}
              </Text>
              {activeTab === 'assets' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>

            <Pressable onPress={() => setActiveTab('activity')}>
              <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>
                {t('homeTabActivity')}
              </Text>
              {activeTab === 'activity' ? <View style={styles.tabIndicator} /> : null}
            </Pressable>

            <View style={styles.tabsSpacer} />

            <Pressable style={styles.tabIconButton} onPress={refreshBalance}>
              <Ionicons name="refresh-outline" size={15} color="#8EA0BC" />
            </Pressable>
            <Pressable style={styles.tabIconButton} onPress={openSettings}>
              <Ionicons name="options-outline" size={15} color="#8EA0BC" />
            </Pressable>
          </View>

          {activeTab === 'assets' ? (
            <View style={styles.assetList}>
              <Pressable style={styles.assetRow} onPress={openWalletDetails}>
                <View style={styles.coinBadge}>
                  <Text style={styles.coinBadgeText}>{network.currencySymbol.slice(0, 2).toUpperCase()}</Text>
                </View>

                <View style={styles.assetInfo}>
                  <View style={styles.assetTopLine}>
                    <Text style={styles.assetSymbol}>{network.currencySymbol.toUpperCase()}</Text>
                    <Text style={styles.assetTag}>{network.name}</Text>
                  </View>
                  <Text style={styles.assetBottomLine}>{t('homeOnchainBalanceLive')}</Text>
                </View>

                <View style={styles.assetRight}>
                  <Text style={styles.assetBalance}>{balanceValue}</Text>
                  <Text style={styles.assetQuote}>{network.currencySymbol}</Text>
                </View>
              </Pressable>

              <View style={styles.assetDivider} />

              <Pressable style={styles.assetRow} onPress={copyAddress}>
                <View style={[styles.coinBadge, styles.coinBadgeSecondary]}>
                  <Ionicons name="finger-print-outline" size={16} color="#C9D8ED" />
                </View>

                <View style={styles.assetInfo}>
                  <View style={styles.assetTopLine}>
                    <Text style={styles.assetSymbol}>{t('homeWalletTag')}</Text>
                    <Text style={styles.assetTag}>{t('homeAddressTag')}</Text>
                  </View>
                  <Text style={styles.assetBottomLine}>{truncateAddress(ethAddress)}</Text>
                </View>

                <View style={styles.assetRight}>
                  <Ionicons name="copy-outline" size={18} color="#8EA0BC" />
                </View>
              </Pressable>
            </View>
          ) : (
            <RecentActivitySection activities={activities} />
          )}
        </ScrollView>

        <View style={styles.bottomNavWrap} pointerEvents="none">
          <View style={styles.bottomNavInner}>
            <View style={[styles.navItem, styles.navItemOn]}>
              <Ionicons name="home-outline" size={18} color="#E7EEFA" />
              <Text style={[styles.navText, styles.navTextOn]}>{t('homeBottomHome')}</Text>
            </View>
            <View style={styles.navItem}>
              <Ionicons name="trending-up-outline" size={18} color="#8EA0BC" />
              <Text style={styles.navText}>{t('homeBottomTrending')}</Text>
            </View>
            <View style={styles.navItemCenter}>
              <View style={styles.navCenterBubble}>
                <Ionicons name="swap-horizontal" size={21} color="#F3F9FF" />
              </View>
              <Text style={styles.navCenterText}>{t('homeBottomTrade')}</Text>
            </View>
            <View style={styles.navItem}>
              <Ionicons name="gift-outline" size={18} color="#8EA0BC" />
              <Text style={styles.navText}>{t('homeBottomRewards')}</Text>
            </View>
            <View style={styles.navItem}>
              <Ionicons name="compass-outline" size={18} color="#8EA0BC" />
              <Text style={styles.navText}>{t('homeBottomExplore')}</Text>
            </View>
          </View>
        </View>

        <SendTransactionDialog
          visible={dialogState.send}
          fromAddress={ethAddress}
          availableAmount={balanceValue}
          onClose={closeSendDialog}
          onSuccess={handleSendSuccess}
        />

        <WalletDetailsDialog
          visible={dialogState.walletDetails}
          onClose={closeWalletDetails}
          address={ethAddress}
          publicKeyHex={publicKeyHex}
          networkName={network.name}
        />
      </SafeAreaView>
    </View>
  );
};

const createStyles = () => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05070D',
  },
  safeArea: {
    flex: 1,
  },
  bgAuraLeft: {
    position: 'absolute',
    left: -120,
    top: -70,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: 'rgba(40, 151, 255, 0.16)',
  },
  bgAuraRight: {
    position: 'absolute',
    right: -130,
    top: 90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(34, 211, 238, 0.09)',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 166,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#111826',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPill: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#111826',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  searchText: {
    color: '#7F90AC',
    fontSize: 13,
  },
  walletBar: {
    alignItems: 'center',
    marginTop: 10,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#111826',
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2897FF',
  },
  walletName: {
    color: '#E7EEFA',
    fontSize: 13,
    fontWeight: '600',
  },
  walletAddress: {
    color: '#8598B8',
    fontSize: 11,
    fontWeight: '500',
  },
  walletCopy: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#192437',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBlock: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  balanceLabel: {
    color: '#62BBFF',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 5,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  balanceValue: {
    color: '#E7EEFA',
    fontSize: 50,
    lineHeight: 54,
    fontWeight: '800',
    letterSpacing: -1.4,
  },
  balanceUnit: {
    color: '#8EA0BC',
    fontSize: 26,
    marginBottom: 7,
    fontWeight: '600',
  },
  balanceDelta: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.35)',
    backgroundColor: 'rgba(40, 151, 255, 0.13)',
  },
  balanceDeltaText: {
    color: '#8CD0FF',
    fontSize: 11,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 12,
  },
  quickAction: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#111826',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 7,
  },
  quickActionPrimary: {
    borderColor: 'rgba(79, 180, 255, 0.36)',
    backgroundColor: 'rgba(40, 151, 255, 0.12)',
  },
  quickIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    color: '#B6C4DB',
    fontSize: 12,
    fontWeight: '600',
  },
  quickLabelPrimary: {
    color: '#EAF4FF',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#243248',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  tabText: {
    color: '#8EA0BC',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  tabTextActive: {
    color: '#E7EEFA',
  },
  tabIndicator: {
    height: 2,
    borderRadius: 999,
    backgroundColor: '#2897FF',
    marginTop: -1,
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
  assetList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#101827',
    overflow: 'hidden',
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  coinBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#254266',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBadgeSecondary: {
    backgroundColor: '#1F2E44',
  },
  coinBadgeText: {
    color: '#EAF4FF',
    fontSize: 12,
    fontWeight: '700',
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
    color: '#E7EEFA',
    fontSize: 15,
    fontWeight: '700',
  },
  assetTag: {
    color: '#8EA0BC',
    fontSize: 11,
    backgroundColor: '#1A2639',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  assetBottomLine: {
    color: '#8EA0BC',
    fontSize: 12,
    marginTop: 4,
  },
  assetRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  assetBalance: {
    color: '#E7EEFA',
    fontSize: 14,
    fontWeight: '700',
  },
  assetQuote: {
    color: '#8EA0BC',
    fontSize: 12,
    marginTop: 3,
  },
  assetDivider: {
    height: 1,
    backgroundColor: '#203149',
    marginHorizontal: 16,
  },
  bottomNavWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    paddingHorizontal: 8,
    paddingTop: 10,
    backgroundColor: 'rgba(5, 7, 13, 0.9)',
  },
  bottomNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#243248',
    backgroundColor: '#111826',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navItemOn: {
    position: 'relative',
  },
  navText: {
    color: '#7F90AC',
    fontSize: 10,
    fontWeight: '600',
  },
  navTextOn: {
    color: '#E7EEFA',
  },
  navItemCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navCenterBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2897FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  navCenterText: {
    color: '#8FD1FF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
});

export default HomeScreen;
