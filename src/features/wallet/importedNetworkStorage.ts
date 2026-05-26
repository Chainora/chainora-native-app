import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  setImportedNetworks,
  type ImportedNetworkKey,
  type NetworkConfig,
} from '../../config/network';

const STORAGE_KEY = '@chainora/walletHome/importedNetworks';

type StoredImportedNetwork = Omit<NetworkConfig, 'key'> & {
  key: ImportedNetworkKey;
};

const COLOR_PALETTE: Array<{ background: string; border: string }> = [
  { background: '#0EA5E9', border: '#0369A1' },
  { background: '#22C55E', border: '#15803D' },
  { background: '#F97316', border: '#C2410C' },
  { background: '#A855F7', border: '#7E22CE' },
  { background: '#EC4899', border: '#BE185D' },
  { background: '#14B8A6', border: '#0F766E' },
  { background: '#6366F1', border: '#4338CA' },
];

const normalizeText = (value: string): string => value.trim();

const normalizeSymbol = (value: string): string =>
  value.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();

const normalizeRpcUrl = (value: string): string => value.trim();

const buildGlyph = (symbol: string, name: string): string => {
  const candidate = symbol.trim() || name.trim();
  if (!candidate) {
    return 'N';
  }
  return candidate.slice(0, 1).toUpperCase();
};

const slugify = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'network';
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const pickPalette = (seed: string) => COLOR_PALETTE[hashString(seed) % COLOR_PALETTE.length];

const toImportedNetworkKey = (value: string): ImportedNetworkKey => {
  if (value.startsWith('imported:')) {
    return value as ImportedNetworkKey;
  }
  return `imported:${value}` as ImportedNetworkKey;
};

const buildImportedNetworkKey = (name: string, chainId: number): ImportedNetworkKey =>
  toImportedNetworkKey(`${slugify(name)}-${chainId}`);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizeStoredNetwork = (value: unknown): StoredImportedNetwork | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<StoredImportedNetwork>;
  if (
    typeof candidate.key !== 'string'
    || typeof candidate.name !== 'string'
    || typeof candidate.shortName !== 'string'
    || !isFiniteNumber(candidate.chainId)
    || typeof candidate.rpcUrl !== 'string'
    || typeof candidate.currencySymbol !== 'string'
    || typeof candidate.nativeAssetName !== 'string'
    || typeof candidate.glyph !== 'string'
    || typeof candidate.iconBackground !== 'string'
    || typeof candidate.iconBorder !== 'string'
  ) {
    return null;
  }

  const normalizedKey = toImportedNetworkKey(candidate.key);
  const symbol = normalizeSymbol(candidate.currencySymbol);
  const name = normalizeText(candidate.name);
  const shortName = normalizeText(candidate.shortName) || symbol;

  return {
    key: normalizedKey,
    name,
    shortName,
    chainId: Math.trunc(candidate.chainId),
    rpcUrl: normalizeRpcUrl(candidate.rpcUrl),
    currencySymbol: symbol,
    nativeAssetName: normalizeText(candidate.nativeAssetName) || name,
    glyph: buildGlyph(candidate.glyph, name),
    iconBackground: candidate.iconBackground,
    iconBorder: candidate.iconBorder,
    visibleInHome: candidate.visibleInHome !== false,
    stablecoinAddress:
      typeof candidate.stablecoinAddress === 'string'
        ? normalizeText(candidate.stablecoinAddress)
        : undefined,
    stablecoinDecimals: isFiniteNumber(candidate.stablecoinDecimals)
      ? Math.trunc(candidate.stablecoinDecimals)
      : undefined,
  };
};

const readStoredImportedNetworks = async (): Promise<StoredImportedNetwork[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(item => sanitizeStoredNetwork(item))
      .filter((item): item is StoredImportedNetwork => Boolean(item));
  } catch {
    return [];
  }
};

const persistImportedNetworks = async (networks: StoredImportedNetwork[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(networks));
};

export const loadImportedNetworks = async (): Promise<NetworkConfig[]> => {
  const networks = await readStoredImportedNetworks();
  setImportedNetworks(networks);
  return networks;
};

export const detectChainIdFromRpc = async (rpcUrl: string): Promise<number> => {
  const normalizedUrl = normalizeRpcUrl(rpcUrl);
  if (!normalizedUrl) {
    throw new Error('RPC URL is required.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 8_000);

  try {
    const response = await fetch(normalizedUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RPC responded with ${response.status}`);
    }

    const payload = (await response.json()) as {
      result?: string;
      error?: { message?: string };
    };

    if (typeof payload.result !== 'string') {
      throw new Error(payload.error?.message || 'RPC returned no chainId');
    }

    const chainId = Number.parseInt(payload.result, 16);
    if (!Number.isFinite(chainId) || chainId <= 0) {
      throw new Error('Invalid chainId from RPC');
    }

    return chainId;
  } finally {
    clearTimeout(timer);
  }
};

export type SaveImportedNetworkInput = {
  name: string;
  rpcUrl: string;
  currencySymbol: string;
  chainId: number;
  nativeAssetName?: string;
};

export const saveImportedNetwork = async (
  input: SaveImportedNetworkInput,
): Promise<NetworkConfig> => {
  const name = normalizeText(input.name);
  const rpcUrl = normalizeRpcUrl(input.rpcUrl);
  const currencySymbol = normalizeSymbol(input.currencySymbol);
  const chainId = Math.trunc(input.chainId);

  if (!name) {
    throw new Error('Network name is required.');
  }
  if (!rpcUrl) {
    throw new Error('RPC URL is required.');
  }
  if (!currencySymbol) {
    throw new Error('Currency symbol is required.');
  }
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('Invalid chainId.');
  }

  const existing = await readStoredImportedNetworks();
  const existingMatch = existing.find(
    network => network.chainId === chainId && network.rpcUrl.toLowerCase() === rpcUrl.toLowerCase(),
  );
  const key = existingMatch?.key ?? buildImportedNetworkKey(name, chainId);
  const palette = pickPalette(`${key}:${currencySymbol}`);

  const nextNetwork: StoredImportedNetwork = {
    key,
    name,
    shortName: currencySymbol,
    chainId,
    rpcUrl,
    currencySymbol,
    nativeAssetName: normalizeText(input.nativeAssetName ?? '') || name,
    glyph: buildGlyph(currencySymbol, name),
    iconBackground: palette.background,
    iconBorder: palette.border,
    visibleInHome: true,
  };

  const next = [
    ...existing.filter(network => network.key !== key),
    nextNetwork,
  ];

  await persistImportedNetworks(next);
  setImportedNetworks(next);

  return nextNetwork;
};
