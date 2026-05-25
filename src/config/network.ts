type EnvMap = Record<string, string | undefined>;

export type NetworkKey =
  | 'ethMainnet'
  | 'bscMainnet'
  | 'polygonMainnet'
  | 'baseMainnet'
  | 'arbitrumMainnet'
  | 'eth'
  | 'polygon'
  | 'bnb'
  | 'chainora';

export type WalletHomeNetworkKey = Extract<
  NetworkKey,
  'ethMainnet' | 'bscMainnet' | 'polygonMainnet' | 'baseMainnet' | 'arbitrumMainnet'
>;

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
const BASE_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_BASE_RPC_URL', 'https://base-rpc.publicnode.com');
const ARBITRUM_PUBLIC_RPC = readEnvVar('CHAINORA_PUBLIC_ARBITRUM_RPC_URL', 'https://arbitrum-one-rpc.publicnode.com');

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
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
  baseMainnet: {
    key: 'baseMainnet',
    name: 'Base',
    shortName: 'BASE',
    chainId: 8453,
    rpcUrl: BASE_PUBLIC_RPC,
    currencySymbol: 'BASE',
    nativeAssetName: 'Base Ether',
    glyph: 'B',
    iconBackground: '#0052FF',
    iconBorder: '#002C88',
    visibleInHome: true,
  },
  arbitrumMainnet: {
    key: 'arbitrumMainnet',
    name: 'Arbitrum',
    shortName: 'ARB',
    chainId: 42161,
    rpcUrl: ARBITRUM_PUBLIC_RPC,
    currencySymbol: 'ARB',
    nativeAssetName: 'Arbitrum Ether',
    glyph: 'A',
    iconBackground: '#28A0F0',
    iconBorder: '#134F79',
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

export const WALLET_HOME_NETWORK_KEYS = [
  'ethMainnet',
  'bscMainnet',
  'polygonMainnet',
  'baseMainnet',
  'arbitrumMainnet',
] as const satisfies readonly WalletHomeNetworkKey[];

export const WALLET_HOME_NETWORKS = WALLET_HOME_NETWORK_KEYS.map(key => NETWORKS[key]);

export const WALLET_NATIVE_PRICE_USD: Record<WalletHomeNetworkKey, number> = {
  ethMainnet: 3498.24,
  bscMainnet: 611.42,
  polygonMainnet: 0.74,
  baseMainnet: 3498.24,
  arbitrumMainnet: 3498.24,
};

let activeNetworkKey: NetworkKey = 'chainora';

export const getNetworkConfig = (key: NetworkKey): NetworkConfig => NETWORKS[key];

export const getActiveNetwork = (): NetworkConfig => NETWORKS[activeNetworkKey];

export const setActiveNetwork = (key: NetworkKey): NetworkConfig => {
  activeNetworkKey = key;
  return getActiveNetwork();
};

export const getNetworkList = (): NetworkConfig[] => Object.values(NETWORKS);

export const getWalletHomeNetworks = (): NetworkConfig[] => WALLET_HOME_NETWORKS;

export const isWalletHomeNetworkKey = (key: string): key is WalletHomeNetworkKey =>
  WALLET_HOME_NETWORK_KEYS.includes(key as WalletHomeNetworkKey);
