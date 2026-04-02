import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient } from 'viem';

import { NETWORKS, type NetworkConfig } from '../config/network';

const RPC_TIMEOUT_MS = 10_000;

type NetworkRecord = typeof NETWORKS;

const buildRpcCandidates = (rpcUrl: string): string[] => {
  const unique = new Set<string>([rpcUrl]);

  try {
    const parsed = new URL(rpcUrl);
    const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';

    if (!isLocalHost) {
      return Array.from(unique);
    }

    ['10.0.2.2', '10.0.3.2', 'localhost', '127.0.0.1'].forEach(host => {
      const candidate = new URL(rpcUrl);
      candidate.hostname = host;
      unique.add(candidate.toString());
    });
  } catch {
    return Array.from(unique);
  }

  return Array.from(unique);
};

const toChain = (network: NetworkConfig): Chain =>
  defineChain({
    id: network.chainId,
    name: network.name,
    network: network.key,
    nativeCurrency: {
      name: network.currencySymbol,
      symbol: network.currencySymbol,
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: buildRpcCandidates(network.rpcUrl),
      },
      public: {
        http: buildRpcCandidates(network.rpcUrl),
      },
    },
  });

const chainByKey: Record<keyof NetworkRecord, Chain> = {
  eth: toChain(NETWORKS.eth),
  polygon: toChain(NETWORKS.polygon),
  bnb: toChain(NETWORKS.bnb),
  chainora: toChain(NETWORKS.chainora),
};

const chains = [chainByKey.eth, chainByKey.polygon, chainByKey.bnb, chainByKey.chainora] as const;

const publicClientByChainId = new Map<number, PublicClient>();

const buildTransport = (network: NetworkConfig) =>
  fallback(buildRpcCandidates(network.rpcUrl).map(url => http(url, { timeout: RPC_TIMEOUT_MS })));

export const getPublicViemClient = (network: NetworkConfig): PublicClient => {
  const cached = publicClientByChainId.get(network.chainId);
  if (cached) {
    return cached;
  }

  const chain = chains.find(item => item.id === network.chainId);
  if (!chain) {
    throw new Error(`Unsupported chainId ${network.chainId}`);
  }

  const client = createPublicClient({
    chain,
    transport: buildTransport(network),
  });

  publicClientByChainId.set(network.chainId, client);
  return client;
};
