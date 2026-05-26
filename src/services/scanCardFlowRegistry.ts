import type { ToastType } from '../features/toast';
import type { WalletActionResult } from './cardService';

export type ScanMode = 'init' | 'signin';
export type ScanCardFlowKind = 'auth' | 'flow';

export type ScanCardFlowSuccess = {
  result: WalletActionResult;
  mode: ScanMode;
};

export type ScanCardFlowConfig = {
  isNfcEnabled: boolean | null;
  initialMode?: ScanMode;
  prefilledPin?: string;
  flowType?: ScanCardFlowKind;
  autoStartDelayMs?: number;
  onClose?: () => void | Promise<void>;
  onStatusChange?: (status: string) => void;
  onScanningChange?: (isScanning: boolean) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onSuccess?: (details: ScanCardFlowSuccess) => void | Promise<void>;
  onFlowScan?: (setStageStatus: (status: string) => void) => Promise<WalletActionResult>;
};

const scanCardFlows = new Map<string, ScanCardFlowConfig>();

export const registerScanCardFlow = (config: ScanCardFlowConfig): string => {
  const flowId = `scan-card-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  scanCardFlows.set(flowId, config);
  return flowId;
};

export const getScanCardFlow = (flowId: string): ScanCardFlowConfig | null =>
  scanCardFlows.get(flowId) ?? null;

export const clearScanCardFlow = (flowId: string) => {
  scanCardFlows.delete(flowId);
};
