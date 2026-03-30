import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { AppButton } from '../AppButton';
import { PinInput } from './PinInput';
import { ScanDialog } from './ScanDialog';
import { useSettings } from '../../features/settings';
import type { ThemeTokens } from '../../types/theme/colors';
import { useNfcEnabled } from '../../features/nfc/hooks/useNfcEnabled';
import {
  fetchSuggestedGasPriceWei,
  parseEther,
  sendEthTransaction,
  type SendEthResult,
} from '../../services/transactionService';
import type { WalletActionResult } from '../../services/cardService';
import { getActiveNetwork } from '../../config/network';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const PIN_LENGTH = 4;
const DEFAULT_GAS_LIMIT = '21000';

type Phase = 'details' | 'review' | 'result';

type PendingTxConfig = {
  valueWei: bigint;
  gasPriceWei?: bigint;
  gasLimitWei?: bigint;
};

export type SendTransactionSuccessPayload = {
  result: SendEthResult;
  recipient: string;
  amountDisplay: string;
  currencySymbol: string;
  networkName: string;
};

type SendTransactionDialogProps = {
  visible: boolean;
  fromAddress: string;
  availableAmount: string;
  onClose: () => void;
  onSuccess?: (payload: SendTransactionSuccessPayload) => void;
};

export const SendTransactionDialog: React.FC<SendTransactionDialogProps> = ({
  visible,
  fromAddress,
  availableAmount,
  onClose,
  onSuccess,
}) => {
  const { t, themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const { isEnabled } = useNfcEnabled();
  const [phase, setPhase] = useState<Phase>('details');
  const [scanDialogVisible, setScanDialogVisible] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [gasPriceGwei, setGasPriceGwei] = useState('');
  const [gasLimit, setGasLimit] = useState(DEFAULT_GAS_LIMIT);
  const [showGasEditor, setShowGasEditor] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendEthResult | null>(null);
  const [pendingTxConfig, setPendingTxConfig] = useState<PendingTxConfig | null>(null);
  const [reviewGasPriceWei, setReviewGasPriceWei] = useState<bigint | null>(null);
  const pendingResultRef = useRef<SendEthResult | null>(null);
  const network = getActiveNetwork();
  const usdRateBySymbol = useMemo(
    () => ({ ETH: 1960.86, MATIC: 0.82, BNB: 598.0 }),
    [],
  );

  const parseGwei = useCallback((value: string): bigint => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(t('sendErrorGasPricePositive'));
    }
    const [whole, fraction = ''] = trimmed.split('.');
    const wholeWei = BigInt(whole) * 1_000_000_000n;
    const fractionPadded = (fraction + '000000000').slice(0, 9);
    const fractionWei = BigInt(fractionPadded);
    const total = wholeWei + fractionWei;
    if (total <= 0n) {
      throw new Error(t('sendErrorGasPricePositive'));
    }
    return total;
  }, [t]);

  const formatGwei = useCallback((wei: bigint): string => {
    const whole = wei / 1_000_000_000n;
    const fraction = (wei % 1_000_000_000n).toString().padStart(9, '0').slice(0, 2);
    return `${whole.toString()}.${fraction}`;
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPhase('details');
    setScanDialogVisible(false);
    setRecipient('');
    setAmount('');
    setGasPriceGwei('');
    setGasLimit(DEFAULT_GAS_LIMIT);
    setShowGasEditor(false);
    setPin('');
    setError(null);
    setResult(null);
    setPendingTxConfig(null);
    setReviewGasPriceWei(null);
    pendingResultRef.current = null;
  }, [visible]);

  const isCloseDisabled = useMemo(
    () => scanDialogVisible,
    [scanDialogVisible],
  );

  const handleValidateDetails = useCallback(() => {
    const trimmedRecipient = recipient.trim();
    const trimmedAmount = amount.trim();
    if (!ADDRESS_REGEX.test(trimmedRecipient)) {
      setError(t('sendErrorInvalidAddress'));
      return;
    }

    if (trimmedAmount.length === 0) {
      setError(t('sendErrorAmountRequired'));
      return;
    }

    try {
      const wei = parseEther(trimmedAmount);
      if (wei <= 0n) {
        setError(t('sendErrorAmountPositive'));
        return;
      }

      setPendingTxConfig({
        valueWei: wei,
        gasPriceWei: undefined,
        gasLimitWei: BigInt(DEFAULT_GAS_LIMIT),
      });
      setError(null);
      setPhase('review');
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      setError(message);
    }
  }, [amount, recipient, t]);

  const handleBackToDetails = useCallback(() => {
    setPhase('details');
    setError(null);
  }, []);

  useEffect(() => {
    if (phase !== 'review' || !pendingTxConfig) {
      return;
    }

    let active = true;
    const hydrateReviewGas = async () => {
      if (pendingTxConfig.gasPriceWei) {
        setReviewGasPriceWei(pendingTxConfig.gasPriceWei);
        return;
      }

      try {
        const suggested = await fetchSuggestedGasPriceWei();
        if (active) {
          setReviewGasPriceWei(suggested);
        }
      } catch {
        if (active) {
          setReviewGasPriceWei(null);
        }
      }
    };

    hydrateReviewGas();
    return () => {
      active = false;
    };
  }, [pendingTxConfig, phase]);

  const handleConfirmReview = useCallback(() => {
    if (!pendingTxConfig) {
      setError(t('sendErrorMissingDetails'));
      setPhase('details');
      return;
    }

    if (pin.length < PIN_LENGTH) {
      setError(t('sendErrorPinLength'));
      return;
    }

    const trimmedGasPrice = gasPriceGwei.trim();
    const trimmedGasLimit = gasLimit.trim();
    let nextGasPriceWei: bigint | undefined;
    let nextGasLimitWei: bigint | undefined;

    if (trimmedGasPrice.length > 0) {
      try {
        nextGasPriceWei = parseGwei(trimmedGasPrice);
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : String(parseError);
        setError(message);
        return;
      }
    } else if (reviewGasPriceWei) {
      nextGasPriceWei = reviewGasPriceWei;
    }

    if (trimmedGasLimit.length > 0) {
      if (!/^\d+$/.test(trimmedGasLimit) || BigInt(trimmedGasLimit) <= 0n) {
        setError(t('sendErrorGasLimitPositive'));
        return;
      }
      nextGasLimitWei = BigInt(trimmedGasLimit);
    }

    setPendingTxConfig({
      valueWei: pendingTxConfig.valueWei,
      gasPriceWei: nextGasPriceWei,
      gasLimitWei: nextGasLimitWei,
    });
    setReviewGasPriceWei(nextGasPriceWei ?? null);
    setError(null);
    setScanDialogVisible(true);
  }, [gasLimit, gasPriceGwei, parseGwei, pendingTxConfig, pin, reviewGasPriceWei, t]);

  const handleFlowScan = useCallback(async (): Promise<WalletActionResult> => {
    if (!pendingTxConfig) {
      throw new Error(t('sendErrorMissingDetails'));
    }

    const outcome = await sendEthTransaction({
      from: fromAddress,
      to: recipient.trim(),
      valueWei: pendingTxConfig.valueWei,
      pin,
      gasPriceWei: pendingTxConfig.gasPriceWei,
      gasLimitWei: pendingTxConfig.gasLimitWei,
    });

    pendingResultRef.current = outcome;
    return {
      ok: true,
      message: t('sendStatusSuccess'),
    };
  }, [fromAddress, pendingTxConfig, pin, recipient, t]);

  const handleScanSuccess = useCallback(async () => {
    const outcome = pendingResultRef.current;
    if (!outcome) {
      throw new Error(t('sendErrorMissingDetails'));
    }

    setResult(outcome);
    setScanDialogVisible(false);
    setPhase('result');
    onSuccess?.({
      result: outcome,
      recipient: recipient.trim(),
      amountDisplay: amount.trim(),
      currencySymbol: network.currencySymbol,
      networkName: network.name,
    });
  }, [amount, network.currencySymbol, network.name, onSuccess, recipient, t]);

  const handleClose = useCallback(() => {
    if (isCloseDisabled) {
      return;
    }
    onClose();
  }, [isCloseDisabled, onClose]);

  const estimatedUsd = useMemo(() => {
    const parsedAmount = Number(amount.trim());
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return null;
    }
    const rate = usdRateBySymbol[network.currencySymbol as keyof typeof usdRateBySymbol] ?? null;
    if (!rate) {
      return null;
    }
    return parsedAmount * rate;
  }, [amount, network.currencySymbol, usdRateBySymbol]);

  const networkFeeNative = useMemo(() => {
    const trimmedGasLimit = gasLimit.trim();
    if (!/^\d+$/.test(trimmedGasLimit) || !reviewGasPriceWei) {
      return null;
    }
    const gasLimitWei = BigInt(trimmedGasLimit);
    if (gasLimitWei <= 0n) {
      return null;
    }
    const feeWei = gasLimitWei * reviewGasPriceWei;
    const whole = feeWei / 1_000_000_000_000_000_000n;
    const fraction = (feeWei % 1_000_000_000_000_000_000n)
      .toString()
      .padStart(18, '0')
      .slice(0, 6);
    return `${whole.toString()}.${fraction}`;
  }, [gasLimit, reviewGasPriceWei]);

  const networkFeeUsd = useMemo(() => {
    if (!networkFeeNative) {
      return null;
    }
    const native = Number(networkFeeNative);
    if (Number.isNaN(native)) {
      return null;
    }
    const rate = usdRateBySymbol[network.currencySymbol as keyof typeof usdRateBySymbol] ?? null;
    if (!rate) {
      return null;
    }
    return native * rate;
  }, [network.currencySymbol, networkFeeNative, usdRateBySymbol]);

  const renderDetails = () => (
    <View style={styles.section}>
      <Text style={styles.title}>{t('sendTitle')} {network.currencySymbol}</Text>
      <Text style={styles.subtitle}>{t('sendSubtitle')}</Text>

      <View style={styles.networkBadge}>
        <Ionicons name="globe-outline" size={13} color={themeTokens.primary} />
        <Text style={styles.networkBadgeText}>{network.name}</Text>
      </View>

      <View style={styles.availableRow}>
        <Text style={styles.availableLabel}>{t('sendAvailableLabel')}</Text>
        <Text style={styles.availableValue}>{`${availableAmount} ${network.currencySymbol}`}</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('sendRecipientLabel')}</Text>
        <TextInput
          value={recipient}
          onChangeText={text => setRecipient(text)}
          placeholder={t('sendRecipientPlaceholder')}
          placeholderTextColor={themeTokens.foregroundMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('sendAmountLabel')} ({network.currencySymbol})</Text>
        <TextInput
          value={amount}
          onChangeText={text => setAmount(text)}
          placeholder={t('sendAmountPlaceholder')}
          placeholderTextColor={themeTokens.foregroundMuted}
          keyboardType="decimal-pad"
          style={styles.input}
        />
      </View>

      {estimatedUsd !== null && (
        <Text style={styles.usdHint}>{`$${estimatedUsd.toFixed(2)}`}</Text>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <AppButton label={t('sendContinue')} onPress={handleValidateDetails} />
      <AppButton label={t('commonCancel')} onPress={handleClose} variant="text" style={styles.secondaryAction} />
    </View>
  );

  const renderReview = () => (
    <View style={styles.section}>
      <Text style={styles.title}>{t('sendReviewTitle')}</Text>

      <View style={styles.reviewAmountWrap}>
        <Text style={styles.reviewAmount}>{`${amount.trim() || '0'} ${network.currencySymbol}`}</Text>
        {estimatedUsd !== null && <Text style={styles.reviewUsd}>{`$${estimatedUsd.toFixed(2)}`}</Text>}
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{t('sendFromLabel')}</Text>
          <Text style={styles.reviewValue}>{fromAddress.slice(0, 10)}...{fromAddress.slice(-6)}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{t('sendToLabel')}</Text>
          <Text style={styles.reviewValue}>{recipient.slice(0, 10)}...{recipient.slice(-6)}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{t('sendNetworkLabel')}</Text>
          <Text style={styles.reviewValue}>{network.name}</Text>
        </View>

        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{t('sendNetworkFeeLabel')}</Text>
          <Text style={styles.reviewValue}>
            {networkFeeNative ? `${networkFeeNative} ${network.currencySymbol}` : t('sendFeeEstimatePending')}
          </Text>
        </View>

        {networkFeeUsd !== null && (
          <Text style={styles.reviewSubvalue}>{`$${networkFeeUsd.toFixed(2)}`}</Text>
        )}

        <AppButton
          label={showGasEditor ? t('sendHideGasEditor') : t('sendEditGasFee')}
          onPress={() => setShowGasEditor(prev => !prev)}
          variant="text"
        />

        {showGasEditor && (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('sendGasPriceLabel')}</Text>
              <TextInput
                value={gasPriceGwei}
                onChangeText={setGasPriceGwei}
                placeholder={t('sendGasPricePlaceholder')}
                placeholderTextColor={themeTokens.foregroundMuted}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('sendGasLimitLabel')}</Text>
              <TextInput
                value={gasLimit}
                onChangeText={setGasLimit}
                placeholder={t('sendGasLimitPlaceholder')}
                placeholderTextColor={themeTokens.foregroundMuted}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>

            <Text style={styles.helperText}>{t('sendGasHelper')}</Text>
          </>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('sendStatusEnterPin')}</Text>
        <PinInput value={pin} onChange={setPin} length={PIN_LENGTH} />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <AppButton label={t('sendConfirm')} onPress={handleConfirmReview} />
      <AppButton label={t('sendBack')} onPress={handleBackToDetails} variant="text" style={styles.secondaryAction} />
    </View>
  );

  const renderResult = () => (
    <View style={styles.section}>
      <Text style={styles.title}>{t('sendTransactionSent')}</Text>
      <Text style={styles.subtitle}>{t('sendStatusSuccess')}</Text>
      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>{t('sendTxHash')}</Text>
          <Text style={styles.resultValue} selectable>
            {result.transactionHash}
          </Text>
          <Text style={styles.resultMeta}>
            {t('sendGasLabel')}: {result.gasLimitWei.toString()} @ {formatGwei(result.gasPriceWei)} Gwei
          </Text>
        </View>
      )}
      <AppButton label={t('sendDone')} onPress={handleClose} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.dialogContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.dialog}>
              {phase === 'details' && renderDetails()}
              {phase === 'review' && renderReview()}
              {phase === 'result' && renderResult()}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <ScanDialog
          visible={scanDialogVisible}
          isNfcEnabled={isEnabled}
          onClose={() => setScanDialogVisible(false)}
          onSuccess={handleScanSuccess}
          types="flow"
          prefilledPin={pin}
          onFlowScan={handleFlowScan}
        />
      </View>
    </Modal>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
    },
    dialogContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    dialog: {
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    section: {
      gap: 14,
    },
    title: {
      fontSize: theme.typography.title,
      fontWeight: '800',
      color: theme.foreground,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: theme.typography.subtext,
      color: theme.foregroundMuted,
      lineHeight: 20,
    },
    networkBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primaryLight,
      backgroundColor: theme.glow,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    networkBadgeText: {
      fontSize: theme.typography.caption,
      fontWeight: '700',
      color: theme.primary,
    },
    availableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceHighlight,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    availableLabel: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    availableValue: {
      color: theme.foreground,
      fontSize: theme.typography.subtext,
      fontWeight: '700',
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabel: {
      fontSize: theme.typography.caption,
      fontWeight: '700',
      color: theme.foregroundMuted,
      letterSpacing: 0.4,
    },
    groupTitle: {
      fontSize: theme.typography.caption,
      fontWeight: '800',
      color: theme.foreground,
      letterSpacing: 0.4,
      marginTop: 2,
    },
    helperText: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.small,
      lineHeight: 16,
    },
    usdHint: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      marginTop: -2,
    },
    input: {
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.foreground,
      fontSize: theme.typography.body,
    },
    errorText: {
      color: theme.danger,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
    secondaryAction: {
      marginTop: -2,
    },
    reviewAmountWrap: {
      alignItems: 'center',
      gap: 2,
      marginTop: -2,
    },
    reviewAmount: {
      fontSize: 40,
      fontWeight: '800',
      color: theme.foreground,
      letterSpacing: -0.8,
    },
    reviewUsd: {
      fontSize: theme.typography.subtitle,
      color: theme.foregroundMuted,
      fontWeight: '600',
    },
    reviewCard: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 16,
      padding: 14,
      gap: 10,
    },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    reviewLabel: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.subtext,
      fontWeight: '700',
    },
    reviewValue: {
      color: theme.foreground,
      fontSize: theme.typography.subtext,
      fontWeight: '700',
      flexShrink: 1,
      textAlign: 'right',
    },
    reviewSubvalue: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.caption,
      textAlign: 'right',
      marginTop: -6,
    },
    resultCard: {
      backgroundColor: theme.surfaceHighlight,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 8,
    },
    resultLabel: {
      fontSize: theme.typography.caption,
      fontWeight: '700',
      color: theme.foregroundMuted,
    },
    resultValue: {
      fontSize: theme.typography.subtext,
      color: theme.foreground,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }),
    },
    resultMeta: {
      color: theme.foregroundMuted,
      fontSize: theme.typography.caption,
      lineHeight: 18,
    },
  });

export default SendTransactionDialog;
