import { useCallback } from 'react';

import type { ScanCardFlowConfig } from '@app-types/wallet';
import { registerScanCardFlow } from '@services/scanCardFlowRegistry';
import type { ToastType } from '@store/toast';

type UseAuthPinScanFlowArgs = {
  isNfcEnabled: boolean | null;
  onShowToast?: (message: string, type: ToastType) => void;
};

type AuthPinScanFlowInput = Pick<
  ScanCardFlowConfig,
  'initialMode' | 'prefilledPin' | 'onSuccess'
>;

export const useAuthPinScanFlow = ({
  isNfcEnabled,
  onShowToast,
}: UseAuthPinScanFlowArgs) =>
  useCallback(
    (input: AuthPinScanFlowInput) =>
      registerScanCardFlow({
        isNfcEnabled,
        onShowToast,
        ...input,
      }),
    [isNfcEnabled, onShowToast],
  );
