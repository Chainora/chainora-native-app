import { decodeEventLog, encodeFunctionData, getAddress, parseUnits } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  DEVICE_ADAPTER_READ_ABI,
  FACTORY_CREATE_POOL_ABI,
  ZERO_ADDRESS,
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
  fetchWithTimeout,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { isDeviceNotVerifiedError, mapCreatePoolRevertMessage } from './qr-login/precheckUtils';
import { runWithSoftTimeout, waitForTransactionReceiptWithRetry, withOperationTimeout } from './qr-login/rpcUtils';
import { withVerifiedWalletSession, type VerifiedWalletSession } from './cardService';
import { diagnoseCreatePoolPrecheck } from './qrCreateGroupPrecheckService';
import { verifyCardAttestationForCreatePool } from './qrCreateGroupDeviceVerificationService';
import { createSessionStatusPublisher, resolveRegistryAndDeviceAdapter, throwIfQrFlowCancelled } from './qrFlowCommonService';
import { isNonceConflictLikeError } from './qrPoolActionHelpers';
import { sendAbiTransactionStrict } from './transactionService';
import type { QrLoginPayload, VerifyLoginResponse } from './qrTypes';
import { getPublicViemClient } from './web3Client';
export { verifyCardAttestationForCreatePool } from './qrCreateGroupDeviceVerificationService';

const FAST_VERIFY_CHECK_TIMEOUT_MS = 1_600;
const CREATE_POOL_GAS_PRICE_BOOST_NUMERATOR = 170n;
const CREATE_POOL_GAS_PRICE_BOOST_DENOMINATOR = 100n;
const CREATE_POOL_REPLACEMENT_GAS_PRICE_BOOST_NUMERATOR = 120n;
const CREATE_POOL_REPLACEMENT_GAS_PRICE_BOOST_DENOMINATOR = 100n;
const CREATE_POOL_RECEIPT_WAIT_TIMEOUT_MS = 10_000;
const CREATE_POOL_RECEIPT_RETRY_DELAY_MS = 320;
const CREATE_POOL_RECEIPT_POLL_INTERVAL_MS = 380;
const CREATE_POOL_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS = 2;
const CREATE_POOL_NONCE_WARMUP_TIMEOUT_MS = 900;

const isPendingConfirmationError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('confirmation is taking too long')
    || normalized.includes('transaction may still be pending on-chain')
    || isRpcTimeoutLikeError(message)
  );
};

const boostGasPrice = (
  gasPriceWei: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint => {
  const boosted = (
    gasPriceWei * numerator
    + (denominator - 1n)
  ) / denominator;

  if (boosted > gasPriceWei) {
    return boosted;
  }

  return gasPriceWei + 1n;
};

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
        1_200,
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
      txSubmitPolicy: 'strict',
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

  const detectDeviceVerificationNeededFast = async (): Promise<boolean | null> => {
    const quickCheck = await runWithSoftTimeout((async () => {
      const { deviceAdapterAddress } = await resolveRegistryAndDeviceAdapter({
        client,
        factoryAddress,
      });

      if (deviceAdapterAddress.toLowerCase() === ZERO_ADDRESS) {
        return false;
      }

      const verifiedOnChain = await client.readContract({
        address: deviceAdapterAddress,
        abi: DEVICE_ADAPTER_READ_ABI,
        functionName: 'isDeviceVerified',
        args: [accountAddress],
      });
      return !verifiedOnChain;
    })(), FAST_VERIFY_CHECK_TIMEOUT_MS);

    if (quickCheck.status !== 'ok') {
      return null;
    }
    return quickCheck.value;
  };

  const buildBoostedCreatePoolGasPrice = async (): Promise<bigint | undefined> => {
    const gasProbe = await runWithSoftTimeout(client.getGasPrice(), 1_000);
    if (gasProbe.status !== 'ok') {
      return undefined;
    }

    return boostGasPrice(
      gasProbe.value,
      CREATE_POOL_GAS_PRICE_BOOST_NUMERATOR,
      CREATE_POOL_GAS_PRICE_BOOST_DENOMINATOR,
    );
  };
  const buildWarmCreatePoolNonce = async (): Promise<bigint | undefined> => {
    const nonceProbe = await runWithSoftTimeout(
      client.getTransactionCount({
        address: accountAddress,
        blockTag: 'pending',
      }),
      CREATE_POOL_NONCE_WARMUP_TIMEOUT_MS,
    );
    if (nonceProbe.status !== 'ok') {
      return undefined;
    }

    return BigInt(nonceProbe.value);
  };
  const warmedCreatePoolGasPriceTask = buildBoostedCreatePoolGasPrice();
  const warmedCreatePoolNonceTask = buildWarmCreatePoolNonce();
  type CreatePoolReceipt = Awaited<ReturnType<typeof client.waitForTransactionReceipt>>;

  const waitCreatePoolReceipt = async ({
    txHash,
    onWaitProgress,
    retryLimit = 1,
  }: {
    txHash: `0x${string}`;
    onWaitProgress?: (status: string) => void;
    retryLimit?: number;
  }): Promise<CreatePoolReceipt> =>
    waitForTransactionReceiptWithRetry({
      client,
      txHash,
      label: 'create-pool',
      onProgress: onWaitProgress,
      timeoutMs: CREATE_POOL_RECEIPT_WAIT_TIMEOUT_MS,
      retryLimit,
      retryDelayMs: CREATE_POOL_RECEIPT_RETRY_DELAY_MS,
      pollingIntervalMs: CREATE_POOL_RECEIPT_POLL_INTERVAL_MS,
    });

  const finalizeCreatePoolSuccess = async ({
    txHash,
    receipt,
    onFinalizeProgress,
  }: {
    txHash: `0x${string}`;
    receipt: CreatePoolReceipt;
    onFinalizeProgress?: (status: string) => void;
  }): Promise<{ poolAddress: string; poolId: string }> => {
    if (receipt.status !== 'success') {
      throw new Error(`Create pool transaction reverted on-chain. Tx: ${txHash}`);
    }

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
      throw new Error(`Create pool transaction confirmed but ChainoraPoolCreated event was not found. Tx: ${txHash}`);
    }

    const apiBase = payload.apiBase?.trim() ?? '';
    if (!apiBase) {
      throw new Error('Create-pool backend sync failed: apiBase is missing in QR payload.');
    }

    const authToken = config.authToken?.trim() ?? '';
    if (!authToken) {
      throw new Error('Create-pool backend sync failed: auth token is missing in QR payload.');
    }

    pushSessionStatus('create_pool_syncing_backend');
    onFinalizeProgress?.('Syncing created group to backend...');
    const groupResponse = await fetchWithTimeout(`${apiBase}/v1/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        poolId,
        poolAddress,
        name: config.groupName || `Savings Group ${poolId}`,
        description: config.groupDescription || '',
        groupImageUrl: config.groupImageUrl || '',
        publicRecruitment: config.publicRecruitment ?? true,
        contributionAmount: contributionAmountWei.toString(),
        minReputation: minReputationScore.toString(),
        targetMembers: config.targetMembers,
        periodDuration: config.periodDurationSeconds,
        contributionWindow: config.contributionWindowSeconds,
        auctionWindow: config.auctionWindowSeconds,
        txHash,
      }),
    });

    if (!groupResponse.ok) {
      const detail = await readApiErrorMessage(groupResponse, `Persist group failed: ${groupResponse.status}`);
      throw new Error(detail);
    }

    writeDeviceVerificationCache(verificationCacheKey, true);
    pushSessionStatus('create_pool_success');
    return { poolAddress, poolId };
  };

  let needsAutoVerifyBeforeSubmit = false;

  if (skipPrecheck) {
    pushSessionStatus(CREATE_POOL_PRECHECK_CONTINUE_STATUS);
    onProgress?.('Skipping heavy pre-check for faster flow. Proceeding directly to transaction signing...');
    const cachedVerification = readDeviceVerificationCache(verificationCacheKey);

    if (cachedVerification === false) {
      const quickNeed = await detectDeviceVerificationNeededFast();
      if (quickNeed === false) {
        writeDeviceVerificationCache(verificationCacheKey, true);
        onProgress?.('Wallet is already device-verified on-chain. Skipping extra verification step.');
      } else {
        onProgress?.('Wallet was recently marked as not device-verified. Auto-verifying in same NFC session before create pool...');
        needsAutoVerifyBeforeSubmit = true;
      }
    } else if (cachedVerification === null) {
      onProgress?.('Skipping extra verification lookup for faster create-group submission...');
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

  const submitCreatePoolTx = async (session: VerifiedWalletSession) => {
    pushSessionStatus('create_pool_signing_tx');
    onProgress?.('Signing createPool transaction on card...');
    throwIfQrFlowCancelled(isCancelled);
    const initialGasPriceWei = await warmedCreatePoolGasPriceTask;
    const warmedNonce = await warmedCreatePoolNonceTask;
    if (initialGasPriceWei) {
      onProgress?.('Using priority gas price to speed up create-group confirmation...');
    }
    let nextTxResult: {
      transactionHash: string;
      nonce: bigint;
      gasPriceWei: bigint;
      gasLimitWei: bigint;
    };
    let nonceRecoveryAttempt = 0;
    let currentGasPriceWei = initialGasPriceWei;
    let currentNonce = warmedNonce;
    try {
      while (true) {
        try {
          nextTxResult = await sendAbiTransactionStrict({
            from: accountAddress,
            to: factoryAddress,
            valueWei: 0n,
            pin: '0000',
            signHash: hash => session.signHash(hash),
            nonce: currentNonce,
            gasPriceWei: currentGasPriceWei,
            dataHex: calldata,
            estimateFailureMessage:
              'Unable to prepare create-group transaction because Chainora RPC gas estimation is slow. Please retry in a moment.',
          });
          break;
        } catch (submissionError) {
          const reason = submissionError instanceof Error ? submissionError.message : String(submissionError);
          if (
            !isNonceConflictLikeError(reason)
            || nonceRecoveryAttempt >= CREATE_POOL_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS
          ) {
            throw submissionError instanceof Error ? submissionError : new Error(reason);
          }

          nonceRecoveryAttempt += 1;
          currentNonce = undefined;
          onProgress?.(
            `Wallet nonce changed during create-group submit. Retrying with fresh nonce (${nonceRecoveryAttempt}/${CREATE_POOL_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS})...`,
          );
          if (currentGasPriceWei) {
            currentGasPriceWei = boostGasPrice(
              currentGasPriceWei,
              CREATE_POOL_REPLACEMENT_GAS_PRICE_BOOST_NUMERATOR,
              CREATE_POOL_REPLACEMENT_GAS_PRICE_BOOST_DENOMINATOR,
            );
          } else {
            currentGasPriceWei = await buildBoostedCreatePoolGasPrice();
          }
        }
      }
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
    const activeTxResult = nextTxResult;
    let waitingRound = 1;
    while (true) {
      throwIfQrFlowCancelled(isCancelled);
      try {
        const nextReceipt = await waitCreatePoolReceipt({
          txHash: activeTxResult.transactionHash as `0x${string}`,
          onWaitProgress: onProgress,
        });
        return { txResult: activeTxResult, receipt: nextReceipt };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!isPendingConfirmationError(reason)) {
          throw error instanceof Error ? error : new Error(reason);
        }
        waitingRound += 1;
        onProgress?.(`Chainora RPC is still slow. Continuing to wait for create-pool confirmation... (${waitingRound})`);
      }
    }
  };

  const runCreatePoolOneTap = () => withVerifiedWalletSession(pin, async session => {
    if (session.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error('Card address does not match the active wallet in app.');
    }
    if (needsAutoVerifyBeforeSubmit) {
      await autoVerifyDevice(session);
    }

    let execution = await submitCreatePoolTx(session);
    if (execution.receipt.status !== 'success') {
      const diagnosed = await runPrecheckDiagnosis();
      if (!attemptedAutoVerify && diagnosed && isDeviceNotVerifiedError(diagnosed)) {
        await autoVerifyDevice(session);
        execution = await submitCreatePoolTx(session);
      } else if (diagnosed) {
        throw new Error(diagnosed);
      }
    }

    return execution;
  });

  const execution = await runCreatePoolOneTap();

  const txHash = execution.txResult.transactionHash as `0x${string}`;
  const finalized = await finalizeCreatePoolSuccess({
    txHash,
    receipt: execution.receipt,
    onFinalizeProgress: onProgress,
  });

  return {
    verified: true,
    address: expectedAddress,
    txHash,
    poolAddress: finalized.poolAddress,
    poolId: finalized.poolId,
  };
};
