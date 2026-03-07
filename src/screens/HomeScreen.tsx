import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { BottomNavBar } from '../components/BottomNavBar';
import { FloatingOrb } from '../components/ui/animations/FloatingOrb';
import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { NETWORK } from '../config/network';
import { useAuth } from '../features/auth';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';
import { SendTransactionDialog } from '../components/ui/SendTransactionDialog';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width, height } = Dimensions.get('window');

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' });

export const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex, mode } = route.params;
  const { session, initializeSession, isAuthenticated } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  const [sendVisible, setSendVisible] = useState(false);

  // Entrance Animations for staggered reveal
  const { animatedStyle: heroAnimation } = useEntranceAnimation({ translateInitial: 36, fadeDuration: 800 });
  const { animatedStyle: balanceAnimation } = useEntranceAnimation({ translateInitial: 24, delay: 150 });
  const { animatedStyle: detailAnimation } = useEntranceAnimation({ translateInitial: 20, delay: 300 });

  const truncatedPublicKey = useMemo(() => {
    if (!publicKeyHex) return null;
    return `${publicKeyHex.slice(0, 16)}...${publicKeyHex.slice(-16)}`;
  }, [publicKeyHex]);

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  const openSendDialog = useCallback(() => {
    setSendVisible(true);
  }, []);

  const closeSendDialog = useCallback(() => {
    setSendVisible(false);
  }, []);

  const refreshBalance = balanceState.refresh;

  const handleSendSuccess = useCallback(() => {
    refreshBalance();
  }, [refreshBalance]);

  const openComingSoon = useCallback((label: string) => {
    Alert.alert(`${label} (Coming Soon)`, 'This feature is currently being integrated into the hardware layer.');
  }, []);

  const quickActions = useMemo(
    () => [
      {
        key: 'scan',
        label: 'Scan Card',
        description: 'Update keys',
        color: THEME.primary,
        onPress: () => navigation.navigate(ROUTES.NfcScan),
      },
      {
        key: 'transactions',
        label: 'Activity',
        description: 'View history',
        color: '#818CF8',
        onPress: () => openComingSoon('Transactions'),
      },
      {
        key: 'backup',
        label: 'Security',
        description: 'Recovery tools',
        color: '#10B981',
        onPress: () => openComingSoon('Backup'),
      },
      {
        key: 'settings',
        label: 'Config',
        description: 'App settings',
        color: '#F59E0B',
        onPress: () => openComingSoon('Settings'),
      },
    ],
    [navigation, openComingSoon],
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />

      {/* Ambient Cyber Background */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FloatingOrb color={THEME.primary} size={400} initial={{ x: -100, y: -100 }} duration={12000} />
        <FloatingOrb color="#6366F1" size={300} initial={{ x: width - 200, y: height / 3 }} duration={15000} drift={{ x: 50, y: -50 }} />
        <FloatingOrb color="#22D3EE" size={250} initial={{ x: 50, y: height - 250 }} duration={10000} opacity={0.1} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. Identity Card (Hero) */}
          <Animated.View style={[styles.idCard, heroAnimation]}>
            <View style={styles.idCardGlow} />
            <View style={styles.idHeader}>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: isAuthenticated ? THEME.success : THEME.warning }]} />
                <Text style={styles.statusText}>{isAuthenticated ? 'SECURE' : 'RESCAN REQ.'}</Text>
              </View>
              <Text style={styles.idCardLabel}>IDENTITY NODE</Text>
            </View>

            <View style={styles.idBody}>
              <Text style={styles.idTitle}>Chainora Wallet</Text>
              <View style={styles.addressContainer}>
                <Text style={styles.addressLabel}>EVM ENDPOINT</Text>
                <Text style={styles.addressValue} selectable>{ethAddress}</Text>
              </View>
            </View>

            <View style={styles.idFooter}>
              <View style={styles.modePill}>
                <Text style={styles.modePillText}>{mode === 'init' ? 'INITIALIZED' : 'SIGN-IN ACTIVE'}</Text>
              </View>
              <Text style={styles.networkName}>{NETWORK.name}</Text>
            </View>
            
            {/* Tech Decoration */}
            <View style={styles.cornerAccent} />
          </Animated.View>

          {/* 2. Portfolio Balance (Glassmorphic) */}
          <Animated.View style={[styles.balanceCard, balanceAnimation]}>
            <View style={styles.balanceHeader}>
              <Text style={styles.cardLabel}>ASSETS</Text>
              <Pressable onPress={balanceState.refresh} disabled={balanceState.loading}>
                <Text style={[styles.refreshText, balanceState.loading && styles.refreshDisabled]}>
                  {balanceState.loading ? 'SYNCING...' : 'REFRESH'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.balanceMain}>
              <Text style={styles.balanceValue}>
                {balanceState.loading ? '---.----' : balanceState.formatted || '0.0000'}
              </Text>
              <Text style={styles.currencySymbol}>{NETWORK.currencySymbol}</Text>
            </View>
            {balanceState.error && <Text style={styles.errorText}>{balanceState.error}</Text>}
          </Animated.View>

          <View style={styles.sendButtonWrapper}>
            <AppButton label="Send ETH" onPress={openSendDialog} />
          </View>

          {/* 3. Action Grid */}
          <View style={styles.actionGrid}>
            {quickActions.map(action => (
              <Pressable
                key={action.key}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.actionTile,
                  { borderColor: `${action.color}33` },
                  pressed && styles.actionTilePressed,
                ]}
              >
                <View style={[styles.actionIconDot, { backgroundColor: action.color }]} />
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionSubLabel}>{action.description}</Text>
              </Pressable>
            ))}
          </View>

          {/* 4. Technical Details Grid */}
          <Animated.View style={[styles.detailsSection, detailAnimation]}>
            <Text style={styles.cardLabel}>NODE SPECIFICATIONS</Text>
            <View style={styles.dataGrid}>
              <View style={styles.dataTile}>
                <Text style={styles.dataLabel}>CHAIN ID</Text>
                <Text style={styles.dataValue}>{NETWORK.chainId}</Text>
              </View>
              <View style={styles.dataTile}>
                <Text style={styles.dataLabel}>UPTIME</Text>
                <Text style={styles.dataValue}>99.9%</Text>
              </View>
              <View style={styles.dataTileFull}>
                <Text style={styles.dataLabel}>PUBKEY_HEX</Text>
                <Text style={styles.dataValueMono} selectable>{truncatedPublicKey}</Text>
              </View>
              <View style={styles.dataTileFull}>
                <Text style={styles.dataLabel}>SESSION_LIFE</Text>
                <Text style={styles.dataValue}>{session ? 'ACTIVE' : 'EXPIRED'}</Text>
              </View>
            </View>
            
            <AppButton
              label="Authenticate New Card"
              onPress={() => navigation.navigate(ROUTES.NfcScan)}
              variant="secondary"
              style={styles.bottomButton}
            />
          </Animated.View>

        </ScrollView>

        <BottomNavBar
          items={[
            { key: 'home', label: 'Home', active: true, onPress: undefined },
            { key: 'transactions', label: 'History', onPress: () => openComingSoon('History') },
            { key: 'settings', label: 'Vault', onPress: () => openComingSoon('Vault') },
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
    paddingBottom: 140,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
  // ID Card Styling
  idCard: {
    backgroundColor: 'rgba(20, 23, 28, 0.9)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(191, 164, 106, 0.3)',
    overflow: 'hidden',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  idCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4,
    height: '100%',
    backgroundColor: THEME.primary,
  },
  idHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    color: THEME.foreground,
    fontSize: THEME.typography.micro,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  idCardLabel: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.micro,
    fontWeight: '700',
    letterSpacing: 2,
  },
  idBody: {
    marginBottom: 24,
  },
  idTitle: {
    fontSize: THEME.typography.title,
    fontWeight: '800',
    color: THEME.foreground,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  addressContainer: {
    backgroundColor: 'rgba(14, 16, 21, 0.85)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  addressLabel: {
    color: THEME.primary,
    fontSize: THEME.typography.micro,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 1,
  },
  addressValue: {
    color: '#C7CEDB',
    fontSize: THEME.typography.caption,
    fontFamily: MONO_FONT,
    lineHeight: 18,
  },
  idFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modePill: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modePillText: {
    color: THEME.primary,
    fontSize: THEME.typography.small,
    fontWeight: '700',
  },
  networkName: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.caption,
    fontWeight: '600',
  },
  cornerAccent: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 20,
  },
  // Balance Card
  balanceCard: {
    backgroundColor: 'rgba(14, 16, 21, 0.8)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: THEME.typography.small,
    fontWeight: '800',
    color: THEME.foregroundMuted,
    letterSpacing: 1.5,
  },
  refreshText: {
    fontSize: THEME.typography.small,
    fontWeight: '700',
    color: THEME.primary,
  },
  refreshDisabled: {
    opacity: 0.5,
  },
  balanceMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  balanceValue: {
    fontSize: THEME.typography.display,
    fontWeight: '800',
    color: THEME.foreground,
    letterSpacing: -1,
  },
  currencySymbol: {
    fontSize: THEME.typography.body,
    fontWeight: '600',
    color: THEME.primary,
  },
  errorText: {
    color: THEME.danger,
    fontSize: THEME.typography.caption,
    marginTop: 8,
  },
  sendButtonWrapper: {
    marginTop: -4,
  },
  // Action Grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  actionTilePressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
  },
  actionIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: THEME.typography.subtext,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  actionSubLabel: {
    fontSize: THEME.typography.small,
    color: THEME.foregroundMuted,
  },
  // Details Section
  detailsSection: {
    backgroundColor: 'rgba(14, 16, 21, 0.8)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    gap: 16,
  },
  dataTile: {
    width: '47%',
  },
  dataTileFull: {
    width: '100%',
  },
  dataLabel: {
    fontSize: THEME.typography.micro,
    fontWeight: '800',
    color: THEME.foregroundMuted,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  dataValue: {
    fontSize: THEME.typography.subtext,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  dataValueMono: {
    fontSize: THEME.typography.caption,
    fontFamily: MONO_FONT,
    color: THEME.primary,
  },
  bottomButton: {
    marginTop: 24,
  },
});

export default HomeScreen;
