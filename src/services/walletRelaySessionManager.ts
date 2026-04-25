import { encodeFunctionData, erc20Abi, getAddress, isAddress } from 'viem';

import { withVerifiedWalletSession } from './cardService';
import { sendEthTransaction } from './transactionService';
import { derToCompactSignatureHex } from './transaction/signatureUtils';
import { buildEip191HashFromPersonalSignInput, decodePersonalSignInput } from './walletRelayCrypto';
import { getActiveNetwork } from '../config/network';
import { getPublicViemClient } from './web3Client';
import type {
  WalletRelayMessage,
  WalletRelayPairingPayload,
} from './walletRelayProtocol';
import { WALLET_RELAY_MESSAGE_TYPES } from './walletRelayProtocol';

type RelaySessionState = {
  sessionId: string;
  chainId: string;
  relayWsBase: string;
  token: string;
  mobileResumeToken: string;
  ws: WebSocket | null;
  boundAddress: string;
  connectedAt: number;
  reconnectAttempts: number;
  reconnecting: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

export type WalletRelayPendingRequest = {
  requestId: string;
  sessionId: string;
  type: typeof WALLET_RELAY_MESSAGE_TYPES.signMessage | typeof WALLET_RELAY_MESSAGE_TYPES.signTransaction;
  chainId: string;
  origin: string;
  address: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  requiresSwitch: boolean;
};

type RelayManagerSnapshot = {
  activeAccount: string;
  requestModalSuppressed: boolean;
  sessions: Array<{
    sessionId: string;
    chainId: string;
    boundAddress: string;
    connectedAt: number;
  }>;
  pendingRequests: WalletRelayPendingRequest[];
};

type Listener = (state: RelayManagerSnapshot) => void;

type PendingConnectRequest = {
  sessionId: string;
  requestId: string;
  chainId: string;
  origin: string;
  payloadHash: string;
  intent: 'default' | 'login';
};

type OneTapLoginRequestWaiter = {
  address: string;
  resolve: (request: WalletRelayPendingRequest) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type OneTapWalletSession = {
  ethAddress: string;
  signHash: (hash: Uint8Array) => Promise<{
    ok: boolean;
    message: string;
    signatureDer?: Uint8Array;
  }>;
};

const CONNECT_REQUEST_TIMEOUT_MS = 45_000;
const AUTO_RECONNECT_BASE_DELAY_MS = 1_000;
const AUTO_RECONNECT_MAX_DELAY_MS = 8_000;
const AUTO_LOGIN_DETECTION_TIMEOUT_MS = 8_000;
const LOGIN_SIGN_PREFIX = 'Sign this to login to Chainora:';
const REJECT_REASON_LOGIN_SCAN_REQUIRED = 'LOGIN_SCAN_REQUIRED';
const REJECT_REASON_USER_REJECTED = 'USER_REJECTED';
const CONTRIBUTE_SELECTOR = '0xd7bb99ba';

type ApproveRequestOptions = {
  onProgress?: (status: string) => void;
};

type ContributionAutoApprovePlan = {
  poolAddress: string;
  stablecoinAddress: string;
  contributionAmount: bigint;
  currentAllowance: bigint;
  needsApprove: boolean;
};

const POOL_FUNDS_ABI = [
  {
    type: 'function',
    name: 'stablecoin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'contributionAmount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const normalizeAddress = (raw: unknown): string => {
  const trimmed = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const normalizedPrefix = trimmed.replace(/^0X/, '0x');
  const body = normalizedPrefix.startsWith('0x') ? normalizedPrefix.slice(2) : normalizedPrefix;
  if (!/^[0-9a-fA-F]{40}$/.test(body)) {
    if (isAddress(normalizedPrefix)) {
      return normalizedPrefix.toLowerCase();
    }
    return '';
  }

  return `0x${body.toLowerCase()}`;
};

const parseBigIntLike = (value: unknown, fallback: bigint): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const raw = value.trim();
    if (/^0x/i.test(raw)) {
      return BigInt(raw);
    }
    if (/^[0-9]+$/.test(raw)) {
      return BigInt(raw);
    }
  }
  return fallback;
};

const decodeUtf8 = (bytes: Uint8Array): string => {
  if (bytes.length === 0) {
    return '';
  }

  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
  } catch {
    // Fallback to manual decode below.
  }

  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
};

const decodePersonalSignMessage = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  try {
    const bytes = decodePersonalSignInput(raw);
    const decoded = decodeUtf8(bytes).trim();
    return decoded || raw;
  } catch {
    return raw;
  }
};

const isLoginSignMessagePayload = (payload: Record<string, unknown>): boolean => {
  const decoded = decodePersonalSignMessage(payload.message);
  return decoded.startsWith(LOGIN_SIGN_PREFIX);
};

class WalletRelaySessionManager {
  private sessions = new Map<string, RelaySessionState>();

  private pendingRequests: WalletRelayPendingRequest[] = [];

  private pendingConnect = new Map<string, PendingConnectRequest>();

  private connectWaiters = new Map<string, {
    resolve: (request: PendingConnectRequest) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  private listeners = new Set<Listener>();

  private activeAccount = '';
  private oneTapLoginWaiters = new Map<string, OneTapLoginRequestWaiter>();
  private pairingFlowLocks = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): RelayManagerSnapshot {
    return {
      activeAccount: this.activeAccount,
      requestModalSuppressed: this.pairingFlowLocks > 0,
      sessions: Array.from(this.sessions.values()).map(session => ({
        sessionId: session.sessionId,
        chainId: session.chainId,
        boundAddress: session.boundAddress,
        connectedAt: session.connectedAt,
      })),
      pendingRequests: this.pendingRequests,
    };
  }

  setActiveAccount(address: string) {
    this.activeAccount = normalizeAddress(address);
    this.pendingRequests = this.pendingRequests.map(request => ({
      ...request,
      requiresSwitch: this.activeAccount !== '' && request.address !== this.activeAccount,
    }));
    this.emit();
  }

  beginPairingFlow() {
    this.pairingFlowLocks += 1;
    this.emit();
  }

  endPairingFlow() {
    this.pairingFlowLocks = Math.max(0, this.pairingFlowLocks - 1);
    this.emit();
  }

  async pairAndApproveConnect(payload: WalletRelayPairingPayload, address: string): Promise<PendingConnectRequest> {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) {
      console.warn('[wallet-relay][native] pair.invalid_address', {
        sessionId: payload.sessionId,
        chainId: payload.chainId,
        addressType: typeof address,
        addressRaw: String(address ?? ''),
      });
      throw new Error('Invalid card address for pairing approval.');
    }

    await this.connectSession(payload);
    const connectRequest = await this.waitForConnectRequest(payload.sessionId, CONNECT_REQUEST_TIMEOUT_MS);

    await this.sendMessage(payload.sessionId, {
      type: WALLET_RELAY_MESSAGE_TYPES.approve,
      sessionId: payload.sessionId,
      requestId: connectRequest.requestId,
      chainId: connectRequest.chainId,
      origin: connectRequest.origin,
      address: normalizedAddress,
      payloadHash: connectRequest.payloadHash,
      payload: {
        address: normalizedAddress,
      },
      timestamp: Date.now(),
    });

    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      throw new Error('Relay session closed during connect approval.');
    }
    session.boundAddress = normalizedAddress;
    this.sessions.set(payload.sessionId, session);
    if (!this.activeAccount) {
      this.activeAccount = normalizedAddress;
    }
    this.emit();
    return connectRequest;
  }

  async pairAndApproveConnectAndLoginOnce(
    payload: WalletRelayPairingPayload,
    walletSession: OneTapWalletSession,
    options?: { loginTimeoutMs?: number },
  ): Promise<{ address: string; loginApproved: boolean }> {
    const normalizedAddress = normalizeAddress(walletSession.ethAddress);
    if (!normalizedAddress) {
      throw new Error('Invalid card address for one-tap login approval.');
    }

    let loginRequest: WalletRelayPendingRequest | null = null;
    let loginApproved = false;

    try {
      const connectRequest = await this.pairAndApproveConnect(payload, normalizedAddress);
      if (connectRequest.intent !== 'login') {
        return {
          address: normalizedAddress,
          loginApproved: false,
        };
      }

      loginRequest = await this.waitForOneTapLoginRequest(
        payload.sessionId,
        normalizedAddress,
        options?.loginTimeoutMs ?? AUTO_LOGIN_DETECTION_TIMEOUT_MS,
      );

      const message = String(loginRequest.payload.message ?? '');
      const messageHash = buildEip191HashFromPersonalSignInput(message);
      const signResult = await walletSession.signHash(messageHash);
      if (!signResult.ok || !signResult.signatureDer) {
        throw new Error(signResult.message || 'Failed to sign login message.');
      }

      const signature = derToCompactSignatureHex(signResult.signatureDer);
      await this.sendMessage(payload.sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.approve,
        sessionId: payload.sessionId,
        requestId: loginRequest.requestId,
        chainId: loginRequest.chainId,
        origin: loginRequest.origin,
        address: normalizedAddress,
        payloadHash: loginRequest.payloadHash,
        payload: {
          signature,
        },
        timestamp: Date.now(),
      });
      loginApproved = true;

      return {
        address: normalizedAddress,
        loginApproved,
      };
    } catch (error) {
      if (loginRequest) {
        await this.tryRejectLoginRequest(loginRequest, error);
      }
      this.closeSession(payload.sessionId);

      const message = error instanceof Error ? error.message : String(error);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async approveRequest(requestId: string, pin: string, options?: ApproveRequestOptions): Promise<void> {
    const emitProgress = (status: string) => {
      options?.onProgress?.(status);
    };

    emitProgress('Validating relay request...');
    const request = this.pendingRequests.find(item => item.requestId === requestId);
    if (!request) {
      throw new Error('Relay request not found.');
    }

    const session = this.sessions.get(request.sessionId);
    if (!session) {
      throw new Error('Relay session disconnected.');
    }

    const boundAddress = normalizeAddress(session.boundAddress || request.address);
    if (!boundAddress) {
      throw new Error('Session has no bound address.');
    }
    if (this.activeAccount && this.activeAccount !== boundAddress) {
      throw new Error('Switch active account before approving this request.');
    }

    if (request.type === WALLET_RELAY_MESSAGE_TYPES.signMessage) {
      const message = String(request.payload.message ?? '');
      if (!message) {
        throw new Error('signMessage payload is invalid.');
      }

      emitProgress('Waiting for NFC tap...');
      const signature = await withVerifiedWalletSession(pin, async walletSession => {
        if (normalizeAddress(walletSession.ethAddress) !== boundAddress) {
          throw new Error('Tapped card does not match the session account.');
        }
        emitProgress('Card verified. Signing message...');
        const messageHash = buildEip191HashFromPersonalSignInput(message);
        const signResult = await walletSession.signHash(messageHash);
        if (!signResult.ok || !signResult.signatureDer) {
          throw new Error(signResult.message || 'Failed to sign message.');
        }
        return derToCompactSignatureHex(signResult.signatureDer);
      });

      emitProgress('Sending signature to dApp...');
      await this.sendMessage(session.sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.approve,
        sessionId: session.sessionId,
        requestId: request.requestId,
        chainId: request.chainId,
        address: boundAddress,
        payloadHash: request.payloadHash,
        payload: {
          signature,
        },
        timestamp: Date.now(),
      });
      this.removePendingRequest(request.requestId);
      emitProgress('Request approved.');
      return;
    }

    const transaction = (request.payload.transaction ?? {}) as Record<string, unknown>;
    const to = typeof transaction.to === 'string' ? transaction.to : '';
    const from = normalizeAddress(typeof transaction.from === 'string' ? transaction.from : boundAddress);
    if (!to || !isAddress(to) || !from) {
      throw new Error('signTransaction payload is invalid.');
    }

    const valueWei = parseBigIntLike(transaction.value, 0n);
    const nonce = transaction.nonce === undefined ? undefined : parseBigIntLike(transaction.nonce, 0n);
    const gasPriceWei = transaction.gasPrice === undefined ? undefined : parseBigIntLike(transaction.gasPrice, 0n);
    const gasLimitWei = transaction.gas === undefined ? undefined : parseBigIntLike(transaction.gas, 0n);
    const dataHexRaw = typeof transaction.data === 'string' ? transaction.data : undefined;
    const dataHex = dataHexRaw?.trim() ? dataHexRaw.trim() : undefined;

    emitProgress('Checking transaction prerequisites...');
    const contributionPlan = await this.resolveContributionAutoApprovePlan({
      requestChainId: request.chainId,
      fromAddress: from,
      toAddress: to,
      valueWei,
      dataHex,
    });
    if (contributionPlan?.needsApprove) {
      if (nonce !== undefined) {
        throw new Error(
          'Cannot auto-approve allowance because this request has a fixed nonce. Please approve tcUSD first, then retry.',
        );
      }
      emitProgress('Allowance missing. Will submit approve + contribute in one scan.');
    }

    emitProgress('Waiting for NFC tap...');
    const txHash = await withVerifiedWalletSession(pin, async walletSession => {
      if (normalizeAddress(walletSession.ethAddress) !== boundAddress) {
        throw new Error('Tapped card does not match the session account.');
      }

      const signHash = (hash: Uint8Array) => walletSession.signHash(hash);
      let resolvedNonce = nonce;
      let resolvedGasPrice = gasPriceWei;
      const activeNetwork = getActiveNetwork();
      const client = getPublicViemClient(activeNetwork);

      const waitForSuccessReceipt = async (hash: string, label: string): Promise<void> => {
        emitProgress(`Waiting for ${label} confirmation...`);
        const receipt = await client.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        if (receipt.status !== 'success') {
          throw new Error(`${label} transaction reverted.`);
        }
      };

      if (contributionPlan?.needsApprove) {
        if (contributionPlan.currentAllowance > 0n) {
          emitProgress('Card verified. Resetting old allowance...');
          const resetApprovalDataHex = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [getAddress(contributionPlan.poolAddress), 0n],
          });
          const resetApprovalTx = await sendEthTransaction({
            from,
            to: contributionPlan.stablecoinAddress,
            valueWei: 0n,
            pin,
            signHash,
            nonce: resolvedNonce,
            gasPriceWei: resolvedGasPrice,
            dataHex: resetApprovalDataHex,
            broadcast: true,
          });
          await waitForSuccessReceipt(resetApprovalTx.transactionHash, 'allowance reset');
          resolvedNonce = resetApprovalTx.nonce + 1n;
          resolvedGasPrice = resetApprovalTx.gasPriceWei;
        }

        emitProgress('Signing allowance approval...');
        const approvalDataHex = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [getAddress(contributionPlan.poolAddress), contributionPlan.contributionAmount],
        });
        const approvalTx = await sendEthTransaction({
          from,
          to: contributionPlan.stablecoinAddress,
          valueWei: 0n,
          pin,
          signHash,
          nonce: resolvedNonce,
          gasPriceWei: resolvedGasPrice,
          dataHex: approvalDataHex,
          broadcast: true,
        });
        await waitForSuccessReceipt(approvalTx.transactionHash, 'allowance approval');
        resolvedNonce = approvalTx.nonce + 1n;
        resolvedGasPrice = approvalTx.gasPriceWei;

        const latestAllowance = await client.readContract({
          address: contributionPlan.stablecoinAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [getAddress(from), getAddress(contributionPlan.poolAddress)],
        });
        if (latestAllowance < contributionPlan.contributionAmount) {
          throw new Error('tcUSD allowance is still insufficient after approval.');
        }

        emitProgress('Allowance confirmed. Estimating contribution gas...');
      } else {
        emitProgress('Card verified. Signing and broadcasting transaction...');
      }

      const txResult = await sendEthTransaction({
        from,
        to,
        valueWei,
        pin,
        signHash,
        nonce: resolvedNonce,
        gasPriceWei: resolvedGasPrice,
        gasLimitWei: contributionPlan?.needsApprove ? undefined : gasLimitWei,
        dataHex,
        broadcast: true,
      });
      return txResult.transactionHash;
    });

    emitProgress('Sending tx hash to dApp...');
    await this.sendMessage(session.sessionId, {
      type: WALLET_RELAY_MESSAGE_TYPES.approve,
      sessionId: session.sessionId,
      requestId: request.requestId,
      chainId: request.chainId,
      address: boundAddress,
      payloadHash: request.payloadHash,
      payload: {
        txHash,
      },
      timestamp: Date.now(),
    });
    this.removePendingRequest(request.requestId);
    emitProgress('Request approved.');
  }

  async rejectRequest(requestId: string, reason: string): Promise<void> {
    const request = this.pendingRequests.find(item => item.requestId === requestId);
    if (!request) {
      return;
    }

    await this.sendMessage(request.sessionId, {
      type: WALLET_RELAY_MESSAGE_TYPES.reject,
      sessionId: request.sessionId,
      requestId: request.requestId,
      chainId: request.chainId,
      address: request.address,
      payloadHash: request.payloadHash,
      error: reason.trim() || 'Rejected by user.',
      timestamp: Date.now(),
    });
    this.removePendingRequest(request.requestId);
  }

  private async resolveContributionAutoApprovePlan(params: {
    requestChainId: string;
    fromAddress: string;
    toAddress: string;
    valueWei: bigint;
    dataHex?: string;
  }): Promise<ContributionAutoApprovePlan | null> {
    const data = (params.dataHex ?? '').trim().toLowerCase();
    if (!data || !data.startsWith(CONTRIBUTE_SELECTOR)) {
      return null;
    }
    if (params.valueWei !== 0n) {
      return null;
    }

    const activeNetwork = getActiveNetwork();
    const requestChainId = params.requestChainId.trim();
    if (!requestChainId || requestChainId !== String(activeNetwork.chainId)) {
      console.warn('[wallet-relay][native] contribute.auto_approve.chain_mismatch', {
        requestChainId,
        activeChainId: String(activeNetwork.chainId),
      });
      return null;
    }

    const poolAddress = normalizeAddress(params.toAddress);
    const fromAddress = normalizeAddress(params.fromAddress);
    if (!poolAddress || !fromAddress) {
      return null;
    }

    const client = getPublicViemClient(activeNetwork);
    const [stablecoinRaw, contributionAmountRaw] = await Promise.all([
      client.readContract({
        address: getAddress(poolAddress),
        abi: POOL_FUNDS_ABI,
        functionName: 'stablecoin',
      }),
      client.readContract({
        address: getAddress(poolAddress),
        abi: POOL_FUNDS_ABI,
        functionName: 'contributionAmount',
      }),
    ]);

    const stablecoinAddress = typeof stablecoinRaw === 'string' && isAddress(stablecoinRaw)
      ? getAddress(stablecoinRaw)
      : '';
    if (!stablecoinAddress) {
      throw new Error('Pool stablecoin is not configured.');
    }

    const contributionAmount = typeof contributionAmountRaw === 'bigint'
      ? contributionAmountRaw
      : BigInt(String(contributionAmountRaw ?? '0'));
    if (contributionAmount <= 0n) {
      throw new Error('Invalid pool contribution amount.');
    }

    const [balance, allowance] = await Promise.all([
      client.readContract({
        address: stablecoinAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [getAddress(fromAddress)],
      }),
      client.readContract({
        address: stablecoinAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [getAddress(fromAddress), getAddress(poolAddress)],
      }),
    ]);

    if (balance < contributionAmount) {
      throw new Error('Insufficient tcUSD balance for this contribution.');
    }

    return {
      poolAddress: getAddress(poolAddress),
      stablecoinAddress,
      contributionAmount,
      currentAllowance: allowance,
      needsApprove: allowance < contributionAmount,
    };
  }

  private async connectSession(payload: WalletRelayPairingPayload): Promise<void> {
    const existing = this.sessions.get(payload.sessionId);
    if (existing?.ws && existing.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (existing?.reconnectTimer) {
      clearTimeout(existing.reconnectTimer);
      existing.reconnectTimer = null;
    }

    if (existing?.ws) {
      try {
        existing.ws.onclose = null;
        existing.ws.onmessage = null;
        existing.ws.onerror = null;
        existing.ws.close();
      } catch {
        // no-op
      }
    }

    const wsUrl = `${payload.relayWsBase}/${encodeURIComponent(payload.sessionId)}`
      + `?role=mobile&token=${encodeURIComponent(payload.token)}`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Relay websocket connection timed out.'));
      }, CONNECT_REQUEST_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect relay websocket.'));
      };
    });

    ws.onmessage = event => {
      this.handleIncoming(payload.sessionId, event.data);
    };
    ws.onclose = () => {
      this.handleSessionClosed(payload.sessionId, { allowReconnect: true });
    };

    this.sessions.set(payload.sessionId, {
      sessionId: payload.sessionId,
      chainId: payload.chainId,
      relayWsBase: payload.relayWsBase,
      token: payload.token,
      mobileResumeToken: existing?.mobileResumeToken ?? '',
      ws,
      boundAddress: existing?.boundAddress ?? '',
      connectedAt: existing?.connectedAt ?? Date.now(),
      reconnectAttempts: 0,
      reconnecting: false,
      reconnectTimer: null,
    });
    this.emit();
  }

  private waitForConnectRequest(sessionId: string, timeoutMs: number): Promise<PendingConnectRequest> {
    const existing = this.pendingConnect.get(sessionId);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.connectWaiters.delete(sessionId);
        reject(new Error('Timed out waiting for connect request from dApp.'));
      }, timeoutMs);

      this.connectWaiters.set(sessionId, { resolve, reject, timer });
    });
  }

  private scheduleSessionReconnect(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.mobileResumeToken || session.reconnecting || session.reconnectTimer) {
      return;
    }

    const nextAttempt = session.reconnectAttempts + 1;
    const delay = Math.min(
      AUTO_RECONNECT_MAX_DELAY_MS,
      AUTO_RECONNECT_BASE_DELAY_MS * Math.max(1, nextAttempt),
    );

    session.reconnectTimer = setTimeout(() => {
      const latest = this.sessions.get(sessionId);
      if (!latest) {
        return;
      }

      latest.reconnectTimer = null;
      latest.reconnecting = true;
      this.sessions.set(sessionId, latest);
      this.emit();

      void this.reconnectSession(sessionId);
    }, delay);

    this.sessions.set(sessionId, session);
    console.log('[wallet-relay][native] reconnect.scheduled', {
      sessionIdPreview: `${sessionId.slice(0, 8)}...`,
      attempt: nextAttempt,
      delayMs: delay,
    });
  }

  private async reconnectSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.mobileResumeToken) {
      return;
    }

    try {
      await this.connectSession({
        version: 'v1',
        sessionId: session.sessionId,
        token: session.mobileResumeToken,
        relayWsBase: session.relayWsBase,
        chainId: session.chainId,
      });

      const latest = this.sessions.get(sessionId);
      if (latest) {
        latest.reconnectAttempts = 0;
        latest.reconnecting = false;
        this.sessions.set(sessionId, latest);
      }

      console.log('[wallet-relay][native] reconnect.success', {
        sessionIdPreview: `${sessionId.slice(0, 8)}...`,
      });
    } catch (error) {
      const latest = this.sessions.get(sessionId);
      if (!latest) {
        return;
      }

      latest.reconnecting = false;
      latest.reconnectAttempts += 1;
      this.sessions.set(sessionId, latest);

      console.warn('[wallet-relay][native] reconnect.failed', {
        sessionIdPreview: `${sessionId.slice(0, 8)}...`,
        attempt: latest.reconnectAttempts,
        message: error instanceof Error ? error.message : String(error),
      });
      this.scheduleSessionReconnect(sessionId);
    } finally {
      this.emit();
    }
  }

  private handleIncoming(sessionId: string, raw: unknown) {
    let message: WalletRelayMessage<Record<string, unknown>>;
    try {
      message = JSON.parse(String(raw)) as WalletRelayMessage<Record<string, unknown>>;
    } catch {
      return;
    }

    if (!message.type) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (message.type === WALLET_RELAY_MESSAGE_TYPES.pair) {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const resumeTokenRaw = typeof payload.mobileResumeToken === 'string'
        ? payload.mobileResumeToken.trim()
        : '';
      if (resumeTokenRaw) {
        session.mobileResumeToken = resumeTokenRaw;
      }

      const helloAddress = normalizeAddress(String(message.address ?? ''));
      if (helloAddress && !session.boundAddress) {
        session.boundAddress = helloAddress;
      }

      session.reconnecting = false;
      session.reconnectAttempts = 0;
      this.sessions.set(sessionId, session);
      this.emit();
      return;
    }

    if (!message.requestId) {
      return;
    }

    if (message.type === WALLET_RELAY_MESSAGE_TYPES.connect) {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const intentRaw = typeof payload.intent === 'string'
        ? payload.intent.trim().toLowerCase()
        : '';
      const connectRequest: PendingConnectRequest = {
        sessionId,
        requestId: message.requestId,
        chainId: String(message.chainId ?? session.chainId),
        origin: String(message.origin ?? ''),
        payloadHash: String(message.payloadHash ?? ''),
        intent: intentRaw === 'login' ? 'login' : 'default',
      };
      this.pendingConnect.set(sessionId, connectRequest);

      const waiter = this.connectWaiters.get(sessionId);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.connectWaiters.delete(sessionId);
        waiter.resolve(connectRequest);
      }
      return;
    }

    if (message.type !== WALLET_RELAY_MESSAGE_TYPES.signMessage && message.type !== WALLET_RELAY_MESSAGE_TYPES.signTransaction) {
      return;
    }

    const requestAddress = normalizeAddress(String(message.address ?? session.boundAddress));
    if (!requestAddress) {
      void this.sendMessage(sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.error,
        sessionId,
        requestId: message.requestId,
        error: 'Invalid request address.',
        timestamp: Date.now(),
      });
      return;
    }

    if (session.boundAddress && requestAddress !== normalizeAddress(session.boundAddress)) {
      void this.sendMessage(sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.reject,
        sessionId,
        requestId: message.requestId,
        payloadHash: String(message.payloadHash ?? ''),
        error: 'Session account mismatch.',
        timestamp: Date.now(),
      });
      return;
    }

    const pending: WalletRelayPendingRequest = {
      requestId: message.requestId,
      sessionId,
      type: message.type,
      chainId: String(message.chainId ?? session.chainId),
      origin: String(message.origin ?? ''),
      address: requestAddress,
      payloadHash: String(message.payloadHash ?? ''),
      payload: (message.payload ?? {}) as Record<string, unknown>,
      requiresSwitch: this.activeAccount !== '' && this.activeAccount !== requestAddress,
    };

    const existingDuplicate = this.pendingRequests.find(item =>
      item.sessionId === pending.sessionId
      && item.type === pending.type
      && item.address === pending.address
      && item.payloadHash === pending.payloadHash);
    if (existingDuplicate) {
      void this.sendMessage(sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.reject,
        sessionId,
        requestId: existingDuplicate.requestId,
        chainId: existingDuplicate.chainId,
        origin: existingDuplicate.origin,
        address: existingDuplicate.address,
        payloadHash: existingDuplicate.payloadHash,
        error: 'REQUEST_REPLACED_BY_NEWER',
        timestamp: Date.now(),
      }).catch(error => {
        console.warn('[wallet-relay][native] duplicate.replace_reject_failed', {
          sessionId,
          requestId: existingDuplicate.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      this.pendingRequests = this.pendingRequests.filter(item => item.requestId !== existingDuplicate.requestId);
    }

    const isLoginSignMessage = pending.type === WALLET_RELAY_MESSAGE_TYPES.signMessage
      && isLoginSignMessagePayload(pending.payload);
    if (isLoginSignMessage) {
      const oneTapWaiter = this.oneTapLoginWaiters.get(sessionId);
      if (oneTapWaiter && pending.address === oneTapWaiter.address) {
        clearTimeout(oneTapWaiter.timer);
        this.oneTapLoginWaiters.delete(sessionId);
        oneTapWaiter.resolve(pending);
        return;
      }

      void this.sendMessage(sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.reject,
        sessionId,
        requestId: pending.requestId,
        chainId: pending.chainId,
        origin: pending.origin,
        address: pending.address,
        payloadHash: pending.payloadHash,
        error: REJECT_REASON_LOGIN_SCAN_REQUIRED,
        timestamp: Date.now(),
      }).catch(error => {
        console.warn('[wallet-relay][native] login.reject_failed', {
          sessionId,
          requestId: pending.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      return;
    }

    this.pendingRequests = this.pendingRequests.filter(item => item.requestId !== pending.requestId);
    this.pendingRequests.push(pending);
    this.emit();
  }

  private handleSessionClosed(sessionId: string, options?: { allowReconnect?: boolean }) {
    const session = this.sessions.get(sessionId);
    const allowReconnect = Boolean(options?.allowReconnect);

    this.pendingConnect.delete(sessionId);
    this.pendingRequests = this.pendingRequests.filter(request => request.sessionId !== sessionId);

    const oneTapWaiter = this.oneTapLoginWaiters.get(sessionId);
    if (oneTapWaiter) {
      clearTimeout(oneTapWaiter.timer);
      this.oneTapLoginWaiters.delete(sessionId);
      oneTapWaiter.reject(new Error('Relay session closed before one-tap login request.'));
    }

    const waiter = this.connectWaiters.get(sessionId);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.connectWaiters.delete(sessionId);
      waiter.reject(new Error('Relay session closed before connect approval.'));
    }

    if (!session) {
      this.emit();
      return;
    }

    session.ws = null;
    session.reconnecting = false;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    if (allowReconnect && session.mobileResumeToken) {
      this.sessions.set(sessionId, session);
      this.scheduleSessionReconnect(sessionId);
    } else {
      this.sessions.delete(sessionId);
    }

    this.emit();
  }

  private async sendMessage(sessionId: string, message: WalletRelayMessage<Record<string, unknown>>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Relay websocket is not connected.');
    }
    session.ws.send(JSON.stringify(message));
  }

  private removePendingRequest(requestId: string) {
    this.pendingRequests = this.pendingRequests.filter(request => request.requestId !== requestId);
    this.emit();
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => {
      listener(snapshot);
    });
  }

  private waitForOneTapLoginRequest(
    sessionId: string,
    address: string,
    timeoutMs: number,
  ): Promise<WalletRelayPendingRequest> {
    const normalizedSession = sessionId.trim();
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedSession || !normalizedAddress) {
      return Promise.reject(new Error('Invalid one-tap login session.'));
    }

    const existing = this.oneTapLoginWaiters.get(normalizedSession);
    if (existing) {
      clearTimeout(existing.timer);
      this.oneTapLoginWaiters.delete(normalizedSession);
      existing.reject(new Error('Replaced by newer one-tap login request.'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.oneTapLoginWaiters.delete(normalizedSession);
        reject(new Error('Timed out waiting for login signMessage request.'));
      }, Math.max(timeoutMs, 5_000));

      this.oneTapLoginWaiters.set(normalizedSession, {
        address: normalizedAddress,
        resolve,
        reject,
        timer,
      });
    });
  }

  private async tryRejectLoginRequest(request: WalletRelayPendingRequest, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const reason = lower.includes('reject') || lower.includes('cancel')
      ? REJECT_REASON_USER_REJECTED
      : REJECT_REASON_LOGIN_SCAN_REQUIRED;

    try {
      await this.sendMessage(request.sessionId, {
        type: WALLET_RELAY_MESSAGE_TYPES.reject,
        sessionId: request.sessionId,
        requestId: request.requestId,
        chainId: request.chainId,
        origin: request.origin,
        address: request.address,
        payloadHash: request.payloadHash,
        error: reason,
        timestamp: Date.now(),
      });
    } catch (sendError) {
      console.warn('[wallet-relay][native] login.reject_failed', {
        sessionId: request.sessionId,
        requestId: request.requestId,
        reason,
        message: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  }

  private closeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = null;
      }
      if (session.ws) {
        session.ws.onclose = null;
        session.ws.onmessage = null;
        session.ws.onerror = null;
        try {
          session.ws.close();
        } catch {
          // no-op
        }
      }
    }

    this.handleSessionClosed(sessionId, { allowReconnect: false });
  }
}

export const walletRelaySessionManager = new WalletRelaySessionManager();
