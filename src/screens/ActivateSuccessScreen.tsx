import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { THEME } from '../types/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.ActivateSuccess>;

export const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { ethAddress, publicKeyHex, mode } = route.params;
  const hasNavigatedRef = useRef(false);

  const shortAddress = `${ethAddress.slice(0, 6)}...${ethAddress.slice(-4)}`;

  const goToHome = useCallback(() => {
    if (hasNavigatedRef.current) {
      return;
    }

    hasNavigatedRef.current = true;
    navigation.reset({
      index: 0,
      routes: [
        {
          name: ROUTES.Home,
          params: {
            ethAddress,
            publicKeyHex,
            mode,
          },
        },
      ],
    });
  }, [ethAddress, mode, navigation, publicKeyHex]);

  useEffect(() => {
    const timer = setTimeout(goToHome, 2200);
    return () => clearTimeout(timer);
  }, [goToHome]);

  const handleCopyPress = useCallback(() => {
    Alert.alert('Wallet address', ethAddress);
  }, [ethAddress]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={THEME.background} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.frame}>
          <View style={styles.notch} />

          <View style={styles.centerGroup}>
            <View style={styles.successOuter}>
              <View style={styles.successInner}>
                <Ionicons name="checkmark-circle-outline" size={44} color="#1ED760" />
              </View>
            </View>
            <Text style={styles.title}>Wallet Activated!</Text>
            <Text style={styles.subtitle}>Your card is ready to use.</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.walletCard}>
            <View style={styles.cardTapIconWrap}>
              <Ionicons name="wifi-outline" size={21} color="#7E8799" style={styles.cardTapIcon} />
            </View>
            <View style={styles.chip} />
            <Text style={styles.brand}>CHAINORA</Text>
            <Text style={styles.shortAddress}>{shortAddress}</Text>
          </View>

          <View style={styles.addressBox}>
            <View style={styles.addressTextWrap}>
              <Text style={styles.addressLabel}>Your wallet address</Text>
              <Text style={styles.addressValue}>{ethAddress}</Text>
            </View>
            <Pressable style={styles.copyButton} accessibilityRole="button" onPress={handleCopyPress}>
              <Ionicons name="copy-outline" size={22} color="#B8C0CF" />
            </Pressable>
          </View>

          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Share this address to receive ETH. Your private key never leaves the card.
            </Text>
          </View>

          <Text style={styles.footerBrand}>chainora</Text>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#03060A',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  frame: {
    flex: 1,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(81, 92, 110, 0.25)',
    backgroundColor: '#050A10',
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  notch: {
    width: 150,
    height: 42,
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: '#020306',
    marginBottom: 30,
  },
  centerGroup: {
    alignItems: 'center',
  },
  successOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(30, 215, 96, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(30, 215, 96, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  successInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '800',
    color: '#EAF0F8',
    textAlign: 'center',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '500',
    color: '#A5B1C2',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(126, 138, 161, 0.16)',
    marginTop: 34,
  },
  walletCard: {
    marginTop: 24,
    borderRadius: 18,
    minHeight: 160,
    padding: 16,
    backgroundColor: 'rgba(3, 6, 10, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(71, 82, 103, 0.24)',
  },
  cardTapIconWrap: {
    alignItems: 'flex-end',
    marginBottom: 26,
  },
  cardTapIcon: {
    transform: [{ rotate: '-90deg' }],
  },
  chip: {
    width: 56,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(117, 136, 166, 0.42)',
    backgroundColor: 'rgba(81, 104, 142, 0.2)',
    marginBottom: 20,
  },
  brand: {
    color: 'rgba(90, 109, 139, 0.3)',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  shortAddress: {
    marginTop: 8,
    color: '#79859A',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500',
    letterSpacing: -0.8,
  },
  addressBox: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A3A56',
    backgroundColor: '#111A29',
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addressTextWrap: {
    flex: 1,
  },
  addressLabel: {
    color: '#6E7C95',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  addressValue: {
    color: '#E6ECF5',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  copyButton: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: 'rgba(69, 86, 112, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(100, 117, 145, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(80, 92, 114, 0.4)',
    backgroundColor: 'rgba(33, 42, 58, 0.75)',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  noteText: {
    textAlign: 'center',
    color: '#7E8AA2',
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  footerBrand: {
    marginTop: 20,
    color: 'rgba(29, 39, 54, 0.45)',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
});

export default ActivateSuccessScreen;
