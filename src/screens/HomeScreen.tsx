import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BottomNavBar } from '../components/BottomNavBar';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { useAuth } from '../features/auth';
import { useWalletBalance } from '../features/wallet/hooks/useWalletBalance';
import { THEME } from '../utils/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ route }) => {
  const { ethAddress, publicKeyHex, mode } = route.params;
  const { session, initializeSession, isAuthenticated } = useAuth();
  const balanceState = useWalletBalance(ethAddress);

  const truncatedAddress = useMemo(() => {
    return ethAddress.length > 18 ? `${ethAddress.slice(0, 12)}…${ethAddress.slice(-6)}` : ethAddress;
  }, [ethAddress]);

  useEffect(() => {
    initializeSession(ethAddress).catch(error => {
      console.warn('[Home] Failed to ensure auth session', error);
    });
  }, [ethAddress, initializeSession]);

  const sessionStatus = useMemo(() => {
    if (!session) {
      return 'No authentication session. Please rescan your Chainora card.';
    }
    if (isAuthenticated) {
      return 'Authenticated via card signature.';
    }
    return 'Awaiting signature verification. Rescan your Chainora card to authenticate.';
  }, [session, isAuthenticated]);

  const sessionExpiry = useMemo(() => {
    if (!session) {
      return null;
    }
    const millis = Date.parse(session.expiresAt) - Date.now();
    if (Number.isNaN(millis) || millis <= 0) {
      return 'Expired';
    }
    const hours = Math.floor(millis / (1000 * 60 * 60));
    const minutes = Math.floor((millis % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  }, [session]);

  const challengePreview = useMemo(() => {
    if (!session?.challenge) {
      return 'N/A';
    }
    return session.challenge.length > 64 ? `${session.challenge.slice(0, 60)}…` : session.challenge;
  }, [session?.challenge]);

  const openComingSoon = useCallback((label: string) => {
    Alert.alert(`${label} (coming soon)`, 'This section is under development.');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <View style={styles.container}>
        <Text style={styles.heading}>Wallet Ready</Text>
        <Text style={styles.modeText}>{mode === 'init' ? 'New wallet initialised' : 'Signed in successfully'}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Ethereum address</Text>
          <Text style={styles.address}>{truncatedAddress}</Text>
          <Text style={styles.addressDetail} selectable>
            {ethAddress}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Balance</Text>
          <Text style={styles.balanceValue}>
            {balanceState.loading ? 'Loading...' : balanceState.formatted ? `${balanceState.formatted} ETH` : 'N/A'}
          </Text>
          {balanceState.error ? <Text style={styles.errorText}>{balanceState.error}</Text> : null}
        </View>

        {publicKeyHex ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Public key (hex)</Text>
            <Text style={styles.publicKey} selectable>
              {publicKeyHex}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Authentication</Text>
          <Text style={styles.authStatus}>{sessionStatus}</Text>
          <Text style={styles.metaRow}>Session expiry: {sessionExpiry ?? 'Unknown'}</Text>
          <Text style={styles.metaRow} selectable>
            Challenge: {challengePreview}
          </Text>
          {session?.signature ? (
            <Text style={styles.metaRow} selectable>
              Signature: {`${session.signature.slice(0, 20)}…`}
            </Text>
          ) : null}
        </View>
      </View>
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
  );
};

const MONO_FONT = Platform.select({ ios: 'Menlo', macos: 'Menlo', android: 'monospace', default: 'Menlo' });

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  heading: {
    fontSize: 30,
    fontWeight: '700',
    color: THEME.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  modeText: {
    textAlign: 'center',
    color: THEME.foregroundMuted,
    marginBottom: 24,
    fontSize: 16,
  },
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  sectionLabel: {
    fontSize: 14,
    color: THEME.foregroundMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  address: {
    fontSize: 18,
    fontWeight: '600',
    color: THEME.foreground,
    marginBottom: 6,
  },
  addressDetail: {
    fontFamily: MONO_FONT,
    fontSize: 13,
    lineHeight: 18,
    color: THEME.foregroundMuted,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME.foreground,
  },
  errorText: {
    marginTop: 6,
    color: '#f87171',
    fontSize: 13,
  },
  publicKey: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 18,
    color: THEME.foregroundMuted,
  },
  authStatus: {
    fontSize: 16,
    color: THEME.foreground,
    marginBottom: 8,
  },
  metaRow: {
    fontSize: 13,
    color: THEME.foregroundMuted,
    marginTop: 4,
  },
});

export default HomeScreen;
