import { useCallback } from 'react';

import type { NetworkConfig } from '@config/network';
import { addRecentActivity } from '@services/storage/recentActivityStorage';
import {
  sendEthTransaction,
  type SendEthResult,
} from '@services/transaction/transactionService';
import {
  buildTransferPayload,
  formatGweiFromWei,
  getAssetSymbol,
  parseGwei,
} from '@utils/sendFlowUtils';

import { useWalletSendScanFlow } from './useWalletSendScanFlow';

type TouchSignResult = {
  transactionHash: string;
  amount: string;
  gasLimit: string;
  gasPriceGwei: string;
};

type UseTouchSignTransactionFlowArgs = {
  amount: string;
  gasLimit?: string;
  gasPriceGwei: string;
  isNfcEnabled: boolean | null;
  missingResultMessage: string;
  network: NetworkConfig;
  onSuccess: (result: TouchSignResult) => void | Promise<void>;
  pin: string;
  recipient: string;
  successMessage: string;
  walletAddress: string;
};

export const useTouchSignTransactionFlow = ({
  amount,
  gasLimit,
  gasPriceGwei,
  isNfcEnabled,
  missingResultMessage,
  network,
  onSuccess,
  pin,
  recipient,
  successMessage,
  walletAddress,
}: UseTouchSignTransactionFlowArgs) => {
  const handleFlowScan = useCallback(async () => {
    const transferPayload = buildTransferPayload(network, recipient, amount);
    return sendEthTransaction({
      from: walletAddress,
      to: transferPayload.to,
      valueWei: transferPayload.valueWei,
      dataHex: transferPayload.dataHex,
      pin,
      network,
      gasPriceWei: gasPriceGwei ? parseGwei(gasPriceGwei) : undefined,
      gasLimitWei: network.portfolioTokenAddress
        ? undefined
        : gasLimit ? BigInt(gasLimit) : undefined,
    });
  }, [amount, gasLimit, gasPriceGwei, network, pin, recipient, walletAddress]);

  const handleFlowSuccess = useCallback(async (outcome: SendEthResult) => {
    await addRecentActivity({
      transactionHash: outcome.transactionHash,
      networkKey: network.key,
      fromAddress: walletAddress,
      toAddress: recipient.trim(),
      amountDisplay: amount.trim(),
      currencySymbol: getAssetSymbol(network),
      networkName: network.name,
    });

    await onSuccess({
      transactionHash: outcome.transactionHash,
      amount,
      gasLimit: outcome.gasLimitWei.toString(),
      gasPriceGwei: formatGweiFromWei(outcome.gasPriceWei),
    });
  }, [amount, network, onSuccess, recipient, walletAddress]);

  return useWalletSendScanFlow({
    isNfcEnabled,
    pin,
    successMessage,
    missingResultMessage,
    onFlowScan: handleFlowScan,
    onSuccess: handleFlowSuccess,
  });
};
