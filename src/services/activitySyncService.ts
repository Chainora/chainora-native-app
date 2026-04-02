import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  addRecentActivities,
  type AddRecentActivityParams,
} from '../features/wallet/recentActivityStorage';
import { getPublicViemClient } from './web3Client';

const INITIAL_SCAN_LIMIT = 40n;
const CURSOR_PREFIX = '@chainora/activitySyncCursor';
const inFlightSyncs = new Map<string, Promise<void>>();

const formatFromWei = (wei: bigint): string => {
  const weiPerUnit = 1_000_000_000_000_000_000n;
  const whole = wei / weiPerUnit;
  const fraction = (wei % weiPerUnit).toString().padStart(18, '0').slice(0, 4);
  return `${whole.toString()}.${fraction}`;
};

const buildCursorKey = (networkKey: string, walletAddress: string) =>
  `${CURSOR_PREFIX}:${networkKey}:${walletAddress.toLowerCase()}`;

const readCursor = async (networkKey: string, walletAddress: string): Promise<bigint | null> => {
  const raw = await AsyncStorage.getItem(buildCursorKey(networkKey, walletAddress));
  if (!raw) {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
};

const writeCursor = async (networkKey: string, walletAddress: string, block: bigint): Promise<void> => {
  await AsyncStorage.setItem(buildCursorKey(networkKey, walletAddress), block.toString());
};

export const clearActivitySyncState = async (): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  const cursorKeys = keys.filter(key => key.startsWith(CURSOR_PREFIX));
  if (cursorKeys.length > 0) {
    await AsyncStorage.multiRemove(cursorKeys);
  }
};

export const syncWalletActivities = async (walletAddress: string): Promise<void> => {
  const normalizedWallet = walletAddress.toLowerCase();
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  const wallet = getAddress(normalizedWallet).toLowerCase();
  const syncKey = `${network.key}:${normalizedWallet}`;

  if (inFlightSyncs.has(syncKey)) {
    await inFlightSyncs.get(syncKey);
    return;
  }

  const run = (async () => {
    let latest: bigint;
    try {
      latest = await client.getBlockNumber();
    } catch (error) {
      console.warn('[activitySync] Unable to read latest block', error);
      return;
    }
    let start: bigint;

    let cursor: bigint | null = null;
    try {
      cursor = await readCursor(network.key, normalizedWallet);
    } catch {
      cursor = null;
    }

    if (cursor === null) {
      start = latest > INITIAL_SCAN_LIMIT ? latest - INITIAL_SCAN_LIMIT : 0n;
    } else {
      start = cursor + 1n;
    }

    if (start > latest) {
      return;
    }

    const matchedActivities: AddRecentActivityParams[] = [];
    const seenTxHashes = new Set<string>();

    for (let block = start; block <= latest; block += 1n) {
      let blockData: Awaited<ReturnType<typeof client.getBlock>>;
      try {
        blockData = await client.getBlock({
          blockNumber: block,
          includeTransactions: true,
        });
      } catch (error) {
        console.warn('[activitySync] Failed reading block', block.toString(), error);
        continue;
      }

      const transactions = blockData.transactions ?? [];

      for (const tx of transactions) {
        if (typeof tx === 'string') {
          continue;
        }

        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        const valueWei = tx.value;

        if (!from || !to || valueWei <= 0n) {
          continue;
        }

        if (from !== wallet && to !== wallet) {
          continue;
        }

        if (seenTxHashes.has(tx.hash)) {
          continue;
        }

        seenTxHashes.add(tx.hash);
        matchedActivities.push({
          transactionHash: tx.hash,
          networkKey: network.key,
          fromAddress: from,
          toAddress: to,
          amountDisplay: formatFromWei(valueWei),
          currencySymbol: network.currencySymbol,
          networkName: network.name,
        });
      }
    }

    if (matchedActivities.length > 0) {
      try {
        await addRecentActivities(matchedActivities);
      } catch (error) {
        console.warn('[activitySync] Failed saving activity batch', error);
      }
    }

    try {
      await writeCursor(network.key, normalizedWallet, latest);
    } catch (error) {
      console.warn('[activitySync] Failed to persist sync cursor', error);
    }
  })();

  inFlightSyncs.set(syncKey, run);
  try {
    await run;
  } finally {
    inFlightSyncs.delete(syncKey);
  }
};
