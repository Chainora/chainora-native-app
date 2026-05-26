import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  WALLET_COLORS,
  useWalletColors,
  WalletAuras,
  WalletButton,
  WalletPanel,
  WalletPill,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { getNetworkConfig } from '@config/network';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useSettings } from '@hooks/useSettings';
import { useTouchSignTransactionFlow } from '@hooks/useTouchSignTransactionFlow';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { getAssetSymbol, truncateAddress } from '@utils/sendFlowUtils';
import { createTouchSignScreenBase, styles } from './TouchSign.styles';

type TouchSignProps = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.TouchSign
>;

const TouchSignScreen: React.FC<TouchSignProps> = ({ navigation, route }) => {
  const {
    walletAddress,
    publicKeyHex,
    chainKey,
    recipient,
    amount,
    pin,
    gasPriceGwei,
    gasLimit,
  } = route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => createTouchSignScreenBase(colors), [colors]);
  const { isEnabled } = useNfcEnabled();
  const network = getNetworkConfig(chainKey);
  const handleFlowSuccess = useCallback(
    (sendResult: {
      transactionHash: string;
      amount: string;
      gasLimit: string;
      gasPriceGwei: string;
    }) => {
      navigation.replace(ROUTES.Send, {
        walletAddress,
        publicKeyHex,
        chainKey,
        result: sendResult,
      });
    },
    [chainKey, navigation, publicKeyHex, walletAddress],
  );

  const { submitting, startSendScanFlow } = useTouchSignTransactionFlow({
    amount,
    gasLimit,
    gasPriceGwei: gasPriceGwei ?? '',
    isNfcEnabled: isEnabled,
    network,
    onSuccess: handleFlowSuccess,
    pin,
    recipient,
    successMessage: t('sendStatusSuccess'),
    missingResultMessage: t('sendErrorMissingDetails'),
    walletAddress,
  });

  const startTouchSign = useCallback(() => {
    const flowId = startSendScanFlow();
    if (!flowId) {
      return;
    }
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [navigation, startSendScanFlow]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <WalletAuras />
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('touchSignTitle')}
            onBack={() => navigation.goBack()}
          />

          <View style={styles.touchBody}>
            <WalletPill style={styles.scanFlag}>
              <View style={styles.scanFlagDot} />
              <Text style={styles.scanFlagText}>{network.name}</Text>
            </WalletPill>

            <View style={styles.touchStage}>
              <View style={styles.touchRingOne} />
              <View style={styles.touchRingTwo} />
              <View style={styles.touchRingThree} />
              <View style={styles.touchCore}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={30}
                  color={WALLET_COLORS.signal}
                />
              </View>
            </View>

            <Text style={styles.touchTitle}>{t('touchSignTitle')}</Text>
            <Text style={styles.touchBodyText}>{t('touchSignBody')}</Text>

            <WalletPanel style={styles.resultCard}>
              <Text style={styles.resultLabel}>{t('sendNetworkLabel')}</Text>
              <Text style={styles.resultHash}>{network.name}</Text>
              <Text style={styles.resultMeta}>
                {amount} {getAssetSymbol(network)} |{' '}
                {truncateAddress(recipient)}
              </Text>
            </WalletPanel>
          </View>

          <View style={styles.sheetActions}>
            <WalletButton
              label={submitting ? t('sendScanning') : t('sendStartScan')}
              disabled={submitting}
              onPress={startTouchSign}
            />
            <WalletButton
              label={t('commonCancel')}
              variant="secondary"
              onPress={() => navigation.goBack()}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export { TouchSignScreen };
export default TouchSignScreen;
