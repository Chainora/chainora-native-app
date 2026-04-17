import { DEVICE_VERIFY_CACHE_TTL_MS } from './constants';

type DeviceVerificationCacheEntry = {
  verified: boolean;
  updatedAtMs: number;
};

const deviceVerificationCache = new Map<string, DeviceVerificationCacheEntry>();

export const buildDeviceVerificationCacheKey = (
  chainId: number,
  factoryAddress: `0x${string}`,
  accountAddress: `0x${string}`,
): string => `${chainId}:${factoryAddress.toLowerCase()}:${accountAddress.toLowerCase()}`;

export const readDeviceVerificationCache = (key: string): boolean | null => {
  const cached = deviceVerificationCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.updatedAtMs > DEVICE_VERIFY_CACHE_TTL_MS) {
    deviceVerificationCache.delete(key);
    return null;
  }

  return cached.verified;
};

export const writeDeviceVerificationCache = (key: string, verified: boolean): void => {
  deviceVerificationCache.set(key, {
    verified,
    updatedAtMs: Date.now(),
  });
};
