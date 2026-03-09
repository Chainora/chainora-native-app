import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { BottomNavBar } from '../components/BottomNavBar';
import { EcdhBackupDialog } from '../components/ui/EcdhBackupDialog';
import { SendTransactionDialog } from '../components/ui/SendTransactionDialog';
import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const HomeScreen: React.FC<Props> = ({ route }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const isFocused = useIsFocused();
  const { initializeSession } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  const refreshBalanceFn = balanceState.refresh;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [dialogState, setDialogState] = useState({ send: false, backup: false });
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
      'Your Wallet',
      `Address: ${ethAddress}\n\nPublic key: ${publicKeyHex ? `${publicKeyHex.slice(0, 24)}...` : 'Unavailable'}`,
    );
  }, [ethAddress, publicKeyHex]);

  const handleBackup = useCallback(() => {
    setDialogState(prev => ({ ...prev, backup: true }));
  }, []);

  const closeBackupDialog = useCallback(() => {
    setDialogState(prev => ({ ...prev, backup: false }));
  }, []);

  const copyAddress = useCallback(() => {
    Clipboard.setString(ethAddress);
    Alert.alert('Copied', 'Wallet address copied to clipboard.');
  }, [ethAddress]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.cardLabel}>TOTAL BALANCE</Text>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={refreshBalance}
                  disabled={balanceState.loading}
                  style={[styles.refreshButton, balanceState.loading && styles.refreshButtonDisabled]}
                >
                  <Ionicons name="refresh-outline" size={14} color={THEME.foregroundMuted} />
                  <Text style={styles.refreshText}>{balanceState.loading ? 'Updating' : 'Refresh'}</Text>
                </Pressable>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>LIVE</Text>
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
                <Text style={styles.addressLabel}>Address</Text>
                <View style={styles.addressWrapper}>
                  <Text style={styles.addressText}>{truncateAddress(ethAddress)}</Text>
                  <Pressable onPress={copyAddress} hitSlop={12} style={styles.copyButton}>
                    <Ionicons name="copy-outline" size={16} color={THEME.foregroundMuted} />
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={openWalletDetails} style={styles.networkPill}>
                <Ionicons name="trending-up-outline" size={14} color={THEME.primary} />
                <Text style={styles.networkText}>{network.name}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickActions}>
            <Pressable style={styles.actionCard} onPress={openSendDialog}>
              <View style={styles.actionIconGold}>
                <Ionicons name="paper-plane-outline" size={20} color={THEME.primary} />
              </View>
              <Text style={styles.actionTitle}>Send ETH</Text>
              <Text style={styles.actionSubtext}>Transfer funds</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={openWalletDetails}>
              <View style={styles.actionIconGreen}>
                <Ionicons name="shield-checkmark-outline" size={20} color={THEME.success} />
              </View>
              <Text style={styles.actionTitle}>Wallet</Text>
              <Text style={styles.actionSubtext}>Address & keys</Text>
            </Pressable>

            <Pressable style={styles.actionCard} onPress={handleBackup}>
              <View style={styles.actionIconGold}>
                <Ionicons name="sync-outline" size={20} color={THEME.primary} />
              </View>
              <Text style={styles.actionTitle}>Backup</Text>
              <Text style={styles.actionSubtext}>Sync keys</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          <View style={styles.activityList}>
            <View style={styles.activityItem}>
              <View style={styles.activityMeta}>
                <Text style={styles.activityType}>No transactions yet</Text>
                <Text style={styles.activityAddress}>Transaction history will appear here after your first transfer.</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <BottomNavBar
          items={[
            { key: 'home', label: 'Home', active: true, onPress: undefined },
            { key: 'transactions', label: 'History', onPress: undefined },
            { key: 'settings', label: 'Vault', onPress: undefined },
          ]}
        />

        <SendTransactionDialog
          visible={dialogState.send}
          fromAddress={ethAddress}
          onClose={closeSendDialog}
          onSuccess={handleSendSuccess}
        />

        <EcdhBackupDialog visible={dialogState.backup} onClose={closeBackupDialog} />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.background,
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
    backgroundColor: THEME.surfaceHighlight,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: THEME.border,
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
    borderColor: THEME.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: THEME.surface,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshText: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
    fontWeight: '600',
  },
  cardLabel: {
    color: '#7E8AA1',
    fontSize: THEME.typography.body,
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
    fontSize: THEME.typography.subtext,
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
    color: THEME.foreground,
    fontWeight: '800',
    letterSpacing: -1,
  },
  currency: {
    fontSize: THEME.typography.subtitle,
    color: THEME.foregroundMuted,
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
    fontSize: THEME.typography.body,
    color: '#8D98AE',
    marginBottom: 4,
  },
  addressText: {
    fontSize: THEME.typography.subtitle,
    color: THEME.foreground,
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
    borderColor: 'rgba(191, 164, 106, 0.35)',
    backgroundColor: 'rgba(191, 164, 106, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  networkText: {
    color: THEME.primary,
    fontSize: THEME.typography.body,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#7E8AA1',
    fontSize: THEME.typography.body,
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
    backgroundColor: THEME.surfaceHighlight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    minHeight: 160,
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
    borderColor: 'rgba(191, 164, 106, 0.35)',
    backgroundColor: 'rgba(191, 164, 106, 0.08)',
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
    color: THEME.foreground,
    fontSize: THEME.typography.subtitle,
    fontWeight: '700',
  },
  actionSubtext: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.body,
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
    borderColor: THEME.border,
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
    color: THEME.foreground,
    fontSize: THEME.typography.body,
    fontWeight: '700',
  },
  activityAddress: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
    marginTop: 2,
  },
  activityValueCol: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: THEME.typography.body,
    fontWeight: '700',
  },
  amountSent: {
    color: '#FF4D4F',
  },
  amountReceived: {
    color: '#2FD67B',
  },
  activityTime: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
    marginTop: 2,
  },
});

export default HomeScreen;
