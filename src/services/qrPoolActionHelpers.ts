import { getAddress } from 'viem';

export const SUBMIT_JOIN_REQUEST_SELECTOR = '0xd7dc9bc7';
export const PROPOSE_INVITE_SELECTOR = '0x017ebb91';
export const ACCEPT_INVITE_SELECTOR = '0xbf8e9176';
export const ACCEPT_JOIN_REQUEST_SELECTOR = '0x558c1642';
export const CONTRIBUTE_SELECTOR = '0xd7bb99ba';
export const SUBMIT_DISCOUNT_BID_SELECTOR = '0xb30e0159';

export const UINT256_MAX = (1n << 256n) - 1n;

export const isPoolActionSimulationRevertError = (message: string): boolean =>
  message.toLowerCase().includes('transaction simulation indicates revert');

export const isNonceConflictLikeError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('nonce too low')
    || normalized.includes('nonce too high')
    || normalized.includes('nonce has already been used')
    || normalized.includes('nonce gap')
    || normalized.includes('replacement transaction underpriced')
    || normalized.includes('already known')
    || normalized.includes('invalid transaction nonce')
    || normalized.includes('transaction underpriced')
    || normalized.includes('account sequence mismatch')
    || normalized.includes('incorrect account sequence')
  );
};

export const decodeSingleAddressArgument = (calldata: string): `0x${string}` | null => {
  const trimmed = String(calldata ?? '').trim();
  if (!trimmed.startsWith('0x')) {
    return null;
  }

  const body = trimmed.slice(2);
  // 4-byte selector + one 32-byte ABI-encoded argument.
  if (body.length < 8 + 64) {
    return null;
  }

  const argumentSlot = body.slice(8, 72);
  const rawAddress = `0x${argumentSlot.slice(24)}`;
  try {
    return getAddress(rawAddress);
  } catch {
    return null;
  }
};

export const decodeSingleUint256Argument = (calldata: string): bigint | null => {
  const trimmed = String(calldata ?? '').trim();
  if (!trimmed.startsWith('0x')) {
    return null;
  }

  const body = trimmed.slice(2);
  // 4-byte selector + one 32-byte ABI-encoded argument.
  if (body.length < 8 + 64) {
    return null;
  }

  const argumentSlot = body.slice(8, 72);
  try {
    return BigInt(`0x${argumentSlot}`);
  } catch {
    return null;
  }
};
