import {
  NETWORKS,
  WALLET_HOME_NETWORK_KEYS,
  WALLET_NATIVE_PRICE_USD,
  type NetworkConfig,
  type WalletHomeNetworkKey,
} from '../../config/network';
import type { RecentActivity } from './recentActivityStorage';

export type PortfolioAssetSnapshot = {
  network: NetworkConfig;
  balanceFormatted: string;
  balanceWei?: bigint;
  usdPrice: number;
  usdValue: number;
  error?: string;
};

export type PortfolioDayChange = {
  amountUsd: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

export const parseDisplayAmount = (value: string): number => {
  const parsed = Number.parseFloat(value.replace(/,/g, '').trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

export const getUsdPriceForNetwork = (networkKey: WalletHomeNetworkKey): number =>
  WALLET_NATIVE_PRICE_USD[networkKey];

export const buildPortfolioAssetSnapshot = (params: {
  network: NetworkConfig;
  balanceFormatted: string;
  balanceWei?: bigint;
  error?: string;
}): PortfolioAssetSnapshot => {
  const usdPrice = getUsdPriceForNetwork(params.network.key as WalletHomeNetworkKey);
  const usdValue = parseDisplayAmount(params.balanceFormatted) * usdPrice;

  return {
    network: params.network,
    balanceFormatted: params.balanceFormatted,
    balanceWei: params.balanceWei,
    usdPrice,
    usdValue,
    error: params.error,
  };
};

export const sumPortfolioUsdValue = (assets: PortfolioAssetSnapshot[]): number =>
  assets.reduce((total, asset) => total + asset.usdValue, 0);

export const sortPortfolioAssets = (assets: PortfolioAssetSnapshot[]): PortfolioAssetSnapshot[] =>
  [...assets].sort((left, right) => right.usdValue - left.usdValue);

export const mergePortfolioActivities = (activities: RecentActivity[]): RecentActivity[] =>
  [...activities].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

export const formatUsdValue = (value: number, compact = false): string => {
  if (!Number.isFinite(value)) {
    return '$0.00';
  }
  return compact ? `$${compactUsdFormatter.format(value)}` : `$${usdFormatter.format(value)}`;
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
  WALLET_HOME_NETWORK_KEYS.map(key => NETWORKS[key]);
