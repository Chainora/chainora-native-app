import { decodeEventLog, encodeFunctionData, getAddress, parseUnits } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  FACTORY_CREATE_POOL_ABI,
} from './qr-login/abi';
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
  PRECHECK_DIAG_TIMEOUT_MS,
  PRECHECK_SIMULATE_TIMEOUT_MS,
} from './qr-login/constants';
import {
  buildAccountNotActivatedMessage,
  buildInsufficientGasMessage,
  isInsufficientGasLikeError,
  isRpcTimeoutLikeError,
  isUnknownAccountLikeError,
  logCreateGroupGasIssue,
} from './qr-login/errorUtils';
import {
  extractResponseData,
  fetchWithTimeout,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { isDeviceNotVerifiedError, mapCreatePoolRevertMessage } from './qr-login/precheckUtils';
import { runWithSoftTimeout, waitForTransactionReceiptWithRetry, withOperationTimeout } from './qr-login/rpcUtils';
import { withVerifiedWalletSession, type VerifiedWalletSession } from './cardService';
import { diagnoseCreatePoolPrecheck } from './qrCreateGroupPrecheckService';
import { verifyCardAttestationForCreatePool } from './qrCreateGroupDeviceVerificationService';
import { createSessionStatusPublisher, throwIfQrFlowCancelled } from './qrFlowCommonService';
import { sendEthTransaction } from './transactionService';
import type { QrLoginPayload, VerifyLoginResponse } from './qrTypes';
import { getPublicViemClient } from './web3Client';
export { verifyCardAttestationForCreatePool } from './qrCreateGroupDeviceVerificationService';

export const createPoolViaQrOneTap = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
  isCancelled,
  onMainTxSubmitted,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
  isCancelled?: () => boolean;
  onMainTxSubmitted?: (txHash: string) => void;
}): Promise<VerifyLoginResponse> => {
  throwIfQrFlowCancelled(isCancelled);
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

  const autoVerifyDevice = async (session?: VerifiedWalletSession) => {
    if (!payload.apiBase) {
      throw new Error(`${DEVICE_NOT_VERIFIED_MESSAGE} Missing apiBase for automatic card verification.`);
    }
    throwIfQrFlowCancelled(isCancelled);
    await ensureSenderAccountReady();
    attemptedAutoVerify = true;
    await verifyCardAttestationForCreatePool({
      apiBase: payload.apiBase,
      pin,
      expectedAddress: accountAddress,
      factoryAddress,
      onProgress,
      onSessionStatus: pushSessionStatus,
      isCancelled,
      session,
    });
    throwIfQrFlowCancelled(isCancelled);
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

  let needsAutoVerifyBeforeSubmit = false;

  if (skipPrecheck) {
    pushSessionStatus(CREATE_POOL_PRECHECK_CONTINUE_STATUS);
    onProgress?.('Skipping heavy pre-check for faster flow. Proceeding directly to transaction signing...');
    const cachedVerification = readDeviceVerificationCache(verificationCacheKey);

    if (cachedVerification === false) {
      onProgress?.('Wallet was recently marked as not device-verified. Auto-verifying in same NFC session before create pool...');
      needsAutoVerifyBeforeSubmit = true;
    } else if (cachedVerification !== true) {
      const quickDiagnosis = await runWithSoftTimeout(runPrecheckDiagnosis(), 1_500);
      if (quickDiagnosis.status === 'ok' && quickDiagnosis.value) {
        if (isDeviceNotVerifiedError(quickDiagnosis.value)) {
          needsAutoVerifyBeforeSubmit = true;
        } else {
          throw new Error(quickDiagnosis.value);
        }
      }
    }
    throwIfQrFlowCancelled(isCancelled);
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
          needsAutoVerifyBeforeSubmit = true;
        } else if (diagnosed) {
          throw new Error(diagnosed);
        } else {
          throw new Error(mapCreatePoolRevertMessage(reason));
        }
      }
    }
    throwIfQrFlowCancelled(isCancelled);
  }

  const submitCreatePoolTx = async (session?: VerifiedWalletSession) => {
    pushSessionStatus('create_pool_signing_tx');
    onProgress?.('Signing createPool transaction on card...');
    throwIfQrFlowCancelled(isCancelled);
    let nextTxResult;
    try {
      nextTxResult = await sendEthTransaction({
        from: accountAddress,
        to: factoryAddress,
        valueWei: 0n,
        pin: session ? '0000' : pin,
        signHash: session ? hash => session.signHash(hash) : undefined,
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
    onMainTxSubmitted?.(nextTxResult.transactionHash);

    pushSessionStatus('create_pool_waiting_receipt');
    onProgress?.('Waiting for transaction confirmation... Transaction is already submitted and cannot be cancelled.');
    const nextReceipt = await waitForTransactionReceiptWithRetry({
      client,
      txHash: nextTxResult.transactionHash as `0x${string}`,
      label: 'create-pool',
      onProgress,
    });

    return { txResult: nextTxResult, receipt: nextReceipt };
  };

  const runAutoVerifyAndSubmitOneTap = () => withVerifiedWalletSession(pin, async session => {
    if (session.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error('Card address does not match the active wallet in app.');
    }
    await autoVerifyDevice(session);
    return submitCreatePoolTx(session);
  });

  let execution = needsAutoVerifyBeforeSubmit
    ? await runAutoVerifyAndSubmitOneTap()
    : await submitCreatePoolTx();
  if (execution.receipt.status !== 'success') {
    const diagnosed = await runPrecheckDiagnosis();
    if (!attemptedAutoVerify && diagnosed && isDeviceNotVerifiedError(diagnosed)) {
      execution = await runAutoVerifyAndSubmitOneTap();
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
