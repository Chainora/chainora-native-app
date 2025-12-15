const DEFAULT_ETHEREUM_RPC = 'https://cloudflare-eth.com';

const jsonRpcRequest = async (address: string): Promise<string> => {
  const response = await fetch(DEFAULT_ETHEREUM_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: Date.now(),
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC responded with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? 'Unknown RPC error');
  }
  if (typeof payload.result !== 'string') {
    throw new Error('Unexpected RPC response');
  }

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
  return {
    wei,
    formatted: formatBalance(wei),
  };
};
