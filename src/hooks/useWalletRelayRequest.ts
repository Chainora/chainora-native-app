import { useCallback, useEffect, useState } from 'react';
import NfcManager from 'react-native-nfc-manager';

import type { ScanCardFlowConfig, WalletRelaySnapshot } from '@app-types/wallet';
import { registerScanCardFlow } from '@services/scanCardFlowRegistry';
import { walletRelaySessionManager } from '@services/walletRelaySessionManager';

const LOG_PREFIX = '[wallet-relay][request-screen]';

export const useWalletRelaySnapshot = (): WalletRelaySnapshot => {
  const [snapshot, setSnapshot] = useState(() => walletRelaySessionManager.getSnapshot());

  useEffect(() => walletRelaySessionManager.subscribe(next => setSnapshot(next)), []);

  return snapshot;
};

export const useWalletRelayActiveAccount = (address: string) => {
  useEffect(() => {
    walletRelaySessionManager.setActiveAccount(address);
  }, [address]);
};

export const useWalletRelayRequestActions = () => {
  const getSnapshot = useCallback(() => walletRelaySessionManager.getSnapshot(), []);

  const approveRequest = useCallback(
    (
      requestId: string,
      pin: string,
      options?: { onProgress?: (status: string) => void },
    ) => walletRelaySessionManager.approveRequest(requestId, pin, options),
    [],
  );

  const rejectRequest = useCallback(
    (requestId: string, reason: string) => walletRelaySessionManager.rejectRequest(requestId, reason),
    [],
  );

  const setActiveAccount = useCallback(
    (address: string) => walletRelaySessionManager.setActiveAccount(address),
    [],
  );

  const primeNfcForScan = useCallback(async () => {
    try {
      await NfcManager.start();
    } catch (caughtError) {
      console.warn(`${LOG_PREFIX} nfc.start_failed`, {
        message: caughtError instanceof Error ? caughtError.message : String(caughtError),
      });
    }

    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // no-op
    }
  }, []);

  const registerRelayScanFlow = useCallback(
    (config: ScanCardFlowConfig) => registerScanCardFlow(config),
    [],
  );

  return {
    approveRequest,
    getSnapshot,
    primeNfcForScan,
    registerRelayScanFlow,
    rejectRequest,
    setActiveAccount,
  };
};
