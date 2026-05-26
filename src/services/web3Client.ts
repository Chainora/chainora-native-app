import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient } from 'viem';

import type { NetworkConfig } from '../config/network';

const RPC_TIMEOUT_MS = 12_000;
const RPC_RETRY_COUNT = 2;
const RPC_RETRY_DELAY_MS = 450;
const FALLBACK_RETRY_COUNT = 1;

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

const publicClientByNetwork = new Map<string, PublicClient>();

const buildTransport = (network: NetworkConfig) =>
  fallback(
    buildRpcCandidates(network.rpcUrl).map(url => http(url, {
      timeout: RPC_TIMEOUT_MS,
      retryCount: RPC_RETRY_COUNT,
      retryDelay: RPC_RETRY_DELAY_MS,
    })),
    {
      retryCount: FALLBACK_RETRY_COUNT,
      retryDelay: RPC_RETRY_DELAY_MS,
    },
  );

export const getPublicViemClient = (network: NetworkConfig): PublicClient => {
  const cacheKey = `${network.key}:${network.rpcUrl}`;
  const cached = publicClientByNetwork.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = createPublicClient({
    chain: toChain(network),
    transport: buildTransport(network),
  });

  publicClientByNetwork.set(cacheKey, client);
  return client;
};
