import { keccak_256 } from '@noble/hashes/sha3';

import { NETWORK } from '../config/network';
import { signTransactionHash } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';
import { bytesToHex, hexToBytes } from '../utils/encoding';

const RPC_TIMEOUT_MS = 10_000;
const LEGACY_GAS_LIMIT = 21_000n;
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

const jsonRpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(NETWORK.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`RPC ${method} failed with status ${response.status}: ${message}`);
    }

    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) {
      throw new Error(payload.error.message ?? `RPC ${method} returned an error`);
    }
    if (payload.result === undefined) {
      throw new Error(`RPC ${method} returned no result`);
    }

    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
};

const hexToBigInt = (value: string): bigint => {
  const sanitized = value.startsWith('0x') ? value.slice(2) : value;
  if (sanitized.length === 0) {
    return 0n;
  }
  return BigInt(`0x${sanitized}`);
};

const toChecksumAddress = (address: string): string => {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  if (hex.length !== 40) {
    throw new Error('Ethereum address must contain 40 hex characters');
  }
  const lower = hex.toLowerCase();
  const ascii = new Uint8Array(lower.length);
  for (let index = 0; index < lower.length; index += 1) {
    ascii[index] = lower.charCodeAt(index);
  }
  const hash = keccak_256(ascii);
  const hashHex = bytesToHex(hash).toLowerCase();
  let result = '0x';
  for (let index = 0; index < lower.length; index += 1) {
    const character = lower[index];
    const shouldUppercase = parseInt(hashHex[index], 16) >= 8;
    result += shouldUppercase ? character.toUpperCase() : character;
  }
  return result;
};

const sanitizeAddress = (address: string): string => toChecksumAddress(address);

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
  const result = await jsonRpc<string>('eth_getTransactionCount', [address, 'pending']);
  return hexToBigInt(result);
};

const fetchGasPrice = async (): Promise<bigint> => {
  const result = await jsonRpc<string>('eth_gasPrice', []);
  return hexToBigInt(result);
};

const sendRawTransaction = async (payloadHex: string): Promise<string> =>
  jsonRpc<string>('eth_sendRawTransaction', [payloadHex]);

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
  const resolvedGasLimit = gasLimitWei ?? LEGACY_GAS_LIMIT;
  const data = ensureHexData(dataHex);

  const unsigned = buildUnsignedLegacyTx({
    nonce: resolvedNonce,
    gasPrice: resolvedGasPrice,
    gasLimit: resolvedGasLimit,
    to: toChecksum,
    value: valueWei,
    data,
    chainId: BigInt(NETWORK.chainId),
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
    NETWORK.chainId,
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
