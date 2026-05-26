import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  WALLET_COLORS,
  useWalletColors,
  WalletButton,
  WalletPill,
  WalletSectionLabel,
  WalletTextField,
  WalletTopBar,
} from '@components/ui/walletDesign';
import { getNetworkConfig } from '@config/network';
import { useSettings } from '@hooks/useSettings';
import { useSuggestedGasPriceGwei } from '@hooks/useSuggestedGasPriceGwei';
import { useWalletBalance } from '@hooks/useWalletBalance';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import {
  DEFAULT_GAS_LIMIT,
  estimateFeeWei,
  formatFeeNative,
  formatNativeWeiExact,
  getAssetSymbol,
  isValidEvmAddress,
  parseTransferAmount,
  PIN_LENGTH,
  truncateAddress,
} from '@utils/sendFlowUtils';
import WalletNetworkCoin from '@components/wallet/WalletNetworkCoin';
import { createSendScreenBase, styles } from './Send.styles';

type SendProps = NativeStackScreenProps<RootStackParamList, typeof ROUTES.Send>;

const SendScreen: React.FC<SendProps> = ({ navigation, route }) => {
  const { walletAddress, publicKeyHex, chainKey, result, initialRecipient } =
    route.params;
  const { t } = useSettings();
  const colors = useWalletColors();
  const screenBase = useMemo(() => createSendScreenBase(colors), [colors]);
  const network = getNetworkConfig(chainKey);
  const balanceState = useWalletBalance(walletAddress, network);
  const [recipient, setRecipient] = useState(initialRecipient ?? '');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [gasLimit, _setGasLimit] = useState(DEFAULT_GAS_LIMIT);
  const gasPriceGwei = useSuggestedGasPriceGwei(network);
  const assetSymbol = getAssetSymbol(network);
  const isTokenTransfer = Boolean(network.portfolioTokenAddress);

  useEffect(() => {
    if (initialRecipient) {
      setRecipient(initialRecipient);
    }
  }, [initialRecipient]);

  useEffect(() => {
    if (!result) {
      return;
    }

    setPin('');
    setShowReview(false);
  }, [result]);

  const feeNative = useMemo(
    () => (isTokenTransfer ? null : formatFeeNative(gasLimit, gasPriceGwei)),
    [gasLimit, gasPriceGwei, isTokenTransfer],
  );
  const feeWei = useMemo(
    () => (isTokenTransfer ? null : estimateFeeWei(gasLimit, gasPriceGwei)),
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

  const openReview = useCallback(() => {
    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();

    if (!isValidEvmAddress(trimmedRecipient)) {
      setError(t('sendErrorInvalidAddress'));
      return;
    }

    if (!trimmedAmount) {
      setError(t('sendErrorAmountRequired'));
      return;
    }

    try {
      if (parseTransferAmount(network, trimmedAmount) <= 0n) {
        setError(t('sendErrorAmountPositive'));
        return;
      }
    } catch {
      setError(t('sendErrorAmountPositive'));
      return;
    }

    setError(null);
    setShowReview(true);
  }, [amount, network, recipient, t]);

  return (
    <View style={screenBase.screen}>
      <SafeAreaView style={screenBase.safeArea} edges={['top', 'bottom']}>
        <View style={screenBase.content}>
          <WalletTopBar
            title={t('sendTitle')}
            onBack={() => navigation.goBack()}
          />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.formScroll}
          >
            <View style={styles.networkHero}>
              <WalletNetworkCoin network={network} size={52} />
              <View style={styles.networkHeroText}>
                <Text style={styles.networkHeroTitle}>{network.name}</Text>
                <Text style={styles.networkHeroSub}>
                  {balanceState.formatted ?? '0.0000'} {assetSymbol}
                </Text>
              </View>
              <WalletPill style={styles.networkBadge}>
                <Text style={styles.networkBadgeText}>
                  Chain {network.chainId}
                </Text>
              </WalletPill>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label={t('sendRecipientLabel')} />
              <WalletTextField
                right={
                  <View style={styles.fieldActions}>
                    <Pressable
                      onPress={async () =>
                        setRecipient((await Clipboard.getString()).trim())
                      }
                    >
                      <Text style={styles.fieldActionText}>
                        {t('commonPaste')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        navigation.navigate(ROUTES.QRScanner, {
                          walletAddress,
                          publicKeyHex,
                          fallbackChainKey: chainKey,
                        })
                      }
                    >
                      <Ionicons
                        name="scan-outline"
                        size={18}
                        color={WALLET_COLORS.text}
                      />
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder={t('sendRecipientPlaceholder')}
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  style={styles.fieldInput}
                />
              </WalletTextField>
            </View>

            <View style={styles.fieldGroup}>
              <WalletSectionLabel label={t('sendAmountLabel')} />
              <WalletTextField
                large
                right={
                  <View style={styles.fieldActions}>
                    <WalletPill style={styles.amountTag}>
                      <Text style={styles.amountTagText}>{assetSymbol}</Text>
                    </WalletPill>
                    <Pressable
                      onPress={() =>
                        setAmount(balanceState.formatted ?? '0.0000')
                      }
                    >
                      <Text style={styles.fieldActionText}>
                        {t('commonMax')}
                      </Text>
                    </Pressable>
                  </View>
                }
              >
                <TextInput
                  placeholder={t('sendAmountPlaceholder')}
                  placeholderTextColor={WALLET_COLORS.textLow}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={[styles.fieldInput, styles.fieldInputLarge]}
                />
              </WalletTextField>
              {feeNative ? (
                <Text style={styles.approxText}>
                  {t('sendNetworkFeeLabel')}: {feeNative}{' '}
                  {network.currencySymbol}
                </Text>
              ) : null}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <WalletButton label={t('sendContinue')} onPress={openReview} />
        </View>

        {showReview ? (
          <View style={styles.sheetHost}>
            <Pressable
              style={styles.sheetScrim}
              onPress={() => setShowReview(false)}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
              pointerEvents="box-none"
              style={styles.sheetKeyboardAvoider}
            >
              <View style={styles.sheetCard}>
                <View style={styles.sheetGrab} />
                <View style={styles.sheetHeader}>
                  <Pressable
                    style={styles.sheetIcon}
                    onPress={() => setShowReview(false)}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={14}
                      color={WALLET_COLORS.textMuted}
                    />
                  </Pressable>
                  <Text style={styles.sheetTitle}>{t('sendReviewTitle')}</Text>
                  <View style={styles.sheetHeaderSpacer} />
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.sheetScrollContent}
                >
                  <View style={styles.reviewAmountWrap}>
                    <Text style={styles.reviewAmount}>
                      {amount || '0'}{' '}
                      <Text style={styles.reviewAmountUnit}>{assetSymbol}</Text>
                    </Text>
                    <Text style={styles.reviewUsd}>{network.name}</Text>
                  </View>

                  <View style={styles.reviewCard}>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>
                        {t('sendFromLabel')}
                      </Text>
                      <Text style={styles.reviewValue}>
                        {truncateAddress(walletAddress)}
                      </Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>{t('sendToLabel')}</Text>
                      <Text style={styles.reviewValue}>
                        {truncateAddress(recipient)}
                      </Text>
                    </View>
                    <View style={styles.reviewRow}>
                      <Text style={styles.reviewLabel}>
                        {t('sendNetworkLabel')}
                      </Text>
                      <Text style={styles.reviewValue}>{network.name}</Text>
                    </View>
                    <View
                      style={[
                        styles.reviewRow,
                        !totalNative && styles.reviewRowLast,
                      ]}
                    >
                      <Text style={styles.reviewLabel}>
                        {t('sendNetworkFeeLabel')}
                      </Text>
                      <Text style={styles.reviewValue}>
                        {feeNative
                          ? `${feeNative} ${network.currencySymbol}`
                          : `${t('sendFeeEstimatePending')} ${
                              network.currencySymbol
                            }`}
                      </Text>
                    </View>
                    {totalNative ? (
                      <View style={[styles.reviewRow, styles.reviewRowLast]}>
                        <Text style={styles.reviewLabel}>
                          {t('sendTotalLabel')}
                        </Text>
                        <Text style={styles.reviewValue}>
                          {totalNative} {network.currencySymbol}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <WalletSectionLabel label={t('sendPinTitle')} />
                    <WalletTextField>
                      <TextInput
                        value={pin}
                        onChangeText={text => {
                          setPin(
                            text.replace(/[^\d]/g, '').slice(0, PIN_LENGTH),
                          );
                          if (error) {
                            setError(null);
                          }
                        }}
                        placeholder="0000"
                        placeholderTextColor={WALLET_COLORS.textLow}
                        keyboardType="number-pad"
                        secureTextEntry
                        style={[styles.fieldInput, styles.fieldInputLarge]}
                      />
                    </WalletTextField>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </ScrollView>

                <View style={styles.sheetActions}>
                  <WalletButton
                    label={t('sendConfirm')}
                    onPress={() => {
                      if (pin.length !== PIN_LENGTH) {
                        setError(t('sendErrorPinLength'));
                        return;
                      }

                      const capturedPin = pin;
                      setPin('');
                      setError(null);
                      navigation.navigate(ROUTES.TouchSign, {
                        walletAddress,
                        publicKeyHex,
                        chainKey,
                        recipient,
                        amount,
                        pin: capturedPin,
                        gasPriceGwei,
                        gasLimit,
                      });
                    }}
                  />
                  <WalletButton
                    label={t('commonCancel')}
                    variant="secondary"
                    onPress={() => setShowReview(false)}
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : null}

        {result ? (
          <View style={styles.sheetHost}>
            <View style={styles.sheetScrim} />
            <View style={styles.sheetCard}>
              <View style={styles.sheetGrab} />
              <View style={styles.resultIcon}>
                <Ionicons
                  name="checkmark"
                  size={30}
                  color={WALLET_COLORS.success}
                />
              </View>
              <Text style={styles.resultTitle}>{t('sendTransactionSent')}</Text>
              <Text style={styles.resultBody}>{t('sendStatusSuccess')}</Text>
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>{t('sendTxHash')}</Text>
                <Text style={styles.resultHash}>{result.transactionHash}</Text>
                <Text style={styles.resultMeta}>
                  {amount || result.amount} {assetSymbol} | {result.gasLimit}{' '}
                  gas
                </Text>
              </View>
              <WalletButton
                label={t('commonDone')}
                onPress={() => navigation.goBack()}
              />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
};

export { SendScreen };
export default SendScreen;
