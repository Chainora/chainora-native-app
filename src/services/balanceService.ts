import { formatEther, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import { getPublicViemClient } from './web3Client';

export const fetchEthBalance = async (address: string): Promise<{ wei: bigint; formatted: string }> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  const wei = await client.getBalance({
    address: getAddress(address),
    blockTag: 'latest',
  });

  const formattedRaw = formatEther(wei);
  const [whole, fraction = ''] = formattedRaw.split('.');
  const fractionPadded = `${fraction}0000`.slice(0, 4);
  const formatted = `${whole}.${fractionPadded}`;

  console.log('[balanceService] Parsed balance', {
    wei: wei.toString(),
    formatted,
  });
  return {
    wei,
    formatted,
  };
};
