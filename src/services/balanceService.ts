import { NETWORK } from '../config/network';

const jsonRpcRequest = async (address: string): Promise<string> => {
  console.log('[balanceService] Fetching balance', {
    address,
    endpoint: NETWORK.rpcUrl,
  });

  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(NETWORK.rpcUrl, {
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
  } catch (error) {
    console.warn('[balanceService] Network request failed before response', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw new Error('Network request failed');
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
