import type { NetworkKey } from '@config/network';
import type { ToastType } from '@store/toast';

export type WalletActionCode =
  | 'PIN_ALREADY_INITIALISED'
  | 'PIN_NOT_INITIALISED'
  | 'PIN_INVALID'
  | 'PIN_UPDATE_FAILED'
  | 'KEYPAIR_FAILURE'
  | 'PUBLIC_KEY_FAILURE'
  | 'RESET_FAILED'
  | 'SELECT_FAILED'
  | 'PIN_STATE_UNAVAILABLE'
  | 'TRANSPORT_ERROR'
  | 'BACKUP_INIT_FAILED'
  | 'BACKUP_EXPORT_FAILED'
  | 'BACKUP_IMPORT_FAILED'
  | 'CARD_NOT_CHAINORA'
  | 'UNKNOWN';

export type WalletActionResult = {
  ok: boolean;
  message: string;
  statusWord?: string;
  publicKeyHex?: string;
  ethAddress?: string;
  code?: WalletActionCode;
  step?: string;
};

export type WalletSignatureResult = WalletActionResult & {
  signatureDer?: Uint8Array;
  signatureDerHex?: string;
  deviceCertificate?: Uint8Array;
};

export type WalletSignAndAttestResult<TMeta = unknown> =
  WalletSignatureResult & {
    attestationProof?: Uint8Array;
    challengeMeta?: TMeta;
  };

export type CardCertificateResult = WalletActionResult & {
  deviceCertificate?: Uint8Array;
};

export type CardAttestationResult = WalletActionResult & {
  attestationProof?: Uint8Array;
};

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
  onFailure?: (message: string) => void | Promise<void>;
  closeOnFailure?: boolean;
  onFlowScan?: (
    setStageStatus: (status: string) => void,
  ) => Promise<WalletActionResult>;
};

export type WalletRelayRequestType = 'signMessage' | 'signTransaction';

export type WalletRelayPendingRequest = {
  requestId: string;
  sessionId: string;
  type: WalletRelayRequestType;
  chainId: string;
  origin: string;
  address: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  requiresSwitch: boolean;
};

export type WalletRelaySnapshot = {
  activeAccount: string;
  requestModalSuppressed: boolean;
  sessions: Array<{
    sessionId: string;
    chainId: string;
    boundAddress: string;
    connectedAt: number;
  }>;
  pendingRequests: WalletRelayPendingRequest[];
};

export type RecentActivity = {
  id: string;
  walletAddress: string;
  networkKey: NetworkKey;
  kind: 'send' | 'receive';
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  amountDisplay: string;
  currencySymbol: string;
  networkName: string;
  createdAt: string;
};
