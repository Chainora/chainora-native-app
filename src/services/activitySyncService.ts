import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  addRecentActivities,
  type AddRecentActivityParams,
} from '../features/wallet/recentActivityStorage';
import { getPublicViemClient } from './web3Client';

const INITIAL_SCAN_LIMIT = 40n;
const RESCAN_OVERLAP_BLOCKS = 20n;
const CURSOR_PREFIX = '@chainora/activitySyncCursor';
const inFlightSyncs = new Map<string, Promise<void>>();
const blockFailureCounts = new Map<string, number>();
const MAX_BLOCK_RETRIES = 3;
let activitySyncPauseCount = 0;

export const pauseActivitySync = (): void => {
  activitySyncPauseCount += 1;
};

export const resumeActivitySync = (): void => {
  activitySyncPauseCount = Math.max(0, activitySyncPauseCount - 1);
};

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
  if (activitySyncPauseCount > 0) {
    return;
  }

  const normalizedWallet = walletAddress.toLowerCase();
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  const wallet = getAddress(normalizedWallet).toLowerCase();
  const syncKey = `${network.key}:${normalizedWallet}`;

  const registerBlockFailure = (block: bigint, reason: string): boolean => {
    const key = `${syncKey}:${block.toString()}`;
    const nextCount = (blockFailureCounts.get(key) ?? 0) + 1;
    blockFailureCounts.set(key, nextCount);

    if (nextCount <= MAX_BLOCK_RETRIES) {
      console.warn('[activitySync] Block retry scheduled', block.toString(), reason, nextCount);
      return true;
    }

    console.warn('[activitySync] Skipping problematic block after retries', block.toString(), reason);
    blockFailureCounts.delete(key);
    return false;
  };

  const clearBlockFailure = (block: bigint) => {
    const key = `${syncKey}:${block.toString()}`;
    blockFailureCounts.delete(key);
  };

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
      // If saved cursor is ahead of chain tip (RPC reset/reorg/network change),
      // fall back to a bounded recent scan window.
      if (cursor > latest) {
        start = latest > INITIAL_SCAN_LIMIT ? latest - INITIAL_SCAN_LIMIT : 0n;
      } else {
        start = cursor + 1n;
      }

      // Always overlap a few blocks to recover missed receive/send txs from
      // transient RPC read failures in previous sync cycles.
      start = start > RESCAN_OVERLAP_BLOCKS ? start - RESCAN_OVERLAP_BLOCKS : 0n;
    }

    if (start > latest) {
      return;
    }

    const matchedActivities: AddRecentActivityParams[] = [];
    const seenTxHashes = new Set<string>();

    const resolveTransaction = async (
      tx: (Awaited<ReturnType<typeof client.getBlock>>['transactions'])[number],
    ) => {
      if (typeof tx !== 'string') {
        return tx;
      }

      try {
        return await client.getTransaction({ hash: tx });
      } catch (error) {
        console.warn('[activitySync] Failed reading transaction', tx, error);
        return null;
      }
    };

    let lastProcessedBlock = start - 1n;

    for (let block = start; block <= latest; block += 1n) {
      let blockData: Awaited<ReturnType<typeof client.getBlock>>;
      try {
        blockData = await client.getBlock({
          blockNumber: block,
          includeTransactions: true,
        });
      } catch (error) {
        console.warn('[activitySync] Failed reading block', block.toString(), error);
        const shouldRetry = registerBlockFailure(block, 'block-read-failed');
        if (shouldRetry) {
          break;
        }

        lastProcessedBlock = block;
        continue;
      }

      const transactions = blockData.transactions ?? [];
      let blockHasTxReadError = false;

      for (const txItem of transactions) {
        const tx = await resolveTransaction(txItem);
        if (!tx) {
          blockHasTxReadError = true;
          continue;
        }

        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase() ?? '0x0000000000000000000000000000000000000000';
        const valueWei = tx.value;

        if (!from || valueWei <= 0n) {
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

      if (blockHasTxReadError) {
        const shouldRetry = registerBlockFailure(block, 'transaction-read-incomplete');
        if (shouldRetry) {
          break;
        }

        lastProcessedBlock = block;
        continue;
      }

      clearBlockFailure(block);
      lastProcessedBlock = block;
    }

    if (matchedActivities.length > 0) {
      try {
        await addRecentActivities(matchedActivities);
      } catch (error) {
        console.warn('[activitySync] Failed saving activity batch', error);
      }
    }

    if (lastProcessedBlock >= start) {
      try {
        await writeCursor(network.key, normalizedWallet, lastProcessedBlock);
      } catch (error) {
        console.warn('[activitySync] Failed to persist sync cursor', error);
      }
    }
  })();

  inFlightSyncs.set(syncKey, run);
  try {
    await run;
  } finally {
    inFlightSyncs.delete(syncKey);
  }
};
