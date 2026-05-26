import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatUnits, getAddress, parseAbiItem } from 'viem';

import { getActiveNetwork, type NetworkConfig } from '../config/network';
import {
  addRecentActivities,
  type AddRecentActivityParams,
  type RecentActivity,
} from '@services/storage/recentActivityStorage';
import { getActivitySyncStartBlock } from './activitySyncScanWindow';
import { getPublicViemClient } from './web3Client';

const CURSOR_PREFIX = '@chainora/activitySyncCursor';
const BACKFILL_PREFIX = '@chainora/activitySyncBackfill';
const EXPANDED_BACKFILL_VERSION = 'eth-bnb-expanded-v1';
const inFlightSyncs = new Map<string, Promise<void>>();
const activitySyncListeners = new Map<string, Set<ActivitySyncListener>>();
const blockFailureCounts = new Map<string, number>();
const MAX_BLOCK_RETRIES = 3;
let activitySyncPauseCount = 0;

type ActivitySyncListener = (
  activities: RecentActivity[],
) => void | Promise<void>;

type SyncWalletActivitiesOptions = {
  onActivitiesAdded?: ActivitySyncListener;
};

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

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

const formatTokenUnits = (value: bigint, decimals: number): string => {
  const [whole, fraction = ''] = formatUnits(value, decimals).split('.');
  const fractionPadded = `${fraction}0000`.slice(0, 4);
  return `${whole}.${fractionPadded}`;
};

const buildActivityDedupeKey = (
  transactionHash: string,
  direction: 'send' | 'receive',
  networkKey: string,
) => `${transactionHash.toLowerCase()}:${direction}:${networkKey}`;

const buildCursorKey = (networkKey: string, walletAddress: string) =>
  `${CURSOR_PREFIX}:${networkKey}:${walletAddress.toLowerCase()}`;

const buildBackfillKey = (networkKey: string, walletAddress: string) =>
  `${BACKFILL_PREFIX}:${networkKey}:${walletAddress.toLowerCase()}`;

const usesExpandedBackfill = (networkKey: NetworkConfig['key']): boolean =>
  networkKey === 'ethMainnet' || networkKey === 'bscMainnet';

const registerActivitySyncListener = (
  syncKey: string,
  listener?: ActivitySyncListener,
): (() => void) => {
  if (!listener) {
    return () => undefined;
  }

  const listeners =
    activitySyncListeners.get(syncKey) ?? new Set<ActivitySyncListener>();
  listeners.add(listener);
  activitySyncListeners.set(syncKey, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      activitySyncListeners.delete(syncKey);
    }
  };
};

const notifyActivitiesAdded = async (
  syncKey: string,
  activities: RecentActivity[],
): Promise<void> => {
  const listeners = activitySyncListeners.get(syncKey);
  if (!listeners || listeners.size === 0) {
    return;
  }

  const results = await Promise.allSettled(
    Array.from(listeners).map(listener => listener(activities)),
  );
  results.forEach(result => {
    if (result.status === 'rejected') {
      console.warn(
        '[activitySync] Activity update callback failed',
        result.reason,
      );
    }
  });
};

const readCursor = async (
  networkKey: string,
  walletAddress: string,
): Promise<bigint | null> => {
  const raw = await AsyncStorage.getItem(
    buildCursorKey(networkKey, walletAddress),
  );
  if (!raw) {
    return null;
  }
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
};

const writeCursor = async (
  networkKey: string,
  walletAddress: string,
  block: bigint,
): Promise<void> => {
  await AsyncStorage.setItem(
    buildCursorKey(networkKey, walletAddress),
    block.toString(),
  );
};

const readBackfillVersion = async (
  networkKey: string,
  walletAddress: string,
): Promise<string | null> => {
  return AsyncStorage.getItem(buildBackfillKey(networkKey, walletAddress));
};

const writeBackfillVersion = async (
  networkKey: string,
  walletAddress: string,
): Promise<void> => {
  await AsyncStorage.setItem(
    buildBackfillKey(networkKey, walletAddress),
    EXPANDED_BACKFILL_VERSION,
  );
};

export const clearActivitySyncState = async (): Promise<void> => {
  const keys = await AsyncStorage.getAllKeys();
  const syncKeys = keys.filter(
    key => key.startsWith(CURSOR_PREFIX) || key.startsWith(BACKFILL_PREFIX),
  );
  if (syncKeys.length > 0) {
    await AsyncStorage.multiRemove(syncKeys);
  }
};

export const syncWalletActivities = async (
  walletAddress: string,
  network: NetworkConfig = getActiveNetwork(),
  options: SyncWalletActivitiesOptions = {},
): Promise<void> => {
  if (activitySyncPauseCount > 0) {
    return;
  }

  const normalizedWallet = walletAddress.toLowerCase();
  const client = getPublicViemClient(network);
  const walletChecksum = getAddress(normalizedWallet);
  const wallet = walletChecksum.toLowerCase();
  const syncKey = `${network.key}:${normalizedWallet}`;
  const unregisterActivitySyncListener = registerActivitySyncListener(
    syncKey,
    options.onActivitiesAdded,
  );

  const registerBlockFailure = (block: bigint, reason: string): boolean => {
    const key = `${syncKey}:${block.toString()}`;
    const nextCount = (blockFailureCounts.get(key) ?? 0) + 1;
    blockFailureCounts.set(key, nextCount);

    if (nextCount <= MAX_BLOCK_RETRIES) {
      console.warn(
        '[activitySync] Block retry scheduled',
        block.toString(),
        reason,
        nextCount,
      );
      return true;
    }

    console.warn(
      '[activitySync] Skipping problematic block after retries',
      block.toString(),
      reason,
    );
    blockFailureCounts.delete(key);
    return false;
  };

  const clearBlockFailure = (block: bigint) => {
    const key = `${syncKey}:${block.toString()}`;
    blockFailureCounts.delete(key);
  };

  let ownsSync = false;

  try {
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

      let backfillVersion: string | null = null;
      try {
        backfillVersion = await readBackfillVersion(
          network.key,
          normalizedWallet,
        );
      } catch {
        backfillVersion = null;
      }

      const forceInitialBackfill =
        usesExpandedBackfill(network.key) &&
        backfillVersion !== EXPANDED_BACKFILL_VERSION;

      start = getActivitySyncStartBlock({
        networkKey: network.key,
        latest,
        cursor,
        forceInitialBackfill,
      });

      if (start > latest) {
        return;
      }

      const seenActivityKeys = new Set<string>();

      const addMatchedActivity = async (
        input: AddRecentActivityParams,
      ): Promise<void> => {
        const fromAddress = input.fromAddress.toLowerCase();
        const toAddress = input.toAddress.toLowerCase();
        const directions: Array<'send' | 'receive'> = [];

        if (fromAddress === wallet) {
          directions.push('send');
        }
        if (toAddress === wallet) {
          directions.push('receive');
        }
        if (directions.length === 0) {
          return;
        }

        const hasNewDirection = directions.some(direction => {
          const key = buildActivityDedupeKey(
            input.transactionHash,
            direction,
            network.key,
          );
          return !seenActivityKeys.has(key);
        });
        if (!hasNewDirection) {
          return;
        }

        directions.forEach(direction => {
          seenActivityKeys.add(
            buildActivityDedupeKey(
              input.transactionHash,
              direction,
              network.key,
            ),
          );
        });

        try {
          const savedActivities = await addRecentActivities([input]);
          await notifyActivitiesAdded(syncKey, savedActivities);
        } catch (error) {
          console.warn('[activitySync] Failed saving activity', error);
        }
      };

      const resolveTransaction = async (
        txHash: `0x${string}`,
      ): Promise<{
        tx: Awaited<ReturnType<typeof client.getTransaction>> | null;
        fatal: boolean;
      }> => {
        try {
          const tx = await client.getTransaction({ hash: txHash });
          return { tx, fatal: false };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error ?? '');
          if (message.includes('IntegerOutOfRangeError')) {
            console.warn(
              '[activitySync] Skipping malformed transaction payload',
              txHash,
              message,
            );
            return { tx: null, fatal: false };
          }

          console.warn(
            '[activitySync] Failed reading transaction',
            txHash,
            error,
          );
          return { tx: null, fatal: true };
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
          console.warn(
            '[activitySync] Failed reading block',
            block.toString(),
            error,
          );
          const shouldRetry = registerBlockFailure(block, 'block-read-failed');
          if (shouldRetry) {
            break;
          }

          lastProcessedBlock = block;
          continue;
        }

        const transactions = (blockData.transactions ?? []) as Array<
          `0x${string}` | Awaited<ReturnType<typeof client.getTransaction>>
        >;
        let blockHasTxReadError = false;

        for (const transaction of transactions) {
          const { tx, fatal } =
            typeof transaction === 'string'
              ? await resolveTransaction(transaction)
              : { tx: transaction, fatal: false };
          if (!tx) {
            if (fatal) {
              blockHasTxReadError = true;
            }
            continue;
          }

          const from = tx.from?.toLowerCase();
          const to =
            tx.to?.toLowerCase() ??
            '0x0000000000000000000000000000000000000000';
          const valueWei = tx.value;

          if (!from || valueWei <= 0n) {
            continue;
          }

          if (from !== wallet && to !== wallet) {
            continue;
          }

          await addMatchedActivity({
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
          const shouldRetry = registerBlockFailure(
            block,
            'transaction-read-incomplete',
          );
          if (shouldRetry) {
            break;
          }

          lastProcessedBlock = block;
          continue;
        }

        clearBlockFailure(block);
        lastProcessedBlock = block;
      }

      const scanPortfolioTokenTransfers = async (
        fromBlock: bigint,
        toBlock: bigint,
      ): Promise<boolean> => {
        if (!network.portfolioTokenAddress || fromBlock > toBlock) {
          return true;
        }

        const tokenAddress = getAddress(network.portfolioTokenAddress);
        const tokenDecimals = network.portfolioTokenDecimals ?? 18;
        const tokenSymbol =
          network.portfolioTokenSymbol ?? network.currencySymbol;

        try {
          const [sentLogs, receivedLogs] = await Promise.all([
            client.getLogs({
              address: tokenAddress,
              event: TRANSFER_EVENT,
              args: { from: walletChecksum },
              fromBlock,
              toBlock,
            }),
            client.getLogs({
              address: tokenAddress,
              event: TRANSFER_EVENT,
              args: { to: walletChecksum },
              fromBlock,
              toBlock,
            }),
          ]);

          const seenLogs = new Set<string>();
          const logs = [...sentLogs, ...receivedLogs].sort((left, right) => {
            if (left.blockNumber !== right.blockNumber) {
              return left.blockNumber < right.blockNumber ? -1 : 1;
            }
            return (left.logIndex ?? 0) - (right.logIndex ?? 0);
          });

          for (const log of logs) {
            const logKey = `${log.transactionHash}:${log.logIndex ?? 0}`;
            if (seenLogs.has(logKey)) {
              continue;
            }
            seenLogs.add(logKey);

            const from =
              typeof log.args.from === 'string'
                ? getAddress(log.args.from).toLowerCase()
                : null;
            const to =
              typeof log.args.to === 'string'
                ? getAddress(log.args.to).toLowerCase()
                : null;
            const value =
              typeof log.args.value === 'bigint' ? log.args.value : 0n;

            if (!from || !to || value <= 0n) {
              continue;
            }
            if (from !== wallet && to !== wallet) {
              continue;
            }

            await addMatchedActivity({
              transactionHash: log.transactionHash,
              networkKey: network.key,
              fromAddress: from,
              toAddress: to,
              amountDisplay: formatTokenUnits(value, tokenDecimals),
              currencySymbol: tokenSymbol,
              networkName: network.name,
            });
          }

          return true;
        } catch (error) {
          console.warn('[activitySync] Failed reading token transfer logs', {
            networkKey: network.key,
            tokenAddress,
            fromBlock: fromBlock.toString(),
            toBlock: toBlock.toString(),
            error,
          });
          return false;
        }
      };

      const tokenScanSucceeded = await scanPortfolioTokenTransfers(
        start,
        lastProcessedBlock,
      );

      if (tokenScanSucceeded && lastProcessedBlock >= start) {
        try {
          await writeCursor(network.key, normalizedWallet, lastProcessedBlock);
        } catch (error) {
          console.warn('[activitySync] Failed to persist sync cursor', error);
        }

        if (forceInitialBackfill && lastProcessedBlock >= latest) {
          try {
            await writeBackfillVersion(network.key, normalizedWallet);
          } catch (error) {
            console.warn(
              '[activitySync] Failed to persist backfill version',
              error,
            );
          }
        }
      }
    })();

    inFlightSyncs.set(syncKey, run);
    ownsSync = true;
    await run;
  } finally {
    if (ownsSync) {
      inFlightSyncs.delete(syncKey);
    }
    unregisterActivitySyncListener();
  }
};
