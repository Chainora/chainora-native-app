import { Point, Signature } from '@noble/secp256k1';

import { hexToBytes } from '../../utils/encoding';

export type RecoveredSignature = {
  r: string;
  s: string;
  v: string;
  recovery: number;
};

const toCanonicalPublicKeyBytes = (publicKeyHex: string): Uint8Array => {
  const bytes = hexToBytes(publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex);
  if (bytes.length === 33 || bytes.length === 65) {
    const point = Point.fromHex(bytes);
    const uncompressed = point.toRawBytes(false);
    return uncompressed.slice(1);
  }
  if (bytes.length === 64) {
    return bytes;
  }
  throw new Error(`Unsupported public key length (${bytes.length}).`);
};

const parseDerLength = (bytes: Uint8Array, offset: number): { length: number; nextOffset: number } => {
  let cursor = offset;
  if (cursor >= bytes.length) {
    throw new Error('Malformed DER signature length');
  }
  let length = bytes[cursor];
  cursor += 1;

  if (length <= 0x7f) {
    return { length, nextOffset: cursor };
  }

  const byteCount = length & 0x7f;
  if (byteCount === 0 || byteCount > 2 || cursor + byteCount > bytes.length) {
    throw new Error('Malformed DER signature length encoding');
  }

  length = 0;
  for (let index = 0; index < byteCount; index += 1) {
    length = (length << 8) | bytes[cursor + index];
  }
  cursor += byteCount;

  return { length, nextOffset: cursor };
};

const parseDerInteger = (bytes: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } => {
  if (offset >= bytes.length || bytes[offset] !== 0x02) {
    throw new Error('Malformed DER signature integer tag');
  }
  const { length, nextOffset } = parseDerLength(bytes, offset + 1);
  const end = nextOffset + length;
  if (end > bytes.length) {
    throw new Error('Malformed DER signature integer length');
  }
  const value = bytes.slice(nextOffset, end);
  return { value, nextOffset: end };
};

const trimInteger = (value: Uint8Array): Uint8Array => {
  let offset = 0;
  while (offset < value.length - 1 && value[offset] === 0) {
    offset += 1;
  }
  return value.slice(offset);
};

const padTo32Bytes = (value: Uint8Array): Uint8Array => {
  const trimmed = trimInteger(value);
  if (trimmed.length > 32) {
    throw new Error('DER integer exceeds 32 bytes');
  }
  const out = new Uint8Array(32);
  out.set(trimmed, 32 - trimmed.length);
  return out;
};

const derToSignature = (der: Uint8Array): Signature => {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER signature header');
  }

  const { length: sequenceLength, nextOffset: seqOffset } = parseDerLength(der, 1);
  if (sequenceLength !== der.length - seqOffset) {
    throw new Error('Incorrect DER sequence length');
  }

  const firstInteger = parseDerInteger(der, seqOffset);
  const secondInteger = parseDerInteger(der, firstInteger.nextOffset);

  if (secondInteger.nextOffset !== der.length) {
    throw new Error('Unexpected bytes after DER signature');
  }

  const rBytes = padTo32Bytes(firstInteger.value);
  const sBytes = padTo32Bytes(secondInteger.value);
  const compact = new Uint8Array(64);
  compact.set(rBytes, 0);
  compact.set(sBytes, 32);
  return Signature.fromBytes(compact);
};

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
};

const bigintToHex = (value: bigint): string => `0x${value.toString(16).padStart(64, '0')}`;

export const recoverSignature = (
  messageHash: Uint8Array,
  signatureDer: Uint8Array,
  publicKeyHex: string,
  chainId: number,
): RecoveredSignature => {
  const signature = derToSignature(signatureDer);
  const canonical = signature.normalizeS();
  const compact = canonical.toCompactRawBytes();
  const expectedKey = toCanonicalPublicKeyBytes(publicKeyHex);

  let recovery = -1;
  for (let index = 0; index < 4; index += 1) {
    try {
      const recoveredPoint = canonical.addRecoveryBit(index).recoverPublicKey(messageHash);
      const candidate = recoveredPoint.toRawBytes(false).slice(1);
      if (equalBytes(candidate, expectedKey)) {
        recovery = index;
        break;
      }
    } catch {
      // Ignore invalid recovery attempts
    }
  }

  if (recovery === -1) {
    throw new Error('Unable to derive recovery identifier for card signature');
  }

  const rHex = bigintToHex(canonical.r);
  const sHex = bigintToHex(canonical.s);
  const vValue = BigInt(chainId) * 2n + 35n + BigInt(recovery);
  const vHexBody = vValue.toString(16);
  const vHex = `0x${vHexBody.length % 2 === 0 ? vHexBody : `0${vHexBody}`}`;

  return {
    r: rHex,
    s: sHex,
    v: vHex,
    recovery,
  };
};
