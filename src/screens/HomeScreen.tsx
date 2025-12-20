import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

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

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width, height } = Dimensions.get('window');

export const HomeScreen: React.FC<Props> = ({ route, navigation }) => {
  
  const { ethAddress, publicKeyHex, mode } = route.params;
  console.log(ethAddress);
  const { session, initializeSession, isAuthenticated } = useAuth();
  const balanceState = useWalletBalance(ethAddress);
  console.log(balanceState);
  const { animatedStyle: heroAnimation } = useEntranceAnimation({ translateInitial: 36, fadeDuration: 700 });
  const { animatedStyle: balanceAnimation } = useEntranceAnimation({ translateInitial: 28, delay: 140 });
  const { animatedStyle: detailAnimation } = useEntranceAnimation({ translateInitial: 24, delay: 260 });

  const truncatedPublicKey = useMemo(() => {
    if (!publicKeyHex) {
      return null;
    }
    return publicKeyHex.length > 32 ? `${publicKeyHex.slice(0, 28)}…${publicKeyHex.slice(-6)}` : publicKeyHex;
  }, [publicKeyHex]);

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  const sessionStatus = useMemo(() => {
    if (!session) {
      return 'No active authentication session. Scan your Chainora card to get started.';
    }
    if (isAuthenticated) {
      return 'Authenticated via recent card scan.';
    }
    return 'Awaiting card scan. Rescan your Chainora card to authenticate.';
  }, [session, isAuthenticated]);

  const sessionExpiry = useMemo(() => {
    if (!session) {
      return 'Unknown';
    }
    const millis = Date.parse(session.expiresAt) - Date.now();
    if (Number.isNaN(millis) || millis <= 0) {
      return 'Expired';
    }
    const hours = Math.floor(millis / (1000 * 60 * 60));
    const minutes = Math.floor((millis % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  }, [session]);

  const sessionUpdatedAt = useMemo(() => {
    if (!session) {
      return 'Unknown';
    }
    const timestamp = Date.parse(session.issuedAt);
    if (Number.isNaN(timestamp)) {
      return 'Unknown';
    }
    return new Date(timestamp).toLocaleString();
  }, [session]);

  const openComingSoon = useCallback((label: string) => {
    Alert.alert(`${label} (coming soon)`, 'This section is under development.');
  }, []);

  const quickActions = useMemo(
    () => [
      {
        key: 'scan',
        label: 'Scan Card',
        description: 'Open the Chainora scanner',
        tint: 'rgba(56, 189, 248, 0.2)',
        onPress: () => navigation.navigate(ROUTES.NfcScan),
      },
      {
        key: 'transactions',
        label: 'Transactions',
        description: 'View your activity history',
        tint: 'rgba(129, 140, 248, 0.2)',
        onPress: () => openComingSoon('Transactions'),
      },
      {
        key: 'backup',
        label: 'Backup',
        description: 'Review recovery guidance',
        tint: 'rgba(16, 185, 129, 0.2)',
        onPress: () => openComingSoon('Backup'),
      },
    ],
    [navigation, openComingSoon],
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <FloatingOrb color={THEME.primary} size={320} initial={{ x: -80, y: -80 }} duration={9200} />
        <FloatingOrb
          color="#6366F1"
          size={260}
          initial={{ x: width - 240, y: 80 }}
          duration={11000}
          drift={{ x: 30, y: -34 }}
        />
        <FloatingOrb
          color="#22D3EE"
          size={220}
          initial={{ x: width / 3, y: height - 240 }}
          duration={9600}
          drift={{ x: -28, y: 32 }}
          opacity={0.18}
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.heroCard, heroAnimation]}>
            <View style={styles.networkPill}>
              <Text style={styles.networkPillText}>
                {NETWORK.name} · Chain {NETWORK.chainId}
              </Text>
            </View>
            <Text style={styles.heroTitle}>Chainora Wallet</Text>
            <Text style={styles.heroSubtitle}>
              {mode === 'init' ? 'New wallet initialised and secured.' : 'Signed in and ready to transact.'}
            </Text>
            <View style={styles.heroAddressRow}>
              <Text style={styles.heroAddressLabel}>Address</Text>
              <Text style={styles.heroAddressValue} selectable>
                {ethAddress}
              </Text>
            </View>
            <AppButton
              label="Scan Card Again"
              onPress={() => navigation.navigate(ROUTES.NfcScan)}
              style={styles.heroButton}
            />
          </Animated.View>

          <Animated.View style={[styles.card, balanceAnimation]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Pressable
                onPress={balanceState.refresh}
                disabled={balanceState.loading}
                style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
              >
                <Text style={[styles.refreshLabel, balanceState.loading && styles.refreshLabelDisabled]}>
                  {balanceState.loading ? 'Refreshing…' : 'Refresh'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.balanceValue}>
              {balanceState.loading
                ? '···'
                : balanceState.formatted
                ? `${balanceState.formatted} ${NETWORK.currencySymbol}`
                : `0.0000 ${NETWORK.currencySymbol}`}
            </Text>
            {balanceState.error ? <Text style={styles.errorText}>{balanceState.error}</Text> : null}

            <View style={styles.quickActionsRow}>
              {quickActions.map(action => (
                <Pressable
                  key={action.key}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.quickAction,
                    { backgroundColor: action.tint },
                    pressed && styles.quickActionPressed,
                  ]}
                >
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
                  <Text style={styles.quickActionDescription}>{action.description}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[styles.card, detailAnimation]}>
            <Text style={styles.sectionTitle}>Wallet Details</Text>

            <View style={styles.pillRow}>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Network</Text>
                <Text style={styles.infoPillValue}>{NETWORK.name}</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Chain ID</Text>
                <Text style={styles.infoPillValue}>{NETWORK.chainId}</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillLabel}>Currency</Text>
                <Text style={styles.infoPillValue}>{NETWORK.currencySymbol}</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Session status</Text>
              <Text style={styles.detailValue}>{sessionStatus}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Session expiry</Text>
              <Text style={styles.detailValue}>{sessionExpiry}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Last update</Text>
              <Text style={styles.detailValue}>{sessionUpdatedAt}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Public key</Text>
              <Text style={styles.detailValue} selectable>
                {truncatedPublicKey ?? 'N/A'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Full address</Text>
              <Text style={[styles.detailValue, styles.mono]} selectable>
                {ethAddress}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>

        <BottomNavBar
          items={[
            { key: 'home', label: 'Home', active: true, onPress: undefined },
            {
              key: 'transactions',
              label: 'Transactions',
              onPress: () => openComingSoon('Transactions'),
            },
            {
              key: 'settings',
              label: 'Settings',
              onPress: () => openComingSoon('Settings'),
            },
          ]}
        />
      </SafeAreaView>
    </View>
  );
};

const MONO_FONT = Platform.select({ ios: 'Menlo', macos: 'Menlo', android: 'monospace', default: 'Menlo' });

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 20,
  },
  heroCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    shadowColor: THEME.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  networkPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    marginBottom: 16,
  },
  networkPillText: {
    color: THEME.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: THEME.foreground,
    marginBottom: 6,
  },
  heroSubtitle: {
    color: THEME.foregroundMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  heroAddressRow: {
    marginBottom: 24,
  },
  heroAddressLabel: {
    color: THEME.foregroundMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  heroAddressValue: {
    color: THEME.foreground,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: MONO_FONT,
    lineHeight: 20,
  },
  heroButton: {
    marginTop: 12,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.foreground,
    letterSpacing: 0.4,
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  refreshButtonPressed: {
    opacity: 0.8,
  },
  refreshLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.primary,
  },
  refreshLabelDisabled: {
    color: THEME.foregroundMuted,
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: THEME.foreground,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  errorText: {
    marginTop: 8,
    color: THEME.danger,
    fontSize: 13,
  },
  quickActionsRow: {
    marginTop: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    flexBasis: '48%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  quickActionPressed: {
    opacity: 0.9,
  },
  quickActionLabel: {
    color: THEME.foreground,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  quickActionDescription: {
    color: THEME.foregroundMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  infoPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  infoPillLabel: {
    color: THEME.foregroundMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoPillValue: {
    color: THEME.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    color: THEME.foregroundMuted,
    fontSize: 13,
    marginBottom: 4,
  },
  detailValue: {
    color: THEME.foreground,
    fontSize: 14,
    lineHeight: 20,
  },
  mono: {
    fontFamily: MONO_FONT,
  },
});
export default HomeScreen;