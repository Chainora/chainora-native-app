import { getAddress } from 'viem';

export const SUBMIT_JOIN_REQUEST_SELECTOR = '0xd7dc9bc7';
export const PROPOSE_INVITE_SELECTOR = '0x017ebb91';
export const CONTRIBUTE_SELECTOR = '0xd7bb99ba';
export const SUBMIT_DISCOUNT_BID_SELECTOR = '0xb30e0159';

export const UINT256_MAX = (1n << 256n) - 1n;
export const CONTRIBUTION_APPROVE_FALLBACK_GAS_LIMIT = 80_000n;
export const CONTRIBUTION_TX_FALLBACK_GAS_LIMIT = 220_000n;
export const BID_TX_FALLBACK_GAS_LIMIT = 180_000n;

export const isPoolActionSimulationRevertError = (message: string): boolean =>
  message.toLowerCase().includes('transaction simulation indicates revert');

export const isNonceConflictLikeError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('nonce too low')
    || normalized.includes('nonce has already been used')
    || normalized.includes('replacement transaction underpriced')
    || normalized.includes('already known')
    || normalized.includes('invalid transaction nonce')
    || normalized.includes('transaction underpriced')
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
