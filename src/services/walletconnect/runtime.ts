import SignClient from '@walletconnect/sign-client';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';
import { buildApprovedNamespaces, getSdkError, parseUri } from '@walletconnect/utils';
import { getAddress, isAddress, type Address } from 'viem';

import { getActiveNetwork } from '../../config/network';
import {
  handleWalletConnectEvmRequest,
  type WalletConnectEvmRequest,
} from './evmRequestHandler';
import {
  WALLETCONNECT_APP_METADATA,
  WALLETCONNECT_PLACEHOLDER_PROJECT_ID,
  WALLETCONNECT_PROJECT_ID,
  WALLETCONNECT_RELAY_URL,
} from './config';

const EVM_NAMESPACE_KEY = 'eip155';
const EVM_SESSION_METHODS = [
  'eth_requestAccounts',
  'eth_accounts',
  'eth_chainId',
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
] as const;
const EVM_SESSION_EVENTS = ['accountsChanged', 'chainChanged'] as const;

export type WalletConnectRequestPrompt = {
  id: number;
  topic: string;
  chainId: string;
  method: string;
  params: unknown;
  peerName: string;
  peerUrl: string;
};

export type WalletConnectRequestDecision = {
  approved: boolean;
  pin?: string;
};

export type WalletConnectRuntimeEvent =
  | { type: 'client_ready' }
  | { type: 'pair_started'; uri: string }
  | { type: 'pair_success'; uri: string }
  | { type: 'pair_error'; uri: string; error: string }
  | { type: 'proposal_received'; proposer: string }
  | { type: 'session_approved'; topic: string; peerName: string }
  | { type: 'session_deleted'; topic: string; reason: string }
  | { type: 'request_prompt'; prompt: WalletConnectRequestPrompt }
  | { type: 'request_success'; topic: string; id: number; method: string }
  | { type: 'request_error'; topic: string; id: number; method: string; error: string };

type WalletConnectRuntimeListener = (event: WalletConnectRuntimeEvent) => void;
type WalletConnectApprovalHandler = (prompt: WalletConnectRequestPrompt) => Promise<WalletConnectRequestDecision>;
type WalletConnectRuntimeGlobalState = {
  runtime?: WalletConnectRuntime;
  client: SignClient | null;
  initPromise: Promise<SignClient> | null;
};

const WALLETCONNECT_RUNTIME_GLOBAL_KEY = '__chainora_walletconnect_runtime__';

const getWalletConnectGlobalState = (): WalletConnectRuntimeGlobalState => {
  const scope = globalThis as typeof globalThis & {
    [WALLETCONNECT_RUNTIME_GLOBAL_KEY]?: WalletConnectRuntimeGlobalState;
  };

  if (!scope[WALLETCONNECT_RUNTIME_GLOBAL_KEY]) {
    scope[WALLETCONNECT_RUNTIME_GLOBAL_KEY] = {
      runtime: undefined,
      client: null,
      initPromise: null,
    };
  }

  return scope[WALLETCONNECT_RUNTIME_GLOBAL_KEY];
};

const sanitizeErrorMessage = (raw: unknown, fallback: string): string => {
  const message = raw instanceof Error ? raw.message.trim() : String(raw ?? '').trim();
  if (!message) {
    return fallback;
  }
  return message;
};

const isLikelyWalletConnectUri = (value: string): boolean => {
  return value.startsWith('wc:');
};

const normalizeWalletConnectUri = (value: string): string => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error('WalletConnect URI is empty.');
  }

  if (isLikelyWalletConnectUri(trimmed)) {
    parseUri(trimmed);
    return trimmed;
  }

  let decoded = trimmed;
  try {
    const parsed = new URL(trimmed);
    const fromQuery = parsed.searchParams.get('uri')?.trim() ?? '';
    if (fromQuery) {
      decoded = decodeURIComponent(fromQuery);
    }
  } catch {
    // Not an URL; continue with raw value.
  }

  if (!isLikelyWalletConnectUri(decoded)) {
    throw new Error('Invalid WalletConnect URI. Expected wc: URI.');
  }

  parseUri(decoded);
  return decoded;
};

const resolveExpectedAddress = (raw: string): Address | null => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || !isAddress(trimmed)) {
    return null;
  }
  return getAddress(trimmed);
};

class WalletConnectRuntime {
  private listeners = new Set<WalletConnectRuntimeListener>();

  private approvalHandler: WalletConnectApprovalHandler | null = null;

  private expectedAddress: Address | null = null;

  private requestQueue: Promise<void> = Promise.resolve();

  private pairPromises = new Map<string, Promise<void>>();

  private get client(): SignClient | null {
    return getWalletConnectGlobalState().client;
  }

  private set client(next: SignClient | null) {
    getWalletConnectGlobalState().client = next;
  }

  private get initPromise(): Promise<SignClient> | null {
    return getWalletConnectGlobalState().initPromise;
  }

  private set initPromise(next: Promise<SignClient> | null) {
    getWalletConnectGlobalState().initPromise = next;
  }

  private emit(event: WalletConnectRuntimeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Do not break listeners chain.
      }
    }
  }

  subscribe(listener: WalletConnectRuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setApprovalHandler(handler: WalletConnectApprovalHandler | null) {
    this.approvalHandler = handler;
  }

  setExpectedAddress(rawAddress: string) {
    this.expectedAddress = resolveExpectedAddress(rawAddress);
  }

  getSessions(): SessionTypes.Struct[] {
    if (!this.client) {
      return [];
    }
    return this.client.session.getAll();
  }

  private async ensureClient(): Promise<SignClient> {
    if (this.client) {
      return this.client;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const projectId = WALLETCONNECT_PROJECT_ID.trim();
      if (!projectId || projectId === WALLETCONNECT_PLACEHOLDER_PROJECT_ID) {
        throw new Error('WalletConnect projectId is missing. Set WALLETCONNECT_PROJECT_ID before pairing.');
      }

      const next = await SignClient.init({
        projectId,
        relayUrl: WALLETCONNECT_RELAY_URL,
        metadata: WALLETCONNECT_APP_METADATA,
      });
      this.client = next;
      this.registerHandlers(next);
      this.emit({ type: 'client_ready' });
      return next;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  private registerHandlers(client: SignClient) {
    client.on('session_proposal', event => {
      void this.handleSessionProposal(client, event);
    });

    client.on('session_request', event => {
      this.requestQueue = this.requestQueue
        .then(async () => {
          await this.handleSessionRequest(client, event);
        })
        .catch(() => undefined);
    });

    client.on('session_delete', event => {
      const reason = 'Session disconnected by dApp.';
      this.emit({
        type: 'session_deleted',
        topic: event.topic,
        reason,
      });
    });
  }

  private getChainIdLabel(): string {
    return `${EVM_NAMESPACE_KEY}:${getActiveNetwork().chainId}`;
  }

  private getAccountLabel(expectedAddress: Address): string {
    return `${this.getChainIdLabel()}:${expectedAddress}`;
  }

  private async handleSessionProposal(
    client: SignClient,
    event: SignClientTypes.EventArguments['session_proposal'],
  ) {
    const proposal = event.params;
    const proposerName = proposal.proposer?.metadata?.name?.trim() || 'Unknown dApp';
    this.emit({ type: 'proposal_received', proposer: proposerName });

    const expectedAddress = this.expectedAddress;
    if (!expectedAddress) {
      await client.reject({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED', 'Wallet address is not active.'),
      });
      return;
    }

    try {
      const namespaces = buildApprovedNamespaces({
        proposal,
        supportedNamespaces: {
          [EVM_NAMESPACE_KEY]: {
            chains: [this.getChainIdLabel()],
            methods: [...EVM_SESSION_METHODS],
            events: [...EVM_SESSION_EVENTS],
            accounts: [this.getAccountLabel(expectedAddress)],
          },
        },
      });

      const approved = await client.approve({
        id: proposal.id,
        namespaces,
      });

      const session = await approved.acknowledged();
      this.emit({
        type: 'session_approved',
        topic: session.topic,
        peerName: session.peer.metadata.name?.trim() || proposerName,
      });
    } catch (error) {
      await client.reject({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED', sanitizeErrorMessage(error, 'Unable to approve wallet session.')),
      }).catch(() => undefined);
      this.emit({
        type: 'pair_error',
        uri: '',
        error: sanitizeErrorMessage(error, 'Unable to approve wallet session.'),
      });
    }
  }

  private async handleSessionRequest(
    client: SignClient,
    event: SignClientTypes.EventArguments['session_request'],
  ) {
    const expectedAddress = this.expectedAddress;
    const { id, topic, params } = event;
    const method = String(params.request.method ?? '');

    if (!expectedAddress) {
      await client.respond({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED', 'Wallet is locked.'),
        },
      });
      return;
    }

    const session = client.session.get(topic);
    const prompt: WalletConnectRequestPrompt = {
      id,
      topic,
      method,
      params: params.request.params,
      chainId: params.chainId,
      peerName: session?.peer?.metadata?.name?.trim() || 'Unknown dApp',
      peerUrl: session?.peer?.metadata?.url?.trim() || '',
    };

    this.emit({ type: 'request_prompt', prompt });

    const handler = this.approvalHandler;
    const decision = handler
      ? await handler(prompt)
      : { approved: false };

    if (!decision.approved || !decision.pin?.trim()) {
      await client.respond({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED'),
        },
      });
      this.emit({
        type: 'request_error',
        topic,
        id,
        method,
        error: 'User rejected request.',
      });
      return;
    }

    try {
      const result = await handleWalletConnectEvmRequest({
        request: {
          id,
          method,
          params: params.request.params,
        } as WalletConnectEvmRequest,
        context: {
          pin: decision.pin.trim(),
          expectedAddress,
        },
      });

      await client.respond({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          result,
        },
      });
      this.emit({ type: 'request_success', topic, id, method });
    } catch (error) {
      const message = sanitizeErrorMessage(error, 'Wallet request failed.');
      await client.respond({
        topic,
        response: {
          id,
          jsonrpc: '2.0',
          error: {
            code: 5000,
            message,
          },
        },
      });
      this.emit({
        type: 'request_error',
        topic,
        id,
        method,
        error: message,
      });
    }
  }

  async pair(uriOrDeepLink: string): Promise<void> {
    const uri = normalizeWalletConnectUri(uriOrDeepLink);
    const existingPromise = this.pairPromises.get(uri);
    if (existingPromise) {
      return existingPromise;
    }

    this.emit({ type: 'pair_started', uri });

    const pairPromise = (async () => {
      try {
        const client = await this.ensureClient();
        await client.pair({ uri });
        this.emit({ type: 'pair_success', uri });
      } catch (error) {
        const message = sanitizeErrorMessage(error, 'WalletConnect pair failed.');
        this.emit({ type: 'pair_error', uri, error: message });
        throw new Error(message);
      } finally {
        this.pairPromises.delete(uri);
      }
    })();

    this.pairPromises.set(uri, pairPromise);
    return pairPromise;
  }

  extractWalletConnectUri(input: string): string {
    return normalizeWalletConnectUri(input);
  }
}

const runtimeState = getWalletConnectGlobalState();

export const walletConnectRuntime =
  runtimeState.runtime ?? (runtimeState.runtime = new WalletConnectRuntime());
