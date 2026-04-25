import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import { PinInput } from '../ui/PinInput';
import { ScanDialog } from '../ui/ScanDialog';
import { useNfcEnabled } from '../../features/nfc/hooks/useNfcEnabled';
import { useSettings } from '../../features/settings';
import type { WalletActionResult } from '../../services/cardService';
import { walletRelaySessionManager, type WalletRelayPendingRequest } from '../../services/walletRelaySessionManager';
import type { ThemeTokens } from '../../types/theme/colors';

const PIN_LENGTH = 4;
const LOG_PREFIX = '[wallet-relay][request-modal]';
const SCAN_AUTOSTART_DELAY_MS = 420;
const TX_ACTION_SELECTORS: Record<string, string> = {
  '0x9377111a': 'walletRelayActionCreateGroup',
  '0xe1566b14': 'walletRelayActionCreateGroup',
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
};

const resolveTitle = (
  request: WalletRelayPendingRequest,
): 'walletRelayTitleSignMessage' | 'walletRelayTitleSignTransaction' => {
  if (request.type === 'signMessage') {
    return 'walletRelayTitleSignMessage';
  }
  return 'walletRelayTitleSignTransaction';
};

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
): {
  action: string;
  to: string;
  from: string;
  value: string;
  gas: string;
  nonce: string;
  chainId: string;
  dataPreview: string;
} => {
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

export const WalletRelayRequestModal: React.FC = () => {
  const [snapshot, setSnapshot] = useState(() => walletRelaySessionManager.getSnapshot());
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [scanDialogVisible, setScanDialogVisible] = useState(false);
  const [scanRequestId, setScanRequestId] = useState('');
  const scanRequestIdRef = useRef('');
  const lastHydratedRequestIdRef = useRef('');
  const { isEnabled } = useNfcEnabled();
  const { themeTokens, t } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);

  useEffect(() => {
    return walletRelaySessionManager.subscribe(next => {
      setSnapshot(next);
    });
  }, []);

  const request = useMemo(() => {
    const pinnedRequestId = scanRequestIdRef.current || scanRequestId;
    if (pinnedRequestId) {
      const pinned = snapshot.pendingRequests.find(item => item.requestId === pinnedRequestId);
      if (pinned) {
        return pinned;
      }
    }

    if (snapshot.pendingRequests.length === 0) {
      return null;
    }
    return snapshot.pendingRequests[0];
  }, [scanRequestId, snapshot.pendingRequests]);

  const modalVisible = Boolean(request) && !snapshot.requestModalSuppressed && !scanDialogVisible;

  useEffect(() => {
    const requestId = request?.requestId ?? '';
    if (requestId === lastHydratedRequestIdRef.current) {
      return;
    }
    if (submitting || scanDialogVisible) {
      console.log(`${LOG_PREFIX} hydrate.skip_busy`, {
        nextRequestId: requestId,
        currentScanRequestId: scanRequestIdRef.current,
      });
      return;
    }

    lastHydratedRequestIdRef.current = requestId;
    setPin('');
    setSubmitting(false);
    setError('');
    setScanDialogVisible(false);
    setScanRequestId('');
    scanRequestIdRef.current = '';
  }, [request?.requestId, scanDialogVisible, submitting]);

  const canApprove = Boolean(request) && pin.trim().length >= PIN_LENGTH && !submitting && !request?.requiresSwitch;

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

  const onApprove = useCallback(async () => {
    if (!request || !canApprove) {
      return;
    }

    setError('');
    setSubmitting(true);
    setScanRequestId(request.requestId);
    scanRequestIdRef.current = request.requestId;
    console.log(`${LOG_PREFIX} approve.start`, {
      sessionIdPreview: request.sessionId.slice(0, 8),
      requestId: request.requestId,
      type: request.type,
    });

    await primeNfcForScan();
    setScanDialogVisible(true);
  }, [canApprove, primeNfcForScan, request]);

  const onReject = useCallback(async () => {
    if (!request) {
      return;
    }

    setError('');
    try {
      await walletRelaySessionManager.rejectRequest(request.requestId, 'USER_REJECTED');
      console.log(`${LOG_PREFIX} reject.sent`, {
        sessionIdPreview: request.sessionId.slice(0, 8),
        requestId: request.requestId,
      });
    } catch (rejectError) {
      const message = rejectError instanceof Error ? rejectError.message : String(rejectError);
      setError(message || t('walletRelayErrorReject'));
      console.warn(`${LOG_PREFIX} reject.failed`, {
        sessionIdPreview: request.sessionId.slice(0, 8),
        requestId: request.requestId,
        message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [request, t]);

  const onSwitchAccount = useCallback(() => {
    if (!request || submitting) {
      return;
    }
    walletRelaySessionManager.setActiveAccount(request.address);
  }, [request, submitting]);

  const handleApprovePress = useCallback(() => {
    onApprove().catch(() => undefined);
  }, [onApprove]);

  const handleRejectPress = useCallback(() => {
    onReject().catch(() => undefined);
  }, [onReject]);

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
      console.warn(`${LOG_PREFIX} flow.request_missing`, {
        requestId,
        pendingCount: liveSnapshot.pendingRequests.length,
      });
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

    console.log(`${LOG_PREFIX} flow.scan_begin`, {
      sessionIdPreview: targetRequest.sessionId.slice(0, 8),
      requestId: targetRequest.requestId,
      type: targetRequest.type,
      pendingCount: liveSnapshot.pendingRequests.length,
    });

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
      console.log(`${LOG_PREFIX} flow.approve_success`, {
        sessionIdPreview: targetRequest.sessionId.slice(0, 8),
        requestId: targetRequest.requestId,
      });
      return {
        ok: true,
        message: targetRequest.type === 'signTransaction'
          ? t('walletRelayStatusTransactionSigned')
          : t('walletRelayStatusMessageSigned'),
      };
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : String(approveError);
      console.warn(`${LOG_PREFIX} flow.approve_failed`, {
        sessionIdPreview: targetRequest.sessionId.slice(0, 8),
        requestId: targetRequest.requestId,
        message,
      });
      return {
        ok: false,
        message: message || t('walletRelayErrorApprove'),
      };
    }
  }, [pin, scanRequestId, t]);

  const onScanSuccess = useCallback(() => {
    console.log(`${LOG_PREFIX} flow.scan_success`, {
      requestId: scanRequestIdRef.current,
    });
    setSubmitting(false);
    setScanDialogVisible(false);
    setScanRequestId('');
    scanRequestIdRef.current = '';
    lastHydratedRequestIdRef.current = '';
    setPin('');
  }, []);

  const onScanClose = useCallback(() => {
    console.log(`${LOG_PREFIX} flow.scan_close`, {
      requestId: scanRequestIdRef.current,
    });
    setSubmitting(false);
    setScanDialogVisible(false);
  }, []);

  const txSummary = useMemo(() => {
    if (!request || request.type !== 'signTransaction') {
      return null;
    }
    return resolveTransactionSummary(request, t);
  }, [request, t]);

  return (
    <>
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={onReject} statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onReject} />

          <View style={styles.card}>
            <View style={styles.grab} />

            {request ? (
              <>
                <Text style={styles.title}>{t(resolveTitle(request))}</Text>
                <Text style={styles.subtitle}>
                  {t(resolveTitle(request))} · {t('walletRelaySessionLabel')} {request.sessionId.slice(0, 8)}...{' '}
                  {t('walletRelayNeedsAccountLabel')} {request.address}
                </Text>

                {request.requiresSwitch ? (
                  <View style={styles.switchBox}>
                    <Text style={styles.switchText}>
                      {t('walletRelaySwitchWarning')}
                    </Text>
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
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryAction')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.action}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryTo')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.to}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryFrom')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.from}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryValue')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.value}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryGas')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.gas}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryNonce')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.nonce}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryChain')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.chainId}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{t('walletRelaySummaryData')}</Text>
                        <Text style={styles.summaryValue}>{txSummary.dataPreview}</Text>
                      </View>
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

                <Text style={styles.pinHeading}>{t('walletRelayPinHeading')}</Text>
                <PinInput
                  value={pin}
                  onChange={setPin}
                  disabled={submitting || request.requiresSwitch}
                  length={PIN_LENGTH}
                  autoFocus
                  colorScheme="dark"
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.primaryButton, (!canApprove || submitting) && styles.buttonDisabled]}
                    onPress={handleApprovePress}
                    disabled={!canApprove || submitting}
                  >
                    <Text style={styles.primaryButtonText}>
                      {submitting ? t('walletRelayWaitingNfc') : t('walletRelayConfirmScan')}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.ghostButton, submitting && styles.buttonDisabled]}
                    onPress={handleRejectPress}
                    disabled={submitting}
                  >
                    <Text style={styles.ghostButtonText}>{t('walletRelayReject')}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ScanDialog
        visible={scanDialogVisible}
        isNfcEnabled={isEnabled}
        onClose={onScanClose}
        onSuccess={onScanSuccess}
        types="flow"
        prefilledPin={pin}
        onFlowScan={handleFlowScan}
        autoStartDelayMs={SCAN_AUTOSTART_DELAY_MS}
      />
    </>
  );
};

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: ACCENT.overlay,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ACCENT.border,
    backgroundColor: ACCENT.card,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 12,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT.borderStrong,
    alignSelf: 'center',
    marginBottom: 6,
  },
  title: {
    color: ACCENT.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
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
  pinHeading: {
    textAlign: 'center',
    color: ACCENT.textLow,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  errorText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  actions: {
    gap: 8,
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
  buttonDisabled: {
    opacity: 0.55,
  },
});

export default WalletRelayRequestModal;
