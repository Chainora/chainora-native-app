import React, { useCallback, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  View,
  Pressable,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import {
  WALLET_COLORS,
  WalletAuras,
  WalletButton,
  WalletHeroCard,
  WalletPanel,
} from '@components/ui/walletDesign';
import { screenBase, styles } from './ActivateSuccess.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ActivateSuccess
>;

const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { resolvedTheme, t } = useSettings();
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

  return (
    <View style={screenBase.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successBadgeWrap}>
            <View style={styles.successBadgeRing}>
              <View style={styles.successBadgeCore}>
                <Ionicons
                  name="checkmark"
                  size={34}
                  color={WALLET_COLORS.success}
                />
              </View>
            </View>
          </View>

          <Text style={styles.title}>
            {t('activateSuccessWalletActivated')}
          </Text>
          <Text style={styles.subtitle}>{t('activateSuccessCardReady')}</Text>

          <WalletHeroCard addressText={shortAddress} style={styles.heroCard} />

          <WalletPanel style={styles.addressCard}>
            <Text style={styles.addressLabel}>
              {t('activateSuccessAddressLabel')}
            </Text>
            <Text style={styles.addressValue}>{ethAddress}</Text>
            <Pressable
              style={styles.copyButton}
              onPress={() =>
                Alert.alert(t('activateSuccessWalletAddressTitle'), ethAddress)
              }
            >
              <Ionicons
                name="copy-outline"
                size={16}
                color={WALLET_COLORS.text}
              />
              <Text style={styles.copyButtonText}>View</Text>
            </Pressable>
          </WalletPanel>

          <WalletPanel style={styles.noteCard}>
            <Text style={styles.noteText}>{t('activateSuccessShareNote')}</Text>
          </WalletPanel>

          <View style={styles.actions}>
            <WalletButton label={t('commonDone')} onPress={goToHome} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default ActivateSuccessScreen;
