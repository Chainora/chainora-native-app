import type { NetworkKey } from '../config/network';

type ActivitySyncScanWindow = {
  initialBackfillBlocks: bigint;
  cursorOverlapBlocks: bigint;
};

type ActivitySyncStartBlockParams = {
  networkKey: NetworkKey;
  latest: bigint;
  cursor: bigint | null;
  forceInitialBackfill?: boolean;
};

const DEFAULT_SCAN_WINDOW: ActivitySyncScanWindow = {
  initialBackfillBlocks: 40n,
  cursorOverlapBlocks: 20n,
};

const NETWORK_SCAN_WINDOWS: Partial<Record<NetworkKey, ActivitySyncScanWindow>> = {
  ethMainnet: {
    initialBackfillBlocks: 1_200n,
    cursorOverlapBlocks: 3n,
  },
  bscMainnet: {
    initialBackfillBlocks: 4_800n,
    cursorOverlapBlocks: 10n,
  },
};

export const getActivitySyncScanWindow = (networkKey: NetworkKey): ActivitySyncScanWindow =>
  NETWORK_SCAN_WINDOWS[networkKey] ?? DEFAULT_SCAN_WINDOW;

export const getActivitySyncStartBlock = ({
  networkKey,
  latest,
  cursor,
  forceInitialBackfill = false,
}: ActivitySyncStartBlockParams): bigint => {
  const { initialBackfillBlocks, cursorOverlapBlocks } = getActivitySyncScanWindow(networkKey);
  const initialStart = latest > initialBackfillBlocks ? latest - initialBackfillBlocks : 0n;

  if (cursor === null || cursor > latest) {
    return initialStart;
  }

  if (forceInitialBackfill) {
    return initialStart;
  }

  const cursorStart = cursor + 1n;
  const overlappedStart = cursorStart > cursorOverlapBlocks ? cursorStart - cursorOverlapBlocks : 0n;
  return overlappedStart < initialStart ? initialStart : overlappedStart;
};
