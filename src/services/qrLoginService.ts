import { decodeEventLog, encodeFunctionData, getAddress, parseUnits } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  DEVICE_ADAPTER_READ_ABI,
  DEVICE_ADAPTER_WRITE_ABI,
  ERC20_READ_ABI,
  ERC20_WRITE_ABI,
  FACTORY_CREATE_POOL_ABI,
  FACTORY_READ_ABI,
  POOL_READ_ABI,
  REGISTRY_READ_ABI,
  REPUTATION_ADAPTER_READ_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import { buildAuthMessage, buildEip191Hash } from './qr-login/cryptoUtils';
import {
  buildDeviceVerificationCacheKey,
  readDeviceVerificationCache,
  writeDeviceVerificationCache,
} from './qr-login/deviceVerificationCache';
import {
  CREATE_POOL_PRECHECK_CONTINUE_STATUS,
  CREATE_POOL_QR_FEATURE,
  CREATE_POOL_RPC_TIMEOUT_MESSAGE,
  DEVICE_NOT_VERIFIED_MESSAGE,
  POOL_ACTION_QR_FEATURE,
  PRECHECK_DIAG_TIMEOUT_MS,
  PRECHECK_SIMULATE_TIMEOUT_MS,
} from './qr-login/constants';
import {
  buildAccountNotActivatedMessage,
  buildInsufficientGasMessage,
  buildPoolActionAccountNotActivatedMessage,
  buildPoolActionInsufficientGasMessage,
  isInsufficientGasLikeError,
  isRpcTimeoutLikeError,
  isUnknownAccountLikeError,
  logCreateGroupGasIssue,
  logPoolActionEvent,
  logPoolActionIssue,
} from './qr-login/errorUtils';
import {
  ensureField,
  extractResponseData,
  fetchWithTimeout,
  normalizeApiBase,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { isDeviceNotVerifiedError, mapCreatePoolRevertMessage } from './qr-login/precheckUtils';
import { runWithSoftTimeout, waitForTransactionReceiptWithRetry, withOperationTimeout } from './qr-login/rpcUtils';
import { createStatusPublisher } from './qr-login/statusPublisher';
import { signHashAndAttestInOneTap, signTransactionHash } from './cardService';
import { sendEthTransaction } from './transactionService';
import { recoverSignature } from './transaction/signatureUtils';
import { getPublicViemClient } from './web3Client';
import { bytesToHex, hexToBytes } from '../utils/encoding';

const SUBMIT_JOIN_REQUEST_SELECTOR = '0xd7dc9bc7';
const PROPOSE_INVITE_SELECTOR = '0x017ebb91';
const CONTRIBUTE_SELECTOR = '0xd7bb99ba';
const UINT256_MAX = (1n << 256n) - 1n;

const isPoolActionSimulationRevertError = (message: string): boolean =>
  message.toLowerCase().includes('transaction simulation indicates revert');

const decodeSingleAddressArgument = (calldata: string): `0x${string}` | null => {
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

const resolveRegistryAndDeviceAdapter = async ({
  client,
  factoryAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  factoryAddress: `0x${string}`;
}): Promise<{ registryAddress: `0x${string}`; deviceAdapterAddress: `0x${string}` }> => {
  const registryAddress = await client.readContract({
    address: factoryAddress,
    abi: FACTORY_READ_ABI,
    functionName: 'registry',
  });

  const deviceAdapterAddress = await client.readContract({
    address: registryAddress,
    abi: REGISTRY_READ_ABI,
    functionName: 'deviceAdapter',
  });

  return {
    registryAddress,
    deviceAdapterAddress,
  };
};

const createSessionStatusPublisher = ({
  apiBase,
  sessionId,
  enabled = true,
  minIntervalMs = 250,
}: {
  apiBase: string;
  sessionId: string;
  enabled?: boolean;
  minIntervalMs?: number;
}) => {
  return createStatusPublisher({
    enabled: enabled && Boolean(sessionId) && Boolean(apiBase),
    minIntervalMs,
    publish: status => {
      if (!sessionId || !apiBase) {
        return;
      }
      void notifyQrLoginProgress({
        apiBase,
        sessionId,
        status,
      }).catch(() => undefined);
    },
  });
};

const diagnoseCreatePoolPrecheck = async ({
  client,
  factoryAddress,
  accountAddress,
  minReputation,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  factoryAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  minReputation: bigint;
}): Promise<string | null> => {
  try {
    const registryAddress = await client.readContract({
      address: factoryAddress,
      abi: FACTORY_READ_ABI,
      functionName: 'registry',
    });
    const [stablecoinAddress, deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'stablecoin',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'deviceAdapter',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'reputationAdapter',
      }),
    ]);

    if (stablecoinAddress.toLowerCase() === ZERO_ADDRESS) {
      return 'Create pool blocked: protocol registry stablecoin is not configured.';
    }

    if (deviceAdapterAddress.toLowerCase() === ZERO_ADDRESS) {
      return null;
    }

    const isVerified = await client.readContract({
      address: deviceAdapterAddress,
      abi: DEVICE_ADAPTER_READ_ABI,
      functionName: 'isDeviceVerified',
      args: [accountAddress],
    });

    if (!isVerified) {
      return DEVICE_NOT_VERIFIED_MESSAGE;
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const currentScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [accountAddress],
      });

      if (currentScore < minReputation) {
        return `Create pool blocked: wallet reputation score (${currentScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

const diagnoseSubmitJoinRequestPrecheck = async ({
  client,
  poolAddress,
  accountAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
}): Promise<string | null> => {
  try {
    const [poolStatus, publicRecruitment, isActiveMember, minReputation, registryAddress] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'poolStatus',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'publicRecruitment',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'minReputation',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'registry',
      }),
    ]);

    if (Number(poolStatus) !== 0) {
      return 'Join request blocked: this group is no longer in Forming state.';
    }

    if (!publicRecruitment) {
      return 'Join request blocked: this group is private and only accepts invite proposals.';
    }

    if (isActiveMember) {
      return 'Join request blocked: this wallet is already an active member of the group.';
    }

    const [deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'deviceAdapter',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'reputationAdapter',
      }),
    ]);

    if (deviceAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const isVerified = await client.readContract({
        address: deviceAdapterAddress,
        abi: DEVICE_ADAPTER_READ_ABI,
        functionName: 'isDeviceVerified',
        args: [accountAddress],
      });

      if (!isVerified) {
        return 'Join request blocked: this wallet is not device-verified on protocol adapter yet.';
      }
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const currentScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [accountAddress],
      });

      if (currentScore < minReputation) {
        return `Join request blocked: wallet reputation score (${currentScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

const diagnoseProposeInvitePrecheck = async ({
  client,
  poolAddress,
  accountAddress,
  candidateAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
  candidateAddress: `0x${string}`;
}): Promise<string | null> => {
  try {
    if (candidateAddress.toLowerCase() === ZERO_ADDRESS) {
      return 'Invite blocked: candidate wallet address is zero address.';
    }

    const [poolStatus, proposerIsActive, candidateIsActive, minReputation, registryAddress] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'poolStatus',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [candidateAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'minReputation',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'registry',
      }),
    ]);

    if (Number(poolStatus) !== 0) {
      return 'Invite blocked: this group is no longer in Forming state.';
    }

    if (!proposerIsActive) {
      return 'Invite blocked: only active members can propose invites.';
    }

    if (accountAddress.toLowerCase() === candidateAddress.toLowerCase()) {
      return 'Invite blocked: you cannot invite your own wallet.';
    }

    if (candidateIsActive) {
      return 'Invite blocked: candidate is already an active member of this group.';
    }

    const [deviceAdapterAddress, reputationAdapterAddress] = await Promise.all([
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'deviceAdapter',
      }),
      client.readContract({
        address: registryAddress,
        abi: REGISTRY_READ_ABI,
        functionName: 'reputationAdapter',
      }),
    ]);

    if (deviceAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const isVerified = await client.readContract({
        address: deviceAdapterAddress,
        abi: DEVICE_ADAPTER_READ_ABI,
        functionName: 'isDeviceVerified',
        args: [candidateAddress],
      });

      if (!isVerified) {
        return 'Invite blocked: candidate wallet is not device-verified on protocol adapter yet.';
      }
    }

    if (minReputation > 0n && reputationAdapterAddress.toLowerCase() !== ZERO_ADDRESS) {
      const candidateScore = await client.readContract({
        address: reputationAdapterAddress,
        abi: REPUTATION_ADAPTER_READ_ABI,
        functionName: 'scoreOf',
        args: [candidateAddress],
      });

      if (candidateScore < minReputation) {
        return `Invite blocked: candidate reputation score (${candidateScore.toString()}) must be greater than or equal to minReputation (${minReputation.toString()}).`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

type ContributePrecheckResult = {
  blockedReason: string | null;
  needsApproval: boolean;
  stablecoinAddress: `0x${string}` | null;
  contributionAmount: bigint | null;
  allowance: bigint | null;
  balance: bigint | null;
};

const diagnoseContributePrecheck = async ({
  client,
  poolAddress,
  accountAddress,
}: {
  client: ReturnType<typeof getPublicViemClient>;
  poolAddress: `0x${string}`;
  accountAddress: `0x${string}`;
}): Promise<ContributePrecheckResult> => {
  try {
    const [poolStatus, isActiveMember, stablecoinAddress, contributionAmount] = await Promise.all([
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'poolStatus',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'isActiveMember',
        args: [accountAddress],
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'stablecoin',
      }),
      client.readContract({
        address: poolAddress,
        abi: POOL_READ_ABI,
        functionName: 'contributionAmount',
      }),
    ]);

    if (Number(poolStatus) !== 1) {
      return {
        blockedReason: 'Contribute blocked: group is not Active yet.',
        needsApproval: false,
        stablecoinAddress: null,
        contributionAmount: null,
        allowance: null,
        balance: null,
      };
    }

    if (!isActiveMember) {
      return {
        blockedReason: 'Contribute blocked: only active members can contribute.',
        needsApproval: false,
        stablecoinAddress: null,
        contributionAmount: null,
        allowance: null,
        balance: null,
      };
    }

    if (stablecoinAddress.toLowerCase() === ZERO_ADDRESS) {
      return {
        blockedReason: 'Contribute blocked: group stablecoin is not configured.',
        needsApproval: false,
        stablecoinAddress: null,
        contributionAmount: null,
        allowance: null,
        balance: null,
      };
    }

    const [allowance, balance] = await Promise.all([
      client.readContract({
        address: stablecoinAddress,
        abi: ERC20_READ_ABI,
        functionName: 'allowance',
        args: [accountAddress, poolAddress],
      }),
      client.readContract({
        address: stablecoinAddress,
        abi: ERC20_READ_ABI,
        functionName: 'balanceOf',
        args: [accountAddress],
      }),
    ]);

    if (balance < contributionAmount) {
      return {
        blockedReason:
          `Contribute blocked: stablecoin balance is too low. `
          + `Required ${contributionAmount.toString()}, current ${balance.toString()}.`,
        needsApproval: false,
        stablecoinAddress,
        contributionAmount,
        allowance,
        balance,
      };
    }

    return {
      blockedReason: null,
      needsApproval: allowance < contributionAmount,
      stablecoinAddress,
      contributionAmount,
      allowance,
      balance,
    };
  } catch {
    return {
      blockedReason: null,
      needsApproval: false,
      stablecoinAddress: null,
      contributionAmount: null,
      allowance: null,
      balance: null,
    };
  }
};

type CreatePoolQrData = {
  factoryAddress: string;
  contributionAmount: string;
  contributionAmountWei?: string;
  publicRecruitment?: boolean;
  contributionTokenSymbol?: string;
  targetMembers: number;
  periodDurationSeconds: number;
  contributionWindowSeconds: number;
  auctionWindowSeconds: number;
  groupName?: string;
  groupDescription?: string;
  groupImageUrl?: string;
  minReputationScore?: number;
  authToken?: string;
  skipPrecheck?: boolean;
};

type PoolActionQrData = {
  to: string;
  data: string;
  valueWei?: string;
  label?: string;
  poolAddress?: string;
};

const verifyCardAttestationForCreatePool = async ({
  apiBase,
  pin,
  expectedAddress,
  factoryAddress,
  onProgress,
  onSessionStatus,
}: {
  apiBase: string;
  pin: string;
  expectedAddress: string;
  factoryAddress: `0x${string}`;
  onProgress?: (status: string) => void;
  onSessionStatus?: (status: string) => void;
}): Promise<void> => {
  const accountAddress = getAddress(expectedAddress);
  const activeNetwork = getActiveNetwork();
  const client = getPublicViemClient(activeNetwork);
  const { deviceAdapterAddress } = await resolveRegistryAndDeviceAdapter({
    client,
    factoryAddress,
  });

  if (deviceAdapterAddress.toLowerCase() === ZERO_ADDRESS) {
    onProgress?.('Device adapter is disabled in protocol registry. Skipping device verification attestation.');
    return;
  }

  const verifyMessage = `Verify Chainora device for create-pool access on factory ${factoryAddress}`;
  const messageHash = buildEip191Hash(verifyMessage);

  onSessionStatus?.('create_pool_device_verify_challenge');
  onProgress?.('Wallet is not device-verified. Creating card attestation proof...');
  const signAndAttest = await signHashAndAttestInOneTap<CardChallengeResponse>(
    pin,
    messageHash,
    async ({ address, deviceCertificate }) => {
      if (address.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }

      const challengeEndpoint = `${apiBase}/v1/card/challenge`;
      onProgress?.('Requesting device-verification challenge...');
      const challengeResponse = await fetchWithTimeout(challengeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          deviceCertificate: bytesToHex(deviceCertificate),
        }),
      });

      if (!challengeResponse.ok) {
        const detail = await readApiErrorMessage(
          challengeResponse,
          `Card challenge failed: ${challengeResponse.status} at ${challengeEndpoint}`,
        );
        throw new Error(detail);
      }

      const challengeRaw = (await challengeResponse.json()) as { data?: CardChallengeResponse } | CardChallengeResponse;
      const challengePayload = extractResponseData<CardChallengeResponse>(challengeRaw);

      onProgress?.('Signing challenge with card attestation key...');
      return {
        challenge: hexToBytes(challengePayload.challenge),
        meta: challengePayload,
      };
    },
  );

  if (!signAndAttest.ok || !signAndAttest.attestationProof || !signAndAttest.challengeMeta) {
    throw new Error(signAndAttest.message || 'Unable to create card attestation proof for device verification');
  }

  const verifyEndpoint = `${apiBase}/v1/card/verify`;
  onSessionStatus?.('create_pool_device_verify_backend');
  onProgress?.('Submitting card attestation proof to backend...');
  const verifyCardResponse = await fetchWithTimeout(verifyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: signAndAttest.challengeMeta.challengeId,
      attestationProof: bytesToHex(signAndAttest.attestationProof),
    }),
  });

  if (!verifyCardResponse.ok) {
    const detail = await readApiErrorMessage(
      verifyCardResponse,
      `Card verification failed: ${verifyCardResponse.status} at ${verifyEndpoint}`,
    );
    throw new Error(detail);
  }

  const verifyCardRaw = (await verifyCardResponse.json()) as { data?: CardVerifyResponse } | CardVerifyResponse;
  const verifyCardPayload = extractResponseData<CardVerifyResponse>(verifyCardRaw);

  if (!verifyCardPayload.verified) {
    throw new Error('Card verification did not succeed');
  }

  const deviceAttestationEndpoint = `${apiBase}/v1/card/device-attestation`;
  onSessionStatus?.('create_pool_device_attestation_request');
  onProgress?.('Requesting on-chain device attestation from backend...');
  const deviceAttestationResponse = await fetchWithTimeout(deviceAttestationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address: accountAddress,
      deviceAdapter: deviceAdapterAddress,
    }),
  });

  if (!deviceAttestationResponse.ok) {
    const detail = await readApiErrorMessage(
      deviceAttestationResponse,
      `Device attestation request failed: ${deviceAttestationResponse.status} at ${deviceAttestationEndpoint}`,
    );
    throw new Error(detail);
  }

  const deviceAttestationRaw =
    (await deviceAttestationResponse.json()) as
    | { data?: CardDeviceAttestationResponse }
    | CardDeviceAttestationResponse;
  const deviceAttestationPayload = extractResponseData<CardDeviceAttestationResponse>(deviceAttestationRaw);

  if (deviceAttestationPayload.alreadyVerified) {
    onProgress?.('Wallet already verified on-chain. Retrying create pool pre-check...');
    return;
  }

  if (!deviceAttestationPayload.attestation || !deviceAttestationPayload.signature?.trim()) {
    throw new Error('Backend did not return a valid on-chain device attestation payload.');
  }

  const attestedUser = getAddress(deviceAttestationPayload.attestation.user);
  if (attestedUser.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error('On-chain device attestation user does not match active wallet.');
  }

  const payloadDeviceAdapter = getAddress(deviceAttestationPayload.deviceAdapter);
  if (payloadDeviceAdapter.toLowerCase() !== deviceAdapterAddress.toLowerCase()) {
    throw new Error('On-chain device attestation deviceAdapter does not match protocol registry.');
  }

  const attestationNonce = BigInt(deviceAttestationPayload.attestation.nonce);
  const attestationDeadline = BigInt(deviceAttestationPayload.attestation.deadline);
  const attestationSignature = deviceAttestationPayload.signature.startsWith('0x')
    ? deviceAttestationPayload.signature
    : `0x${deviceAttestationPayload.signature}`;

  const submitVerificationCalldata = encodeFunctionData({
    abi: DEVICE_ADAPTER_WRITE_ABI,
    functionName: 'submitVerification',
    args: [
      {
        user: attestedUser,
        nonce: attestationNonce,
        deadline: attestationDeadline,
      },
      attestationSignature as `0x${string}`,
    ],
  });

  onSessionStatus?.('create_pool_device_verification_submit');
  onProgress?.('Submitting on-chain device verification transaction...');
  let submitVerificationTx;
  try {
    submitVerificationTx = await sendEthTransaction({
      from: accountAddress,
      to: deviceAdapterAddress,
      valueWei: 0n,
      pin,
      gasLimitWei: 1_500_000n,
      dataHex: submitVerificationCalldata,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isUnknownAccountLikeError(reason)) {
      logCreateGroupGasIssue({
        stage: 'submit_device_verification_tx',
        accountAddress,
        reason,
      });
      throw new Error(buildAccountNotActivatedMessage(accountAddress));
    }
    if (isInsufficientGasLikeError(reason)) {
      logCreateGroupGasIssue({
        stage: 'submit_device_verification_tx',
        accountAddress,
        reason,
      });
      throw new Error(buildInsufficientGasMessage(accountAddress));
    }
    throw error instanceof Error ? error : new Error(reason);
  }

  onSessionStatus?.('create_pool_device_verification_receipt');
  onProgress?.('Waiting for on-chain device verification confirmation...');
  const submitReceipt = await waitForTransactionReceiptWithRetry({
    client,
    txHash: submitVerificationTx.transactionHash as `0x${string}`,
    label: 'device verification',
    onProgress,
  });
  if (submitReceipt.status !== 'success') {
    throw new Error(
      `On-chain device verification transaction reverted. Tx: ${submitVerificationTx.transactionHash}`,
    );
  }

  let isNowVerified = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const verified = await client.readContract({
      address: deviceAdapterAddress,
      abi: DEVICE_ADAPTER_READ_ABI,
      functionName: 'isDeviceVerified',
      args: [accountAddress],
    });
    if (verified) {
      isNowVerified = true;
      break;
    }

    await new Promise(resolve => {
      setTimeout(resolve, 700);
    });
  }
  if (!isNowVerified) {
    onProgress?.('Device verification tx confirmed. Rechecking create pool pre-check...');
    return;
  }

  onProgress?.('Wallet is now device-verified on-chain. Retrying create pool pre-check...');
};

export type QrLoginPayload = {
  feature?: string;
  sessionId?: string;
  nonce?: string;
  apiBase: string;
  message?: string;
  username?: string;
  address?: string;
  deviceVerificationFactoryAddress?: string;
  autoDeviceVerification?: boolean;
  createPool?: CreatePoolQrData;
  poolAction?: PoolActionQrData;
};

type GenericQrEnvelope = {
  feature?: string;
  apiBase?: unknown;
  data?: Record<string, unknown>;
};

export type QrLoginProof = {
  address: string;
  signatureHex: string;
  recovery: number;
  deviceCertificate?: Uint8Array;
};

export type VerifyLoginRequest = {
  apiBase: string;
  sessionId: string;
  address: string;
  signatureHex: string;
  recovery: number;
};

export type VerifyLoginResponse = {
  verified: boolean;
  address?: string;
  token?: string;
  txHash?: string;
  poolAddress?: string;
  poolId?: string;
};

export type LoginDeviceWarmupResult = {
  attempted: boolean;
  verified: boolean;
  message: string;
};

type CardChallengeResponse = {
  challengeId: string;
  challenge: string;
  deviceId: string;
  expiresAt: string;
};

type CardVerifyResponse = {
  verified: boolean;
  address: string;
  deviceId: string;
  verifiedAt: string;
};

type DeviceAttestationPayload = {
  user: string;
  nonce: string;
  deadline: string;
};

type CardDeviceAttestationResponse = {
  alreadyVerified: boolean;
  address: string;
  deviceAdapter: string;
  chainId: string;
  signer: string;
  attestation: DeviceAttestationPayload;
  signature: string;
};

const toLoginDeviceStatus = (createPoolStatus: string): string | null => {
  switch (createPoolStatus) {
    case 'create_pool_device_verify_challenge':
      return 'login_device_verify_challenge';
    case 'create_pool_device_verify_backend':
      return 'login_device_verify_backend';
    case 'create_pool_device_attestation_request':
      return 'login_device_attestation_request';
    case 'create_pool_device_verification_submit':
      return 'login_device_verification_submit';
    case 'create_pool_device_verification_receipt':
      return 'login_device_verification_receipt';
    default:
      return null;
  }
};

export const warmupLoginDeviceVerification = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
  publishSessionProgress = true,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
  publishSessionProgress?: boolean;
}): Promise<LoginDeviceWarmupResult> => {
  const shouldAuto = payload.autoDeviceVerification !== false;
  if (!shouldAuto) {
    return {
      attempted: false,
      verified: false,
      message: 'Auto device verification on login is disabled.',
    };
  }

  const factoryAddressRaw = payload.deviceVerificationFactoryAddress?.trim() ?? '';
  if (!factoryAddressRaw) {
    return {
      attempted: false,
      verified: false,
      message: 'No protocol factory address in login QR payload.',
    };
  }

  const activeNetwork = getActiveNetwork();
  const factoryAddress = getAddress(factoryAddressRaw);
  const accountAddress = getAddress(expectedAddress);
  const verificationCacheKey = buildDeviceVerificationCacheKey(
    activeNetwork.chainId,
    factoryAddress,
    accountAddress,
  );
  const cachedVerification = readDeviceVerificationCache(verificationCacheKey);
  if (cachedVerification === true) {
    return {
      attempted: false,
      verified: true,
      message: 'Wallet already device-verified recently (cached).',
    };
  }

  const sessionId = payload.sessionId?.trim() ?? '';
  const pushStatus = createSessionStatusPublisher({
    apiBase: payload.apiBase,
    sessionId,
    enabled: publishSessionProgress && Boolean(sessionId),
  });

  onProgress?.('Login verified. Running one-time on-chain device verification warmup...');
  pushStatus('login_device_verify_preparing');

  try {
    await verifyCardAttestationForCreatePool({
      apiBase: payload.apiBase,
      pin,
      expectedAddress: accountAddress,
      factoryAddress,
      onProgress,
      onSessionStatus: status => {
        const loginStatus = toLoginDeviceStatus(status);
        if (loginStatus) {
          pushStatus(loginStatus);
        }
      },
    });

    writeDeviceVerificationCache(verificationCacheKey, true);
    pushStatus('login_device_verify_success');
    return {
      attempted: true,
      verified: true,
      message: 'Wallet is now device-verified on-chain for future create/invite flows.',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    pushStatus('login_device_verify_failed');
    return {
      attempted: true,
      verified: false,
      message: reason,
    };
  }
};

export type NotifyLoginProgressRequest = {
  apiBase: string;
  sessionId: string;
  status: string;
};

export const parseQrLoginPayload = (rawValue: string): QrLoginPayload => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('QR code is empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('QR payload must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid QR payload format');
  }

  const payload = parsed as Record<string, unknown>;

  // New reusable envelope format: { feature, apiBase, data: {...} }
  if ('data' in payload && typeof payload.data === 'object' && payload.data !== null) {
    const envelope = payload as GenericQrEnvelope;
    const feature = typeof envelope.feature === 'string' ? envelope.feature.trim() : '';
    if (
      feature
      && feature !== 'auth.login'
      && feature !== 'username.register'
      && feature !== 'username.set_primary'
      && feature !== CREATE_POOL_QR_FEATURE
      && feature !== POOL_ACTION_QR_FEATURE
    ) {
      throw new Error(`Unsupported QR feature: ${feature}`);
    }

    const data = envelope.data as Record<string, unknown>;
    const apiBase = normalizeApiBase(ensureField(envelope.apiBase, 'apiBase'));

    if (feature === CREATE_POOL_QR_FEATURE) {
      const contractVariables = ((data.contractVariables ?? data.contract ?? data.params) as Record<string, unknown>) ?? {};
      const toInt = (value: unknown, field: string): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          throw new Error(`Invalid QR payload: ${field} must be a positive number`);
        }
        return Math.floor(numeric);
      };
      const toNonNegativeInt = (value: unknown, field: string): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          throw new Error(`Invalid QR payload: ${field} must be a non-negative number`);
        }
        return Math.floor(numeric);
      };

      const contributionAmount = ensureField(contractVariables.contributionAmount, 'contractVariables.contributionAmount');
      const sessionId =
        typeof data.sessionId === 'string' && data.sessionId.trim()
          ? data.sessionId.trim()
          : undefined;
      const contributionTokenSymbol =
        typeof contractVariables.tokenSymbol === 'string' && contractVariables.tokenSymbol.trim()
          ? contractVariables.tokenSymbol.trim()
          : typeof data.tokenSymbol === 'string' && data.tokenSymbol.trim()
            ? data.tokenSymbol.trim()
          : 'tcUSD';
      const publicRecruitment =
        typeof contractVariables.publicRecruitment === 'boolean'
          ? contractVariables.publicRecruitment
          : typeof data.publicRecruitment === 'boolean'
            ? data.publicRecruitment
            : true;
      const skipPrecheck =
        typeof contractVariables.skipPrecheck === 'boolean'
          ? contractVariables.skipPrecheck
          : typeof data.skipPrecheck === 'boolean'
            ? data.skipPrecheck
            : true;
      const targetMembers = toInt(contractVariables.targetMembers, 'contractVariables.targetMembers');
      const periodDurationSeconds = toInt(contractVariables.periodDurationSeconds, 'contractVariables.periodDurationSeconds');
      const contributionWindowSeconds = toInt(contractVariables.contributionWindowSeconds, 'contractVariables.contributionWindowSeconds');
      const auctionWindowSeconds = toInt(contractVariables.auctionWindowSeconds, 'contractVariables.auctionWindowSeconds');
      const minReputationScore = toNonNegativeInt(
        contractVariables.minReputation ?? data.minReputationScore ?? 0,
        'contractVariables.minReputation',
      );

      if (contributionWindowSeconds + auctionWindowSeconds >= periodDurationSeconds) {
        throw new Error('Invalid QR payload: contributionWindow + auctionWindow must be less than periodDuration');
      }

      return {
        feature: CREATE_POOL_QR_FEATURE,
        sessionId,
        apiBase,
        createPool: {
          factoryAddress: ensureField(contractVariables.factoryAddress, 'contractVariables.factoryAddress'),
          contributionAmount,
          contributionAmountWei:
            typeof contractVariables.contributionAmountWei === 'string'
              ? contractVariables.contributionAmountWei.trim()
              : undefined,
          publicRecruitment,
          contributionTokenSymbol,
          targetMembers,
          periodDurationSeconds,
          contributionWindowSeconds,
          auctionWindowSeconds,
          groupName: typeof data.groupName === 'string' ? data.groupName.trim() : undefined,
          groupDescription: typeof data.groupDescription === 'string' ? data.groupDescription.trim() : undefined,
          groupImageUrl: typeof data.groupImageUrl === 'string' ? data.groupImageUrl.trim() : undefined,
          minReputationScore,
          authToken: typeof data.authToken === 'string' ? data.authToken.trim() : undefined,
          skipPrecheck,
        },
      };
    }

    if (feature === POOL_ACTION_QR_FEATURE) {
      const actionPayload = ((data.poolAction ?? data.tx ?? data.transaction) as Record<string, unknown>) ?? {};
      const sessionId = ensureField(data.sessionId, 'sessionId');
      const to = ensureField(actionPayload.to, 'poolAction.to');
      const dataHex = ensureField(actionPayload.data, 'poolAction.data');

      if (!dataHex.startsWith('0x')) {
        throw new Error('Invalid QR payload: poolAction.data must be 0x-prefixed calldata');
      }

      const rawValueWei = typeof actionPayload.valueWei === 'string' ? actionPayload.valueWei.trim() : '';
      const valueWei = rawValueWei || '0';
      if (!/^\d+$/.test(valueWei)) {
        throw new Error('Invalid QR payload: poolAction.valueWei must be a non-negative integer string');
      }

      return {
        feature: POOL_ACTION_QR_FEATURE,
        sessionId,
        apiBase,
        poolAction: {
          to,
          data: dataHex,
          valueWei,
          label: typeof actionPayload.label === 'string' ? actionPayload.label.trim() : undefined,
          poolAddress: typeof actionPayload.poolAddress === 'string' ? actionPayload.poolAddress.trim() : undefined,
        },
      };
    }

    const sessionId = ensureField(data.sessionId, 'sessionId');
    const message = typeof data.message === 'string' ? data.message.trim() : undefined;
    const username = typeof data.username === 'string' ? data.username.trim() : undefined;
    const address = typeof data.address === 'string' ? data.address.trim() : undefined;
    const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : undefined;
    const deviceVerificationFactoryAddress =
      typeof data.deviceVerificationFactoryAddress === 'string' && data.deviceVerificationFactoryAddress.trim()
        ? data.deviceVerificationFactoryAddress.trim()
        : undefined;
    const autoDeviceVerification =
      typeof data.autoDeviceVerification === 'boolean'
        ? data.autoDeviceVerification
        : Boolean(deviceVerificationFactoryAddress);

    if ((feature || 'auth.login') === 'auth.login' && !nonce) {
      throw new Error('Invalid QR payload: nonce is required');
    }

    return {
      feature: feature || 'auth.login',
      sessionId,
      nonce,
      apiBase,
      message,
      username,
      address,
      deviceVerificationFactoryAddress,
      autoDeviceVerification,
    };
  }

  // Legacy format compatibility: { sessionId, nonce, apiBase, message }
  const sessionId = ensureField(payload.sessionId, 'sessionId');
  const nonce = ensureField(payload.nonce, 'nonce');
  const apiBase = normalizeApiBase(ensureField(payload.apiBase, 'apiBase'));
  const message = typeof payload.message === 'string' ? payload.message.trim() : undefined;

  return {
    feature: 'auth.login',
    sessionId,
    nonce,
    apiBase,
    message,
  };
};

export const createPoolViaQrOneTap = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
}): Promise<VerifyLoginResponse> => {
  if (payload.feature !== CREATE_POOL_QR_FEATURE || !payload.createPool) {
    throw new Error('QR payload is not a create-pool request.');
  }

  const activeNetwork = getActiveNetwork();
  if (activeNetwork.key !== 'chainora') {
    throw new Error('Switch active network to Chainora before signing create pool.');
  }

  const config = payload.createPool;
  const createPoolSessionId = payload.sessionId?.trim() ?? '';
  const pushSessionStatus = createSessionStatusPublisher({
    apiBase: payload.apiBase,
    sessionId: createPoolSessionId,
    enabled: Boolean(createPoolSessionId),
  });
  const accountAddress = getAddress(expectedAddress);
  const factoryAddress = getAddress(config.factoryAddress);
  const verificationCacheKey = buildDeviceVerificationCacheKey(
    activeNetwork.chainId,
    factoryAddress,
    accountAddress,
  );
  const minReputationScore = BigInt(Math.max(0, Math.floor(config.minReputationScore ?? 0)));
  const skipPrecheck = config.skipPrecheck !== false;
  const contributionAmountWei = config.contributionAmountWei?.trim()
    ? BigInt(config.contributionAmountWei.trim())
    : parseUnits(config.contributionAmount, 18);
  let attemptedAutoVerify = false;

  const calldata = encodeFunctionData({
    abi: FACTORY_CREATE_POOL_ABI,
    functionName: 'createPool',
    args: [
      {
        contributionAmount: contributionAmountWei,
        minReputation: minReputationScore,
        targetMembers: config.targetMembers,
        periodDuration: config.periodDurationSeconds,
        contributionWindow: config.contributionWindowSeconds,
        auctionWindow: config.auctionWindowSeconds,
      },
      config.publicRecruitment ?? true,
    ],
  });

  const client = getPublicViemClient(activeNetwork);
  const ensureSenderAccountReady = async (): Promise<void> => {
    try {
      await withOperationTimeout(
        client.getTransactionCount({
          address: accountAddress,
          blockTag: 'pending',
        }),
        3_000,
        'Unable to verify wallet account state on Chainora before submitting transaction.',
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isUnknownAccountLikeError(reason)) {
        logCreateGroupGasIssue({
          stage: 'preflight_account_check',
          accountAddress,
          reason,
        });
        throw new Error(buildAccountNotActivatedMessage(accountAddress));
      }
      if (isInsufficientGasLikeError(reason)) {
        logCreateGroupGasIssue({
          stage: 'preflight_account_check',
          accountAddress,
          reason,
        });
        throw new Error(buildInsufficientGasMessage(accountAddress));
      }
      if (isRpcTimeoutLikeError(reason)) {
        return;
      }
      throw error instanceof Error ? error : new Error(reason);
    }
  };
  const simulateCreatePool = async () => {
    await client.simulateContract({
      address: factoryAddress,
      abi: FACTORY_CREATE_POOL_ABI,
      functionName: 'createPool',
      args: [
        {
          contributionAmount: contributionAmountWei,
          minReputation: minReputationScore,
          targetMembers: config.targetMembers,
          periodDuration: config.periodDurationSeconds,
          contributionWindow: config.contributionWindowSeconds,
          auctionWindow: config.auctionWindowSeconds,
        },
        config.publicRecruitment ?? true,
      ],
      account: accountAddress,
    });
  };

  const autoVerifyDevice = async () => {
    if (!payload.apiBase) {
      throw new Error(`${DEVICE_NOT_VERIFIED_MESSAGE} Missing apiBase for automatic card verification.`);
    }
    await ensureSenderAccountReady();
    attemptedAutoVerify = true;
    await verifyCardAttestationForCreatePool({
      apiBase: payload.apiBase,
      pin,
      expectedAddress: accountAddress,
      factoryAddress,
      onProgress,
      onSessionStatus: pushSessionStatus,
    });
    writeDeviceVerificationCache(verificationCacheKey, true);
  };

  const runPrecheckDiagnosis = async (): Promise<string | null> => {
    const diagnosed = await withOperationTimeout(
      diagnoseCreatePoolPrecheck({
        client,
        factoryAddress,
        accountAddress,
        minReputation: minReputationScore,
      }),
      PRECHECK_DIAG_TIMEOUT_MS,
      CREATE_POOL_RPC_TIMEOUT_MESSAGE,
    ).catch(() => null);

    if (diagnosed && isDeviceNotVerifiedError(diagnosed)) {
      writeDeviceVerificationCache(verificationCacheKey, false);
    }

    return diagnosed;
  };

  if (skipPrecheck) {
    pushSessionStatus(CREATE_POOL_PRECHECK_CONTINUE_STATUS);
    onProgress?.('Skipping heavy pre-check for faster flow. Proceeding directly to transaction signing...');
    const cachedVerification = readDeviceVerificationCache(verificationCacheKey);

    if (cachedVerification === false) {
      onProgress?.('Wallet was recently marked as not device-verified. Auto-verifying now before create pool...');
      await autoVerifyDevice();
    } else if (cachedVerification !== true) {
      const quickDiagnosis = await runWithSoftTimeout(runPrecheckDiagnosis(), 1_500);
      if (quickDiagnosis.status === 'ok' && quickDiagnosis.value) {
        if (isDeviceNotVerifiedError(quickDiagnosis.value)) {
          await autoVerifyDevice();
        } else {
          throw new Error(quickDiagnosis.value);
        }
      }
    }
  } else {
    pushSessionStatus('create_pool_precheck');
    onProgress?.('Pre-checking create pool config on-chain...');
    const precheckResult = await runWithSoftTimeout(simulateCreatePool(), PRECHECK_SIMULATE_TIMEOUT_MS);
    if (precheckResult.status === 'timeout') {
      pushSessionStatus(CREATE_POOL_PRECHECK_CONTINUE_STATUS);
      onProgress?.('Chainora RPC is slow during pre-check. Continuing directly to transaction signing...');
    } else if (precheckResult.status === 'error') {
      const reason = precheckResult.error.message;
      if (isRpcTimeoutLikeError(reason)) {
        pushSessionStatus(CREATE_POOL_PRECHECK_CONTINUE_STATUS);
        onProgress?.('Chainora RPC is slow during pre-check. Continuing directly to transaction signing...');
      } else {
        const diagnosed = await runPrecheckDiagnosis();
        if (diagnosed && isDeviceNotVerifiedError(diagnosed)) {
          await autoVerifyDevice();
        } else if (diagnosed) {
          throw new Error(diagnosed);
        } else {
          throw new Error(mapCreatePoolRevertMessage(reason));
        }
      }
    }
  }

  const submitCreatePoolTx = async () => {
    pushSessionStatus('create_pool_signing_tx');
    onProgress?.('Signing createPool transaction on card...');
    let nextTxResult;
    try {
      nextTxResult = await sendEthTransaction({
        from: accountAddress,
        to: factoryAddress,
        valueWei: 0n,
        pin,
        gasLimitWei: 1_500_000n,
        dataHex: calldata,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isUnknownAccountLikeError(reason)) {
        logCreateGroupGasIssue({
          stage: 'submit_create_pool_tx',
          accountAddress,
          reason,
        });
        throw new Error(buildAccountNotActivatedMessage(accountAddress));
      }
      if (isInsufficientGasLikeError(reason)) {
        logCreateGroupGasIssue({
          stage: 'submit_create_pool_tx',
          accountAddress,
          reason,
        });
        throw new Error(buildInsufficientGasMessage(accountAddress));
      }
      throw error instanceof Error ? error : new Error(reason);
    }

    pushSessionStatus('create_pool_waiting_receipt');
    onProgress?.('Waiting for transaction confirmation...');
    const nextReceipt = await waitForTransactionReceiptWithRetry({
      client,
      txHash: nextTxResult.transactionHash as `0x${string}`,
      label: 'create-pool',
      onProgress,
    });

    return { txResult: nextTxResult, receipt: nextReceipt };
  };

  let execution = await submitCreatePoolTx();
  if (execution.receipt.status !== 'success') {
    const diagnosed = await runPrecheckDiagnosis();
    if (!attemptedAutoVerify && diagnosed && isDeviceNotVerifiedError(diagnosed)) {
      await autoVerifyDevice();
      execution = await submitCreatePoolTx();
    } else if (diagnosed) {
      throw new Error(diagnosed);
    }
  }

  if (execution.receipt.status !== 'success') {
    throw new Error(`Create pool transaction reverted on-chain. Tx: ${execution.txResult.transactionHash}`);
  }
  const txResult = execution.txResult;
  const receipt = execution.receipt;

  let poolAddress = '';
  let poolId = '';
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: FACTORY_CREATE_POOL_ABI,
        data: log.data,
        topics: log.topics,
        strict: false,
      });

      if (decoded.eventName === 'ChainoraPoolCreated') {
        poolAddress = String(decoded.args.pool);
        poolId = String(decoded.args.poolId);
        break;
      }
    } catch {
      // Ignore non-matching logs.
    }
  }

  if (!poolAddress || !poolId) {
    throw new Error(`Create pool transaction confirmed but ChainoraPoolCreated event was not found. Tx: ${txResult.transactionHash}`);
  }

  if (payload.apiBase && config.authToken) {
    pushSessionStatus('create_pool_syncing_backend');
    onProgress?.('Syncing created group to backend...');
    const groupResponse = await fetchWithTimeout(`${payload.apiBase}/v1/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.authToken}`,
      },
      body: JSON.stringify({
        poolId,
        poolAddress,
        name: config.groupName || `Savings Group ${poolId}`,
        description: config.groupDescription || '',
        groupImageUrl: config.groupImageUrl || '',
        publicRecruitment: config.publicRecruitment ?? true,
        contributionAmount: contributionAmountWei.toString(),
        targetMembers: config.targetMembers,
        periodDuration: config.periodDurationSeconds,
        contributionWindow: config.contributionWindowSeconds,
        auctionWindow: config.auctionWindowSeconds,
        txHash: txResult.transactionHash,
      }),
    });

    if (!groupResponse.ok) {
      const detail = await readApiErrorMessage(groupResponse, `Persist group failed: ${groupResponse.status}`);
      throw new Error(detail);
    }
  }

  writeDeviceVerificationCache(verificationCacheKey, true);
  pushSessionStatus('create_pool_success');

  return {
    verified: true,
    address: expectedAddress,
    txHash: txResult.transactionHash,
    poolAddress,
    poolId,
  };
};

export const executePoolActionViaQrOneTap = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
}): Promise<VerifyLoginResponse> => {
  if (payload.feature !== POOL_ACTION_QR_FEATURE || !payload.poolAction) {
    throw new Error('QR payload is not a pool-action request.');
  }

  const activeNetwork = getActiveNetwork();
  if (activeNetwork.key !== 'chainora') {
    throw new Error('Switch active network to Chainora before signing pool action.');
  }

  const config = payload.poolAction;
  const sessionId = payload.sessionId?.trim() ?? '';
  const pushSessionStatus = createSessionStatusPublisher({
    apiBase: payload.apiBase,
    sessionId,
    enabled: Boolean(sessionId),
  });

  const accountAddress = getAddress(expectedAddress);
  const targetAddress = getAddress(config.to);
  const valueWei = BigInt(config.valueWei?.trim() || '0');
  const actionLabel = config.label?.trim() || 'pool action';
  const selector = String(config.data ?? '').slice(0, 10).toLowerCase();
  const inviteCandidateAddress = selector === PROPOSE_INVITE_SELECTOR
    ? decodeSingleAddressArgument(String(config.data ?? ''))
    : null;
  const client = getPublicViemClient(activeNetwork);

  const diagnosePoolActionSimulationRevert = async (): Promise<string | null> => {
    if (selector === SUBMIT_JOIN_REQUEST_SELECTOR) {
      const diagnosis = await runWithSoftTimeout(
        diagnoseSubmitJoinRequestPrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
        }),
        3_000,
      );

      if (diagnosis.status === 'ok' && diagnosis.value) {
        return diagnosis.value;
      }

      return 'Join request was rejected by on-chain rules. Common causes: you already have an open join request, the group is no longer recruiting, or membership checks (device verification/reputation) are not met.';
    }

    if (selector === PROPOSE_INVITE_SELECTOR) {
      if (!inviteCandidateAddress) {
        return 'Invite blocked: invalid candidate address in invite payload.';
      }

      const diagnosis = await runWithSoftTimeout(
        diagnoseProposeInvitePrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
          candidateAddress: inviteCandidateAddress,
        }),
        3_000,
      );

      if (diagnosis.status === 'ok' && diagnosis.value) {
        return diagnosis.value;
      }

      return 'Invite was rejected by on-chain rules. Common causes: inviter is not active member, candidate is already active/self-invite, or candidate does not meet verification/reputation requirements.';
    }

    if (selector === CONTRIBUTE_SELECTOR) {
      const diagnosis = await runWithSoftTimeout(
        diagnoseContributePrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
        }),
        3_000,
      );

      if (diagnosis.status === 'ok') {
        const details = diagnosis.value;
        if (details.blockedReason) {
          return details.blockedReason;
        }
        if (details.needsApproval) {
          return 'Contribute blocked: stablecoin allowance for this pool is not enough. Please approve contribution token first.';
        }
      }

      return 'Contribute was rejected by on-chain rules. Common causes: period not in collecting stage, deadline passed, already contributed, or token transfer preconditions not met.';
    }

    return null;
  };

  const ensureContributionApproval = async (): Promise<void> => {
    const diagnosis = await runWithSoftTimeout(
      diagnoseContributePrecheck({
        client,
        poolAddress: targetAddress,
        accountAddress,
      }),
      3_000,
    );

    if (diagnosis.status !== 'ok') {
      return;
    }

    const details = diagnosis.value;
    if (details.blockedReason) {
      throw new Error(details.blockedReason);
    }

    if (!details.needsApproval || !details.stablecoinAddress) {
      return;
    }

    const approveCalldata = encodeFunctionData({
      abi: ERC20_WRITE_ABI,
      functionName: 'approve',
      args: [targetAddress, UINT256_MAX],
    });

    onProgress?.(
      'Contribution needs token approval first. Please tap card to sign approve transaction.',
    );

    let approveTx: { transactionHash: string };
    try {
      approveTx = await sendEthTransaction({
        from: accountAddress,
        to: details.stablecoinAddress,
        valueWei: 0n,
        pin,
        dataHex: approveCalldata,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isUnknownAccountLikeError(reason)) {
        throw new Error(buildPoolActionAccountNotActivatedMessage(accountAddress));
      }
      if (isInsufficientGasLikeError(reason)) {
        throw new Error(buildPoolActionInsufficientGasMessage(accountAddress));
      }
      throw error instanceof Error ? error : new Error(reason);
    }

    onProgress?.('Waiting for token approval confirmation...');
    const approveReceipt = await waitForTransactionReceiptWithRetry({
      client,
      txHash: approveTx.transactionHash as `0x${string}`,
      label: 'approve-contribution-token',
      onProgress,
    });

    if (approveReceipt.status !== 'success') {
      throw new Error(`Contribution token approval reverted on-chain. Tx: ${approveTx.transactionHash}`);
    }

    onProgress?.('Token approval confirmed. Please tap card again to sign contribute transaction.');
  };

  logPoolActionEvent({
    stage: 'start',
    actionLabel,
    accountAddress,
    targetAddress,
    selector,
    sessionId,
  });

  try {
    if (selector === SUBMIT_JOIN_REQUEST_SELECTOR) {
      const precheck = await runWithSoftTimeout(
        diagnoseSubmitJoinRequestPrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
        }),
        3_000,
      );
      if (precheck.status === 'ok' && precheck.value) {
        throw new Error(precheck.value);
      }
    }

    if (selector === PROPOSE_INVITE_SELECTOR) {
      if (!inviteCandidateAddress) {
        throw new Error('Invite blocked: invalid candidate address in invite payload.');
      }

      const precheck = await runWithSoftTimeout(
        diagnoseProposeInvitePrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
          candidateAddress: inviteCandidateAddress,
        }),
        3_000,
      );
      if (precheck.status === 'ok' && precheck.value) {
        throw new Error(precheck.value);
      }
    }

    if (selector === CONTRIBUTE_SELECTOR) {
      await ensureContributionApproval();
    }

    pushSessionStatus('pool_action_signing_tx');
    onProgress?.(`Signing ${actionLabel} transaction on card...`);

    let txResult: { transactionHash: string };
    try {
      txResult = await sendEthTransaction({
        from: accountAddress,
        to: targetAddress,
        valueWei,
        pin,
        dataHex: config.data as `0x${string}`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (isUnknownAccountLikeError(reason)) {
        logPoolActionIssue({
          stage: 'submit_pool_action_tx',
          actionLabel,
          accountAddress,
          targetAddress,
          selector,
          reason,
          sessionId,
        });
        throw new Error(buildPoolActionAccountNotActivatedMessage(accountAddress));
      }
      if (isInsufficientGasLikeError(reason)) {
        logPoolActionIssue({
          stage: 'submit_pool_action_tx',
          actionLabel,
          accountAddress,
          targetAddress,
          selector,
          reason,
          sessionId,
        });
        throw new Error(buildPoolActionInsufficientGasMessage(accountAddress));
      }
      if (isPoolActionSimulationRevertError(reason)) {
        const diagnosed = await diagnosePoolActionSimulationRevert();
        if (diagnosed) {
          logPoolActionIssue({
            stage: 'submit_pool_action_tx',
            actionLabel,
            accountAddress,
            targetAddress,
            selector,
            reason: `${reason} | diagnosed: ${diagnosed}`,
            sessionId,
          });
          throw new Error(diagnosed);
        }
      }
      if (selector === CONTRIBUTE_SELECTOR && reason.toLowerCase().includes('transfer_from_failed')) {
        throw new Error(
          'Contribute blocked: stablecoin transferFrom failed. Check token balance/allowance and group contribution window.',
        );
      }
      throw error instanceof Error ? error : new Error(reason);
    }

    logPoolActionEvent({
      stage: 'tx_submitted',
      actionLabel,
      accountAddress,
      targetAddress,
      selector,
      txHash: txResult.transactionHash,
      sessionId,
    });

    pushSessionStatus('pool_action_waiting_receipt');
    onProgress?.('Waiting for transaction confirmation...');
    const receipt = await waitForTransactionReceiptWithRetry({
      client,
      txHash: txResult.transactionHash as `0x${string}`,
      label: actionLabel,
      onProgress,
    });

    if (receipt.status !== 'success') {
      logPoolActionIssue({
        stage: 'pool_action_tx_reverted',
        actionLabel,
        accountAddress,
        targetAddress,
        selector,
        txHash: txResult.transactionHash,
        sessionId,
        reason: 'transaction reverted on-chain',
      });
      throw new Error(`${actionLabel} transaction reverted on-chain. Tx: ${txResult.transactionHash}`);
    }

    pushSessionStatus('pool_action_success');
    logPoolActionEvent({
      stage: 'success',
      actionLabel,
      accountAddress,
      targetAddress,
      selector,
      txHash: txResult.transactionHash,
      sessionId,
    });

    return {
      verified: true,
      address: accountAddress,
      txHash: txResult.transactionHash,
    };
  } catch (error) {
    pushSessionStatus('pool_action_failed');
    const reason = error instanceof Error ? error.message : String(error);
    logPoolActionIssue({
      stage: 'failed',
      actionLabel,
      accountAddress,
      targetAddress,
      selector,
      reason,
      sessionId,
    });
    throw error instanceof Error ? error : new Error(reason);
  }
};

export const createQrLoginProof = async (payload: QrLoginPayload, pin: string): Promise<QrLoginProof> => {
  const sessionId = payload.sessionId?.trim() ?? '';
  if ((payload.feature ?? 'auth.login') !== CREATE_POOL_QR_FEATURE && (payload.feature ?? 'auth.login') !== POOL_ACTION_QR_FEATURE && !sessionId) {
    throw new Error('QR payload missing sessionId.');
  }

  const message = payload.feature === 'username.register' || payload.feature === 'username.set_primary'
    ? (payload.message?.trim() || `Register Chainora username (session: ${sessionId})`)
    : buildAuthMessage(payload.nonce ?? '', payload.message);
  const messageHash = buildEip191Hash(message);

  const signResult = await signTransactionHash(pin, messageHash);
  if (!signResult.ok || !signResult.signatureDer || !signResult.publicKeyHex || !signResult.ethAddress) {
    throw new Error(signResult.message || 'Unable to sign login challenge');
  }

  const recovered = recoverSignature(messageHash, signResult.signatureDer, signResult.publicKeyHex, 1);
  const signatureHex = `${recovered.r.slice(2)}${recovered.s.slice(2)}`;

  return {
    address: signResult.ethAddress,
    signatureHex,
    recovery: recovered.recovery,
    deviceCertificate: signResult.deviceCertificate,
  };
};

export const registerUsernameRelayer = async ({
  apiBase,
  sessionId,
  address,
  signatureHex,
  recovery,
  username,
  feature,
}: VerifyLoginRequest & { username: string; feature?: string }): Promise<VerifyLoginResponse> => {
  console.log('[UsernameFlow] start registerUsernameRelayer', {
    apiBase,
    sessionId,
    address,
    username,
  });
  console.log('[UsernameFlow] relayer registration request prepared');

  const endpoint = feature === 'username.set_primary'
    ? `${apiBase}/v1/relayer/primary/select`
    : `${apiBase}/v1/relayer/register`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      address,
      username,
      signature: signatureHex,
      v: recovery,
    }),
  });

  if (!response.ok) {
    const detail = await readApiErrorMessage(response, `Register username failed: ${response.status}`);
    throw new Error(detail);
  }
  console.log('[UsernameFlow] relayer register response ok');

  const raw = (await response.json()) as { data?: VerifyLoginResponse } | VerifyLoginResponse;
  if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
    return raw.data;
  }

  return raw as VerifyLoginResponse;
};

export const registerUsernameRelayerOneTap = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
}): Promise<VerifyLoginResponse> => {
  const isPrimarySelection = payload.feature === 'username.set_primary';
  const sessionId = payload.sessionId?.trim() ?? '';
  if (!sessionId) {
    throw new Error('QR payload missing sessionId.');
  }
  const username = payload.username?.trim() ?? '';
  if (!username) {
    throw new Error('QR payload missing username.');
  }

  const message = payload.message?.trim()
    || `${isPrimarySelection ? 'Set Chainora primary username' : 'Register Chainora username'} (session: ${sessionId})`;
  const messageHash = buildEip191Hash(message);

  console.log('[UsernameFlow] one-session NFC start', {
    apiBase: payload.apiBase,
    sessionId,
    username,
  });
  onProgress?.('Verifying PIN and signing challenge on card...');

  const signAndAttest = await signHashAndAttestInOneTap<CardChallengeResponse>(
    pin,
    messageHash,
    async ({ address, deviceCertificate }) => {
      if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }

      const challengeEndpoint = `${payload.apiBase}/v1/card/challenge`;
      onProgress?.('Requesting challenge from backend...');
      const challengeResponse = await fetchWithTimeout(challengeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          deviceCertificate: bytesToHex(deviceCertificate),
        }),
      });

      if (!challengeResponse.ok) {
        const detail = await readApiErrorMessage(
          challengeResponse,
          `Card challenge failed: ${challengeResponse.status} at ${challengeEndpoint}`,
        );
        throw new Error(detail);
      }

      const challengeRaw = (await challengeResponse.json()) as { data?: CardChallengeResponse } | CardChallengeResponse;
      const challengePayload =
        challengeRaw && typeof challengeRaw === 'object' && 'data' in challengeRaw && challengeRaw.data
          ? challengeRaw.data
          : (challengeRaw as CardChallengeResponse);

      onProgress?.('Generating card attestation proof...');

      return {
        challenge: hexToBytes(challengePayload.challenge),
        meta: challengePayload,
      };
    },
  );

  if (!signAndAttest.ok || !signAndAttest.signatureDer || !signAndAttest.publicKeyHex || !signAndAttest.ethAddress) {
    throw new Error(signAndAttest.message || 'Unable to sign username payload');
  }

  if (!signAndAttest.attestationProof || !signAndAttest.challengeMeta) {
    throw new Error('Missing card attestation data from one-session NFC flow');
  }

  const recovered = recoverSignature(messageHash, signAndAttest.signatureDer, signAndAttest.publicKeyHex, 1);
  const signatureHex = `${recovered.r.slice(2)}${recovered.s.slice(2)}`;

  const verifyEndpoint = `${payload.apiBase}/v1/card/verify`;
  onProgress?.('Verifying card attestation with backend...');
  const verifyCardResponse = await fetchWithTimeout(verifyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: signAndAttest.challengeMeta.challengeId,
      attestationProof: bytesToHex(signAndAttest.attestationProof),
    }),
  });

  if (!verifyCardResponse.ok) {
    const detail = await readApiErrorMessage(
      verifyCardResponse,
      `Card verification failed: ${verifyCardResponse.status} at ${verifyEndpoint}`,
    );
    throw new Error(detail);
  }

  const verifyCardRaw = (await verifyCardResponse.json()) as { data?: CardVerifyResponse } | CardVerifyResponse;
  const verifyCardPayload =
    verifyCardRaw && typeof verifyCardRaw === 'object' && 'data' in verifyCardRaw && verifyCardRaw.data
      ? verifyCardRaw.data
      : (verifyCardRaw as CardVerifyResponse);

  if (!verifyCardPayload.verified) {
    throw new Error('Card verification did not succeed');
  }

  onProgress?.(isPrimarySelection ? 'Submitting primary username selection via relayer...' : 'Submitting username registration via relayer...');
  return registerUsernameRelayer({
    apiBase: payload.apiBase,
    sessionId,
    address: signAndAttest.ethAddress,
    signatureHex,
    recovery: recovered.recovery,
    username,
    feature: payload.feature,
  });
};

export const verifyQrLogin = async ({
  apiBase,
  sessionId,
  address,
  signatureHex,
  recovery,
}: VerifyLoginRequest): Promise<VerifyLoginResponse> => {
  const endpoint = `${apiBase}/v1/auth/verify`;
  const body = {
    sessionId,
    address,
    signature: signatureHex,
    v: recovery,
  };

  console.log('[QRLogin] verify request', {
    endpoint,
    sessionId,
    address,
    recovery,
  });

  let response: Response;
  response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await readApiErrorMessage(response, `Verify login failed: ${response.status} at ${endpoint}`);
    throw new Error(detail);
  }

  const raw = (await response.json()) as { data?: VerifyLoginResponse } | VerifyLoginResponse;
  const payload = extractResponseData<VerifyLoginResponse>(raw);
  console.log('[QRLogin] verify response', {
    endpoint,
    verified: payload.verified,
    address: payload.address,
  });

  return payload;
};

export const notifyQrLoginProgress = async ({
  apiBase,
  sessionId,
  status,
}: NotifyLoginProgressRequest): Promise<void> => {
  const endpoint = `${apiBase}/v1/auth/progress`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        status,
      }),
    });
  } catch (error) {
    console.warn('[QRLogin] progress notify failed', {
      endpoint,
      sessionId,
      status,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
