import {
  WALLETCONNECT_PROJECT_ID as DOTENV_WALLETCONNECT_PROJECT_ID,
  WALLETCONNECT_RELAY_URL as DOTENV_WALLETCONNECT_RELAY_URL,
} from '@env';

const DEFAULT_WALLETCONNECT_RELAY_URL = 'wss://relay.walletconnect.com';
export const WALLETCONNECT_PLACEHOLDER_PROJECT_ID = '__TODO__';

const readEnvValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const runtimeEnv =
  typeof globalThis !== 'undefined' && 'process' in globalThis
    ? (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env
    : undefined;

export const WALLETCONNECT_PROJECT_ID =
  readEnvValue(DOTENV_WALLETCONNECT_PROJECT_ID) ||
  readEnvValue(runtimeEnv?.WALLETCONNECT_PROJECT_ID) ||
  readEnvValue(runtimeEnv?.VITE_WALLETCONNECT_PROJECT_ID) ||
  WALLETCONNECT_PLACEHOLDER_PROJECT_ID;

export const WALLETCONNECT_RELAY_URL =
  readEnvValue(DOTENV_WALLETCONNECT_RELAY_URL) ||
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
