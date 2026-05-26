import type { ScanCardFlowConfig } from '@app-types/wallet';

export type {
  ScanCardFlowConfig,
  ScanCardFlowKind,
  ScanCardFlowSuccess,
  ScanMode,
} from '@app-types/wallet';

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
