import { erc20Abi, formatEther, formatUnits, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import { getPublicViemClient } from './web3Client';

const toFixedBalance = (value: bigint, decimals: number): string => {
  const formattedRaw = formatUnits(value, decimals);
  const [whole, fraction = ''] = formattedRaw.split('.');
  const fractionPadded = `${fraction}0000`.slice(0, 4);
  return `${whole}.${fractionPadded}`;
};

export const fetchEthBalance = async (address: string): Promise<{ wei: bigint; formatted: string }> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  const walletAddress = getAddress(address);

  if (network.key === 'chainora' && network.stablecoinAddress) {
    const tokenAddress = getAddress(network.stablecoinAddress);
    const defaultDecimals = network.stablecoinDecimals ?? 18;
    const [wei, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => defaultDecimals),
    ]);

    const normalizedDecimals = Number.isFinite(Number(decimals))
      ? Number(decimals)
      : defaultDecimals;
    const formatted = toFixedBalance(wei, normalizedDecimals);

    console.log('[balanceService] Parsed stablecoin balance', {
      tokenAddress,
      wei: wei.toString(),
      formatted,
      decimals: normalizedDecimals,
    });

    return {
      wei,
      formatted,
    };
  }

  const wei = await client.getBalance({
    address: walletAddress,
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
