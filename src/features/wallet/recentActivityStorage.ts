import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@chainora/recentActivities';
const MAX_ACTIVITIES = 30;

export type RecentActivity = {
  id: string;
  walletAddress: string;
  kind: 'send' | 'receive';
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  amountDisplay: string;
  currencySymbol: string;
  networkName: string;
  createdAt: string;
};

const isRecentActivity = (value: unknown): value is RecentActivity => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const activity = value as Partial<RecentActivity>;
  return (
    (activity.kind === 'send' || activity.kind === 'receive') &&
    typeof activity.id === 'string' &&
    typeof activity.walletAddress === 'string' &&
    typeof activity.transactionHash === 'string' &&
    typeof activity.fromAddress === 'string' &&
    typeof activity.toAddress === 'string' &&
    typeof activity.amountDisplay === 'string' &&
    typeof activity.currencySymbol === 'string' &&
    typeof activity.networkName === 'string' &&
    typeof activity.createdAt === 'string'
  );
};

const parseStoredActivities = (raw: string | null): RecentActivity[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const mapped = parsed
      .map((item): RecentActivity | null => {
        if (isRecentActivity(item)) {
          return {
            ...item,
            walletAddress: item.walletAddress.toLowerCase(),
            fromAddress: item.fromAddress.toLowerCase(),
            toAddress: item.toAddress.toLowerCase(),
          };
        }

        // Backward-compatible migration for old send-only entries without walletAddress.
        if (!item || typeof item !== 'object') {
          return null;
        }
        const legacy = item as Partial<RecentActivity> & { kind?: string };
        if (
          legacy.kind === 'send' &&
          typeof legacy.id === 'string' &&
          typeof legacy.transactionHash === 'string' &&
          typeof legacy.fromAddress === 'string' &&
          typeof legacy.toAddress === 'string' &&
          typeof legacy.amountDisplay === 'string' &&
          typeof legacy.currencySymbol === 'string' &&
          typeof legacy.networkName === 'string' &&
          typeof legacy.createdAt === 'string'
        ) {
          return {
            id: legacy.id,
            walletAddress: legacy.fromAddress.toLowerCase(),
            kind: 'send',
            transactionHash: legacy.transactionHash,
            fromAddress: legacy.fromAddress.toLowerCase(),
            toAddress: legacy.toAddress.toLowerCase(),
            amountDisplay: legacy.amountDisplay,
            currencySymbol: legacy.currencySymbol,
            networkName: legacy.networkName,
            createdAt: legacy.createdAt,
          };
        }

        return null;
      })
      .filter((item): item is RecentActivity => Boolean(item));

    return mapped.slice(0, MAX_ACTIVITIES);
  } catch {
    return [];
  }
};

const writeActivities = async (activities: RecentActivity[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activities.slice(0, MAX_ACTIVITIES)));
};

export const getRecentActivities = async (): Promise<RecentActivity[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseStoredActivities(raw);
};

export const getRecentActivitiesByWallet = async (walletAddress: string): Promise<RecentActivity[]> => {
  const all = await getRecentActivities();
  const normalized = walletAddress.toLowerCase();
  return all.filter(item => item.walletAddress === normalized).slice(0, MAX_ACTIVITIES);
};

export type AddRecentActivityParams = {
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  amountDisplay: string;
  currencySymbol: string;
  networkName: string;
};

const buildId = (hash: string, kind: 'send' | 'receive', walletAddress: string) =>
  `${Date.now()}-${kind}-${walletAddress.slice(2, 8)}-${hash.slice(2, 10)}`;

const buildItemKey = (item: Pick<RecentActivity, 'transactionHash' | 'walletAddress' | 'kind'>) =>
  `${item.transactionHash}:${item.walletAddress}:${item.kind}`;

export const addRecentActivities = async (
  inputs: AddRecentActivityParams[],
): Promise<RecentActivity[]> => {
  if (inputs.length === 0) {
    return getRecentActivities();
  }

  const existing = await getRecentActivities();
  const removeKeys = new Set<string>();

  for (const input of inputs) {
    const fromAddress = input.fromAddress.toLowerCase();
    const toAddress = input.toAddress.toLowerCase();
    removeKeys.add(`${input.transactionHash}:${fromAddress}:send`);
    removeKeys.add(`${input.transactionHash}:${toAddress}:receive`);
  }

  const filteredExisting = existing.filter(item => !removeKeys.has(buildItemKey(item)));
  const nextItems: RecentActivity[] = [];
  const seen = new Set<string>();

  // Process newest-first so the resulting list keeps recent items at the top.
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index];
    const fromAddress = input.fromAddress.toLowerCase();
    const toAddress = input.toAddress.toLowerCase();
    const createdAt = new Date().toISOString();

    const sentItem: RecentActivity = {
      id: buildId(input.transactionHash, 'send', fromAddress),
      walletAddress: fromAddress,
      kind: 'send',
      transactionHash: input.transactionHash,
      fromAddress,
      toAddress,
      amountDisplay: input.amountDisplay,
      currencySymbol: input.currencySymbol,
      networkName: input.networkName,
      createdAt,
    };

    const receivedItem: RecentActivity = {
      id: buildId(input.transactionHash, 'receive', toAddress),
      walletAddress: toAddress,
      kind: 'receive',
      transactionHash: input.transactionHash,
      fromAddress,
      toAddress,
      amountDisplay: input.amountDisplay,
      currencySymbol: input.currencySymbol,
      networkName: input.networkName,
      createdAt,
    };

    const sentKey = buildItemKey(sentItem);
    if (!seen.has(sentKey)) {
      nextItems.push(sentItem);
      seen.add(sentKey);
    }

    const receiveKey = buildItemKey(receivedItem);
    if (!seen.has(receiveKey)) {
      nextItems.push(receivedItem);
      seen.add(receiveKey);
    }
  }

  const next = [...nextItems, ...filteredExisting].slice(0, MAX_ACTIVITIES);
  await writeActivities(next);
  return next;
};

export const addRecentActivity = async (
  input: AddRecentActivityParams,
): Promise<RecentActivity[]> => {
  return addRecentActivities([input]);
};

export const clearRecentActivities = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
