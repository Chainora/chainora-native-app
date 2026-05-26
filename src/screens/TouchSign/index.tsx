import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useWalletColors,
  WalletButton,
  WalletPanel,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { getNetworkConfig } from '@config/network';
import { useNfcEnabled } from '@hooks/useNfcEnabled';
import { useSettings } from '@hooks/useSettings';
import { useTouchSignTransactionFlow } from '@hooks/useTouchSignTransactionFlow';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import {
  estimateFeeWei,
  formatFeeNative,
  formatNativeWeiExact,
  getAssetSymbol,
  parseTransferAmount,
  truncateAddress,
} from '@utils/sendFlowUtils';
import { createTouchSignScreenBase, styles } from './TouchSign.styles';

type TouchSignProps = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.TouchSign
>;

type ReviewRowProps = {
  label: string;
  value: string;
  last?: boolean;
  emphasis?: boolean;
};

const ReviewRow: React.FC<ReviewRowProps> = ({
  label,
  value,
  last = false,
  emphasis = false,
}) => (
  <View style={[styles.reviewRow, last && styles.reviewRowLast]}>
    <Text style={styles.reviewLabel}>{label}</Text>
    <Text style={[styles.reviewValue, emphasis && styles.reviewValueEmphasis]}>
      {value}
    </Text>
  </View>
);

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
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const assetSymbol = getAssetSymbol(network);
  const isTokenTransfer = Boolean(network.portfolioTokenAddress);
  const feeNative = useMemo(
    () =>
      isTokenTransfer ? null : formatFeeNative(gasLimit ?? '', gasPriceGwei),
    [gasLimit, gasPriceGwei, isTokenTransfer],
  );
  const feeWei = useMemo(
    () =>
      isTokenTransfer ? null : estimateFeeWei(gasLimit ?? '', gasPriceGwei),
    [gasLimit, gasPriceGwei, isTokenTransfer],
  );
  const totalNative = useMemo(() => {
    if (isTokenTransfer || feeWei === null) {
      return null;
    }

    try {
      return formatNativeWeiExact(
        parseTransferAmount(network, amount) + feeWei,
      );
    } catch {
      return null;
    }
  }, [amount, feeWei, isTokenTransfer, network]);
  const feeDisplay = feeNative
    ? `${feeNative} ${network.currencySymbol}`
    : `${t('sendFeeEstimatePending')} ${network.currencySymbol}`;
  const totalDisplay = totalNative
    ? `${totalNative} ${network.currencySymbol}`
    : null;
  const knownGasLimit = isTokenTransfer ? null : gasLimit;
  const handleFlowSuccess = useCallback(
    (sendResult: {
      transactionHash: string;
      amount: string;
      gasLimit: string;
      gasPriceGwei: string;
    }) => {
      navigation.popTo(ROUTES.Send, {
        walletAddress,
        publicKeyHex,
        chainKey,
        result: sendResult,
      });
    },
    [chainKey, navigation, publicKeyHex, walletAddress],
  );
  const handleFlowFailure = useCallback((message: string) => {
    setFailureReason(message);
  }, []);

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
    onFailure: handleFlowFailure,
  });

  const startTouchSign = useCallback(() => {
    const flowId = startSendScanFlow();
    if (!flowId) {
      return;
    }
    setFailureReason(null);
    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [navigation, startSendScanFlow]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('touchSignTitle')}
            onBack={() => navigation.goBack()}
          />

          <View style={styles.touchBody}>
            <ScrollView
              style={styles.reviewScroll}
              contentContainerStyle={styles.reviewScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.amountHeader}>
                <Text style={styles.amountLabel}>{t('sendAmountLabel')}</Text>
                <Text style={styles.amountValue}>
                  {amount} <Text style={styles.amountUnit}>{assetSymbol}</Text>
                </Text>
              </View>

              <WalletPanel style={styles.reviewCard}>
                <ReviewRow
                  label={t('sendAmountLabel')}
                  value={`${amount} ${assetSymbol}`}
                />
                <ReviewRow
                  label={t('sendNetworkFeeLabel')}
                  value={feeDisplay}
                />
                {totalDisplay ? (
                  <ReviewRow
                    label={t('sendTotalLabel')}
                    value={totalDisplay}
                    emphasis
                  />
                ) : null}
                <ReviewRow
                  label={t('sendFromLabel')}
                  value={truncateAddress(walletAddress)}
                />
                <ReviewRow
                  label={t('sendToLabel')}
                  value={truncateAddress(recipient)}
                />
                <ReviewRow label={t('sendNetworkLabel')} value={network.name} />
                {gasPriceGwei ? (
                  <ReviewRow
                    label={t('sendGasPriceLabel')}
                    value={`${gasPriceGwei} Gwei`}
                  />
                ) : null}
                {knownGasLimit ? (
                  <ReviewRow
                    label={t('sendGasLimitLabel')}
                    value={knownGasLimit}
                    last
                  />
                ) : (
                  <ReviewRow
                    label={t('sendGasLimitLabel')}
                    value={t('sendFeeEstimatePending')}
                    last
                  />
                )}
              </WalletPanel>
            </ScrollView>
          </View>

          <View style={styles.sheetActions}>
            <Text
              style={[
                styles.touchBodyText,
                failureReason ? styles.failureText : null,
              ]}
            >
              {failureReason ?? t('touchSignBody')}
            </Text>
            <WalletButton
              label={
                submitting
                  ? t('sendScanning')
                  : failureReason
                  ? t('scanPrimaryTryAgain')
                  : t('sendStartScan')
              }
              disabled={submitting}
              onPress={startTouchSign}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

export { TouchSignScreen };
export default TouchSignScreen;
