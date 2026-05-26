import React, { useCallback, useRef } from 'react';
import { ScrollView, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { WALLET_COLORS, WalletButton } from '@components/ui/walletDesign';
import { screenBase, styles } from './ActivateSuccess.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.ActivateSuccess
>;

const ActivateSuccessScreen: React.FC<Props> = ({ route, navigation }) => {
  const { resolvedTheme, t } = useSettings();
  const { ethAddress, publicKeyHex, mode } = route.params;
  const hasNavigatedRef = useRef(false);

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>
            {t('activateSuccessWalletActivated')}
          </Text>
          <Text style={styles.subtitle}>{t('activateSuccessCardReady')}</Text>
          <View style={styles.actions}>
            <WalletButton label={t('commonDone')} onPress={goToHome} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default ActivateSuccessScreen;
