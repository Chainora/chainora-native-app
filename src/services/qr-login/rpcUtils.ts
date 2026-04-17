import { isRpcTimeoutLikeError } from './errorUtils';
import {
  RECEIPT_POLL_INTERVAL_MS,
  RECEIPT_RETRY_DELAY_MS,
  RECEIPT_TIMEOUT_RETRY_LIMIT,
  RECEIPT_WAIT_TIMEOUT_MS,
} from './constants';

export const withOperationTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const runWithSoftTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<
{ status: 'ok'; value: T }
| { status: 'timeout' }
| { status: 'error'; error: Error }
> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guarded = promise
    .then(value => ({ status: 'ok' as const, value }))
    .catch(error => ({
      status: 'error' as const,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
  const timeoutPromise = new Promise<{ status: 'timeout' }>(resolve => {
    timer = setTimeout(() => {
      resolve({ status: 'timeout' });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([guarded, timeoutPromise]);
    if (result.status === 'timeout') {
      void guarded.then(() => undefined).catch(() => undefined);
    }
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => {
  setTimeout(resolve, ms);
});

export const waitForTransactionReceiptWithRetry = async <TReceipt>({
  client,
  txHash,
  label,
  onProgress,
}: {
  client: {
    waitForTransactionReceipt: (args: {
      hash: `0x${string}`;
      timeout: number;
      pollingInterval: number;
    }) => Promise<TReceipt>;
  };
  txHash: `0x${string}`;
  label: string;
  onProgress?: (status: string) => void;
}): Promise<TReceipt> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RECEIPT_TIMEOUT_RETRY_LIMIT; attempt += 1) {
    try {
      return await client.waitForTransactionReceipt({
        hash: txHash,
        timeout: RECEIPT_WAIT_TIMEOUT_MS,
        pollingInterval: RECEIPT_POLL_INTERVAL_MS,
      });
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      if (!isRpcTimeoutLikeError(reason.message)) {
        throw reason;
      }
      if (attempt === RECEIPT_TIMEOUT_RETRY_LIMIT) {
        throw new Error(
          `${label} confirmation is taking too long because Chainora RPC is slow. `
          + `Transaction may still be pending on-chain. Tx: ${txHash}`,
        );
      }

      lastError = reason;
      onProgress?.(
        `Chainora RPC is slow while waiting ${label} confirmation. Retrying (${attempt}/${RECEIPT_TIMEOUT_RETRY_LIMIT})...`,
      );
      await sleep(RECEIPT_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error(`Unable to confirm ${label} transaction`);
};
