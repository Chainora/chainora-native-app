import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Ionicons } from '@react-native-vector-icons/ionicons';

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

const ACCENT = {
  overlay: 'rgba(3, 5, 9, 0.82)',
  card: '#11161F',
  surface: '#171C27',
  surfaceAlt: '#1E2431',
  border: '#272E3E',
  borderStrong: '#384053',
  text: '#E8ECF3',
  textSecondary: '#B6BDCC',
  textMuted: '#7A829A',
  textLow: '#525B73',
  signal: '#0A7CF2',
  signalBright: '#2897FF',
  success: '#10B981',
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
      return {
        ok: false,
        message: t('sendErrorMissingDetails'),
      };
    }

    try {
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
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      return {
        ok: false,
        message,
      };
    }
  }, [fromAddress, pendingTxConfig, pin, recipient, t]);

  const handleScanSuccess = useCallback(async () => {
    const outcome = pendingResultRef.current;
    if (!outcome) {
      setScanDialogVisible(false);
      setError(t('sendErrorMissingDetails'));
      setPhase('review');
      return;
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

  const handleHeaderBack = useCallback(() => {
    if (phase === 'review') {
      handleBackToDetails();
      return;
    }
    handleClose();
  }, [handleBackToDetails, handleClose, phase]);

  const handlePasteRecipient = useCallback(async () => {
    try {
      const clipboardValue = await Clipboard.getString();
      if (clipboardValue) {
        setRecipient(clipboardValue.trim());
      }
    } catch {
      // no-op: clipboard read failure should not block the form
    }
  }, []);

  const handleUseMax = useCallback(() => {
    setAmount(availableAmount);
  }, [availableAmount]);

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

  const step = phase === 'details' ? 1 : phase === 'review' ? 2 : 3;

  const headerTitle =
    phase === 'details'
      ? `${t('sendTitle')} ${network.currencySymbol}`
      : phase === 'review'
      ? t('sendReviewTitle')
      : t('sendTransactionSent');

  const renderDetails = () => (
    <View style={styles.section}>
      <View style={styles.networkBadge}>
        <Ionicons name="globe-outline" size={12} color={ACCENT.signalBright} />
        <Text style={styles.networkBadgeText}>{network.name}</Text>
      </View>

      <View style={styles.availableRow}>
        <Text style={styles.availableLabel}>{t('sendAvailableLabel')}</Text>
        <Text style={styles.availableValue}>{`${availableAmount} ${network.currencySymbol}`}</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t('sendRecipientLabel')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={recipient}
            onChangeText={text => setRecipient(text)}
            placeholder={t('sendRecipientPlaceholder')}
            placeholderTextColor={ACCENT.textLow}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, styles.inputFlex]}
          />
          <Pressable style={styles.suffixButton} onPress={() => handlePasteRecipient().catch(() => undefined)}>
            <Text style={styles.suffixButtonText}>{t('commonPaste')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{`${t('sendAmountLabel')} (${network.currencySymbol})`}</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={amount}
            onChangeText={text => setAmount(text)}
            placeholder={t('sendAmountPlaceholder')}
            placeholderTextColor={ACCENT.textLow}
            keyboardType="decimal-pad"
            style={[styles.input, styles.inputLarge, styles.inputFlex]}
          />
          <Pressable style={styles.suffixButton} onPress={handleUseMax}>
            <Text style={styles.suffixButtonText}>{t('commonMax')}</Text>
          </Pressable>
        </View>
        {estimatedUsd !== null && (
          <Text style={styles.hintText}>{`~ $${estimatedUsd.toFixed(2)}`}</Text>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={handleValidateDetails}>
          <Text style={styles.primaryButtonText}>{t('sendContinue')}</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={handleClose}>
          <Text style={styles.ghostButtonText}>{t('commonCancel')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderReview = () => (
    <View style={styles.section}>
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

        <View style={[styles.reviewRow, styles.reviewRowNoBorder]}>
          <Text style={styles.reviewLabel}>{t('sendNetworkFeeLabel')}</Text>
          <View>
            <Text style={styles.reviewValue}>
              {networkFeeNative ? `${networkFeeNative} ${network.currencySymbol}` : t('sendFeeEstimatePending')}
            </Text>
            {networkFeeUsd !== null && (
              <Text style={styles.reviewSubvalue}>{`$${networkFeeUsd.toFixed(2)}`}</Text>
            )}
          </View>
        </View>
      </View>

      <Pressable style={styles.gasToggle} onPress={() => setShowGasEditor(prev => !prev)}>
        <Text style={styles.gasToggleText}>{showGasEditor ? t('sendHideGasEditor') : t('sendEditGasFee')}</Text>
        <Text style={styles.gasToggleHint}>{showGasEditor ? t('sendGasModeAuto') : t('sendGasModeAdvanced')}</Text>
      </Pressable>

      {showGasEditor && (
        <>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('sendGasPriceLabel')}</Text>
            <TextInput
              value={gasPriceGwei}
              onChangeText={setGasPriceGwei}
              placeholder={t('sendGasPricePlaceholder')}
              placeholderTextColor={ACCENT.textLow}
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
              placeholderTextColor={ACCENT.textLow}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.hintText}>{t('sendGasHelper')}</Text>
          </View>
        </>
      )}

      <Text style={styles.pinHeading}>{t('sendStatusEnterPin')}</Text>
      <PinInput value={pin} onChange={setPin} length={PIN_LENGTH} colorScheme="dark" />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={handleConfirmReview}>
          <Text style={styles.primaryButtonText}>{t('sendConfirm')}</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={handleBackToDetails}>
          <Text style={styles.ghostButtonText}>{t('sendBack')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderResult = () => (
    <View style={styles.section}>
      <View style={styles.resultIconWrap}>
        <View style={styles.resultIconCircle}>
          <Ionicons name="checkmark" size={30} color={ACCENT.success} />
        </View>
      </View>

      <Text style={styles.resultTitle}>{t('sendTransactionSent')}</Text>
      <Text style={styles.resultSubtitle}>{t('sendStatusSuccess')}</Text>

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

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={handleClose}>
          <Text style={styles.primaryButtonText}>{t('sendDone')}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <KeyboardAvoidingView
          style={styles.dialogContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.dialog}>
            <View style={styles.grab} />

            <View style={styles.headerRow}>
              <Pressable style={styles.headerIcon} onPress={handleHeaderBack}>
                <Ionicons
                  name={phase === 'review' ? 'chevron-back' : 'close'}
                  size={16}
                  color={ACCENT.textSecondary}
                />
              </Pressable>
              <Text style={styles.headerTitle}>{headerTitle}</Text>
              <Text style={styles.stepText}>{`${step}/3`}</Text>
            </View>

            <View style={styles.progressRow}>
              {[1, 2, 3].map(index => (
                <View key={index} style={[styles.progressBar, step >= index && styles.progressBarActive]} />
              ))}
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {phase === 'details' && renderDetails()}
              {phase === 'review' && renderReview()}
              {phase === 'result' && renderResult()}
            </ScrollView>
          </View>
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
      backgroundColor: ACCENT.overlay,
    },
    dialogContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    dialog: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: ACCENT.border,
      backgroundColor: ACCENT.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.5,
      shadowRadius: 32,
      elevation: 24,
      maxHeight: '92%',
      overflow: 'hidden',
    },
    grab: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: ACCENT.borderStrong,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 4,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 10,
    },
    headerIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: ACCENT.borderStrong,
      backgroundColor: ACCENT.surfaceAlt,
    },
    headerTitle: {
      flex: 1,
      color: ACCENT.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    stepText: {
      color: ACCENT.textLow,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    progressRow: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    progressBar: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: ACCENT.surfaceAlt,
    },
    progressBarActive: {
      backgroundColor: ACCENT.signal,
    },
    scrollArea: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    section: {
      gap: 14,
      paddingHorizontal: 16,
    },
    networkBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(40, 151, 255, 0.28)',
      backgroundColor: 'rgba(40, 151, 255, 0.08)',
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    networkBadgeText: {
      color: ACCENT.signalBright,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    availableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: ACCENT.surface,
      borderWidth: 1,
      borderColor: ACCENT.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    availableLabel: {
      color: ACCENT.textLow,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    availableValue: {
      color: ACCENT.text,
      fontSize: 14,
      fontWeight: '700',
    },
    fieldGroup: {
      gap: 6,
    },
    fieldLabel: {
      color: ACCENT.textLow,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    inputFlex: {
      flex: 1,
    },
    input: {
      backgroundColor: ACCENT.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: ACCENT.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: ACCENT.text,
      fontSize: 13,
    },
    inputLarge: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.6,
      paddingVertical: 14,
    },
    suffixButton: {
      minWidth: 58,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: ACCENT.border,
      backgroundColor: ACCENT.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suffixButtonText: {
      color: ACCENT.signalBright,
      fontSize: 11,
      fontWeight: '700',
    },
    hintText: {
      color: ACCENT.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    errorText: {
      color: theme.danger,
      fontSize: 12,
      fontWeight: '700',
    },
    actions: {
      gap: 8,
      marginTop: 4,
    },
    primaryButton: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: ACCENT.signalBright,
      backgroundColor: ACCENT.signal,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: ACCENT.signalBright,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 4,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    ghostButton: {
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostButtonText: {
      color: ACCENT.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    reviewAmountWrap: {
      alignItems: 'center',
      marginTop: -2,
      marginBottom: 4,
      gap: 4,
    },
    reviewAmount: {
      color: ACCENT.text,
      fontSize: 40,
      fontWeight: '800',
      letterSpacing: -1,
    },
    reviewUsd: {
      color: ACCENT.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    reviewCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ACCENT.border,
      backgroundColor: ACCENT.surface,
      overflow: 'hidden',
    },
    reviewRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: ACCENT.border,
    },
    reviewRowNoBorder: {
      borderBottomWidth: 0,
    },
    reviewLabel: {
      width: 88,
      color: ACCENT.textLow,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    reviewValue: {
      color: ACCENT.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      flexShrink: 1,
      textAlign: 'right',
    },
    reviewSubvalue: {
      marginTop: 2,
      color: ACCENT.textMuted,
      fontSize: 10,
      textAlign: 'right',
    },
    gasToggle: {
      borderRadius: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: ACCENT.border,
      backgroundColor: ACCENT.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    gasToggleText: {
      color: ACCENT.signalBright,
      fontSize: 12,
      fontWeight: '700',
      flexShrink: 1,
    },
    gasToggleHint: {
      color: ACCENT.textLow,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    pinHeading: {
      textAlign: 'center',
      color: ACCENT.textLow,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    resultIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      marginBottom: 4,
    },
    resultIconCircle: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 2,
      borderColor: ACCENT.success,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultTitle: {
      color: ACCENT.text,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    resultSubtitle: {
      color: ACCENT.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    resultCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: ACCENT.border,
      backgroundColor: ACCENT.surface,
      padding: 14,
      gap: 8,
    },
    resultLabel: {
      color: ACCENT.textLow,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    resultValue: {
      color: ACCENT.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'Menlo' }),
    },
    resultMeta: {
      color: ACCENT.textMuted,
      fontSize: 10,
      lineHeight: 15,
      borderTopWidth: 1,
      borderTopColor: ACCENT.border,
      paddingTop: 8,
    },
  });

export default SendTransactionDialog;
