export type CreatePoolQrData = {
  factoryAddress: string;
  contributionAmount: string;
  contributionAmountWei?: string;
  publicRecruitment?: boolean;
  contributionTokenSymbol?: string;
  targetMembers: number;
  periodDurationSeconds: number;
  contributionWindowSeconds: number;
  auctionWindowSeconds: number;
  groupName?: string;
  groupDescription?: string;
  groupImageUrl?: string;
  minReputationScore?: number;
  authToken?: string;
  skipPrecheck?: boolean;
};

export type PoolActionQrData = {
  to: string;
  data: string;
  valueWei?: string;
  label?: string;
  poolAddress?: string;
};

export type QrLoginPayload = {
  feature?: string;
  sessionId?: string;
  nonce?: string;
  apiBase: string;
  message?: string;
  username?: string;
  address?: string;
  deviceVerificationFactoryAddress?: string;
  autoDeviceVerification?: boolean;
  createPool?: CreatePoolQrData;
  poolAction?: PoolActionQrData;
};

export type GenericQrEnvelope = {
  feature?: string;
  apiBase?: unknown;
  data?: Record<string, unknown>;
};

export type QrLoginProof = {
  address: string;
  signatureHex: string;
  recovery: number;
  deviceCertificate?: Uint8Array;
};

export type VerifyLoginRequest = {
  apiBase: string;
  sessionId: string;
  address: string;
  signatureHex: string;
  recovery: number;
};

export type VerifyLoginResponse = {
  verified: boolean;
  address?: string;
  token?: string;
  txHash?: string;
  pendingConfirmation?: boolean;
  poolAddress?: string;
  poolId?: string;
};

export type LoginDeviceWarmupResult = {
  attempted: boolean;
  verified: boolean;
  message: string;
};

export type CardChallengeResponse = {
  challengeId: string;
  challenge: string;
  deviceId: string;
  expiresAt: string;
};

export type CardVerifyResponse = {
  verified: boolean;
  address: string;
  deviceId: string;
  verifiedAt: string;
};

export type DeviceAttestationPayload = {
  user: string;
  nonce: string;
  deadline: string;
};

export type CardDeviceAttestationResponse = {
  alreadyVerified: boolean;
  address: string;
  deviceAdapter: string;
  chainId: string;
  signer: string;
  attestation: DeviceAttestationPayload;
  signature: string;
};

export type NotifyLoginProgressRequest = {
  apiBase: string;
  sessionId: string;
  status: string;
};
