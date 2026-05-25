import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import NfcManager from 'react-native-nfc-manager';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinInput } from '../components/ui/PinInput';
import { PinGhostButton } from '../components/ui/pinTheme';
import { DISPLAY_FONT_MEDIUM, WALLET_COLORS } from '../components/ui/walletDesign';
import { useSettings } from '../features/settings';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';
import type { WalletActionResult } from '../services/cardService';
import { registerScanCardFlow } from '../services/scanCardFlowRegistry';
import {
  walletRelaySessionManager,
  type WalletRelayPendingRequest,
} from '../services/walletRelaySessionManager';

const PIN_LENGTH = 4;
const LOG_PREFIX = '[wallet-relay][request-screen]';

const ACCENT = {
  card: '#11161F',
  surface: '#171C27',
  surfaceAlt: '#1E2431',
  border: '#272E3E',
  borderStrong: '#384053',
  text: '#E8ECF3',
  textSecondary: '#B6BDCC',
  textMuted: '#7A829A',
  textLow: '#525B73',
  signalBright: '#2897FF',
} as const;

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.WalletRelayRequest>;

const TX_ACTION_SELECTORS: Record<string, string> = {
  '0x9377111a': 'walletRelayActionCreateGroup',
  '0xe1566b14': 'walletRelayActionCreateGroup',
};

const resolveTitle = (
  request: WalletRelayPendingRequest,
): 'walletRelayTitleSignMessage' | 'walletRelayTitleSignTransaction' =>
  request.type === 'signMessage' ? 'walletRelayTitleSignMessage' : 'walletRelayTitleSignTransaction';

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
  const transaction = (request.payload.transaction ?? {}) as Record<string, unknown>;
  const to = typeof transaction.to === 'string' ? transaction.to : '';
  const from = typeof transaction.from === 'string' ? transaction.from : request.address;
  const dataHex = typeof transaction.data === 'string' ? transaction.data.trim() : '';
  const selector = /^0x[0-9a-fA-F]{8}/.test(dataHex) ? dataHex.slice(0, 10).toLowerCase() : '';
  const valueWei = parseQuantity(transaction.value);
  const gas = parseQuantity(transaction.gas);
  const nonce = parseQuantity(transaction.nonce);

  return {
    action: selector
      ? (TX_ACTION_SELECTORS[selector]
        ? translate(TX_ACTION_SELECTORS[selector])
        : `${translate('walletRelayActionContractCall')} (${selector})`)
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
  const [snapshot, setSnapshot] = useState(() => walletRelaySessionManager.getSnapshot());
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [scanRequestId, setScanRequestId] = useState('');
  const scanRequestIdRef = useRef('');
  const lastHydratedRequestIdRef = useRef('');
  const { t, resolvedTheme } = useSettings();

  useEffect(() => walletRelaySessionManager.subscribe(next => setSnapshot(next)), []);

  const request = useMemo(() => {
    const pinnedRequestId = scanRequestIdRef.current || scanRequestId;
    if (pinnedRequestId) {
      const pinned = snapshot.pendingRequests.find(item => item.requestId === pinnedRequestId);
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
    Boolean(request) && pin.trim().length >= PIN_LENGTH && !submitting && !request?.requiresSwitch;

  const primeNfcForScan = useCallback(async () => {
    try {
      await NfcManager.start();
    } catch (caughtError) {
      console.warn(`${LOG_PREFIX} nfc.start_failed`, {
        message: caughtError instanceof Error ? caughtError.message : String(caughtError),
      });
    }

    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // no-op
    }
  }, []);

  const handleFlowScan = useCallback(async (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
    const requestId = scanRequestIdRef.current || scanRequestId;
    if (!requestId) {
      return {
        ok: false,
        message: t('walletRelayErrorRequestUnavailable'),
      };
    }

    const liveSnapshot = walletRelaySessionManager.getSnapshot();
    const targetRequest = liveSnapshot.pendingRequests.find(item => item.requestId === requestId);
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
      await walletRelaySessionManager.approveRequest(requestId, pin.trim(), {
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
        message: targetRequest.type === 'signTransaction'
          ? t('walletRelayStatusTransactionSigned')
          : t('walletRelayStatusMessageSigned'),
      };
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : String(approveError);
      return {
        ok: false,
        message: message || t('walletRelayErrorApprove'),
      };
    }
  }, [pin, scanRequestId, t]);

  const onApprove = useCallback(async () => {
    if (!request || !canApprove) {
      return;
    }

    setError('');
    setSubmitting(true);
    setScanRequestId(request.requestId);
    scanRequestIdRef.current = request.requestId;

    await primeNfcForScan();
    const flowId = registerScanCardFlow({
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
  }, [canApprove, handleFlowScan, navigation, pin, primeNfcForScan, request]);

  const onReject = useCallback(async () => {
    if (!request) {
      return;
    }

    setError('');
    try {
      await walletRelaySessionManager.rejectRequest(request.requestId, 'USER_REJECTED');
      navigation.goBack();
    } catch (rejectError) {
      const message = rejectError instanceof Error ? rejectError.message : String(rejectError);
      setError(message || t('walletRelayErrorReject'));
    } finally {
      setSubmitting(false);
    }
  }, [navigation, request, t]);

  const onSwitchAccount = useCallback(() => {
    if (!request || submitting) {
      return;
    }
    walletRelaySessionManager.setActiveAccount(request.address);
  }, [request, submitting]);

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
            <Pressable style={styles.headerIcon} onPress={() => onReject().catch(() => undefined)}>
              <Ionicons name="close" size={16} color={ACCENT.textSecondary} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {request ? t(resolveTitle(request)) : t('walletRelayTitleSignMessage')}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          {request ? (
            <>
              <Text style={styles.subtitle}>
                {t(resolveTitle(request))} · {t('walletRelaySessionLabel')} {request.sessionId.slice(0, 8)}...{' '}
                {t('walletRelayNeedsAccountLabel')} {request.address}
              </Text>

              {request.requiresSwitch ? (
                <View style={styles.switchBox}>
                  <Text style={styles.switchText}>{t('walletRelaySwitchWarning')}</Text>
                  <Pressable style={styles.secondaryButton} onPress={onSwitchAccount} disabled={submitting}>
                    <Text style={styles.secondaryButtonText}>{t('walletRelaySwitchAccountButton')}</Text>
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
                    <Text style={styles.summaryLabel}>{t('walletRelaySummaryMessagePreview')}</Text>
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
                ctaLabel={submitting ? t('walletRelayWaitingNfc') : t('walletRelayConfirmScan')}
                heroIconName={
                  request.type === 'signTransaction'
                    ? 'document-text-outline'
                    : 'chatbox-ellipses-outline'
                }
                errorMessage={error || null}
                afterActionSlot={(
                  <PinGhostButton
                    label={t('walletRelayReject')}
                    onPress={() => onReject().catch(() => undefined)}
                    disabled={submitting}
                  />
                )}
              />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WALLET_COLORS.background,
  },
  card: {
    flex: 1,
    backgroundColor: ACCENT.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    backgroundColor: ACCENT.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: ACCENT.text,
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 17,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 30,
    height: 30,
  },
  subtitle: {
    color: ACCENT.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  switchBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(40, 151, 255, 0.28)',
    backgroundColor: 'rgba(40, 151, 255, 0.08)',
    padding: 12,
    gap: 10,
  },
  switchText: {
    color: ACCENT.signalBright,
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT.borderStrong,
    backgroundColor: ACCENT.surfaceAlt,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: ACCENT.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryScroll: {
    maxHeight: 288,
  },
  summaryScrollContent: {
    flexGrow: 1,
  },
  summaryBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.surface,
    padding: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryLabel: {
    color: ACCENT.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flexShrink: 0,
    maxWidth: 86,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    color: ACCENT.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  summaryMessage: {
    color: ACCENT.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
});

export default WalletRelayRequestScreen;
