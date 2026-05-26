type EnvMap = Record<string, string | undefined>;

export type BuiltInNetworkKey =
  | 'ethMainnet'
  | 'bscMainnet'
  | 'polygonMainnet'
  | 'optimismMainnet'
  | 'arbitrumMainnet';

export type NetworkKey = BuiltInNetworkKey;
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
};

export const WALLET_HOME_NETWORK_KEYS = [
  'ethMainnet',
  'bscMainnet',
  'polygonMainnet',
  'arbitrumMainnet',
  'optimismMainnet',
] as const satisfies readonly BuiltInNetworkKey[];

let activeNetworkKey: NetworkKey = 'ethMainnet';

const registryListeners = new Set<() => void>();

const emitNetworkRegistryChanged = () => {
  registryListeners.forEach(listener => {
    listener();
  });
};

const getNetworkRegistry = (): Record<NetworkKey, NetworkConfig> => NETWORKS;

export const subscribeNetworkRegistry = (listener: () => void): (() => void) => {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
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
  emitNetworkRegistryChanged();
  return getActiveNetwork();
};

export const getNetworkList = (): NetworkConfig[] => Object.values(getNetworkRegistry());

export const getWalletHomeNetworks = (): NetworkConfig[] => {
  return WALLET_HOME_NETWORK_KEYS.map(key => NETWORKS[key]);
};

export const getWalletHomeNetworkKeys = (): WalletHomeNetworkKey[] =>
  getWalletHomeNetworks().map(network => network.key);

export const isWalletHomeNetworkKey = (key: string): key is WalletHomeNetworkKey =>
  getWalletHomeNetworkKeys().includes(key as WalletHomeNetworkKey);
