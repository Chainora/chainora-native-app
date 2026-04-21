import { encodeFunctionData, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  ERC20_WRITE_ABI,
} from './qr-login/abi';
import { POOL_ACTION_QR_FEATURE } from './qr-login/constants';
import {
  buildPoolActionAccountNotActivatedMessage,
  buildPoolActionInsufficientGasMessage,
  isInsufficientGasLikeError,
  isRpcTimeoutLikeError,
  isUnknownAccountLikeError,
  logPoolActionEvent,
  logPoolActionIssue,
} from './qr-login/errorUtils';
import { runWithSoftTimeout, waitForTransactionReceiptWithRetry } from './qr-login/rpcUtils';
import { withVerifiedWalletSession } from './cardService';
import { createSessionStatusPublisher, throwIfQrFlowCancelled } from './qrFlowCommonService';
import {
  ACCEPT_INVITE_SELECTOR,
  ACCEPT_JOIN_REQUEST_SELECTOR,
  CONTRIBUTE_SELECTOR,
  decodeSingleUint256Argument,
  decodeSingleAddressArgument,
  isNonceConflictLikeError,
  isPoolActionSimulationRevertError,
  PROPOSE_INVITE_SELECTOR,
  SUBMIT_DISCOUNT_BID_SELECTOR,
  SUBMIT_JOIN_REQUEST_SELECTOR,
  UINT256_MAX,
} from './qrPoolActionHelpers';
import { diagnoseSubmitDiscountBidPrecheck } from './qrPoolActionBiddingPrecheckService';
import { diagnoseContributePrecheck } from './qrPoolActionCollectingPrecheckService';
import { diagnoseProposeInvitePrecheck, diagnoseSubmitJoinRequestPrecheck } from './qrPoolActionFormingPrecheckService';
import { sendAbiTransactionStrict } from './transactionService';
import type {
  QrLoginPayload,
  VerifyLoginResponse,
} from './qrTypes';
import { getPublicViemClient } from './web3Client';

const CONTRIBUTE_PRECHECK_TIMEOUT_MS = 2_800;
const MEMBERSHIP_PRECHECK_TIMEOUT_MS = 900;
const BID_PRECHECK_TIMEOUT_MS = 1_800;
const TX_NONCE_WARMUP_TIMEOUT_MS = 900;
const MEMBERSHIP_RECEIPT_WAIT_TIMEOUT_MS = 8_000;
const CONTRIBUTE_RECEIPT_WAIT_TIMEOUT_MS = 12_000;
const BID_RECEIPT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_RECEIPT_WAIT_TIMEOUT_MS = 9_000;
const JOIN_REQUEST_GAS_PRICE_BOOST_NUMERATOR = 140n;
const JOIN_REQUEST_GAS_PRICE_BOOST_DENOMINATOR = 100n;
const JOIN_REQUEST_REPLACEMENT_GAS_PRICE_BOOST_NUMERATOR = 118n;
const JOIN_REQUEST_REPLACEMENT_GAS_PRICE_BOOST_DENOMINATOR = 100n;
const JOIN_REQUEST_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS = 2;
const CONTRIBUTE_GAS_PRICE_BOOST_NUMERATOR = 132n;
const CONTRIBUTE_GAS_PRICE_BOOST_DENOMINATOR = 100n;

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

export const executePoolActionViaQrOneTap = async ({
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
  const normalizedActionLabel = actionLabel.toLowerCase();
  const selector = String(config.data ?? '').slice(0, 10).toLowerCase();
  const isMembershipLikeAction = (
    selector === PROPOSE_INVITE_SELECTOR
    || selector === SUBMIT_JOIN_REQUEST_SELECTOR
    || selector === ACCEPT_INVITE_SELECTOR
    || selector === ACCEPT_JOIN_REQUEST_SELECTOR
    || normalizedActionLabel.includes('invite')
    || normalizedActionLabel.includes('join')
    || normalizedActionLabel.includes('request')
    || normalizedActionLabel.includes('vote')
    || normalizedActionLabel.includes('leave')
  );
  const receiptWaitProfile = (() => {
    if (isMembershipLikeAction) {
      return {
        timeoutMs: MEMBERSHIP_RECEIPT_WAIT_TIMEOUT_MS,
        retryDelayMs: 350,
        pollingIntervalMs: 450,
      };
    }
    if (selector === CONTRIBUTE_SELECTOR) {
      return {
        timeoutMs: CONTRIBUTE_RECEIPT_WAIT_TIMEOUT_MS,
        retryDelayMs: 500,
        pollingIntervalMs: 550,
      };
    }
    if (selector === SUBMIT_DISCOUNT_BID_SELECTOR) {
      return {
        timeoutMs: BID_RECEIPT_WAIT_TIMEOUT_MS,
        retryDelayMs: 450,
        pollingIntervalMs: 520,
      };
    }
    return {
      timeoutMs: DEFAULT_RECEIPT_WAIT_TIMEOUT_MS,
      retryDelayMs: 420,
      pollingIntervalMs: 500,
    };
  })();
  const inviteCandidateAddress = selector === PROPOSE_INVITE_SELECTOR
    ? decodeSingleAddressArgument(String(config.data ?? ''))
    : null;
  const bidDiscount = selector === SUBMIT_DISCOUNT_BID_SELECTOR
    ? decodeSingleUint256Argument(String(config.data ?? ''))
    : null;
  const shouldUseMembershipPriority = (
    selector === PROPOSE_INVITE_SELECTOR
    || selector === SUBMIT_JOIN_REQUEST_SELECTOR
    || selector === ACCEPT_INVITE_SELECTOR
    || selector === ACCEPT_JOIN_REQUEST_SELECTOR
  );
  const client = getPublicViemClient(activeNetwork);

  const buildPriorityGasPrice = async ({
    numerator,
    denominator,
    timeoutMs = 900,
  }: {
    numerator: bigint;
    denominator: bigint;
    timeoutMs?: number;
  }): Promise<bigint | undefined> => {
    const gasProbe = await runWithSoftTimeout(client.getGasPrice(), timeoutMs);
    if (gasProbe.status !== 'ok') {
      return undefined;
    }

    return boostGasPrice(gasProbe.value, numerator, denominator);
  };

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

    if (selector === SUBMIT_DISCOUNT_BID_SELECTOR) {
      if (bidDiscount === null) {
        return 'Bid blocked: invalid discount parameter in bid payload.';
      }

      const diagnosis = await runWithSoftTimeout(
        diagnoseSubmitDiscountBidPrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
          discountWei: bidDiscount,
        }),
        4_000,
      );

      if (diagnosis.status === 'ok' && diagnosis.value) {
        return diagnosis.value;
      }

      return 'Bid was rejected by on-chain rules. Common causes: auction not open, bid not higher than best discount, or wallet is not eligible this cycle.';
    }

    if (selector === CONTRIBUTE_SELECTOR) {
      const diagnosis = await runWithSoftTimeout(
        diagnoseContributePrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
        }),
        CONTRIBUTE_PRECHECK_TIMEOUT_MS,
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

  type ContributionApprovalPreparation = {
    contributeGasPriceWei?: bigint;
  };
  type ContributeDiagnosis = Awaited<ReturnType<typeof diagnoseContributePrecheck>>;
  type ContributePrecheckProbe =
    | { status: 'ok'; value: ContributeDiagnosis }
    | { status: 'timeout' }
    | { status: 'error'; error: Error };

  const buildWarmPendingNonce = async (timeoutMs = TX_NONCE_WARMUP_TIMEOUT_MS): Promise<bigint | undefined> => {
    const nonceProbe = await runWithSoftTimeout(client.getTransactionCount({
      address: accountAddress,
      blockTag: 'pending',
    }), timeoutMs);
    if (nonceProbe.status !== 'ok') {
      return undefined;
    }

    return BigInt(nonceProbe.value);
  };

  const membershipPriorityGasPriceTask: Promise<bigint | undefined> = shouldUseMembershipPriority
    ? buildPriorityGasPrice({
      numerator: JOIN_REQUEST_GAS_PRICE_BOOST_NUMERATOR,
      denominator: JOIN_REQUEST_GAS_PRICE_BOOST_DENOMINATOR,
    })
    : Promise.resolve(undefined);
  const warmedPendingNonceTask = buildWarmPendingNonce();
  const warmContributePrecheckTask: Promise<ContributePrecheckProbe | null> = selector === CONTRIBUTE_SELECTOR
    ? runWithSoftTimeout(
      diagnoseContributePrecheck({
        client,
        poolAddress: targetAddress,
        accountAddress,
      }),
      CONTRIBUTE_PRECHECK_TIMEOUT_MS,
    )
    : Promise.resolve(null);
  let actionPrecheckError: Error | null = null;
  const actionPrecheckTask = (async (): Promise<void> => {
    if (selector === SUBMIT_JOIN_REQUEST_SELECTOR) {
      const precheck = await runWithSoftTimeout(
        diagnoseSubmitJoinRequestPrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
        }),
        MEMBERSHIP_PRECHECK_TIMEOUT_MS,
      );
      if (precheck.status === 'ok' && precheck.value) {
        throw new Error(precheck.value);
      }
      return;
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
        MEMBERSHIP_PRECHECK_TIMEOUT_MS,
      );
      if (precheck.status === 'ok' && precheck.value) {
        throw new Error(precheck.value);
      }
      return;
    }

    if (selector === SUBMIT_DISCOUNT_BID_SELECTOR) {
      if (bidDiscount === null) {
        throw new Error('Bid blocked: invalid discount parameter in bid payload.');
      }

      const precheck = await runWithSoftTimeout(
        diagnoseSubmitDiscountBidPrecheck({
          client,
          poolAddress: targetAddress,
          accountAddress,
          discountWei: bidDiscount,
        }),
        BID_PRECHECK_TIMEOUT_MS,
      );
      if (precheck.status === 'ok' && precheck.value) {
        throw new Error(precheck.value);
      }
    }
  })().catch(error => {
    actionPrecheckError = error instanceof Error ? error : new Error(String(error));
  });

  logPoolActionEvent({
    stage: 'start',
    actionLabel,
    accountAddress,
    targetAddress,
    selector,
    sessionId,
  });

  try {
    return await withVerifiedWalletSession(pin, async walletSession => {
      if (walletSession.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }
      throwIfQrFlowCancelled(isCancelled);
      await actionPrecheckTask;
      if (actionPrecheckError) {
        throw actionPrecheckError;
      }

      const warmContributePrecheck = selector === CONTRIBUTE_SELECTOR
        ? await warmContributePrecheckTask
        : null;
      const ensureContributionApproval = async (
        warmDiagnosis?: ContributePrecheckProbe | null,
      ): Promise<ContributionApprovalPreparation> => {
        throwIfQrFlowCancelled(isCancelled);
        const diagnosis = warmDiagnosis ?? await runWithSoftTimeout(
          diagnoseContributePrecheck({
            client,
            poolAddress: targetAddress,
            accountAddress,
          }),
          CONTRIBUTE_PRECHECK_TIMEOUT_MS,
        );

        if (diagnosis.status === 'timeout') {
          onProgress?.('Contribute pre-check timed out. Skipping strict pre-check and continuing to transaction signing...');
          return {};
        }

        if (diagnosis.status === 'error') {
          const reason = diagnosis.error.message || 'unknown pre-check error';
          if (isRpcTimeoutLikeError(reason)) {
            onProgress?.('Contribute pre-check hit RPC timeout. Continuing with direct transaction submission...');
            return {};
          }
          throw new Error(`Contribute pre-check failed: ${reason}.`);
        }

        const details = diagnosis.value;
        if (details.blockedReason) {
          throw new Error(details.blockedReason);
        }

        if (!details.needsApproval || !details.stablecoinAddress) {
          return {};
        }

        const approveCalldata = encodeFunctionData({
          abi: ERC20_WRITE_ABI,
          functionName: 'approve',
          args: [targetAddress, UINT256_MAX],
        });

        onProgress?.(
          'Contribution needs token approval first. Submitting approval transaction...',
        );
        throwIfQrFlowCancelled(isCancelled);

        const contributePriorityGasPrice = await buildPriorityGasPrice({
          numerator: CONTRIBUTE_GAS_PRICE_BOOST_NUMERATOR,
          denominator: CONTRIBUTE_GAS_PRICE_BOOST_DENOMINATOR,
        });
        if (contributePriorityGasPrice) {
          onProgress?.('Using priority gas price for token approval...');
        }

        let approveTx: {
          transactionHash: string;
          gasPriceWei: bigint;
        };
        try {
          approveTx = await sendAbiTransactionStrict({
            from: accountAddress,
            to: details.stablecoinAddress,
            valueWei: 0n,
            pin: '0000',
            signHash: hash => walletSession.signHash(hash),
            gasPriceWei: contributePriorityGasPrice,
            dataHex: approveCalldata,
            estimateFailureMessage:
              'Unable to estimate gas for contribution token approval because Chainora RPC is slow. Please retry in a moment.',
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

        throwIfQrFlowCancelled(isCancelled);
        onProgress?.('Waiting for token approval confirmation...');
        let approvalWaitingRound = 1;
        while (true) {
          throwIfQrFlowCancelled(isCancelled);
          try {
            const approvalReceipt = await waitForTransactionReceiptWithRetry({
              client,
              txHash: approveTx.transactionHash as `0x${string}`,
              label: 'contribution approval',
              onProgress,
              timeoutMs: 6_000,
              retryLimit: 1,
              retryDelayMs: 260,
              pollingIntervalMs: 320,
            });
            if (approvalReceipt.status !== 'success') {
              throw new Error(`Contribution approval reverted on-chain. Tx: ${approveTx.transactionHash}`);
            }
            break;
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (!isPendingConfirmationError(reason)) {
              throw error instanceof Error ? error : new Error(reason);
            }
            approvalWaitingRound += 1;
            onProgress?.(
              `Chainora RPC is still slow. Continuing to wait for contribution approval confirmation... (${approvalWaitingRound})`,
            );
          }
        }

        return { contributeGasPriceWei: approveTx.gasPriceWei };
      };

      let contributionApprovalPrep: ContributionApprovalPreparation | null = null;
      if (selector === CONTRIBUTE_SELECTOR) {
        contributionApprovalPrep = await ensureContributionApproval(warmContributePrecheck);
      }
      throwIfQrFlowCancelled(isCancelled);

      const membershipPriorityGasPrice = shouldUseMembershipPriority
        ? await membershipPriorityGasPriceTask
        : undefined;
      if (membershipPriorityGasPrice) {
        onProgress?.('Using priority gas price to speed up membership confirmation...');
      }
      const warmedPendingNonce = await warmedPendingNonceTask;

      const contributePriorityGasPrice = (
        selector === CONTRIBUTE_SELECTOR
        && !contributionApprovalPrep?.contributeGasPriceWei
      )
        ? await buildPriorityGasPrice({
          numerator: CONTRIBUTE_GAS_PRICE_BOOST_NUMERATOR,
          denominator: CONTRIBUTE_GAS_PRICE_BOOST_DENOMINATOR,
        })
        : undefined;
      if (contributePriorityGasPrice) {
        onProgress?.('Using priority gas price to speed up contribute confirmation...');
      }

      const signingMessage =
        selector === CONTRIBUTE_SELECTOR
        && contributionApprovalPrep?.contributeGasPriceWei
          ? 'Token approval confirmed. Estimating gas and signing contribute transaction on card...'
          : `Signing ${actionLabel} transaction on card...`;

      pushSessionStatus('pool_action_signing_tx');
      onProgress?.(signingMessage);
      throwIfQrFlowCancelled(isCancelled);

      const submitPoolActionTx = (params?: { nonce?: bigint; gasPriceWei?: bigint }) => sendAbiTransactionStrict({
        from: accountAddress,
        to: targetAddress,
        valueWei,
        pin: '0000',
        signHash: hash => walletSession.signHash(hash),
        nonce: params?.nonce,
        gasPriceWei: params?.gasPriceWei,
        dataHex: config.data as `0x${string}`,
        estimateFailureMessage:
          `Unable to estimate gas for ${actionLabel} because Chainora RPC is slow. Please retry in a moment.`,
      });

      const submitMembershipActionWithNonceRecovery = async (): Promise<
      Awaited<ReturnType<typeof submitPoolActionTx>>
      > => {
        let attempt = 0;
        let currentGasPriceWei = membershipPriorityGasPrice;
        let currentNonce = warmedPendingNonce;

        while (true) {
          try {
            return await submitPoolActionTx({
              nonce: currentNonce,
              gasPriceWei: currentGasPriceWei,
            });
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (
              !isNonceConflictLikeError(reason)
              || attempt >= JOIN_REQUEST_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS
            ) {
              throw error instanceof Error ? error : new Error(reason);
            }

            attempt += 1;
            currentNonce = undefined;
            onProgress?.(
              `Wallet nonce changed during membership submit. Retrying with fresh nonce (${attempt}/${JOIN_REQUEST_MAX_SUBMIT_NONCE_RECOVERY_ATTEMPTS})...`,
            );
            if (currentGasPriceWei) {
              currentGasPriceWei = boostGasPrice(
                currentGasPriceWei,
                JOIN_REQUEST_REPLACEMENT_GAS_PRICE_BOOST_NUMERATOR,
                JOIN_REQUEST_REPLACEMENT_GAS_PRICE_BOOST_DENOMINATOR,
              );
            } else {
              const gasProbe = await runWithSoftTimeout(client.getGasPrice(), 900);
              if (gasProbe.status === 'ok') {
                currentGasPriceWei = boostGasPrice(
                  gasProbe.value,
                  JOIN_REQUEST_GAS_PRICE_BOOST_NUMERATOR,
                  JOIN_REQUEST_GAS_PRICE_BOOST_DENOMINATOR,
                );
              }
            }
          }
        }
      };

      let txResult: Awaited<ReturnType<typeof sendAbiTransactionStrict>> | null = null;
      let submissionError: Error | null = null;
      try {
        if (shouldUseMembershipPriority) {
          txResult = await submitMembershipActionWithNonceRecovery();
        } else {
          txResult = await submitPoolActionTx({
            nonce: warmedPendingNonce,
            gasPriceWei:
              contributionApprovalPrep?.contributeGasPriceWei
              ?? contributePriorityGasPrice
              ?? membershipPriorityGasPrice,
          });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (isNonceConflictLikeError(reason)) {
          onProgress?.('Wallet nonce changed during submit. Retrying with fresh nonce...');
          try {
            txResult = await submitPoolActionTx({
              gasPriceWei:
                contributionApprovalPrep?.contributeGasPriceWei
                ?? contributePriorityGasPrice
                ?? membershipPriorityGasPrice,
            });
          } catch (retryError) {
            submissionError = retryError instanceof Error ? retryError : new Error(String(retryError));
          }
        } else {
          submissionError = error instanceof Error ? error : new Error(reason);
        }
      }

      if (submissionError) {
        const reason = submissionError.message;
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
          const diagnosis = await runWithSoftTimeout(
            diagnoseContributePrecheck({
              client,
              poolAddress: targetAddress,
              accountAddress,
            }),
            CONTRIBUTE_PRECHECK_TIMEOUT_MS,
          );

          if (diagnosis.status === 'ok') {
            if (diagnosis.value.blockedReason) {
              throw new Error(diagnosis.value.blockedReason);
            }

            if (diagnosis.value.needsApproval) {
              const required = diagnosis.value.contributionAmount ?? 0n;
              const current = diagnosis.value.allowance ?? 0n;
              throw new Error(
                `Contribute blocked: stablecoin allowance is too low. `
                + `Required ${required.toString()}, current ${current.toString()}.`,
              );
            }

            if (diagnosis.value.balance !== null && diagnosis.value.contributionAmount !== null) {
              if (diagnosis.value.balance < diagnosis.value.contributionAmount) {
                throw new Error(
                  `Contribute blocked: stablecoin balance is too low. `
                  + `Required ${diagnosis.value.contributionAmount.toString()}, current ${diagnosis.value.balance.toString()}.`,
                );
              }
            }
          }

          throw new Error(
            'Contribute blocked: stablecoin transferFrom failed. Check token balance/allowance and group contribution window.',
          );
        }
        throw submissionError;
      }
      if (!txResult) {
        throw new Error(`${actionLabel} transaction was not submitted.`);
      }

      onMainTxSubmitted?.(txResult.transactionHash);

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
      onProgress?.('Waiting for transaction confirmation... Transaction is already submitted and cannot be cancelled.');

      let receipt;
      let waitingRound = 1;
      const activeTxResult = txResult;
      while (true) {
        throwIfQrFlowCancelled(isCancelled);
        try {
          receipt = await waitForTransactionReceiptWithRetry({
            client,
            txHash: activeTxResult.transactionHash as `0x${string}`,
            label: actionLabel,
            onProgress,
            timeoutMs: receiptWaitProfile.timeoutMs,
            retryLimit: 1,
            retryDelayMs: receiptWaitProfile.retryDelayMs,
            pollingIntervalMs: receiptWaitProfile.pollingIntervalMs,
          });
          break;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (!isPendingConfirmationError(reason)) {
            throw error instanceof Error ? error : new Error(reason);
          }
          waitingRound += 1;
          onProgress?.(
            `Chainora RPC is still slow. Continuing to wait for ${actionLabel} confirmation... (${waitingRound})`,
          );
        }
      }

      if (receipt.status !== 'success') {
        if (selector === CONTRIBUTE_SELECTOR) {
          const diagnosed = await diagnosePoolActionSimulationRevert();
          if (diagnosed) {
            logPoolActionIssue({
              stage: 'pool_action_tx_reverted',
              actionLabel,
              accountAddress,
              targetAddress,
              selector,
              txHash: activeTxResult.transactionHash,
              sessionId,
              reason: `transaction reverted on-chain | diagnosed: ${diagnosed}`,
            });
            throw new Error(diagnosed);
          }
        }

        logPoolActionIssue({
          stage: 'pool_action_tx_reverted',
          actionLabel,
          accountAddress,
          targetAddress,
          selector,
          txHash: activeTxResult.transactionHash,
          sessionId,
          reason: 'transaction reverted on-chain',
        });
        throw new Error(`${actionLabel} transaction reverted on-chain. Tx: ${activeTxResult.transactionHash}`);
      }

      pushSessionStatus('pool_action_success');
      logPoolActionEvent({
        stage: 'success',
        actionLabel,
        accountAddress,
        targetAddress,
        selector,
        txHash: activeTxResult.transactionHash,
        sessionId,
      });

      return {
        verified: true,
        address: accountAddress,
        txHash: activeTxResult.transactionHash,
      };
    });
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
