import { encodeFunctionData, erc20Abi, getAddress } from 'viem';

import type { NetworkConfig } from '../../../config/network';
import { parseEther } from '../../../services/transactionService';

export const PIN_LENGTH = 4;
export const DEFAULT_GAS_LIMIT = '21000';

export const truncateAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
export const getAssetSymbol = (network: NetworkConfig): string =>
  network.portfolioTokenSymbol ?? network.currencySymbol;

const getAssetDecimals = (network: NetworkConfig): number => network.portfolioTokenDecimals ?? 18;

const parseAmountToUnits = (value: string, decimals: number): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Amount must be a positive decimal number');
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`);
  }

  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * base;
  const fractionPadded = `${fraction}${'0'.repeat(decimals)}`.slice(0, decimals);
  const fractionUnits = fractionPadded ? BigInt(fractionPadded) : 0n;
  return wholeUnits + fractionUnits;
};

export const parseTransferAmount = (network: NetworkConfig, amount: string): bigint => {
  if (network.portfolioTokenAddress) {
    return parseAmountToUnits(amount, getAssetDecimals(network));
  }
  return parseEther(amount);
};

export const buildTransferPayload = (network: NetworkConfig, recipient: string, amount: string) => {
  if (!network.portfolioTokenAddress) {
    return {
      to: recipient.trim(),
      valueWei: parseTransferAmount(network, amount),
      dataHex: undefined as string | undefined,
    };
  }

  const recipientAddress = getAddress(recipient.trim());
  const amountUnits = parseTransferAmount(network, amount);
  const dataHex = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipientAddress, amountUnits],
  });

  return {
    to: network.portfolioTokenAddress,
    valueWei: 0n,
    dataHex,
  };
};

export const parseGwei = (value: string): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid gas price');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const wholeWei = BigInt(whole) * 1_000_000_000n;
  const fractionPadded = (fraction + '000000000').slice(0, 9);
  return wholeWei + BigInt(fractionPadded);
};

export const formatGweiFromWei = (wei: bigint): string => {
  const whole = wei / 1_000_000_000n;
  const fraction = (wei % 1_000_000_000n).toString().padStart(9, '0').slice(0, 2);
  return `${whole.toString()}.${fraction}`;
};

export const formatFeeNative = (gasLimit: string, gasPriceGwei?: string): string | null => {
  if (!gasPriceGwei || !/^\d+$/.test(gasLimit)) {
    return null;
  }
  const gasPriceWei = parseGwei(gasPriceGwei);
  const feeWei = BigInt(gasLimit) * gasPriceWei;
  const whole = feeWei / 1_000_000_000_000_000_000n;
  const fraction = (feeWei % 1_000_000_000_000_000_000n).toString().padStart(18, '0').slice(0, 6);
  return `${whole.toString()}.${fraction}`;
};

export const isValidEvmAddress = (value: string): boolean => {
  try {
    getAddress(value.trim());
    return true;
  } catch {
    return false;
  }
};
