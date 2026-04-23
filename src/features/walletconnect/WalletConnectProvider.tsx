import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import { AppButton } from '../../components/AppButton';
import { PinInput } from '../../components/ui/PinInput';
import { ScanDialog } from '../../components/ui/ScanDialog';
import { useAuth } from '../auth';
import { useSettings } from '../settings';
import { useToast } from '../toast';
import type { WalletActionResult } from '../../services/cardService';
import {
  walletConnectRuntime,
  type WalletConnectRequestDecision,
  type WalletConnectRequestPrompt,
  type WalletConnectRuntimeEvent,
  type WalletConnectSessionProposal,
} from '../../services/walletconnect';
import { SessionProposalModal } from './SessionProposalModal';

type WalletConnectContextValue = {
  pairWithInput: (input: string, addressHint?: string) => Promise<void>;
  latestStatus: string;
  latestError: string;
  activeSessionCount: number;
};

const WalletConnectContext = createContext<WalletConnectContextValue | undefined>(undefined);

export const WalletConnectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { session } = useAuth();
  const { themeTokens } = useSettings();
  const { showToast } = useToast();
  const styles = useMemo(() => createStyles(themeTokens.background, themeTokens.foreground), [themeTokens.background, themeTokens.foreground]);

  const pendingDecisionRef = useRef<((decision: WalletConnectRequestDecision) => void) | null>(null);
  const pendingProposalDecisionRef = useRef<((accepted: boolean) => void) | null>(null);
  const scanFlowResolverRef = useRef<((result: WalletActionResult) => void) | null>(null);
  const lastHandledUrlRef = useRef('');

  const [latestStatus, setLatestStatus] = useState('WalletConnect ready.');
  const [latestError, setLatestError] = useState('');
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<WalletConnectRequestPrompt | null>(null);
  const [pendingProposal, setPendingProposal] = useState<WalletConnectSessionProposal | null>(null);
  const [requestPin, setRequestPin] = useState('');
  const [requestPinError, setRequestPinError] = useState('');
  const [cardSigningMethod, setCardSigningMethod] = useState<string | null>(null);

  const closePromptWithDecision = useCallback((decision: WalletConnectRequestDecision) => {
    const resolver = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    setPendingPrompt(null);
    setRequestPin('');
    setRequestPinError('');
    setCardSigningMethod(null);
    resolver?.(decision);
  }, []);

  const resolveApprovedDecision = useCallback((decision: WalletConnectRequestDecision) => {
    // Resolve the approval Promise but keep the modal open so that the
    // user can see the card-tap instructions while NFC signing is in
    // flight. The modal will be torn down when the runtime reports
    // success or failure.
    const resolver = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    resolver?.(decision);
  }, []);

  const resolveProposalDecision = useCallback((accepted: boolean) => {
    const resolver = pendingProposalDecisionRef.current;
    pendingProposalDecisionRef.current = null;
    setPendingProposal(null);
    resolver?.(accepted);
  }, []);

  const handleWCFlowScan = useCallback(
    (setStageStatus: (status: string) => void): Promise<WalletActionResult> => {
      return new Promise<WalletActionResult>(resolve => {
        scanFlowResolverRef.current = resolve;
        setStageStatus('Signing with your card…');
      });
    },
    [],
  );

  useEffect(() => {
    walletConnectRuntime.setExpectedAddress(session?.address ?? '');
  }, [session?.address]);

  useEffect(() => {
    // Warm-up the NFC adapter so that the first WalletConnect card-sign does
    // not have to pay the cost of initialising reader mode from scratch on a
    // screen that does not already mount the NFC hook.
    let cancelled = false;
    const warmUp = async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (cancelled || !supported) {
          return;
        }
        await NfcManager.start();
      } catch (warmUpError) {
        console.warn('[WC UI] NfcManager warm-up failed', warmUpError);
      }
    };
    void warmUp();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    walletConnectRuntime.setApprovalHandler(async prompt => {
      return new Promise<WalletConnectRequestDecision>(resolve => {
        pendingDecisionRef.current = resolve;
        setRequestPin('');
        setRequestPinError('');
        setPendingPrompt(prompt);
      });
    });

    walletConnectRuntime.setProposalHandler(async proposal => {
      return new Promise<boolean>(resolve => {
        pendingProposalDecisionRef.current = resolve;
        setPendingProposal(proposal);
      });
    });

    return () => {
      walletConnectRuntime.setApprovalHandler(null);
      walletConnectRuntime.setProposalHandler(null);
      if (pendingDecisionRef.current) {
        pendingDecisionRef.current({ approved: false });
        pendingDecisionRef.current = null;
      }
      if (pendingProposalDecisionRef.current) {
        pendingProposalDecisionRef.current(false);
        pendingProposalDecisionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = walletConnectRuntime.subscribe((event: WalletConnectRuntimeEvent) => {
      switch (event.type) {
        case 'client_ready':
          setLatestStatus('WalletConnect client initialized.');
          setLatestError('');
          break;
        case 'pair_started':
          setLatestStatus('Pairing WalletConnect session...');
          setLatestError('');
          break;
        case 'pair_success':
          setLatestStatus('Waiting for dApp to send session proposal...');
          setLatestError('');
          setActiveSessionCount(walletConnectRuntime.getSessions().length);
          break;
        case 'pair_error':
          setLatestStatus('WalletConnect pairing failed.');
          setLatestError(event.error);
          showToast(event.error, 'error');
          break;
        case 'proposal_received':
          setLatestStatus(`Session proposal received from ${event.proposer}.`);
          setLatestError('');
          break;
        case 'proposal_rejected':
          setLatestStatus(`Proposal rejected: ${event.proposer}.`);
          setLatestError(event.reason);
          showToast(event.reason, 'error');
          break;
        case 'session_approved':
          setLatestStatus(`Connected to ${event.peerName}.`);
          setLatestError('');
          setActiveSessionCount(walletConnectRuntime.getSessions().length);
          showToast(`Connected to ${event.peerName}`, 'success');
          break;
        case 'session_deleted':
          setLatestStatus('WalletConnect session disconnected.');
          setLatestError(event.reason);
          setActiveSessionCount(walletConnectRuntime.getSessions().length);
          break;
        case 'request_prompt':
          setLatestStatus(`Approval requested: ${event.prompt.method}`);
          setLatestError('');
          break;
        case 'request_success':
          setLatestStatus(`Request completed: ${event.method}`);
          setLatestError('');
          scanFlowResolverRef.current?.({
            ok: true,
            message: 'Signed via WalletConnect',
          });
          scanFlowResolverRef.current = null;
          setCardSigningMethod(null);
          setPendingPrompt(null);
          setRequestPin('');
          setRequestPinError('');
          break;
        case 'request_error':
          console.warn('[WC UI] request_error method=', event.method, 'error=', event.error);
          setLatestStatus(`Request failed: ${event.method}`);
          setLatestError(event.error);
          scanFlowResolverRef.current?.({
            ok: false,
            code: 'TRANSPORT_ERROR',
            message: event.error,
          });
          scanFlowResolverRef.current = null;
          setCardSigningMethod(null);
          setPendingPrompt(null);
          setRequestPin('');
          setRequestPinError('');
          break;
        default:
          break;
      }
    });

    setActiveSessionCount(walletConnectRuntime.getSessions().length);
    return unsubscribe;
  }, [showToast]);

  const pairWithInput = useCallback(async (input: string, addressHint?: string) => {
    const normalizedInput = String(input ?? '').trim();
    if (!normalizedInput) {
      throw new Error('WalletConnect URI is empty.');
    }

    if (addressHint?.trim()) {
      walletConnectRuntime.setExpectedAddress(addressHint.trim());
    }

    if (!walletConnectRuntime.getExpectedAddress()) {
      throw new Error('Please sign in to your wallet before pairing.');
    }

    await walletConnectRuntime.pair(normalizedInput);
    setActiveSessionCount(walletConnectRuntime.getSessions().length);
  }, []);

  useEffect(() => {
    const maybePairFromDeepLink = async (url: string | null) => {
      const candidate = String(url ?? '').trim();
      if (!candidate || lastHandledUrlRef.current === candidate) {
        return;
      }
      lastHandledUrlRef.current = candidate;

      if (!session?.address) {
        // Deep-link invoked but wallet not logged in — surface a toast, skip pairing.
        if (candidate.toLowerCase().includes('wc:') || candidate.toLowerCase().includes('uri=wc')) {
          showToast('Please sign in to your wallet before pairing.', 'error');
        }
        return;
      }

      try {
        await pairWithInput(candidate, session.address);
      } catch {
        // Ignore non-WalletConnect deep links.
      }
    };

    const subscription = Linking.addEventListener('url', event => {
      void maybePairFromDeepLink(event.url);
    });

    void Linking.getInitialURL().then(url => {
      void maybePairFromDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [pairWithInput, session?.address, showToast]);

  const contextValue = useMemo<WalletConnectContextValue>(() => ({
    pairWithInput,
    latestStatus,
    latestError,
    activeSessionCount,
  }), [pairWithInput, latestStatus, latestError, activeSessionCount]);

  return (
    <WalletConnectContext.Provider value={contextValue}>
      {children}

      <SessionProposalModal
        proposal={pendingProposal}
        onApprove={() => resolveProposalDecision(true)}
        onReject={() => resolveProposalDecision(false)}
      />

      <Modal
        visible={Boolean(pendingPrompt) && !cardSigningMethod}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          if (cardSigningMethod) {
            // Do not allow dismiss during NFC signing — the runtime will
            // close the modal once the request settles.
            return;
          }
          closePromptWithDecision({ approved: false });
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>WalletConnect request</Text>
            <Text style={styles.modalSubtitle}>
              {pendingPrompt
                ? `${pendingPrompt.peerName} requests: ${pendingPrompt.method}`
                : 'Approve request'}
            </Text>

            {pendingPrompt?.peerUrl ? (
              <Text style={styles.modalMeta}>Origin: {pendingPrompt.peerUrl}</Text>
            ) : null}
            {pendingPrompt?.chainId ? (
              <Text style={styles.modalMeta}>Chain: {pendingPrompt.chainId}</Text>
            ) : null}

            {cardSigningMethod ? null : (
              <>
                <Text style={styles.pinLabel}>Enter card PIN to sign</Text>
                <PinInput
                  value={requestPin}
                  onChange={next => {
                    setRequestPin(next);
                    setRequestPinError('');
                  }}
                  length={4}
                  autoFocus={Boolean(pendingPrompt)}
                />
                {requestPinError ? <Text style={styles.errorText}>{requestPinError}</Text> : null}

                <View style={styles.actionRow}>
                  <AppButton
                    label="Reject"
                    variant="text"
                    onPress={() => {
                      closePromptWithDecision({ approved: false });
                    }}
                    style={styles.actionButton}
                  />
                  <AppButton
                    label="Approve & Sign"
                    onPress={() => {
                      if (requestPin.length < 4) {
                        setRequestPinError('PIN must be 4 digits.');
                        return;
                      }
                      const method = pendingPrompt?.method ?? 'request';
                      setCardSigningMethod(method);
                      resolveApprovedDecision({
                        approved: true,
                        pin: requestPin,
                      });
                    }}
                    style={styles.actionButton}
                  />
                </View>

                <Pressable
                  onPress={() => {
                    closePromptWithDecision({ approved: false });
                  }}
                  style={styles.closeHint}
                >
                  <Text style={styles.closeHintText}>Close</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ScanDialog
        visible={Boolean(cardSigningMethod)}
        isNfcEnabled={null}
        onClose={() => {
          // Resolve resolver so ScanDialog tears down; do not touch
          // cardSigningMethod / pendingPrompt — runtime subscribe will
          // clear them via request_success / request_error.
          if (scanFlowResolverRef.current) {
            scanFlowResolverRef.current({
              ok: false,
              message: 'Cancelled by user',
            });
            scanFlowResolverRef.current = null;
          }
        }}
        onSuccess={async () => {
          // no-op: state clearing happens in the runtime event subscribe.
        }}
        onShowToast={showToast}
        initialMode="signin"
        prefilledPin={requestPin}
        types="flow"
        onFlowScan={handleWCFlowScan}
      />
    </WalletConnectContext.Provider>
  );
};

export const useWalletConnect = (): WalletConnectContextValue => {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error('useWalletConnect must be used within WalletConnectProvider');
  }
  return context;
};

const createStyles = (background: string, foreground: string) => StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: background,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: foreground,
  },
  modalSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: foreground,
  },
  modalMeta: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(100, 116, 139, 1)',
  },
  pinLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: foreground,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
  },
  errorText: {
    marginTop: -12,
    marginBottom: 8,
    fontSize: 12,
    color: '#dc2626',
  },
  closeHint: {
    alignSelf: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  closeHintText: {
    fontSize: 12,
    color: 'rgba(100, 116, 139, 1)',
  },
});
