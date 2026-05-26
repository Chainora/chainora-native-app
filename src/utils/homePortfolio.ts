import {
  getWalletHomeNetworks,
  type NetworkConfig,
} from '@config/network';
import type { RecentActivity } from '@app-types/wallet';

export type PortfolioAssetSnapshot = {
  network: NetworkConfig;
  balanceFormatted: string;
  balanceWei?: bigint;
  usdPrice: number;
  usdValue: number;
  error?: string;
  priceUnavailable?: boolean;
};

export type PortfolioDayChange = {
  amountUsd: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
};

export type FiatCurrency = 'usd' | 'vnd';

const USD_TO_VND_RATE = 26_000;

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const compactVndFormatter = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const parseDisplayAmount = (value: string): number => {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

export const buildPortfolioAssetSnapshot = (params: {
  network: NetworkConfig;
  balanceFormatted: string;
  balanceWei?: bigint;
  usdPrice?: number;
  error?: string;
  priceUnavailable?: boolean;
}): PortfolioAssetSnapshot => {
  const usdPrice = Number.isFinite(params.usdPrice) ? params.usdPrice ?? 0 : 0;
  const usdValue = parseDisplayAmount(params.balanceFormatted) * usdPrice;

  return {
    network: params.network,
    balanceFormatted: params.balanceFormatted,
    balanceWei: params.balanceWei,
    usdPrice,
    usdValue,
    error: params.error,
    priceUnavailable: params.priceUnavailable,
  };
};

export const sumPortfolioUsdValue = (assets: PortfolioAssetSnapshot[]): number =>
  assets.reduce((total, asset) => total + asset.usdValue, 0);

export const sortPortfolioAssets = (assets: PortfolioAssetSnapshot[]): PortfolioAssetSnapshot[] =>
  [...assets].sort((left, right) => right.usdValue - left.usdValue);

export const mergePortfolioActivities = (activities: RecentActivity[]): RecentActivity[] =>
  [...activities].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

const toFiatValue = (valueUsd: number, currency: FiatCurrency): number => {
  if (!Number.isFinite(valueUsd)) {
    return 0;
  }
  return currency === 'vnd' ? valueUsd * USD_TO_VND_RATE : valueUsd;
};

export const getFiatUnit = (currency: FiatCurrency): string =>
  (currency === 'vnd' ? '\u20AB' : '$');

export const formatFiatAmount = (
  valueUsd: number,
  currency: FiatCurrency = 'usd',
  compact = false,
): string => {
  const value = toFiatValue(valueUsd, currency);

  if (currency === 'vnd') {
    return compact ? compactVndFormatter.format(value) : vndFormatter.format(value);
  }
  return compact ? compactUsdFormatter.format(value) : usdFormatter.format(value);
};

export const formatFiatValue = (
  valueUsd: number,
  currency: FiatCurrency = 'usd',
  compact = false,
): string => {
  const amount = formatFiatAmount(valueUsd, currency, compact);
  return currency === 'vnd' ? `${amount} \u20AB` : `$${amount}`;
};

export const formatUsdValue = (value: number, compact = false): string => {
  return formatFiatValue(value, 'usd', compact);
};

export const calculatePortfolioDayChange = (
  currentUsdValue: number,
  previousUsdValue?: number | null,
): PortfolioDayChange => {
  const current = Number.isFinite(currentUsdValue) ? currentUsdValue : 0;
  const previous = Number.isFinite(previousUsdValue ?? NaN) ? previousUsdValue ?? 0 : current;
  const amountUsd = current - previous;
  const percent = previous > 0 ? (amountUsd / previous) * 100 : 0;

  if (amountUsd > 0) {
    return { amountUsd, percent, direction: 'up' };
  }
  if (amountUsd < 0) {
    return { amountUsd, percent, direction: 'down' };
  }
  return { amountUsd, percent, direction: 'flat' };
};

export const formatSignedUsdDelta = (value: number): string => {
  const absValue = formatUsdValue(Math.abs(value));
  if (value > 0) {
    return `+${absValue}`;
  }
  if (value < 0) {
    return `-${absValue}`;
  }
  return absValue;
};

export const formatSignedFiatDelta = (valueUsd: number, currency: FiatCurrency): string => {
  const absValue = formatFiatValue(Math.abs(valueUsd), currency);
  if (valueUsd > 0) {
    return `+${absValue}`;
  }
  if (valueUsd < 0) {
    return `-${absValue}`;
  }
  return absValue;
};

export const formatSignedPercentDelta = (value: number): string => {
  const absValue = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${absValue}%`;
  }
  if (value < 0) {
    return `-${absValue}%`;
  }
  return `${absValue}%`;
};

export const getWalletHomeAssetConfigs = (): NetworkConfig[] =>
  getWalletHomeNetworks();
