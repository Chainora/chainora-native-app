import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
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

import { SendTransactionDialog } from '../components/ui/SendTransactionDialog';
import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useSettings } from '../features/settings';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import type { ThemeTokens } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

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
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [dialogState, setDialogState] = useState({ send: false });
  const network = getActiveNetwork();

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      appStateRef.current = nextAppState;
      setIsAppActive(nextAppState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const intervalId = setInterval(() => {
      refreshBalanceFn();
    }, 10_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshBalanceFn, isAppActive, isFocused]);

  const balanceValue = balanceState.loading
    ? '0.0000'
    : balanceState.formatted || '0.0000';

  const openSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: true }));
  }, []);

  const closeSendDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, send: false }));
  }, []);

  const handleSendSuccess = useCallback(() => {
    balanceState.refresh();
  }, [balanceState]);

  const refreshBalance = useCallback(() => {
    balanceState.refresh();
  }, [balanceState]);

  const openWalletDetails = useCallback(() => {
    Alert.alert(
      t('homeWalletAlertTitle'),
      `${t('homeAddressLine')}: ${ethAddress}\n\n${t('homePublicKeyLine')}: ${publicKeyHex ? `${publicKeyHex.slice(0, 24)}...` : t('homeUnavailable')}`,
    );
  }, [ethAddress, publicKeyHex, t]);

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
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>{t('homeLive')}</Text>
                </View>
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

            <Pressable style={styles.actionCard} onPress={openWalletDetails}>
              <View style={styles.actionIconGreen}>
                <Ionicons name="shield-checkmark-outline" size={20} color={themeTokens.success} />
              </View>
              <Text style={styles.actionTitle}>{t('homeWalletDetails')}</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={handleBackup}>
              <View style={styles.actionIconGold}>
                <Ionicons name="settings-outline" size={20} color={themeTokens.primary} />
              </View>
              <Text style={styles.actionTitle}>{t('homeSettings')}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>{t('homeRecentActivity')}</Text>
          <View style={styles.activityList}>
            <View style={styles.activityItem}>
              <View style={styles.activityMeta}>
                <Text style={styles.activityType}>{t('homeNoTransactions')}</Text>
                <Text style={styles.activityAddress}>{t('homeNoTransactionsDesc')}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <SendTransactionDialog
          visible={dialogState.send}
          fromAddress={ethAddress}
          onClose={closeSendDialog}
          onSuccess={handleSendSuccess}
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
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111722',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconSent: {
    backgroundColor: 'rgba(255, 77, 79, 0.1)',
  },
  activityIconReceived: {
    backgroundColor: 'rgba(47, 214, 123, 0.1)',
  },
  activityMeta: {
    flex: 1,
  },
  activityType: {
    color: theme.foreground,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  activityAddress: {
    color: theme.foregroundMuted,
    fontSize: theme.typography.subtext,
    marginTop: 2,
  },
  activityValueCol: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  amountSent: {
    color: '#FF4D4F',
  },
  amountReceived: {
    color: '#2FD67B',
  },
  activityTime: {
    color: theme.foregroundMuted,
    fontSize: theme.typography.subtext,
    marginTop: 2,
  },
});

export default HomeScreen;
