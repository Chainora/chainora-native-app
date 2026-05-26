type EnvMap = Record<string, string | undefined>;

export type BuiltInNetworkKey =
  | 'ethMainnet'
  | 'bscMainnet'
  | 'polygonMainnet'
  | 'optimismMainnet'
  | 'arbitrumMainnet'
  | 'eth'
  | 'polygon'
  | 'bnb'
  | 'chainora';

export type ImportedNetworkKey = `imported:${string}`;
export type NetworkKey = BuiltInNetworkKey | ImportedNetworkKey;
export type WalletHomeNetworkKey = NetworkKey;

export type NetworkConfig = {
  key: NetworkKey;
  name: string;
  shortName: string;
  chainId: number;
  rpcUrl: string;
  currencySymbol: string;
  nativeAssetName: string;
  glyph: string;
  iconBackground: string;
  iconBorder: string;
  stablecoinAddress?: string;
  stablecoinDecimals?: number;
  portfolioTokenAddress?: string;
  portfolioTokenDecimals?: number;
  portfolioTokenSymbol?: string;
  priceTickerSymbol?: string;
  visibleInHome?: boolean;
};

const getEnvMap = (): EnvMap => {
  const candidate = globalThis as { process?: { env?: EnvMap } };
  return candidate.process?.env ?? {};
};

const readEnvVar = (key: string, fallback: string): string => {
  const value = getEnvMap()[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const LOCAL_RPC_ETH = 'http://127.0.0.1:8545';
const LOCAL_RPC_POLYGON = 'http://127.0.0.1:8546';
const LOCAL_RPC_BNB = 'http://127.0.0.1:8547';
const CHAINORA_RPC = readEnvVar('CHAINORA_RPC_URL', 'http://157.66.100.120:8545/');
const CHAINORA_CHAIN_ID = Number(readEnvVar('CHAINORA_CHAIN_ID', '1123337227327254'));
const CHAINORA_STABLECOIN_ADDRESS = '0x79abce4dc09dce832361090d35ba8ae051cd1fd6';

const ETHEREUM_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_ETH_RPC_URL', 'https://ethereum-rpc.publicnode.com');
const BSC_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_BSC_RPC_URL', 'https://bsc-rpc.publicnode.com');
const POLYGON_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_POLYGON_RPC_URL', 'https://polygon-bor-rpc.publicnode.com');
const OPTIMISM_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_OPTIMISM_RPC_URL', 'https://optimism-rpc.publicnode.com');
const ARBITRUM_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_ARBITRUM_RPC_URL', 'https://arbitrum-one-rpc.publicnode.com');
const ARBITRUM_TOKEN_ADDRESS = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const OPTIMISM_TOKEN_ADDRESS = '0x4200000000000000000000000000000000000042';

export const NETWORKS: Record<BuiltInNetworkKey, NetworkConfig> = {
  ethMainnet: {
    key: 'ethMainnet',
    name: 'Ethereum',
    shortName: 'ETH',
    chainId: 1,
    rpcUrl: ETHEREUM_PUBLIC_RPC,
    currencySymbol: 'ETH',
    nativeAssetName: 'Ethereum',
    glyph: 'E',
    iconBackground: '#627EEA',
    iconBorder: '#2A3A7E',
    visibleInHome: true,
  },
  bscMainnet: {
    key: 'bscMainnet',
    name: 'BNB Smart Chain',
    shortName: 'BNB',
    chainId: 56,
    rpcUrl: BSC_PUBLIC_RPC,
    currencySymbol: 'BNB',
    nativeAssetName: 'BNB',
    glyph: 'B',
    iconBackground: '#F3BA2F',
    iconBorder: '#8A6300',
    visibleInHome: true,
  },
  polygonMainnet: {
    key: 'polygonMainnet',
    name: 'Polygon',
    shortName: 'POL',
    chainId: 137,
    rpcUrl: POLYGON_PUBLIC_RPC,
    currencySymbol: 'POL',
    nativeAssetName: 'Polygon',
    glyph: 'P',
    iconBackground: '#8247E5',
    iconBorder: '#412080',
    visibleInHome: true,
  },
  arbitrumMainnet: {
    key: 'arbitrumMainnet',
    name: 'Arbitrum',
    shortName: 'ARB',
    chainId: 42161,
    rpcUrl: ARBITRUM_PUBLIC_RPC,
    currencySymbol: 'ETH',
    nativeAssetName: 'Ether',
    glyph: 'A',
    iconBackground: '#28A0F0',
    iconBorder: '#134F79',
    portfolioTokenAddress: ARBITRUM_TOKEN_ADDRESS,
    portfolioTokenDecimals: 18,
    portfolioTokenSymbol: 'ARB',
    priceTickerSymbol: 'ARBUSDT',
    visibleInHome: true,
  },
  optimismMainnet: {
    key: 'optimismMainnet',
    name: 'Optimism',
    shortName: 'OP',
    chainId: 10,
    rpcUrl: OPTIMISM_PUBLIC_RPC,
    currencySymbol: 'ETH',
    nativeAssetName: 'Ether',
    glyph: 'O',
    iconBackground: '#FF0420',
    iconBorder: '#950215',
    portfolioTokenAddress: OPTIMISM_TOKEN_ADDRESS,
    portfolioTokenDecimals: 18,
    portfolioTokenSymbol: 'OP',
    priceTickerSymbol: 'OPUSDT',
    visibleInHome: true,
  },
  eth: {
    key: 'eth',
    name: 'Local ETH',
    shortName: 'ETH DEV',
    chainId: 31337,
    rpcUrl: LOCAL_RPC_ETH,
    currencySymbol: 'ETH',
    nativeAssetName: 'Ethereum',
    glyph: 'E',
    iconBackground: '#627EEA',
    iconBorder: '#2A3A7E',
  },
  polygon: {
    key: 'polygon',
    name: 'Local Polygon',
    shortName: 'POL DEV',
    chainId: 80002,
    rpcUrl: LOCAL_RPC_POLYGON,
    currencySymbol: 'MATIC',
    nativeAssetName: 'Polygon',
    glyph: 'P',
    iconBackground: '#8247E5',
    iconBorder: '#412080',
  },
  bnb: {
    key: 'bnb',
    name: 'Local BNB',
    shortName: 'BNB DEV',
    chainId: 97,
    rpcUrl: LOCAL_RPC_BNB,
    currencySymbol: 'BNB',
    nativeAssetName: 'BNB',
    glyph: 'B',
    iconBackground: '#F3BA2F',
    iconBorder: '#8A6300',
  },
  chainora: {
    key: 'chainora',
    name: 'Chainora Testnet',
    shortName: 'CHAINORA',
    chainId: CHAINORA_CHAIN_ID,
    rpcUrl: CHAINORA_RPC,
    currencySymbol: 'tcUSD',
    nativeAssetName: 'tcUSD',
    glyph: 'C',
    iconBackground: '#1A8DFF',
    iconBorder: '#0B3F73',
    stablecoinAddress: CHAINORA_STABLECOIN_ADDRESS,
    stablecoinDecimals: 18,
  },
};

const BUILTIN_WALLET_HOME_NETWORK_KEYS = [
  'ethMainnet',
  'bscMainnet',
  'polygonMainnet',
  'arbitrumMainnet',
  'optimismMainnet',
] as const satisfies readonly BuiltInNetworkKey[];

export const WALLET_HOME_NETWORK_KEYS = [...BUILTIN_WALLET_HOME_NETWORK_KEYS];

let importedNetworks: Record<ImportedNetworkKey, NetworkConfig> = {};
let activeNetworkKey: NetworkKey = 'chainora';

const registryListeners = new Set<() => void>();

const emitNetworkRegistryChanged = () => {
  registryListeners.forEach(listener => {
    listener();
  });
};

const getNetworkRegistry = (): Record<NetworkKey, NetworkConfig> => ({
  ...(NETWORKS as Record<NetworkKey, NetworkConfig>),
  ...(importedNetworks as Record<NetworkKey, NetworkConfig>),
});

const normalizeImportedNetwork = (network: NetworkConfig): NetworkConfig => ({
  ...network,
  visibleInHome: network.visibleInHome !== false,
  shortName: network.shortName.trim() || network.currencySymbol.trim().toUpperCase(),
  currencySymbol: network.currencySymbol.trim().toUpperCase(),
  nativeAssetName: network.nativeAssetName.trim() || network.name.trim(),
  portfolioTokenAddress: network.portfolioTokenAddress?.trim(),
  portfolioTokenDecimals: network.portfolioTokenDecimals,
  portfolioTokenSymbol: network.portfolioTokenSymbol?.trim().toUpperCase(),
  priceTickerSymbol: network.priceTickerSymbol?.trim().toUpperCase(),
  name: network.name.trim(),
  rpcUrl: network.rpcUrl.trim(),
});

const toImportedNetworkKey = (key: string): ImportedNetworkKey => {
  if (key.startsWith('imported:')) {
    return key as ImportedNetworkKey;
  }
  return `imported:${key}` as ImportedNetworkKey;
};

export const subscribeNetworkRegistry = (listener: () => void): (() => void) => {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
};

export const setImportedNetworks = (networks: NetworkConfig[]): void => {
  const next: Record<ImportedNetworkKey, NetworkConfig> = {};

  networks.forEach(network => {
    if (network.key in NETWORKS) {
      return;
    }

    const key = toImportedNetworkKey(network.key);
    next[key] = normalizeImportedNetwork({
      ...network,
      key,
    });
  });

  importedNetworks = next;

  const registry = getNetworkRegistry();
  if (!registry[activeNetworkKey]) {
    activeNetworkKey = 'chainora';
  }

  emitNetworkRegistryChanged();
};

export const upsertImportedNetwork = (network: NetworkConfig): NetworkConfig => {
  if (network.key in NETWORKS) {
    throw new Error(`Cannot overwrite built-in network key: ${network.key}`);
  }

  const key = toImportedNetworkKey(network.key);
  const next = normalizeImportedNetwork({
    ...network,
    key,
  });

  importedNetworks = {
    ...importedNetworks,
    [key]: next,
  };

  emitNetworkRegistryChanged();
  return next;
};

export const getNetworkConfig = (key: NetworkKey): NetworkConfig => {
  const network = getNetworkRegistry()[key];
  if (!network) {
    throw new Error(`Unknown network key: ${key}`);
  }
  return network;
};

export const getNetworkConfigByChainId = (chainId: number): NetworkConfig | null => {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return null;
  }

  return getNetworkList().find(network => network.chainId === chainId) ?? null;
};

export const getActiveNetwork = (): NetworkConfig => getNetworkConfig(activeNetworkKey);

export const setActiveNetwork = (key: NetworkKey): NetworkConfig => {
  if (!getNetworkRegistry()[key]) {
    throw new Error(`Unknown active network key: ${key}`);
  }

  activeNetworkKey = key;
  return getActiveNetwork();
};

export const getNetworkList = (): NetworkConfig[] => Object.values(getNetworkRegistry());

export const getWalletHomeNetworks = (): NetworkConfig[] => {
  const builtins = BUILTIN_WALLET_HOME_NETWORK_KEYS.map(key => NETWORKS[key]);
  const imported = Object.values(importedNetworks).filter(network => network.visibleInHome !== false);
  return [...builtins, ...imported];
};

export const getWalletHomeNetworkKeys = (): NetworkKey[] =>
  getWalletHomeNetworks().map(network => network.key);

export const isWalletHomeNetworkKey = (key: string): key is WalletHomeNetworkKey =>
  getWalletHomeNetworkKeys().includes(key as NetworkKey);
