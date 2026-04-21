import { keccak_256 } from '@noble/hashes/sha3.js';
import { getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import { signTransactionHash } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';
import { getPublicViemClient } from './web3Client';
import { bytesToHex, hexToBytes } from '../utils/encoding';

const LEGACY_TRANSFER_GAS_LIMIT = 21_000n;
const CONTRACT_CALL_FALLBACK_GAS_LIMIT = 1_500_000n;
const GAS_ESTIMATE_BUFFER_NUMERATOR = 12n;
const GAS_ESTIMATE_BUFFER_DENOMINATOR = 10n;
const GAS_ESTIMATE_TIMEOUT_MS = 2_200;
const STRICT_GAS_ESTIMATE_RETRY_LIMIT = 2;
const STRICT_GAS_ESTIMATE_RETRY_DELAY_MS = 220;
const RPC_CALL_RETRY_LIMIT = 2;
const RPC_CALL_RETRY_DELAY_MS = 280;
const ZERO_BYTES = new Uint8Array(0);

export type SendEthParams = {
  from: string;
  to: string;
  valueWei: bigint;
  pin: string;
  signHash?: (hash: Uint8Array) => Promise<{
    ok: boolean;
    message: string;
    signatureDer?: Uint8Array;
    publicKeyHex?: string;
    ethAddress?: string;
  }>;
  nonce?: bigint;
  gasPriceWei?: bigint;
  gasLimitWei?: bigint;
  fallbackGasLimitWei?: bigint;
  dataHex?: string;
  broadcast?: boolean;
};

export type SendEthResult = {
  transactionHash: string;
  rawTransaction: string;
  nonce: bigint;
  gasPriceWei: bigint;
  gasLimitWei: bigint;
};

export type SendAbiTransactionStrictParams =
  Omit<SendEthParams, 'gasLimitWei' | 'fallbackGasLimitWei'> & {
    estimateFailureMessage?: string;
  };

export const parseEther = (value: string): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('ETH amount must be a positive decimal number');
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const wholeWei = BigInt(whole) * 1_000_000_000_000_000_000n;
  const fractionPadded = (fraction + '000000000000000000').slice(0, 18);
  const fractionWei = BigInt(fractionPadded);
  return wholeWei + fractionWei;
};

const sanitizeAddress = (address: string): string => getAddress(address);

const concat = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
};

const encodeLength = (length: number, offset: number): Uint8Array => {
  if (length < 56) {
    return Uint8Array.from([length + offset]);
  }
  const hex = length.toString(16);
  const evenHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = hexToBytes(evenHex);
  return concat(Uint8Array.from([offset + 55 + bytes.length]), bytes);
};

const encodeBytes = (value: Uint8Array): Uint8Array => {
  if (value.length === 1 && value[0] < 0x80) {
    return value;
  }
  return concat(encodeLength(value.length, 0x80), value);
};

const encodeInteger = (value: bigint): Uint8Array => {
  if (value === 0n) {
    return encodeBytes(ZERO_BYTES);
  }
  let hex = value.toString(16);
  if (hex.length % 2 === 1) {
    hex = `0${hex}`;
  }
  return encodeBytes(hexToBytes(hex));
};

const encodeAddress = (value: string): Uint8Array => {
  const normalized = value.toLowerCase().startsWith('0x') ? value.slice(2) : value;
  return encodeBytes(hexToBytes(normalized));
};

const encodeList = (items: Uint8Array[]): Uint8Array => {
  const payload = concat(...items);
  return concat(encodeLength(payload.length, 0xc0), payload);
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => {
  setTimeout(resolve, ms);
});

const isRpcTimeoutLikeError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('timeout')
    || lower.includes('timed out')
    || lower.includes('request took too long')
    || lower.includes('failed to fetch')
    || lower.includes('network request failed')
  );
};

const withRpcRetry = async <T>(task: () => Promise<T>): Promise<T> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RPC_CALL_RETRY_LIMIT; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      if (!isRpcTimeoutLikeError(reason.message) || attempt === RPC_CALL_RETRY_LIMIT) {
        throw reason;
      }
      lastError = reason;
      await sleep(RPC_CALL_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error('RPC call failed unexpectedly');
};

const buildUnsignedLegacyTx = (params: {
  nonce: bigint;
  gasPrice: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  data: Uint8Array;
  chainId: bigint;
}): Uint8Array => {
  const fields = [
    encodeInteger(params.nonce),
    encodeInteger(params.gasPrice),
    encodeInteger(params.gasLimit),
    encodeAddress(params.to),
    encodeInteger(params.value),
    encodeBytes(params.data),
    encodeInteger(params.chainId),
    encodeInteger(0n),
    encodeInteger(0n),
  ];
  return encodeList(fields);
};

const buildSignedLegacyTx = (params: {
  nonce: bigint;
  gasPrice: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  data: Uint8Array;
  v: string;
  r: string;
  s: string;
}): Uint8Array => {
  const fields = [
    encodeInteger(params.nonce),
    encodeInteger(params.gasPrice),
    encodeInteger(params.gasLimit),
    encodeAddress(params.to),
    encodeInteger(params.value),
    encodeBytes(params.data),
    encodeBytes(hexToBytes(params.v.slice(2))),
    encodeBytes(hexToBytes(params.r.slice(2))),
    encodeBytes(hexToBytes(params.s.slice(2))),
  ];
  return encodeList(fields);
};

const fetchNonce = async (address: string): Promise<bigint> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  const nonce = await withRpcRetry(() => client.getTransactionCount({
    address: getAddress(address),
    blockTag: 'pending',
  }));
  return BigInt(nonce);
};

const fetchGasPrice = async (): Promise<bigint> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  return withRpcRetry(() => client.getGasPrice());
};

const applyGasEstimateBuffer = (estimate: bigint): bigint =>
  (estimate * GAS_ESTIMATE_BUFFER_NUMERATOR + (GAS_ESTIMATE_BUFFER_DENOMINATOR - 1n)) /
  GAS_ESTIMATE_BUFFER_DENOMINATOR;

const isEstimateRevertError = (reason: string): boolean => {
  const normalized = reason.toLowerCase();
  return normalized.includes('revert') || normalized.includes('execution reverted') || normalized.includes('failed to execute message');
};

const estimateGasLimit = async (params: {
  from: string;
  to: string;
  valueWei: bigint;
  data: Uint8Array;
}): Promise<bigint | null> => {
  try {
    const network = getActiveNetwork();
    const client = getPublicViemClient(network);
    const estimatePromise = client.estimateGas({
      account: getAddress(params.from),
      to: getAddress(params.to),
      value: params.valueWei,
      data: (`0x${bytesToHex(params.data)}` as `0x${string}`),
    }).then(value => ({ status: 'ok' as const, value }))
      .catch(error => ({
        status: 'error' as const,
        error: error instanceof Error ? error : new Error(String(error)),
      }));
    const timeoutPromise = new Promise<{ status: 'timeout' }>(resolve => {
      setTimeout(() => resolve({ status: 'timeout' }), GAS_ESTIMATE_TIMEOUT_MS);
    });
    const result = await Promise.race([estimatePromise, timeoutPromise]);

    if (result.status === 'ok') {
      return result.value;
    }

    if (result.status === 'timeout') {
      console.warn('[Tx] estimateGas timed out, using fallback gas limit', {
        from: params.from,
        to: params.to,
        valueWei: params.valueWei.toString(),
        dataLength: params.data.length,
      });
      void estimatePromise.then(() => undefined).catch(() => undefined);
      return null;
    }

    const reason = result.error.message;
    if (isEstimateRevertError(reason)) {
      throw new Error(`Transaction simulation indicates revert: ${reason}`);
    }

    console.warn('[Tx] estimateGas failed, will use fallback gas limit', {
      from: params.from,
      to: params.to,
      valueWei: params.valueWei.toString(),
      dataLength: params.data.length,
      reason,
    });
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isEstimateRevertError(reason)) {
      throw new Error(`Transaction simulation indicates revert: ${reason}`);
    }

    console.warn('[Tx] estimateGas failed, will use fallback gas limit', {
      from: params.from,
      to: params.to,
      valueWei: params.valueWei.toString(),
      dataLength: params.data.length,
      reason,
    });
    return null;
  }
};

const estimateGasLimitStrict = async (params: {
  from: string;
  to: string;
  valueWei: bigint;
  data: Uint8Array;
  estimateFailureMessage?: string;
}): Promise<bigint> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= STRICT_GAS_ESTIMATE_RETRY_LIMIT; attempt += 1) {
    try {
      const estimate = await estimateGasLimit({
        from: params.from,
        to: params.to,
        valueWei: params.valueWei,
        data: params.data,
      });

      if (estimate !== null) {
        return estimate;
      }
      lastError = new Error('estimateGas returned no result');
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      if (isEstimateRevertError(reason.message)) {
        throw reason;
      }
      lastError = reason;
    }

    if (attempt < STRICT_GAS_ESTIMATE_RETRY_LIMIT) {
      await sleep(STRICT_GAS_ESTIMATE_RETRY_DELAY_MS * attempt);
    }
  }

  const reason = lastError?.message;
  throw new Error(
    params.estimateFailureMessage
      ?? (reason
        ? `Unable to estimate transaction gas on Chainora right now. Please retry in a moment. Details: ${reason}`
        : 'Unable to estimate transaction gas on Chainora right now. Please retry in a moment.'),
  );
};

export const fetchSuggestedGasPriceWei = async (): Promise<bigint> => {
  return fetchGasPrice();
};

const sendRawTransaction = async (payloadHex: string): Promise<string> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  return withRpcRetry(() => client.sendRawTransaction({ serializedTransaction: payloadHex as `0x${string}` }));
};

const ensureHexData = (dataHex?: string): Uint8Array => {
  if (!dataHex) {
    return ZERO_BYTES;
  }
  const normalized = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
  if (normalized.length % 2 !== 0) {
    throw new Error('Transaction data hex must have even length');
  }
  return hexToBytes(normalized);
};

export const sendEthTransaction = async ({
  from,
  to,
  valueWei,
  pin,
  signHash,
  nonce,
  gasPriceWei,
  gasLimitWei,
  fallbackGasLimitWei,
  dataHex,
  broadcast = true,
}: SendEthParams): Promise<SendEthResult> => {
  const fromChecksum = sanitizeAddress(from);
  const toChecksum = sanitizeAddress(to);

  const [resolvedNonce, resolvedGasPrice] = await Promise.all([
    nonce ?? fetchNonce(fromChecksum),
    gasPriceWei ?? fetchGasPrice(),
  ]);
  const data = ensureHexData(dataHex);
  const defaultGasLimit = data.length > 0 ? CONTRACT_CALL_FALLBACK_GAS_LIMIT : LEGACY_TRANSFER_GAS_LIMIT;
  const baselineGasLimit = gasLimitWei ?? fallbackGasLimitWei ?? defaultGasLimit;
  let resolvedGasLimit = baselineGasLimit;

  // When caller already provides a gas limit, skip estimateGas to reduce RPC roundtrips on slow nodes.
  if (gasLimitWei === undefined) {
    const estimatedGasLimit = await estimateGasLimit({
      from: fromChecksum,
      to: toChecksum,
      valueWei,
      data,
    });

    resolvedGasLimit = estimatedGasLimit
      ? baselineGasLimit > applyGasEstimateBuffer(estimatedGasLimit)
        ? baselineGasLimit
        : applyGasEstimateBuffer(estimatedGasLimit)
      : baselineGasLimit;
  }

  const unsigned = buildUnsignedLegacyTx({
    nonce: resolvedNonce,
    gasPrice: resolvedGasPrice,
    gasLimit: resolvedGasLimit,
    to: toChecksum,
    value: valueWei,
    data,
    chainId: BigInt(getActiveNetwork().chainId),
  });

  const messageHash = keccak_256(unsigned);

  const signatureResult = signHash
    ? await signHash(messageHash)
    : await signTransactionHash(pin, messageHash);
  if (!signatureResult.ok || !signatureResult.signatureDer || !signatureResult.publicKeyHex) {
    throw new Error(signatureResult.message);
  }

  if (!signatureResult.ethAddress) {
    throw new Error('Unable to derive signer address from card public key. Please re-tap the card and try again.');
  }

  const cardSignerChecksum = sanitizeAddress(signatureResult.ethAddress);
  if (cardSignerChecksum.toLowerCase() !== fromChecksum.toLowerCase()) {
    throw new Error(
      `Card signer mismatch: active wallet is ${fromChecksum}, but tapped card signs as ${cardSignerChecksum}. `
      + 'Please login with the same card (or switch wallet) before sending.',
    );
  }

  const recovered = recoverSignature(
    messageHash,
    signatureResult.signatureDer,
    signatureResult.publicKeyHex,
    getActiveNetwork().chainId,
  );

  const signedTx = buildSignedLegacyTx({
    nonce: resolvedNonce,
    gasPrice: resolvedGasPrice,
    gasLimit: resolvedGasLimit,
    to: toChecksum,
    value: valueWei,
    data,
    v: recovered.v,
    r: recovered.r,
    s: recovered.s,
  });

  const rawTxHex = `0x${bytesToHex(signedTx)}`;
  const locallyComputedHash = `0x${bytesToHex(keccak_256(signedTx))}`;
  const transactionHash = broadcast
    ? await sendRawTransaction(rawTxHex)
    : locallyComputedHash;

  return {
    transactionHash,
    rawTransaction: rawTxHex,
    nonce: resolvedNonce,
    gasPriceWei: resolvedGasPrice,
    gasLimitWei: resolvedGasLimit,
  };
};

export const sendAbiTransactionStrict = async ({
  from,
  to,
  valueWei,
  pin,
  signHash,
  nonce,
  gasPriceWei,
  dataHex,
  broadcast = true,
  estimateFailureMessage,
}: SendAbiTransactionStrictParams): Promise<SendEthResult> => {
  const fromChecksum = sanitizeAddress(from);
  const toChecksum = sanitizeAddress(to);
  const data = ensureHexData(dataHex);

  const [resolvedNonce, resolvedGasPrice] = await Promise.all([
    nonce ?? fetchNonce(fromChecksum),
    gasPriceWei ?? fetchGasPrice(),
  ]);

  const estimatedGasLimit = await estimateGasLimitStrict({
    from: fromChecksum,
    to: toChecksum,
    valueWei,
    data,
    estimateFailureMessage,
  });

  return sendEthTransaction({
    from: fromChecksum,
    to: toChecksum,
    valueWei,
    pin,
    signHash,
    nonce: resolvedNonce,
    gasPriceWei: resolvedGasPrice,
    gasLimitWei: applyGasEstimateBuffer(estimatedGasLimit),
    dataHex,
    broadcast,
  });
};
