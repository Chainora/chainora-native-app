import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  WALLET_HOME_NETWORK_KEYS,
  type WalletHomeNetworkKey,
} from '../../config/network';

const VISIBILITY_STORAGE_KEY = '@chainora/walletHome/visibility';
const DAILY_TOTALS_STORAGE_KEY = '@chainora/walletHome/dailyTotals';
const MAX_DAILY_SNAPSHOTS = 30;

export type WalletHomeVisibilityMap = Record<WalletHomeNetworkKey, boolean>;
type WalletDailyTotalsMap = Record<string, Record<string, number>>;

const normalizeWalletAddress = (walletAddress: string) => walletAddress.trim().toLowerCase();
const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const buildDefaultWalletHomeVisibility = (): WalletHomeVisibilityMap => ({
  ethMainnet: true,
  bscMainnet: true,
  polygonMainnet: true,
  baseMainnet: true,
  arbitrumMainnet: true,
});

const sanitizeVisibility = (value: unknown): WalletHomeVisibilityMap => {
  const defaults = buildDefaultWalletHomeVisibility();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const candidate = value as Partial<Record<WalletHomeNetworkKey, unknown>>;
  return WALLET_HOME_NETWORK_KEYS.reduce((result, key) => {
    result[key] = typeof candidate[key] === 'boolean' ? candidate[key] : defaults[key];
    return result;
  }, { ...defaults });
};

const sanitizeDailyTotals = (value: unknown): WalletDailyTotalsMap => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const input = value as Record<string, unknown>;
  const result: WalletDailyTotalsMap = {};

  Object.entries(input).forEach(([walletAddress, snapshotValue]) => {
    if (!snapshotValue || typeof snapshotValue !== 'object') {
      return;
    }

    const snapshots = snapshotValue as Record<string, unknown>;
    const normalizedWallet = normalizeWalletAddress(walletAddress);
    const validEntries = Object.entries(snapshots)
      .filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-MAX_DAILY_SNAPSHOTS);

    if (validEntries.length === 0) {
      return;
    }

    result[normalizedWallet] = Object.fromEntries(validEntries) as Record<string, number>;
  });

  return result;
};

export const getWalletHomeVisibility = async (): Promise<WalletHomeVisibilityMap> => {
  const raw = await AsyncStorage.getItem(VISIBILITY_STORAGE_KEY);
  if (!raw) {
    return buildDefaultWalletHomeVisibility();
  }

  try {
    return sanitizeVisibility(JSON.parse(raw));
  } catch {
    return buildDefaultWalletHomeVisibility();
  }
};

export const setWalletHomeAssetEnabled = async (
  key: WalletHomeNetworkKey,
  enabled: boolean,
): Promise<WalletHomeVisibilityMap> => {
  const next = {
    ...(await getWalletHomeVisibility()),
    [key]: enabled,
  };

  await AsyncStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next));
  return next;
};

const readDailyTotals = async (): Promise<WalletDailyTotalsMap> => {
  const raw = await AsyncStorage.getItem(DAILY_TOTALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return sanitizeDailyTotals(JSON.parse(raw));
  } catch {
    return {};
  }
};

export const syncPortfolioDailySnapshot = async (
  walletAddress: string,
  totalUsdValue: number,
  now = new Date(),
): Promise<number | null> => {
  const allTotals = await readDailyTotals();
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  const walletTotals = allTotals[normalizedWallet] ?? {};
  const currentDay = todayKey(now);
  const sortedDates = Object.keys(walletTotals).sort();
  const previousDate = sortedDates.filter(date => date < currentDay).pop();
  const previousTotal = previousDate ? walletTotals[previousDate] : null;

  const nextWalletTotals = {
    ...walletTotals,
    [currentDay]: Number.isFinite(totalUsdValue) ? totalUsdValue : 0,
  };

  const trimmedEntries = Object.entries(nextWalletTotals)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-MAX_DAILY_SNAPSHOTS);

  allTotals[normalizedWallet] = Object.fromEntries(trimmedEntries) as Record<string, number>;
  await AsyncStorage.setItem(DAILY_TOTALS_STORAGE_KEY, JSON.stringify(allTotals));

  return previousTotal;
};
