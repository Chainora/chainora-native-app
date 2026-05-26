import { useCallback, useEffect, useMemo } from 'react';

import type {
  ScanCardFlowConfig,
  ScanMode,
  WalletActionResult,
} from '@app-types/wallet';
import { initialiseWallet, signInWallet } from '@services/cardService';
import {
  clearScanCardFlow,
  getScanCardFlow,
  registerScanCardFlow,
} from '@services/scanCardFlowRegistry';

export const useRegisterScanCardFlow = () =>
  useCallback((config: ScanCardFlowConfig) => registerScanCardFlow(config), []);

export const useScanCardFlowConfig = (flowId: string): ScanCardFlowConfig | null => {
  const flowConfig = useMemo(() => getScanCardFlow(flowId), [flowId]);

  useEffect(() => {
    return () => {
      clearScanCardFlow(flowId);
    };
  }, [flowId]);

  return flowConfig;
};

export const useScanCardAuthActions = () => {
  const executeAuthScan = useCallback(
    (mode: ScanMode, pin: string): Promise<WalletActionResult> =>
      mode === 'init' ? initialiseWallet(pin) : signInWallet(pin),
    [],
  );

  return { executeAuthScan };
};
