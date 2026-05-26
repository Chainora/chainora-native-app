import { useCallback, useRef, useState } from 'react';

import type { SendEthResult } from '../../../../services/transactionService';
import { registerScanCardFlow } from '../../../../services/scanCardFlowRegistry';

type UseWalletSendScanFlowArgs = {
  isNfcEnabled: boolean | null;
  pin: string;
  successMessage: string;
  missingResultMessage: string;
  onFlowScan: () => Promise<SendEthResult>;
  onSuccess: (result: SendEthResult) => Promise<void> | void;
  onClose?: () => Promise<void> | void;
};

type UseWalletSendScanFlowResult = {
  submitting: boolean;
  startSendScanFlow: () => string | null;
};

export const useWalletSendScanFlow = ({
  isNfcEnabled,
  pin,
  successMessage,
  missingResultMessage,
  onFlowScan,
  onSuccess,
  onClose,
}: UseWalletSendScanFlowArgs): UseWalletSendScanFlowResult => {
  const pendingResultRef = useRef<SendEthResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startSendScanFlow = useCallback(() => {
    if (submitting) {
      return null;
    }

    setSubmitting(true);
    return registerScanCardFlow({
      isNfcEnabled,
      flowType: 'flow',
      prefilledPin: pin,
      onFlowScan: async () => {
        try {
          const outcome = await onFlowScan();
          pendingResultRef.current = outcome;
          return {
            ok: true,
            message: successMessage,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            ok: false,
            message,
          };
        }
      },
      onSuccess: async () => {
        const outcome = pendingResultRef.current;
        try {
          if (!outcome) {
            throw new Error(missingResultMessage);
          }
          await onSuccess(outcome);
        } finally {
          pendingResultRef.current = null;
          setSubmitting(false);
        }
      },
      onClose: async () => {
        pendingResultRef.current = null;
        setSubmitting(false);
        await onClose?.();
      },
    });
  }, [isNfcEnabled, missingResultMessage, onClose, onFlowScan, onSuccess, pin, submitting, successMessage]);

  return {
    submitting,
    startSendScanFlow,
  };
};
