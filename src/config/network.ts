export type NetworkKey = 'eth' | 'polygon' | 'bnb' | 'chainora';

export type NetworkConfig = {
  key: NetworkKey;
  name: string;
  chainId: number;
  rpcUrl: string;
  currencySymbol: string;
  stablecoinAddress?: string;
  stablecoinDecimals?: number;
};

const LOCAL_RPC_ETH = 'http://127.0.0.1:8545';
const LOCAL_RPC_POLYGON = 'http://127.0.0.1:8546';
const LOCAL_RPC_BNB = 'http://127.0.0.1:8547';
const CHAINORA_RPC = 'http://157.66.100.120:8545/';
// Keep this in sync with chainora-dapp `VITE_CHAINORA_STABLECOIN_ADDRESS`.
const CHAINORA_STABLECOIN_ADDRESS = '0x79abce4dc09dce832361090d35ba8ae051cd1fd6';

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  eth: {
    key: 'eth',
    name: 'Local ETH',
    chainId: 31337,
    rpcUrl: LOCAL_RPC_ETH,
    currencySymbol: 'ETH',
  },
  polygon: {
    key: 'polygon',
    name: 'Local Polygon',
    chainId: 80002,
    rpcUrl: LOCAL_RPC_POLYGON,
    currencySymbol: 'MATIC',
  },
  bnb: {
    key: 'bnb',
    name: 'Local BNB',
    chainId: 97,
    rpcUrl: LOCAL_RPC_BNB,
    currencySymbol: 'BNB',
  },
  chainora: {
    key: 'chainora',
    name: 'Chainora Testnet',
    chainId: 1123337227327254,
    rpcUrl: CHAINORA_RPC,
    currencySymbol: 'tcUSD',
    stablecoinAddress: CHAINORA_STABLECOIN_ADDRESS,
    stablecoinDecimals: 18,
  },
};

let activeNetworkKey: NetworkKey = 'chainora';

export const getActiveNetwork = (): NetworkConfig => NETWORKS[activeNetworkKey];

export const setActiveNetwork = (key: NetworkKey): NetworkConfig => {
  activeNetworkKey = key;
  return getActiveNetwork();
};

export const getNetworkList = (): NetworkConfig[] => Object.values(NETWORKS);
