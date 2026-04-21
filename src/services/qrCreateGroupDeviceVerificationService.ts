import { encodeFunctionData, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  DEVICE_ADAPTER_READ_ABI,
  DEVICE_ADAPTER_WRITE_ABI,
  ZERO_ADDRESS,
} from './qr-login/abi';
import { buildEip191Hash } from './qr-login/cryptoUtils';
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
import { signHashAndAttestInOneTap, type VerifiedWalletSession } from './cardService';
import { resolveRegistryAndDeviceAdapter, throwIfQrFlowCancelled } from './qrFlowCommonService';
import { sendAbiTransactionStrict, sendEthTransaction } from './transactionService';
import type { CardChallengeResponse, CardDeviceAttestationResponse, CardVerifyResponse } from './qrTypes';
import { getPublicViemClient } from './web3Client';
import { bytesToHex, hexToBytes } from '../utils/encoding';

export const verifyCardAttestationForCreatePool = async ({
  apiBase,
  pin,
  expectedAddress,
  factoryAddress,
  onProgress,
  onSessionStatus,
  isCancelled,
  session,
  txSubmitPolicy = 'legacy',
}: {
  apiBase: string;
  pin: string;
  expectedAddress: string;
  factoryAddress: `0x${string}`;
  onProgress?: (status: string) => void;
  onSessionStatus?: (status: string) => void;
  isCancelled?: () => boolean;
  session?: VerifiedWalletSession;
  txSubmitPolicy?: 'legacy' | 'strict';
}): Promise<void> => {
  throwIfQrFlowCancelled(isCancelled);
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
  throwIfQrFlowCancelled(isCancelled);

  const alreadyOnChainVerified = await client.readContract({
    address: deviceAdapterAddress,
    abi: DEVICE_ADAPTER_READ_ABI,
    functionName: 'isDeviceVerified',
    args: [accountAddress],
  });
  if (alreadyOnChainVerified) {
    onProgress?.('Wallet already verified on-chain. Retrying create pool pre-check...');
    return;
  }
  throwIfQrFlowCancelled(isCancelled);

  const verifyMessage = `Verify Chainora device for create-pool access on factory ${factoryAddress}`;
  const messageHash = buildEip191Hash(verifyMessage);

  onSessionStatus?.('create_pool_device_verify_challenge');
  onProgress?.('Wallet is not device-verified. Creating card attestation proof...');
  const requestChallenge = async (address: string, deviceCertificate: Uint8Array): Promise<CardChallengeResponse> => {
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
    return extractResponseData<CardChallengeResponse>(challengeRaw);
  };

  const signAndAttest = session
    ? await (async () => {
      if (session.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }

      const challengePayload = await requestChallenge(accountAddress, session.deviceCertificate);
      onProgress?.('Signing challenge with card attestation key...');
      const attestResult = await session.attestChallenge(hexToBytes(challengePayload.challenge));
      if (!attestResult.ok || !attestResult.attestationProof) {
        throw new Error(attestResult.message || 'Unable to create card attestation proof for device verification');
      }

      return {
        ok: true,
        message: 'Card attestation proof generated successfully.',
        attestationProof: attestResult.attestationProof,
        challengeMeta: challengePayload,
      };
    })()
    : await signHashAndAttestInOneTap<CardChallengeResponse>(
      pin,
      messageHash,
      async ({ address, deviceCertificate }) => {
        if (address.toLowerCase() !== accountAddress.toLowerCase()) {
          throw new Error('Card address does not match the active wallet in app.');
        }

        const challengePayload = await requestChallenge(address, deviceCertificate);
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
  throwIfQrFlowCancelled(isCancelled);

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
  throwIfQrFlowCancelled(isCancelled);

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
  throwIfQrFlowCancelled(isCancelled);

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
  throwIfQrFlowCancelled(isCancelled);
  let submitVerificationTx;
  try {
    if (txSubmitPolicy === 'strict') {
      submitVerificationTx = await sendAbiTransactionStrict({
        from: accountAddress,
        to: deviceAdapterAddress,
        valueWei: 0n,
        pin: session ? '0000' : pin,
        signHash: session ? hash => session.signHash(hash) : undefined,
        dataHex: submitVerificationCalldata,
        estimateFailureMessage:
          'Unable to prepare device verification transaction because Chainora RPC gas estimation is slow. Please retry in a moment.',
      });
    } else {
      submitVerificationTx = await sendEthTransaction({
        from: accountAddress,
        to: deviceAdapterAddress,
        valueWei: 0n,
        pin: session ? '0000' : pin,
        signHash: session ? hash => session.signHash(hash) : undefined,
        gasLimitWei: 1_500_000n,
        dataHex: submitVerificationCalldata,
      });
    }
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
    timeoutMs: 16_000,
    retryLimit: 1,
    retryDelayMs: 320,
    pollingIntervalMs: 420,
  });
  if (submitReceipt.status !== 'success') {
    throw new Error(
      `On-chain device verification transaction reverted. Tx: ${submitVerificationTx.transactionHash}`,
    );
  }
  throwIfQrFlowCancelled(isCancelled);

  let isNowVerified = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
      setTimeout(resolve, 280);
    });
  }
  if (!isNowVerified) {
    onProgress?.('Device verification tx confirmed. Rechecking create pool pre-check...');
    return;
  }

  onProgress?.('Wallet is now device-verified on-chain. Retrying create pool pre-check...');
};
