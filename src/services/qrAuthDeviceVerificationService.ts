import { encodeFunctionData, getAddress } from 'viem';

import {
  DEVICE_ADAPTER_READ_ABI,
  DEVICE_ADAPTER_WRITE_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import {
  buildAccountNotActivatedMessage,
  buildInsufficientGasMessage,
  isInsufficientGasLikeError,
  isUnknownAccountLikeError,
  logCreateGroupGasIssue,
} from './qr-login/errorUtils';
import {
  extractResponseData,
  fetchWithTimeout,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { waitForTransactionReceiptWithRetry } from './qr-login/rpcUtils';
import { type VerifiedWalletSession } from './cardService';
import { resolveRegistryAndDeviceAdapter } from './qrFlowCommonService';
import { sendEthTransaction } from './transactionService';
import type { CardChallengeResponse, CardDeviceAttestationResponse, CardVerifyResponse } from './qrTypes';
import { getPublicViemClient } from './web3Client';
import { bytesToHex, hexToBytes } from '../utils/encoding';

export const mapCreatePoolStatusToLoginStatus = (createPoolStatus: string): string | null => {
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

export const verifyLoginDeviceInOneSession = async ({
  apiBase,
  accountAddress,
  factoryAddress,
  client,
  session,
  onProgress,
  onSessionStatus,
}: {
  apiBase: string;
  accountAddress: `0x${string}`;
  factoryAddress: `0x${string}`;
  client: ReturnType<typeof getPublicViemClient>;
  session: VerifiedWalletSession;
  onProgress?: (status: string) => void;
  onSessionStatus?: (status: string) => void;
}): Promise<void> => {
  const { deviceAdapterAddress } = await resolveRegistryAndDeviceAdapter({
    client,
    factoryAddress,
  });
  if (deviceAdapterAddress.toLowerCase() === ZERO_ADDRESS) {
    onProgress?.('Device adapter is disabled in protocol registry. Skipping device verification attestation.');
    return;
  }

  const alreadyOnChainVerified = await client.readContract({
    address: deviceAdapterAddress,
    abi: DEVICE_ADAPTER_READ_ABI,
    functionName: 'isDeviceVerified',
    args: [accountAddress],
  });
  if (alreadyOnChainVerified) {
    onProgress?.('Wallet already verified on-chain. Continue login verification...');
    return;
  }

  onSessionStatus?.('login_device_verify_challenge');
  onProgress?.('Wallet is not device-verified. Creating card attestation proof...');

  const challengeEndpoint = `${apiBase}/v1/card/challenge`;
  const challengeResponse = await fetchWithTimeout(challengeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address: accountAddress,
      deviceCertificate: bytesToHex(session.deviceCertificate),
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
  const attestationResult = await session.attestChallenge(hexToBytes(challengePayload.challenge));
  if (!attestationResult.ok || !attestationResult.attestationProof) {
    throw new Error(attestationResult.message || 'Unable to create card attestation proof for device verification');
  }

  const verifyEndpoint = `${apiBase}/v1/card/verify`;
  onSessionStatus?.('login_device_verify_backend');
  onProgress?.('Submitting card attestation proof to backend...');
  const verifyCardResponse = await fetchWithTimeout(verifyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: challengePayload.challengeId,
      attestationProof: bytesToHex(attestationResult.attestationProof),
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
  onSessionStatus?.('login_device_attestation_request');
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
    onProgress?.('Wallet already verified on-chain. Continue login verification...');
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

  onSessionStatus?.('login_device_verification_submit');
  onProgress?.('Submitting on-chain device verification transaction...');
  let submitVerificationTx;
  try {
    submitVerificationTx = await sendEthTransaction({
      from: accountAddress,
      to: deviceAdapterAddress,
      valueWei: 0n,
      pin: '0000',
      signHash: async hash => session.signHash(hash),
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

  onSessionStatus?.('login_device_verification_receipt');
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
    throw new Error('Device verification transaction confirmed, but adapter state is not updated yet. Please retry login.');
  }
  onProgress?.('Wallet is now device-verified on-chain. Continue login verification...');
};
