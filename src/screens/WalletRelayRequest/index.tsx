import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinInput } from '@components/ui/PinInput';
import { PinGhostButton } from '@components/ui/pinTheme';
import { WALLET_COLORS } from '@components/ui/walletDesign';
import type {
  WalletActionResult,
  WalletRelayPendingRequest,
} from '@app-types/wallet';
import { useSettings } from '@hooks/useSettings';
import {
  useWalletRelayRequestActions,
  useWalletRelaySnapshot,
} from '@hooks/useWalletRelayRequest';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { ACCENT, styles } from './WalletRelayRequest.styles';

const PIN_LENGTH = 4;
const LOG_PREFIX = '[wallet-relay][request-screen]';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.WalletRelayRequest
>;

const TX_ACTION_SELECTORS: Record<string, string> = {
  '0x9377111a': 'walletRelayActionCreateGroup',
  '0xe1566b14': 'walletRelayActionCreateGroup',
};

const resolveTitle = (
  request: WalletRelayPendingRequest,
): 'walletRelayTitleSignMessage' | 'walletRelayTitleSignTransaction' =>
  request.type === 'signMessage'
    ? 'walletRelayTitleSignMessage'
    : 'walletRelayTitleSignTransaction';

const parseQuantity = (value: unknown): string => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      try {
        return BigInt(trimmed).toString();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return '';
};

const previewText = (value: string, max = 42): string => {
  const normalized = value.trim();
  if (!normalized) {
    return '-';
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
};

const resolveTransactionSummary = (
  request: WalletRelayPendingRequest,
  translate: (key: any) => string,
) => {
  const transaction = (request.payload.transaction ?? {}) as Record<
    string,
    unknown
  >;
  const to = typeof transaction.to === 'string' ? transaction.to : '';
  const from =
    typeof transaction.from === 'string' ? transaction.from : request.address;
  const dataHex =
    typeof transaction.data === 'string' ? transaction.data.trim() : '';
  const selector = /^0x[0-9a-fA-F]{8}/.test(dataHex)
    ? dataHex.slice(0, 10).toLowerCase()
    : '';
  const valueWei = parseQuantity(transaction.value);
  const gas = parseQuantity(transaction.gas);
  const nonce = parseQuantity(transaction.nonce);

  return {
    action: selector
      ? TX_ACTION_SELECTORS[selector]
        ? translate(TX_ACTION_SELECTORS[selector])
        : `${translate('walletRelayActionContractCall')} (${selector})`
      : translate('walletRelayActionNativeTransfer'),
    to: previewText(to),
    from: previewText(from),
    value: `${valueWei || '0'} wei`,
    gas: gas || '-',
    nonce: nonce || '-',
    chainId: request.chainId || '-',
    dataPreview: dataHex ? previewText(dataHex, 28) : '-',
  };
};

const WalletRelayRequestScreen: React.FC<Props> = ({ navigation }) => {
  const snapshot = useWalletRelaySnapshot();
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [scanRequestId, setScanRequestId] = useState('');
  const scanRequestIdRef = useRef('');
  const lastHydratedRequestIdRef = useRef('');
  const { t, resolvedTheme } = useSettings();
  const {
    approveRequest,
    getSnapshot,
    primeNfcForScan,
    registerRelayScanFlow,
    rejectRequest,
    setActiveAccount,
  } = useWalletRelayRequestActions();

  const request = useMemo(() => {
    const pinnedRequestId = scanRequestIdRef.current || scanRequestId;
    if (pinnedRequestId) {
      const pinned = snapshot.pendingRequests.find(
        item => item.requestId === pinnedRequestId,
      );
      if (pinned) {
        return pinned;
      }
    }

    return snapshot.pendingRequests[0] ?? null;
  }, [scanRequestId, snapshot.pendingRequests]);

  useEffect(() => {
    if (request || submitting) {
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, request, submitting]);

  useEffect(() => {
    const requestId = request?.requestId ?? '';
    if (requestId === lastHydratedRequestIdRef.current) {
      return;
    }
    if (submitting) {
      return;
    }

    lastHydratedRequestIdRef.current = requestId;
    setPin('');
    setSubmitting(false);
    setError('');
    setScanRequestId('');
    scanRequestIdRef.current = '';
  }, [request?.requestId, submitting]);

  const canApprove =
    Boolean(request) &&
    pin.trim().length >= PIN_LENGTH &&
    !submitting &&
    !request?.requiresSwitch;

  const handleFlowScan = useCallback(
    async (
      setStageStatus: (status: string) => void,
    ): Promise<WalletActionResult> => {
      const requestId = scanRequestIdRef.current || scanRequestId;
      if (!requestId) {
        return {
          ok: false,
          message: t('walletRelayErrorRequestUnavailable'),
        };
      }

      const liveSnapshot = getSnapshot();
      const targetRequest = liveSnapshot.pendingRequests.find(
        item => item.requestId === requestId,
      );
      if (!targetRequest) {
        return {
          ok: false,
          message: t('walletRelayErrorRequestExpired'),
        };
      }

      setStageStatus(
        targetRequest.type === 'signTransaction'
          ? t('walletRelayStatusAuthorizingTransaction')
          : t('walletRelayStatusAuthorizingMessage'),
      );

      try {
        await approveRequest(requestId, pin.trim(), {
          onProgress: status => {
            setStageStatus(status);
            console.log(`${LOG_PREFIX} flow.progress`, {
              requestId: targetRequest.requestId,
              status,
            });
          },
        });

        return {
          ok: true,
          message:
            targetRequest.type === 'signTransaction'
              ? t('walletRelayStatusTransactionSigned')
              : t('walletRelayStatusMessageSigned'),
        };
      } catch (approveError) {
        const message =
          approveError instanceof Error
            ? approveError.message
            : String(approveError);
        return {
          ok: false,
          message: message || t('walletRelayErrorApprove'),
        };
      }
    },
    [approveRequest, getSnapshot, pin, scanRequestId, t],
  );

  const onApprove = useCallback(async () => {
    if (!request || !canApprove) {
      return;
    }

    setError('');
    setSubmitting(true);
    setScanRequestId(request.requestId);
    scanRequestIdRef.current = request.requestId;

    await primeNfcForScan();
    const flowId = registerRelayScanFlow({
      isNfcEnabled: true,
      flowType: 'flow',
      prefilledPin: pin.trim(),
      onFlowScan: handleFlowScan,
      autoStartDelayMs: 420,
      onSuccess: () => {
        setSubmitting(false);
        setScanRequestId('');
        scanRequestIdRef.current = '';
        lastHydratedRequestIdRef.current = '';
        setPin('');
        navigation.goBack();
      },
      onClose: () => {
        setSubmitting(false);
      },
    });

    navigation.navigate(ROUTES.ScanCard, { flowId });
  }, [
    canApprove,
    handleFlowScan,
    navigation,
    pin,
    primeNfcForScan,
    registerRelayScanFlow,
    request,
  ]);

  const onReject = useCallback(async () => {
    if (!request) {
      return;
    }

    setError('');
    try {
      await rejectRequest(request.requestId, 'USER_REJECTED');
      navigation.goBack();
    } catch (rejectError) {
      const message =
        rejectError instanceof Error
          ? rejectError.message
          : String(rejectError);
      setError(message || t('walletRelayErrorReject'));
    } finally {
      setSubmitting(false);
    }
  }, [navigation, rejectRequest, request, t]);

  const onSwitchAccount = useCallback(() => {
    if (!request || submitting) {
      return;
    }
    setActiveAccount(request.address);
  }, [request, setActiveAccount, submitting]);

  const txSummary = useMemo(() => {
    if (!request || request.type !== 'signTransaction') {
      return null;
    }
    return resolveTransactionSummary(request, t);
  }, [request, t]);

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={WALLET_COLORS.background}
      />
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Pressable
              style={styles.headerIcon}
              onPress={() => onReject().catch(() => undefined)}
            >
              <Ionicons name="close" size={16} color={ACCENT.textSecondary} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {request
                ? t(resolveTitle(request))
                : t('walletRelayTitleSignMessage')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          {request ? (
            <>
              <Text style={styles.subtitle}>
                {t(resolveTitle(request))} · {t('walletRelaySessionLabel')}{' '}
                {request.sessionId.slice(0, 8)}...{' '}
                {t('walletRelayNeedsAccountLabel')} {request.address}
              </Text>

              {request.requiresSwitch ? (
                <View style={styles.switchBox}>
                  <Text style={styles.switchText}>
                    {t('walletRelaySwitchWarning')}
                  </Text>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={onSwitchAccount}
                    disabled={submitting}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('walletRelaySwitchAccountButton')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <ScrollView
                style={styles.summaryScroll}
                contentContainerStyle={styles.summaryScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {txSummary ? (
                  <View style={styles.summaryBox}>
                    {[
                      [t('walletRelaySummaryAction'), txSummary.action],
                      [t('walletRelaySummaryTo'), txSummary.to],
                      [t('walletRelaySummaryFrom'), txSummary.from],
                      [t('walletRelaySummaryValue'), txSummary.value],
                      [t('walletRelaySummaryGas'), txSummary.gas],
                      [t('walletRelaySummaryNonce'), txSummary.nonce],
                      [t('walletRelaySummaryChain'), txSummary.chainId],
                      [t('walletRelaySummaryData'), txSummary.dataPreview],
                    ].map(([label, value]) => (
                      <View key={label} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{label}</Text>
                        <Text style={styles.summaryValue}>{value}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>
                      {t('walletRelaySummaryMessagePreview')}
                    </Text>
                    <Text style={styles.summaryMessage}>
                      {previewText(String(request.payload.message ?? ''), 120)}
                    </Text>
                  </View>
                )}
              </ScrollView>

              <PinInput
                value={pin}
                onChange={nextValue => {
                  setPin(nextValue);
                  if (error) {
                    setError('');
                  }
                }}
                onSubmit={() => onApprove().catch(() => undefined)}
                disabled={submitting || request.requiresSwitch}
                submitDisabled={!canApprove || submitting}
                title={t('walletRelayPinTitle')}
                subtitle={t(
                  request.type === 'signTransaction'
                    ? 'walletRelayPinSubtitleTransaction'
                    : 'walletRelayPinSubtitleMessage',
                )}
                ctaLabel={
                  submitting
                    ? t('walletRelayWaitingNfc')
                    : t('walletRelayConfirmScan')
                }
                heroIconName={
                  request.type === 'signTransaction'
                    ? 'document-text-outline'
                    : 'chatbox-ellipses-outline'
                }
                errorMessage={error || null}
                afterActionSlot={
                  <PinGhostButton
                    label={t('walletRelayReject')}
                    onPress={() => onReject().catch(() => undefined)}
                    disabled={submitting}
                  />
                }
              />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

export default WalletRelayRequestScreen;
