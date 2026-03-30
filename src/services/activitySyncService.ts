import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getActiveNetwork } from '../config/network';
import {
  addRecentActivities,
  type AddRecentActivityParams,
} from '../features/wallet/recentActivityStorage';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];
const INITIAL_SCAN_LIMIT = 40n;
const INCREMENTAL_SCAN_LIMIT = 40n;
const CURSOR_PREFIX = '@chainora/activitySyncCursor';
const inFlightSyncs = new Map<string, Promise<void>>();

type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
};

type RpcBlock = {
  transactions?: RpcTransaction[];
};

const buildRpcCandidates = (rpcUrl: string): string[] => {
  const unique = new Set<string>([rpcUrl]);

  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Array.from(unique);
    }

    const isLocalHost = LOCAL_HOSTS.includes(parsed.hostname);
    if (!isLocalHost || Platform.OS !== 'android') {
      return Array.from(unique);
    }

    ['10.0.2.2', '10.0.3.2'].forEach(host => {
      const candidate = new URL(rpcUrl);
      candidate.hostname = host;
      unique.add(candidate.toString());
    });
  } catch {
    return Array.from(unique);
  }

  return Array.from(unique);
};

const jsonRpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const network = getActiveNetwork();
  const candidates = buildRpcCandidates(network.rpcUrl);
  let lastError: Error | null = null;

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`RPC ${method} failed (${response.status}): ${bodyText}`);
      }

      const payload = (await response.json()) as { result?: T; error?: { message?: string } };
      if (payload.error) {
        throw new Error(payload.error.message ?? `RPC ${method} failed`);
      }

      if (payload.result === undefined) {
        throw new Error(`RPC ${method} returned no result`);
      }

      return payload.result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`RPC ${method} failed`);
};

const hexToBigInt = (value: string): bigint => {
  if (!value || value === '0x') {
    return 0n;
  }
  return BigInt(value);
};

const toHexBlock = (value: bigint): string => `0x${value.toString(16)}`;

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
  const syncKey = `${network.key}:${normalizedWallet}`;

  if (inFlightSyncs.has(syncKey)) {
    await inFlightSyncs.get(syncKey);
    return;
  }

  const run = (async () => {
    let latestHex: string;
    try {
      latestHex = await jsonRpc<string>('eth_blockNumber', []);
    } catch (error) {
      console.warn('[activitySync] Unable to read latest block', error);
      return;
    }

    const latest = hexToBigInt(latestHex);
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
      const maxStart = latest > INCREMENTAL_SCAN_LIMIT ? latest - INCREMENTAL_SCAN_LIMIT : 0n;
      if (start < maxStart) {
        start = maxStart;
      }
    }

    if (start > latest) {
      return;
    }

    const matchedActivities: AddRecentActivityParams[] = [];
    const seenTxHashes = new Set<string>();

    for (let block = start; block <= latest; block += 1n) {
      let blockData: RpcBlock;
      try {
        blockData = await jsonRpc<RpcBlock>('eth_getBlockByNumber', [toHexBlock(block), true]);
      } catch (error) {
        console.warn('[activitySync] Failed reading block', block.toString(), error);
        continue;
      }

      const transactions = blockData.transactions ?? [];

      for (const tx of transactions) {
        const from = tx.from?.toLowerCase();
        const to = tx.to?.toLowerCase();
        const valueWei = hexToBigInt(tx.value);

        if (!from || !to || valueWei <= 0n) {
          continue;
        }

        if (from !== normalizedWallet && to !== normalizedWallet) {
          continue;
        }

        if (seenTxHashes.has(tx.hash)) {
          continue;
        }

        seenTxHashes.add(tx.hash);
        matchedActivities.push({
          transactionHash: tx.hash,
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
