import { keccak_256 } from '@noble/hashes/sha3.js';
import { getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import { signTransactionHash } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';
import { getPublicViemClient } from './web3Client';
import { bytesToHex, hexToBytes } from '../utils/encoding';

const LEGACY_GAS_LIMIT = 21_000n;
const GAS_ESTIMATE_BUFFER_NUMERATOR = 12n;
const GAS_ESTIMATE_BUFFER_DENOMINATOR = 10n;
const ZERO_BYTES = new Uint8Array(0);

export type SendEthParams = {
  from: string;
  to: string;
  valueWei: bigint;
  pin: string;
  nonce?: bigint;
  gasPriceWei?: bigint;
  gasLimitWei?: bigint;
  dataHex?: string;
};

export type SendEthResult = {
  transactionHash: string;
  rawTransaction: string;
  nonce: bigint;
  gasPriceWei: bigint;
  gasLimitWei: bigint;
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
  const nonce = await client.getTransactionCount({
    address: getAddress(address),
    blockTag: 'pending',
  });
  return BigInt(nonce);
};

const fetchGasPrice = async (): Promise<bigint> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  return client.getGasPrice();
};

const applyGasEstimateBuffer = (estimate: bigint): bigint =>
  (estimate * GAS_ESTIMATE_BUFFER_NUMERATOR + (GAS_ESTIMATE_BUFFER_DENOMINATOR - 1n)) /
  GAS_ESTIMATE_BUFFER_DENOMINATOR;

const estimateGasLimit = async (params: {
  from: string;
  to: string;
  valueWei: bigint;
  data: Uint8Array;
}): Promise<bigint | null> => {
  try {
    const network = getActiveNetwork();
    const client = getPublicViemClient(network);
    const estimated = await client.estimateGas({
      account: getAddress(params.from),
      to: getAddress(params.to),
      value: params.valueWei,
      data: (`0x${bytesToHex(params.data)}` as `0x${string}`),
    });
    return estimated;
  } catch {
    return null;
  }
};

export const fetchSuggestedGasPriceWei = async (): Promise<bigint> => {
  return fetchGasPrice();
};

const sendRawTransaction = async (payloadHex: string): Promise<string> => {
  const network = getActiveNetwork();
  const client = getPublicViemClient(network);
  return client.sendRawTransaction({ serializedTransaction: payloadHex as `0x${string}` });
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
  nonce,
  gasPriceWei,
  gasLimitWei,
  dataHex,
}: SendEthParams): Promise<SendEthResult> => {
  const fromChecksum = sanitizeAddress(from);
  const toChecksum = sanitizeAddress(to);

  const resolvedNonce = nonce ?? (await fetchNonce(fromChecksum));
  const resolvedGasPrice = gasPriceWei ?? (await fetchGasPrice());
  const data = ensureHexData(dataHex);
  const estimatedGasLimit = await estimateGasLimit({
    from: fromChecksum,
    to: toChecksum,
    valueWei,
    data,
  });
  const baselineGasLimit = gasLimitWei ?? LEGACY_GAS_LIMIT;
  const resolvedGasLimit = estimatedGasLimit
    ? baselineGasLimit > estimatedGasLimit
      ? baselineGasLimit
      : applyGasEstimateBuffer(estimatedGasLimit)
    : baselineGasLimit;

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

  const signatureResult = await signTransactionHash(pin, messageHash);
  if (!signatureResult.ok || !signatureResult.signatureDer || !signatureResult.publicKeyHex) {
    throw new Error(signatureResult.message);
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
  const transactionHash = await sendRawTransaction(rawTxHex);

  return {
    transactionHash,
    rawTransaction: rawTxHex,
    nonce: resolvedNonce,
    gasPriceWei: resolvedGasPrice,
    gasLimitWei: resolvedGasLimit,
  };
};
