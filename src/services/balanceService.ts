import { erc20Abi, formatEther, formatUnits, getAddress } from 'viem';

import { getActiveNetwork, type NetworkConfig } from '../config/network';
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

const readErc20Balance = async (params: {
  walletAddress: `0x${string}`;
  tokenAddress: string;
  defaultDecimals: number;
  network: NetworkConfig;
  label: string;
}): Promise<{ wei: bigint; formatted: string } | null> => {
  const client = getPublicViemClient(params.network);
  const tokenAddress = getAddress(params.tokenAddress);

  try {
    const [wei, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [params.walletAddress],
      }),
      client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => params.defaultDecimals),
    ]);

    const normalizedDecimals = Number.isFinite(Number(decimals))
      ? Number(decimals)
      : params.defaultDecimals;
    const formatted = toFixedBalance(wei, normalizedDecimals);

    console.log('[balanceService] Parsed token balance', {
      networkKey: params.network.key,
      label: params.label,
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
    console.warn('[balanceService] Token balance read failed, fallback to native balance', {
      networkKey: params.network.key,
      label: params.label,
      tokenAddress,
      walletAddress: params.walletAddress,
      reason,
    });
    return null;
  }
};

export const fetchWalletBalance = async (
  address: string,
  network: NetworkConfig = getActiveNetwork(),
): Promise<{ wei: bigint; formatted: string }> => {
  const walletAddress = getAddress(address);
  const client = getPublicViemClient(network);

  const tokenConfig = network.key === 'chainora' && network.stablecoinAddress
    ? {
      tokenAddress: network.stablecoinAddress,
      defaultDecimals: network.stablecoinDecimals ?? 18,
      label: 'stablecoin',
    }
    : network.portfolioTokenAddress
      ? {
        tokenAddress: network.portfolioTokenAddress,
        defaultDecimals: network.portfolioTokenDecimals ?? 18,
        label: 'portfolio-token',
      }
      : null;

  if (tokenConfig) {
    const tokenBalance = await readErc20Balance({
      walletAddress,
      tokenAddress: tokenConfig.tokenAddress,
      defaultDecimals: tokenConfig.defaultDecimals,
      network,
      label: tokenConfig.label,
    });
    if (tokenBalance) {
      return tokenBalance;
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

export const fetchEthBalance = async (address: string): Promise<{ wei: bigint; formatted: string }> =>
  fetchWalletBalance(address, getActiveNetwork());
