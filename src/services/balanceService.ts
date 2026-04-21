import { erc20Abi, formatEther, formatUnits, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import { getPublicViemClient } from './web3Client';

const toFixedBalance = (value: bigint, decimals: number): string => {
  const formattedRaw = formatUnits(value, decimals);
  const [whole, fraction = ''] = formattedRaw.split('.');
  const fractionPadded = `${fraction}0000`.slice(0, 4);
  return `${whole}.${fractionPadded}`;
};

const toFixedNativeBalance = (value: bigint): string => {
  const formattedRaw = formatEther(value);
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
    try {
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[balanceService] Stablecoin balance read failed, fallback to native balance', {
        tokenAddress,
        walletAddress,
        reason,
      });
    }
  }

  const wei = await client.getBalance({
    address: walletAddress,
    blockTag: 'latest',
  });
  const formatted = toFixedNativeBalance(wei);

  console.log('[balanceService] Parsed balance', {
    wei: wei.toString(),
    formatted,
  });
  return {
    wei,
    formatted,
  };
};
