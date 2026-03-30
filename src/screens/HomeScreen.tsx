import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { ThemeTokens } from '../types/theme/colors';
import type { SendTransactionSuccessPayload } from '../components/ui/SendTransactionDialog';
import { syncWalletActivities } from '../services/activitySyncService';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;
const BALANCE_POLL_INTERVAL_MS = 15_000;
const ACTIVITY_POLL_INTERVAL_MS = 30_000;

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { resolvedTheme, t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const isFocused = useIsFocused();
  const { initializeSession } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  const refreshBalanceFn = balanceState.refresh;
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [dialogState, setDialogState] = useState({ send: false, walletDetails: false });
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const network = getActiveNetwork();

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      setIsAppActive(nextAppState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadRecentActivity = useCallback(async () => {
    try {
      await syncWalletActivities(ethAddress);
      const next = await getRecentActivitiesByWallet(ethAddress);
      setActivities(next);
    } catch (error) {
      console.warn('[Home] Failed to load recent activity', error);
    }
  }, [ethAddress]);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const balanceIntervalId = setInterval(() => {
      refreshBalanceFn();
    }, BALANCE_POLL_INTERVAL_MS);

    const activityIntervalId = setInterval(() => {
      loadRecentActivity();
    }, ACTIVITY_POLL_INTERVAL_MS);

    return () => {
      clearInterval(balanceIntervalId);
      clearInterval(activityIntervalId);
    };
  }, [loadRecentActivity, refreshBalanceFn, isAppActive, isFocused]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    loadRecentActivity();
  }, [isFocused, loadRecentActivity]);

  const balanceValue = balanceState.loading
    ? '0.0000'
    : balanceState.formatted || '0.0000';

  const openSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: true }));
  }, []);

  const closeSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: false }));
  }, []);

  const handleSendSuccess = useCallback(async (payload: SendTransactionSuccessPayload) => {
    balanceState.refresh();
    try {
      await addRecentActivity({
        transactionHash: payload.result.transactionHash,
        fromAddress: ethAddress,
        toAddress: payload.recipient,
        amountDisplay: payload.amountDisplay,
        currencySymbol: payload.currencySymbol,
        networkName: payload.networkName,
      });
      const next = await getRecentActivitiesByWallet(ethAddress);
      setActivities(next);
    } catch (error) {
      console.warn('[Home] Failed to persist recent activity', error);
    }
  }, [balanceState, ethAddress]);

  const refreshBalance = useCallback(() => {
    balanceState.refresh();
  }, [balanceState]);

  const openWalletDetails = useCallback(() => {
    setDialogState(prev => ({ ...prev, walletDetails: true }));
  }, []);

  const closeWalletDetails = useCallback(() => {
    setDialogState(prev => ({ ...prev, walletDetails: false }));
  }, []);

  const handleBackup = useCallback(() => {
    navigation.navigate(ROUTES.Settings);
  }, [navigation]);

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert(t('homeCopiedTitle'), t('homeCopiedMessage'));
  }, [ethAddress, t]);

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={themeTokens.background}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.cardLabel}>{t('homeTotalBalance')}</Text>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={refreshBalance}
                  disabled={balanceState.loading}
                  style={[styles.refreshButton, balanceState.loading && styles.refreshButtonDisabled]}
                >
                  <Ionicons name="refresh-outline" size={14} color={themeTokens.foregroundMuted} />
                  <Text style={styles.refreshText}>{balanceState.loading ? t('homeUpdating') : t('homeRefresh')}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceValue}>{balanceValue}</Text>
              <Text style={styles.currency}>{network.currencySymbol}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.addressRow}>
              <View>
                <Text style={styles.addressLabel}>{t('homeAddressLabel')}</Text>
                <View style={styles.addressWrapper}>
                  <Text style={styles.addressText}>{truncateAddress(ethAddress)}</Text>
                  <Pressable onPress={copyAddress} hitSlop={12} style={styles.copyButton}>
                    <Ionicons name="copy-outline" size={16} color={themeTokens.foregroundMuted} />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={openWalletDetails} style={styles.networkPill}>
                <Ionicons name="trending-up-outline" size={14} color={themeTokens.primary} />
                <Text style={styles.networkText}>{network.name}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('homeQuickActions')}</Text>
          <View style={styles.quickActions}>
            <Pressable style={styles.actionCard} onPress={openSendDialog}>
              <View style={styles.actionIconGold}>
                <Ionicons name="paper-plane-outline" size={20} color={themeTokens.primary} />
              </View>
              <Text style={styles.actionTitle}>{t('homeSendEth')}</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={handleBackup}>
              <View style={styles.actionIconGold}>
                <Ionicons name="settings-outline" size={20} color={themeTokens.primary} />
              </View>
              <Text style={styles.actionTitle}>{t('homeSettings')}</Text>
            </Pressable>
          </View>

          <RecentActivitySection activities={activities} />
        </ScrollView>

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

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 16,
  },
  balanceCard: {
    backgroundColor: theme.surfaceHighlight,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 18,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.surface,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshText: {
    color: theme.foregroundMuted,
    fontSize: theme.typography.subtext,
    fontWeight: '600',
  },
  cardLabel: {
    color: '#7E8AA1',
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  liveBadge: {
    backgroundColor: 'rgba(47, 214, 123, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(47, 214, 123, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveText: {
    color: '#2FD67B',
    fontSize: theme.typography.subtext,
    fontWeight: '700',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  balanceValue: {
    fontSize: 52,
    lineHeight: 56,
    color: theme.foreground,
    fontWeight: '800',
    letterSpacing: -1,
  },
  currency: {
    fontSize: theme.typography.subtitle,
    color: theme.foregroundMuted,
    marginBottom: 7,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(126, 138, 161, 0.2)',
    marginVertical: 16,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  addressLabel: {
    fontSize: theme.typography.body,
    color: '#8D98AE',
    marginBottom: 4,
  },
  addressText: {
    fontSize: theme.typography.subtitle,
    color: theme.foreground,
    fontWeight: '700',
  },
  addressWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    padding: 2,
    opacity: 0.8,
  },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.primaryLight,
    backgroundColor: theme.glow,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  networkText: {
    color: theme.primary,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#7E8AA1',
    fontSize: theme.typography.body,
    letterSpacing: 2,
    fontWeight: '700',
    marginTop: 6,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: theme.surfaceHighlight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
  },
  actionIconGold: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.primaryLight,
    backgroundColor: theme.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconGreen: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(47, 214, 123, 0.35)',
    backgroundColor: 'rgba(47, 214, 123, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    color: theme.foreground,
    fontSize: theme.typography.subtitle,
    fontWeight: '700',
  },
  actionSubtext: {
    color: theme.foregroundMuted,
    fontSize: theme.typography.body,
  },
});

export default HomeScreen;
