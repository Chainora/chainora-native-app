// Backward-compatible facade for QR services.

export { isQrFlowCancelledError } from './qrFlowCommonService';

export {
  createQrLoginProof,
  verifyQrLogin,
  verifyQrLoginWithOneTapVerification,
  warmupLoginDeviceVerification,
} from './qrAuthFlowService';

export { createPoolViaQrOneTap } from './qrCreateGroupFlowService';

export { executePoolActionViaQrOneTap } from './qrPoolActionFlowService';

export { parseQrLoginPayload } from './qrPayloadParserService';

export { notifyQrLoginProgress } from './qrSessionProgressService';

export {
  registerUsernameRelayer,
  registerUsernameRelayerOneTap,
} from './qrUsernameFlowService';

export type {
  CardChallengeResponse,
  CardDeviceAttestationResponse,
  CardVerifyResponse,
  CreatePoolQrData,
  DeviceAttestationPayload,
  GenericQrEnvelope,
  LoginDeviceWarmupResult,
  NotifyLoginProgressRequest,
  PoolActionQrData,
  QrLoginPayload,
  QrLoginProof,
  VerifyLoginRequest,
  VerifyLoginResponse,
} from './qrTypes';
