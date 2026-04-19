import { encodeFunctionData, getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  ERC20_READ_ABI,
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
  BID_TX_FALLBACK_GAS_LIMIT,
  CONTRIBUTION_APPROVE_FALLBACK_GAS_LIMIT,
  CONTRIBUTION_TX_FALLBACK_GAS_LIMIT,
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
import { broadcastRawSignedTransaction, sendEthTransaction } from './transactionService';
import type {
  QrLoginPayload,
  VerifyLoginResponse,
} from './qrTypes';
import { getPublicViemClient } from './web3Client';

const CONTRIBUTE_PRECHECK_TIMEOUT_MS = 6_000;

const isPendingConfirmationError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('confirmation is taking too long')
    || normalized.includes('transaction may still be pending on-chain')
    || isRpcTimeoutLikeError(message)
  );
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
  const selector = String(config.data ?? '').slice(0, 10).toLowerCase();
  const inviteCandidateAddress = selector === PROPOSE_INVITE_SELECTOR
    ? decodeSingleAddressArgument(String(config.data ?? ''))
    : null;
  const bidDiscount = selector === SUBMIT_DISCOUNT_BID_SELECTOR
    ? decodeSingleUint256Argument(String(config.data ?? ''))
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
    queuedApprovalTxHash?: `0x${string}`;
    queuedMainTxNonce?: bigint;
    queuedMainTxGasPriceWei?: bigint;
    preparedApprovalRawTx?: string;
    preparedMainRawTx?: string;
    approvalTokenAddress?: `0x${string}`;
    requiredAllowanceWei?: bigint;
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
    return await withVerifiedWalletSession(pin, async walletSession => {
      if (walletSession.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }

      const ensureContributionApproval = async (): Promise<ContributionApprovalPreparation> => {
        throwIfQrFlowCancelled(isCancelled);
        const diagnosis = await runWithSoftTimeout(
          diagnoseContributePrecheck({
            client,
            poolAddress: targetAddress,
            accountAddress,
          }),
          CONTRIBUTE_PRECHECK_TIMEOUT_MS,
        );

        if (diagnosis.status === 'timeout') {
          throw new Error(
            'Contribute pre-check timed out on Chainora RPC. Please refresh QR and retry to avoid sending a reverting transaction.',
          );
        }

        if (diagnosis.status === 'error') {
          const reason = diagnosis.error.message || 'unknown pre-check error';
          throw new Error(
            `Contribute pre-check failed: ${reason}. `
            + 'Please refresh QR and retry.',
          );
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

        const approvePreflight = await runWithSoftTimeout(
          client.call({
            account: accountAddress,
            to: details.stablecoinAddress,
            value: 0n,
            data: approveCalldata,
          }),
          CONTRIBUTE_PRECHECK_TIMEOUT_MS,
        );

        if (approvePreflight.status === 'timeout') {
          throw new Error(
            'Contribution approval simulation timed out on Chainora RPC. Please refresh QR and retry.',
          );
        }

        if (approvePreflight.status === 'error') {
          const reason = approvePreflight.error.message || 'unknown approval simulation error';
          throw new Error(`Contribution approval simulation failed: ${reason}`);
        }

        onProgress?.(
          'Contribution needs token approval first. Continuing approval + contribute in one NFC session...',
        );
        throwIfQrFlowCancelled(isCancelled);

        let approveTx: {
          transactionHash: string;
          nonce: bigint;
          gasPriceWei: bigint;
          rawTransaction: string;
        };
        let preparedContributeTx: {
          rawTransaction: string;
        };
        try {
          approveTx = await sendEthTransaction({
            from: accountAddress,
            to: details.stablecoinAddress,
            valueWei: 0n,
            pin: '0000',
            signHash: hash => walletSession.signHash(hash),
            fallbackGasLimitWei: CONTRIBUTION_APPROVE_FALLBACK_GAS_LIMIT,
            dataHex: approveCalldata,
            broadcast: false,
          });

          preparedContributeTx = await sendEthTransaction({
            from: accountAddress,
            to: targetAddress,
            valueWei,
            pin: '0000',
            signHash: hash => walletSession.signHash(hash),
            nonce: approveTx.nonce + 1n,
            gasPriceWei: approveTx.gasPriceWei,
            // This tx is signed before approval is mined. Skip estimateGas here to avoid false revert.
            gasLimitWei: CONTRIBUTION_TX_FALLBACK_GAS_LIMIT,
            dataHex: config.data as `0x${string}`,
            broadcast: false,
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
        onProgress?.(
          'Approval and contribute signatures are ready in one NFC session. Submitting transactions to Chainora...',
        );

        return {
          queuedApprovalTxHash: approveTx.transactionHash as `0x${string}`,
          queuedMainTxNonce: approveTx.nonce + 1n,
          queuedMainTxGasPriceWei: approveTx.gasPriceWei,
          preparedApprovalRawTx: approveTx.rawTransaction,
          preparedMainRawTx: preparedContributeTx.rawTransaction,
          approvalTokenAddress: details.stablecoinAddress,
          requiredAllowanceWei: details.contributionAmount ?? 0n,
        };
      };

      const assertContributeExecutableNow = async (): Promise<void> => {
        const preflight = await runWithSoftTimeout(
          client.call({
            account: accountAddress,
            to: targetAddress,
            value: valueWei,
            data: config.data as `0x${string}`,
          }),
          CONTRIBUTE_PRECHECK_TIMEOUT_MS,
        );

        if (preflight.status === 'timeout') {
          throw new Error(
            'Contribute simulation timed out on Chainora RPC. Please refresh QR and retry to avoid sending a reverting transaction.',
          );
        }

        if (preflight.status === 'ok') {
          return;
        }

        const reason = preflight.error.message || 'unknown simulation error';
        if (reason.toLowerCase().includes('transfer_from_failed')) {
          const diagnosis = await runWithSoftTimeout(
            diagnoseContributePrecheck({
              client,
              poolAddress: targetAddress,
              accountAddress,
            }),
            CONTRIBUTE_PRECHECK_TIMEOUT_MS,
          );
          if (diagnosis.status === 'ok' && diagnosis.value.blockedReason) {
            throw new Error(diagnosis.value.blockedReason);
          }

          throw new Error(
            'Contribute blocked: stablecoin transferFrom failed. '
            + 'Check contribution token balance/allowance and current collecting window.',
          );
        }

        if (isPoolActionSimulationRevertError(reason) || reason.toLowerCase().includes('revert')) {
          const diagnosed = await diagnosePoolActionSimulationRevert();
          if (diagnosed) {
            throw new Error(diagnosed);
          }
        }

        throw new Error(`Contribute simulation failed: ${reason}`);
      };

      throwIfQrFlowCancelled(isCancelled);
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
          4_000,
        );
        if (precheck.status === 'timeout') {
          throw new Error(
            'Bid pre-check timed out on Chainora RPC. Please refresh QR and retry to avoid sending a reverting transaction.',
          );
        }
        if (precheck.status === 'error') {
          const reason = precheck.error.message || 'unknown bid pre-check error';
          throw new Error(`Bid pre-check failed: ${reason}. Please refresh QR and retry.`);
        }
        if (precheck.status === 'ok' && precheck.value) {
          throw new Error(precheck.value);
        }
      }

      let contributionApprovalPrep: ContributionApprovalPreparation | null = null;
      if (selector === CONTRIBUTE_SELECTOR) {
        contributionApprovalPrep = await ensureContributionApproval();
        if (!contributionApprovalPrep.preparedApprovalRawTx) {
          await assertContributeExecutableNow();
        }
      }
      throwIfQrFlowCancelled(isCancelled);

      const signingMessage =
        selector === CONTRIBUTE_SELECTOR
        && contributionApprovalPrep?.preparedApprovalRawTx
        && contributionApprovalPrep.preparedMainRawTx
          ? 'Signing approval + contribute transactions on card (single NFC session)...'
          : `Signing ${actionLabel} transaction on card...`;

      pushSessionStatus('pool_action_signing_tx');
      onProgress?.(signingMessage);
      throwIfQrFlowCancelled(isCancelled);

      const submitPoolActionTx = (params?: { nonce?: bigint; gasPriceWei?: bigint }) => sendEthTransaction({
        from: accountAddress,
        to: targetAddress,
        valueWei,
        pin: '0000',
        signHash: hash => walletSession.signHash(hash),
        nonce: params?.nonce,
        gasPriceWei: params?.gasPriceWei,
        // Contribute/bid are preflighted before this step; keep fixed gas to avoid estimateGas false-reverts.
        gasLimitWei:
          selector === CONTRIBUTE_SELECTOR
            ? CONTRIBUTION_TX_FALLBACK_GAS_LIMIT
            : selector === SUBMIT_DISCOUNT_BID_SELECTOR
              ? BID_TX_FALLBACK_GAS_LIMIT
              : undefined,
        dataHex: config.data as `0x${string}`,
      });

      let txResult: { transactionHash: string } | null = null;
      let submissionError: Error | null = null;
      if (
        selector === CONTRIBUTE_SELECTOR
        && contributionApprovalPrep?.preparedApprovalRawTx
        && contributionApprovalPrep.preparedMainRawTx
      ) {
        try {
          onProgress?.('Submitting token approval transaction...');
          const approvalTxHash = await broadcastRawSignedTransaction(contributionApprovalPrep.preparedApprovalRawTx);
          contributionApprovalPrep.queuedApprovalTxHash = approvalTxHash as `0x${string}`;

          throwIfQrFlowCancelled(isCancelled);
          onProgress?.('Waiting for approval confirmation...');
          const approvalReceipt = await waitForTransactionReceiptWithRetry({
            client,
            txHash: approvalTxHash as `0x${string}`,
            label: 'contribution approval',
            onProgress,
            timeoutMs: 60_000,
            retryLimit: 1,
            retryDelayMs: 700,
          });
          if (approvalReceipt.status !== 'success') {
            throw new Error(`Contribution approval reverted on-chain. Tx: ${approvalTxHash}`);
          }

          if (contributionApprovalPrep.approvalTokenAddress) {
            const approvalPostCheck = await runWithSoftTimeout(
              client.readContract({
                address: contributionApprovalPrep.approvalTokenAddress,
                abi: ERC20_READ_ABI,
                functionName: 'allowance',
                args: [accountAddress, targetAddress],
              }),
              CONTRIBUTE_PRECHECK_TIMEOUT_MS,
            );

            if (approvalPostCheck.status === 'timeout') {
              throw new Error('Unable to verify updated allowance after approval (timeout). Please retry.');
            }

            if (approvalPostCheck.status === 'error') {
              throw new Error(`Unable to verify updated allowance after approval: ${approvalPostCheck.error.message}`);
            }

            const requiredAllowanceWei = contributionApprovalPrep.requiredAllowanceWei ?? 0n;
            if (approvalPostCheck.value < requiredAllowanceWei) {
              throw new Error(
                `Contribution approval did not set enough allowance. `
                + `Required ${requiredAllowanceWei.toString()}, current ${approvalPostCheck.value.toString()}.`,
              );
            }
          }

          throwIfQrFlowCancelled(isCancelled);
          await assertContributeExecutableNow();

          onProgress?.('Approval confirmed. Submitting contribute transaction...');
          const mainTxHash = await broadcastRawSignedTransaction(contributionApprovalPrep.preparedMainRawTx);
          txResult = { transactionHash: mainTxHash };
        } catch (error) {
          submissionError = error instanceof Error ? error : new Error(String(error));
        }
      } else {
        try {
          txResult = await submitPoolActionTx({
            nonce: contributionApprovalPrep?.queuedMainTxNonce,
            gasPriceWei: contributionApprovalPrep?.queuedMainTxGasPriceWei,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (
            selector === CONTRIBUTE_SELECTOR
            && contributionApprovalPrep?.queuedMainTxNonce !== undefined
            && isNonceConflictLikeError(reason)
          ) {
            onProgress?.('Contribute nonce changed while approval was processing. Retrying contribute transaction...');
            try {
              txResult = await submitPoolActionTx();
            } catch (retryError) {
              submissionError = retryError instanceof Error ? retryError : new Error(String(retryError));
            }
          } else {
            submissionError = error instanceof Error ? error : new Error(reason);
          }
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
      try {
        receipt = await waitForTransactionReceiptWithRetry({
          client,
          txHash: txResult.transactionHash as `0x${string}`,
          label: actionLabel,
          onProgress,
          timeoutMs: 45_000,
          retryLimit: 1,
          retryDelayMs: 700,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (isPendingConfirmationError(reason)) {
          pushSessionStatus('pool_action_pending_confirmation');
          onProgress?.(
            'Transaction was submitted, but Chainora RPC is slow to confirm. You can continue using app and check tx status later.',
          );
          logPoolActionEvent({
            stage: 'pending_confirmation',
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
            pendingConfirmation: true,
          };
        }
        throw error instanceof Error ? error : new Error(reason);
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
              txHash: txResult.transactionHash,
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
