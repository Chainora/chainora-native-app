import {
  getAddress,
  hashTypedData,
  hashMessage,
  hexToBytes,
  isAddress,
  type Address,
} from 'viem';

import { getNetworkList, getActiveNetwork, setActiveNetwork } from '../../config/network';
import { withVerifiedWalletSession } from '../cardService';
import { sendEthTransaction } from '../transactionService';
import { recoverSignature } from '../transaction/signatureUtils';

export type WalletConnectEvmRequest = {
  id?: string | number;
  method: string;
  params?: unknown;
};

export type WalletConnectRequestContext = {
  pin: string;
  expectedAddress: string;
};

export class WalletConnectUnsupportedMethodError extends Error {
  readonly code = 4200;

  constructor(method: string) {
    super(`Method not supported: ${method}`);
    this.name = 'WalletConnectUnsupportedMethodError';
  }
}

const parseAddress = (value: unknown, fieldName: string): Address => {
  const raw = String(value ?? '').trim();
  if (!isAddress(raw)) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  return getAddress(raw);
};

const parseBigInt = (value: unknown, fallback = 0n): bigint => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    try {
      if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    } catch {
      throw new Error(`Invalid bigint value: ${trimmed}`);
    }
  }

  throw new Error('Invalid bigint value.');
};

const resolveSessionAddress = async (context: WalletConnectRequestContext): Promise<Address> => {
  const expectedAddress = parseAddress(context.expectedAddress, 'expectedAddress');

  return withVerifiedWalletSession(context.pin, async session => {
    const signerAddress = getAddress(session.ethAddress);
    if (signerAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error('Card signer does not match the active wallet address.');
    }
    return signerAddress;
  });
};

const getParamAt = (params: unknown, index: number): unknown => {
  if (!Array.isArray(params)) {
    return undefined;
  }
  return params[index];
};

const normalizePersonalSignMessage = (rawMessage: unknown): string => {
  const message = String(rawMessage ?? '');
  if (!message.startsWith('0x')) {
    return message;
  }

  try {
    const bytes = hexToBytes(message as `0x${string}`);
    return new TextDecoder().decode(bytes);
  } catch {
    return message;
  }
};

const parseSwitchChainRequest = (params: unknown): bigint => {
  const candidate = getParamAt(params, 0);
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid wallet_switchEthereumChain params.');
  }

  const chainIdValue = (candidate as { chainId?: unknown }).chainId;
  if (!chainIdValue) {
    throw new Error('Missing chainId in wallet_switchEthereumChain.');
  }

  return parseBigInt(chainIdValue);
};

const normalizePersonalSignMessageAndAddress = ({
  params,
  expectedAddress,
}: {
  params: unknown;
  expectedAddress: Address;
}): { message: string; address: Address } => {
  const first = getParamAt(params, 0);
  const second = getParamAt(params, 1);

  const firstRaw = String(first ?? '').trim();
  const secondRaw = String(second ?? '').trim();

  const firstIsAddress = isAddress(firstRaw);
  const secondIsAddress = isAddress(secondRaw);

  let messageCandidate: unknown = first;
  let addressCandidate: unknown = second;

  if (firstIsAddress && !secondIsAddress) {
    messageCandidate = second;
    addressCandidate = first;
  }

  const resolvedAddress = parseAddress(addressCandidate ?? expectedAddress, 'personal_sign address');
  const message = normalizePersonalSignMessage(messageCandidate);

  return {
    message,
    address: resolvedAddress,
  };
};

const parseTypedDataV4Hash = (params: unknown): `0x${string}` => {
  const first = getParamAt(params, 0);
  const second = getParamAt(params, 1);

  // Typical order: [address, typedData] or [typedData, address]
  const typedDataRaw = (
    typeof first === 'string' && isAddress(first)
      ? second
      : first
  ) ?? second;

  if (!typedDataRaw) {
    throw new Error('Missing typed data payload.');
  }

  let parsed: Record<string, unknown>;
  if (typeof typedDataRaw === 'string') {
    try {
      parsed = JSON.parse(typedDataRaw) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid typed data JSON payload.');
    }
  } else if (typeof typedDataRaw === 'object') {
    parsed = typedDataRaw as Record<string, unknown>;
  } else {
    throw new Error('Invalid typed data payload.');
  }

  const domain = (parsed.domain ?? {}) as Record<string, unknown>;
  const message = (parsed.message ?? {}) as Record<string, unknown>;
  const rawTypes = (parsed.types ?? {}) as Record<string, unknown>;
  const primaryTypeRaw = String(parsed.primaryType ?? '').trim();

  if (!primaryTypeRaw) {
    throw new Error('Typed data primaryType is missing.');
  }

  const typesWithoutDomain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawTypes)) {
    if (key === 'EIP712Domain') {
      continue;
    }
    typesWithoutDomain[key] = value;
  }

  return hashTypedData({
    domain,
    primaryType: primaryTypeRaw as never,
    types: typesWithoutDomain as never,
    message,
  } as never);
};

const switchToChainId = (chainId: bigint): string => {
  const next = getNetworkList().find(network => BigInt(network.chainId) === chainId);
  if (!next) {
    throw new Error(`Unsupported chainId: 0x${chainId.toString(16)}`);
  }

  setActiveNetwork(next.key);
  return `0x${chainId.toString(16)}`;
};

const buildSignatureFromHash = async ({
  hashHex,
  context,
}: {
  hashHex: `0x${string}`;
  context: WalletConnectRequestContext;
}): Promise<`0x${string}`> => {
  return withVerifiedWalletSession(context.pin, async session => {
    const expectedAddress = parseAddress(context.expectedAddress, 'expectedAddress');
    const signerAddress = getAddress(session.ethAddress);
    if (signerAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error('Card signer does not match the active wallet address.');
    }

    const signResult = await session.signHash(hexToBytes(hashHex));
    if (!signResult.ok || !signResult.signatureDer || !signResult.publicKeyHex) {
      throw new Error(signResult.message || 'Failed to sign request with card.');
    }

    const recovered = recoverSignature(
      hexToBytes(hashHex),
      signResult.signatureDer,
      signResult.publicKeyHex,
      getActiveNetwork().chainId,
    );
    // EIP-191 / EIP-712 signatures use a 1-byte v of 27 + recovery, not the
    // EIP-155 encoding (chainId * 2 + 35 + recovery) used for legacy tx.
    const vByte = (27 + recovered.recovery).toString(16).padStart(2, '0');
    return `${recovered.r}${recovered.s.slice(2)}${vByte}` as `0x${string}`;
  });
};

const handleEthSendTransaction = async (
  params: unknown,
  context: WalletConnectRequestContext,
): Promise<string> => {
  const txObject = getParamAt(params, 0);
  if (!txObject || typeof txObject !== 'object') {
    throw new Error('Invalid eth_sendTransaction params.');
  }

  const source = txObject as {
    from?: unknown;
    to?: unknown;
    value?: unknown;
    data?: unknown;
    nonce?: unknown;
    gas?: unknown;
    gasPrice?: unknown;
    maxFeePerGas?: unknown;
    maxPriorityFeePerGas?: unknown;
  };

  const from = parseAddress(source.from ?? context.expectedAddress, 'from');
  const expectedAddress = parseAddress(context.expectedAddress, 'expectedAddress');
  if (from.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('Transaction account does not match active wallet address.');
  }

  const to = parseAddress(source.to, 'to');
  const gasPriceLike = source.gasPrice ?? source.maxFeePerGas;

  const result = await sendEthTransaction({
    from,
    to,
    valueWei: parseBigInt(source.value, 0n),
    pin: context.pin,
    nonce: source.nonce === undefined ? undefined : parseBigInt(source.nonce),
    gasLimitWei: source.gas === undefined ? undefined : parseBigInt(source.gas),
    gasPriceWei: gasPriceLike === undefined ? undefined : parseBigInt(gasPriceLike),
    dataHex: typeof source.data === 'string' ? source.data : undefined,
  });

  return result.transactionHash;
};

export const handleWalletConnectEvmRequest = async ({
  request,
  context,
}: {
  request: WalletConnectEvmRequest;
  context: WalletConnectRequestContext;
}): Promise<unknown> => {
  switch (request.method) {
    case 'eth_requestAccounts':
    case 'eth_accounts': {
      // Return the session's expected address without requiring a fresh card
      // tap. A dApp only needs the address here; any signing operation will
      // verify the card identity separately.
      const address = parseAddress(context.expectedAddress, 'expectedAddress');
      return [address];
    }

    case 'eth_chainId': {
      return `0x${BigInt(getActiveNetwork().chainId).toString(16)}`;
    }

    case 'wallet_switchEthereumChain': {
      const chainId = parseSwitchChainRequest(request.params);
      return switchToChainId(chainId);
    }

    case 'personal_sign': {
      const expectedAddress = parseAddress(context.expectedAddress, 'expectedAddress');
      const { message, address } = normalizePersonalSignMessageAndAddress({
        params: request.params,
        expectedAddress,
      });
      if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
        throw new Error('Signature account does not match active wallet address.');
      }
      const hashHex = hashMessage(message);
      return buildSignatureFromHash({
        hashHex,
        context,
      });
    }

    case 'eth_signTypedData_v4': {
      const hashHex = parseTypedDataV4Hash(request.params);
      return buildSignatureFromHash({
        hashHex,
        context,
      });
    }

    case 'eth_sendTransaction': {
      return handleEthSendTransaction(request.params, context);
    }

    default:
      throw new WalletConnectUnsupportedMethodError(request.method);
  }
};
