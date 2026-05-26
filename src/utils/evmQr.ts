import { getAddress } from 'viem';

export type ReceiveQrPayload = {
  address: string;
  chainId?: number;
};

const EVM_ADDRESS_PATTERN = '0x[a-fA-F0-9]{40}';
const PLAIN_ADDRESS_REGEX = new RegExp(`^${EVM_ADDRESS_PATTERN}$`);
const RECEIVE_URI_REGEX = new RegExp(
  `^ethereum:(?:pay-)?(${EVM_ADDRESS_PATTERN})(?:@(\\d+))?(?:[/?].*)?$`,
  'i',
);

const normalizeChainId = (chainId: number): number => {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Invalid EVM chain id');
  }

  return chainId;
};

const parseChainId = (value: string | undefined): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
};

const toChecksumAddress = (value: string): string | null => {
  try {
    return getAddress(value);
  } catch {
    return null;
  }
};

export const buildReceiveQrUri = (address: string, chainId: number): string => {
  const checksumAddress = getAddress(address.trim());
  return `ethereum:${checksumAddress}@${normalizeChainId(chainId)}`;
};

export const parseReceiveQrPayload = (
  payload: string,
): ReceiveQrPayload | null => {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  if (PLAIN_ADDRESS_REGEX.test(trimmed)) {
    const address = toChecksumAddress(trimmed);
    return address ? { address } : null;
  }

  const match = RECEIVE_URI_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const chainId = parseChainId(match[2]);
  if (chainId === null) {
    return null;
  }

  const address = toChecksumAddress(match[1]);
  if (!address) {
    return null;
  }

  return {
    address,
    ...(chainId === undefined ? {} : { chainId }),
  };
};
