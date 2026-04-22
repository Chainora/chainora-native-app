const DEFAULT_WALLETCONNECT_PROJECT_ID = 'f18b36387b29270d62dd0b4798411d5d';
const DEFAULT_WALLETCONNECT_RELAY_URL = 'wss://relay.walletconnect.com';

const readEnvValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const runtimeEnv =
  typeof globalThis !== 'undefined' && 'process' in globalThis
    ? (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env
    : undefined;

export const WALLETCONNECT_PROJECT_ID =
  readEnvValue(runtimeEnv?.WALLETCONNECT_PROJECT_ID) ||
  readEnvValue(runtimeEnv?.VITE_WALLETCONNECT_PROJECT_ID) ||
  DEFAULT_WALLETCONNECT_PROJECT_ID;

export const WALLETCONNECT_RELAY_URL =
  readEnvValue(runtimeEnv?.WALLETCONNECT_RELAY_URL) ||
  DEFAULT_WALLETCONNECT_RELAY_URL;

export const WALLETCONNECT_APP_METADATA = {
  name: 'Chainora Native Wallet',
  description: 'Card-backed wallet signer for Chainora.',
  url: 'https://chainora.app',
  icons: ['https://chainora.app/icon.png'],
  redirect: {
    native: 'chainora://wc',
  },
};

export const WALLETCONNECT_PLACEHOLDER_PROJECT_ID = '__TODO__';
