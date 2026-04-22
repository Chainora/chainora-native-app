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

import { AppButton } from '../../components/AppButton';
import { PinInput } from '../../components/ui/PinInput';
import { useAuth } from '../auth';
import { useSettings } from '../settings';
import {
  walletConnectRuntime,
  type WalletConnectRequestDecision,
  type WalletConnectRequestPrompt,
  type WalletConnectRuntimeEvent,
} from '../../services/walletconnect';

type WalletConnectContextValue = {
  pairWithInput: (input: string, addressHint?: string) => Promise<void>;
  latestStatus: string;
  latestError: string;
  activeSessionCount: number;
};

const WalletConnectContext = createContext<WalletConnectContextValue | undefined>(undefined);

const normalizeErrorMessage = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return 'WalletConnect request failed.';
  }
  return message;
};

export const WalletConnectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { session } = useAuth();
  const { themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens.background, themeTokens.foreground), [themeTokens.background, themeTokens.foreground]);

  const pendingDecisionRef = useRef<((decision: WalletConnectRequestDecision) => void) | null>(null);
  const lastHandledUrlRef = useRef('');

  const [latestStatus, setLatestStatus] = useState('WalletConnect ready.');
  const [latestError, setLatestError] = useState('');
  const [activeSessionCount, setActiveSessionCount] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<WalletConnectRequestPrompt | null>(null);
  const [requestPin, setRequestPin] = useState('');
  const [requestPinError, setRequestPinError] = useState('');

  const closePromptWithDecision = useCallback((decision: WalletConnectRequestDecision) => {
    const resolver = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    setPendingPrompt(null);
    setRequestPin('');
    setRequestPinError('');
    resolver?.(decision);
  }, []);

  useEffect(() => {
    walletConnectRuntime.setExpectedAddress(session?.address ?? '');
  }, [session?.address]);

  useEffect(() => {
    walletConnectRuntime.setApprovalHandler(async prompt => {
      return new Promise<WalletConnectRequestDecision>(resolve => {
        pendingDecisionRef.current = resolve;
        setRequestPin('');
        setRequestPinError('');
        setPendingPrompt(prompt);
      });
    });

    return () => {
      walletConnectRuntime.setApprovalHandler(null);
      if (pendingDecisionRef.current) {
        pendingDecisionRef.current({ approved: false });
        pendingDecisionRef.current = null;
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
          setLatestStatus('WalletConnect pair request sent. Approve session in dApp.');
          setLatestError('');
          setActiveSessionCount(walletConnectRuntime.getSessions().length);
          break;
        case 'pair_error':
          setLatestStatus('WalletConnect pairing failed.');
          setLatestError(event.error);
          break;
        case 'proposal_received':
          setLatestStatus(`Session proposal received from ${event.proposer}.`);
          setLatestError('');
          break;
        case 'session_approved':
          setLatestStatus(`Session approved: ${event.peerName}.`);
          setLatestError('');
          setActiveSessionCount(walletConnectRuntime.getSessions().length);
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
          break;
        case 'request_error':
          setLatestStatus(`Request failed: ${event.method}`);
          setLatestError(event.error);
          break;
        default:
          break;
      }
    });

    setActiveSessionCount(walletConnectRuntime.getSessions().length);
    return unsubscribe;
  }, []);

  const pairWithInput = useCallback(async (input: string, addressHint?: string) => {
    const normalizedInput = String(input ?? '').trim();
    if (!normalizedInput) {
      throw new Error('WalletConnect URI is empty.');
    }

    if (addressHint?.trim()) {
      walletConnectRuntime.setExpectedAddress(addressHint.trim());
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

      try {
        await pairWithInput(candidate, session?.address ?? '');
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
  }, [pairWithInput, session?.address]);

  const contextValue = useMemo<WalletConnectContextValue>(() => ({
    pairWithInput,
    latestStatus,
    latestError,
    activeSessionCount,
  }), [pairWithInput, latestStatus, latestError, activeSessionCount]);

  return (
    <WalletConnectContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={Boolean(pendingPrompt)}
        animationType="slide"
        transparent
        onRequestClose={() => {
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
              />
              <AppButton
                label="Approve & Sign"
                onPress={() => {
                  if (requestPin.length < 4) {
                    setRequestPinError('PIN must be 4 digits.');
                    return;
                  }
                  closePromptWithDecision({
                    approved: true,
                    pin: requestPin,
                  });
                }}
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
          </View>
        </View>
      </Modal>
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
