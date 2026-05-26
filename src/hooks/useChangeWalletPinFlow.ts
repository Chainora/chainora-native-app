import { useCallback } from 'react';

import type { ScanCardFlowSuccess } from '@app-types/wallet';
import { changeWalletPin } from '@services/cardService';
import { registerScanCardFlow } from '@services/scanCardFlowRegistry';
import type { ToastType } from '@store/toast';

type UseChangeWalletPinFlowArgs = {
  isNfcEnabled: boolean | null;
  oldPin: string;
  nextPin: string;
  onShowToast?: (message: string, type: ToastType) => void;
  onSuccess: (details: ScanCardFlowSuccess) => void | Promise<void>;
};

export const useChangeWalletPinFlow = ({
  isNfcEnabled,
  nextPin,
  oldPin,
  onShowToast,
  onSuccess,
}: UseChangeWalletPinFlowArgs) =>
  useCallback(
    () =>
      registerScanCardFlow({
        isNfcEnabled,
        onShowToast,
        flowType: 'flow',
        prefilledPin: oldPin,
        onFlowScan: () => changeWalletPin(oldPin, nextPin),
        onSuccess,
      }),
    [isNfcEnabled, nextPin, oldPin, onShowToast, onSuccess],
  );
