import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { BottomNavBar } from '../components/BottomNavBar';
import { SendTransactionDialog } from '../components/ui/SendTransactionDialog';
import { getActiveNetwork } from '../config/network';
import { useAuth } from '../features/auth';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type ActivityItem = {
  id: string;
  type: 'sent' | 'received';
  address: string;
  amount: string;
  timeAgo: string;
};

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const HomeScreen: React.FC<Props> = ({ route }) => {
  const { ethAddress, publicKeyHex } = route.params;
  const { initializeSession } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  const [sendVisible, setSendVisible] = useState(false);
  const network = getActiveNetwork();

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  const balanceValue = balanceState.loading
    ? '0.0000'
    : balanceState.formatted || '0.0000';

  const activities = useMemo<ActivityItem[]>(
    () => [
      {
        id: 'tx-1',
        type: 'sent',
        address: '0xAb3F...9C21',
        amount: '-0.05',
        timeAgo: '2h ago',
      },
      {
        id: 'tx-2',
        type: 'received',
        address: '0x19Fe...3D44',
        amount: '+0.20',
        timeAgo: '1d ago',
      },
    ],
    [],
  );

  const openSendDialog = useCallback(() => {
    setSendVisible(true);
  }, []);

  const closeSendDialog = useCallback(() => {
    setSendVisible(false);
  }, []);

  const handleSendSuccess = useCallback(() => {
    balanceState.refresh();
  }, [balanceState]);

  const openWalletDetails = useCallback(() => {
    Alert.alert(
      'Your Wallet',
      `Address: ${ethAddress}\n\nPublic key: ${publicKeyHex ? `${publicKeyHex.slice(0, 24)}...` : 'Unavailable'}`,
    );
  }, [ethAddress, publicKeyHex]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.cardLabel}>TOTAL BALANCE</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
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
                <Text style={styles.addressText}>{truncateAddress(ethAddress)}</Text>
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
          </View>

          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          <View style={styles.activityList}>
            {activities.map(item => {
              const sent = item.type === 'sent';
              return (
                <View key={item.id} style={styles.activityItem}>
                  <View style={[styles.activityIcon, sent ? styles.activityIconSent : styles.activityIconReceived]}>
                    <Ionicons
                      name={sent ? 'arrow-up-outline' : 'arrow-down-outline'}
                      size={18}
                      color={sent ? '#FF4D4F' : '#2FD67B'}
                    />
                  </View>

                  <View style={styles.activityMeta}>
                    <Text style={styles.activityType}>{sent ? 'Sent' : 'Received'}</Text>
                    <Text style={styles.activityAddress}>{item.address}</Text>
                  </View>

                  <View style={styles.activityValueCol}>
                    <Text style={[styles.activityAmount, sent ? styles.amountSent : styles.amountReceived]}>
                      {item.amount} {network.currencySymbol}
                    </Text>
                    <Text style={styles.activityTime}>{item.timeAgo}</Text>
                  </View>
                </View>
              );
            })}
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
          visible={sendVisible}
          fromAddress={ethAddress}
          onClose={closeSendDialog}
          onSuccess={handleSendSuccess}
        />
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
