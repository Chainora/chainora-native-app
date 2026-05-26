export const WALLET_RELAY_MESSAGE_TYPES = {
  pair: 'pair',
  connect: 'connect',
  signMessage: 'signMessage',
  signTransaction: 'signTransaction',
  approve: 'approve',
  reject: 'reject',
  error: 'error',
} as const;

export type WalletRelayMessageType = (typeof WALLET_RELAY_MESSAGE_TYPES)[keyof typeof WALLET_RELAY_MESSAGE_TYPES];

export type WalletRelayMessage<TPayload = Record<string, unknown>> = {
  type: WalletRelayMessageType;
  sessionId?: string;
  requestId?: string;
  timestamp?: number;
  chainId?: string;
  origin?: string;
  address?: string;
  payloadHash?: string;
  payload?: TPayload;
  error?: string;
};

export type WalletRelayPairingPayload = {
  version: string;
  sessionId: string;
  token: string;
  relayWsBase: string;
  chainId: string;
};
