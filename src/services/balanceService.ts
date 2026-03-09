import { Platform } from 'react-native';

import { getActiveNetwork } from '../config/network';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

const buildRpcCandidates = (rpcUrl: string): string[] => {
  const unique = new Set<string>([rpcUrl]);

  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Array.from(unique);
    }

    const isLocalHost = LOCAL_HOSTS.includes(parsed.hostname);
    if (!isLocalHost || Platform.OS !== 'android') {
      return Array.from(unique);
    }

    const emulatorHosts = ['10.0.2.2', '10.0.3.2'];
    emulatorHosts.forEach(host => {
      const candidate = new URL(rpcUrl);
      candidate.hostname = host;
      unique.add(candidate.toString());
    });
  } catch {
    return Array.from(unique);
  }

  return Array.from(unique);
};

const jsonRpcRequest = async (address: string): Promise<string> => {
  const network = getActiveNetwork();
  const rpcCandidates = buildRpcCandidates(network.rpcUrl);

  console.log('[balanceService] Fetching balance', {
    address,
    endpoint: network.rpcUrl,
    candidates: rpcCandidates,
  });

  const startedAt = Date.now();

  let response: Response | null = null;
  let lastNetworkError: Error | null = null;

  for (const endpoint of rpcCandidates) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      });

      if (endpoint !== network.rpcUrl) {
        console.log('[balanceService] RPC fallback endpoint succeeded', { endpoint });
      }

      break;
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      lastNetworkError = typedError;
      console.warn('[balanceService] Network request failed before response', {
        endpoint,
        message: typedError.message,
        stack: typedError.stack,
      });
    }
  }

  if (!response) {
    throw new Error(lastNetworkError?.message ?? 'Network request failed');
  }

  const durationMs = Date.now() - startedAt;
  console.log('[balanceService] RPC response received', {
    status: response.status,
    durationMs,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.warn('[balanceService] RPC request failed', {
      status: response.status,
      bodyText,
    });
    throw new Error(`RPC responded with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (payload.error) {
    console.warn('[balanceService] RPC responded with error payload', payload.error);
    throw new Error(payload.error.message ?? 'Unknown RPC error');
  }
  if (typeof payload.result !== 'string') {
    console.warn('[balanceService] RPC returned unexpected payload', payload);
    throw new Error('Unexpected RPC response');
  }

  console.log('[balanceService] Balance result received', {
    hex: payload.result,
  });

  return payload.result;
};

const hexToBigInt = (value: string): bigint => {
  if (!value.startsWith('0x')) {
    throw new Error('Balance response was not hex encoded');
  }
  if (value === '0x') {
    return BigInt(0);
  }
  return BigInt(value);
};

const formatBalance = (wei: bigint): string => {
  const weiPerEth = BigInt(1_000_000_000_000_000_000);
  const whole = wei / weiPerEth;
  const remainder = wei % weiPerEth;
  const remainderStr = remainder.toString().padStart(18, '0').slice(0, 4);
  return `${whole.toString()}.${remainderStr}`;
};

export const fetchEthBalance = async (address: string): Promise<{ wei: bigint; formatted: string }> => {
  const raw = await jsonRpcRequest(address);
  const wei = hexToBigInt(raw);
  console.log('[balanceService] Parsed balance', {
    wei: wei.toString(),
    formatted: formatBalance(wei),
  });
  return {
    wei,
    formatted: formatBalance(wei),
  };
};
