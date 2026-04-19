import {
  CREATE_POOL_QR_FEATURE,
  POOL_ACTION_QR_FEATURE,
} from './qr-login/constants';
import {
  ensureField,
  normalizeApiBase,
} from './qr-login/httpUtils';
import type {
  GenericQrEnvelope,
  QrLoginPayload,
} from './qrTypes';

// Payload parsing + shared QR payload types.
export type { QrLoginPayload } from './qrTypes';

export const parseQrLoginPayload = (rawValue: string): QrLoginPayload => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('QR code is empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('QR payload must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid QR payload format');
  }

  const payload = parsed as Record<string, unknown>;

  // New reusable envelope format: { feature, apiBase, data: {...} }
  if ('data' in payload && typeof payload.data === 'object' && payload.data !== null) {
    const envelope = payload as GenericQrEnvelope;
    const feature = typeof envelope.feature === 'string' ? envelope.feature.trim() : '';
    if (
      feature
      && feature !== 'auth.login'
      && feature !== 'username.register'
      && feature !== 'username.set_primary'
      && feature !== CREATE_POOL_QR_FEATURE
      && feature !== POOL_ACTION_QR_FEATURE
    ) {
      throw new Error(`Unsupported QR feature: ${feature}`);
    }

    const data = envelope.data as Record<string, unknown>;
    const apiBase = normalizeApiBase(ensureField(envelope.apiBase, 'apiBase'));

    if (feature === CREATE_POOL_QR_FEATURE) {
      const contractVariables = ((data.contractVariables ?? data.contract ?? data.params) as Record<string, unknown>) ?? {};
      const toInt = (value: unknown, field: string): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          throw new Error(`Invalid QR payload: ${field} must be a positive number`);
        }
        return Math.floor(numeric);
      };
      const toNonNegativeInt = (value: unknown, field: string): number => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          throw new Error(`Invalid QR payload: ${field} must be a non-negative number`);
        }
        return Math.floor(numeric);
      };

      const contributionAmount = ensureField(contractVariables.contributionAmount, 'contractVariables.contributionAmount');
      const sessionId =
        typeof data.sessionId === 'string' && data.sessionId.trim()
          ? data.sessionId.trim()
          : undefined;
      const contributionTokenSymbol =
        typeof contractVariables.tokenSymbol === 'string' && contractVariables.tokenSymbol.trim()
          ? contractVariables.tokenSymbol.trim()
          : typeof data.tokenSymbol === 'string' && data.tokenSymbol.trim()
            ? data.tokenSymbol.trim()
          : 'tcUSD';
      const publicRecruitment =
        typeof contractVariables.publicRecruitment === 'boolean'
          ? contractVariables.publicRecruitment
          : typeof data.publicRecruitment === 'boolean'
            ? data.publicRecruitment
            : true;
      const skipPrecheck =
        typeof contractVariables.skipPrecheck === 'boolean'
          ? contractVariables.skipPrecheck
          : typeof data.skipPrecheck === 'boolean'
            ? data.skipPrecheck
            : true;
      const targetMembers = toInt(contractVariables.targetMembers, 'contractVariables.targetMembers');
      const periodDurationSeconds = toInt(contractVariables.periodDurationSeconds, 'contractVariables.periodDurationSeconds');
      const contributionWindowSeconds = toInt(contractVariables.contributionWindowSeconds, 'contractVariables.contributionWindowSeconds');
      const auctionWindowSeconds = toInt(contractVariables.auctionWindowSeconds, 'contractVariables.auctionWindowSeconds');
      const minReputationScore = toNonNegativeInt(
        contractVariables.minReputation ?? data.minReputationScore ?? 0,
        'contractVariables.minReputation',
      );

      if (contributionWindowSeconds + auctionWindowSeconds >= periodDurationSeconds) {
        throw new Error('Invalid QR payload: contributionWindow + auctionWindow must be less than periodDuration');
      }

      return {
        feature: CREATE_POOL_QR_FEATURE,
        sessionId,
        apiBase,
        createPool: {
          factoryAddress: ensureField(contractVariables.factoryAddress, 'contractVariables.factoryAddress'),
          contributionAmount,
          contributionAmountWei:
            typeof contractVariables.contributionAmountWei === 'string'
              ? contractVariables.contributionAmountWei.trim()
              : undefined,
          publicRecruitment,
          contributionTokenSymbol,
          targetMembers,
          periodDurationSeconds,
          contributionWindowSeconds,
          auctionWindowSeconds,
          groupName: typeof data.groupName === 'string' ? data.groupName.trim() : undefined,
          groupDescription: typeof data.groupDescription === 'string' ? data.groupDescription.trim() : undefined,
          groupImageUrl: typeof data.groupImageUrl === 'string' ? data.groupImageUrl.trim() : undefined,
          minReputationScore,
          authToken: typeof data.authToken === 'string' ? data.authToken.trim() : undefined,
          skipPrecheck,
        },
      };
    }

    if (feature === POOL_ACTION_QR_FEATURE) {
      const actionPayload = ((data.poolAction ?? data.tx ?? data.transaction) as Record<string, unknown>) ?? {};
      const sessionId = ensureField(data.sessionId, 'sessionId');
      const to = ensureField(actionPayload.to, 'poolAction.to');
      const dataHex = ensureField(actionPayload.data, 'poolAction.data');

      if (!dataHex.startsWith('0x')) {
        throw new Error('Invalid QR payload: poolAction.data must be 0x-prefixed calldata');
      }

      const rawValueWei = typeof actionPayload.valueWei === 'string' ? actionPayload.valueWei.trim() : '';
      const valueWei = rawValueWei || '0';
      if (!/^\d+$/.test(valueWei)) {
        throw new Error('Invalid QR payload: poolAction.valueWei must be a non-negative integer string');
      }

      return {
        feature: POOL_ACTION_QR_FEATURE,
        sessionId,
        apiBase,
        poolAction: {
          to,
          data: dataHex,
          valueWei,
          label: typeof actionPayload.label === 'string' ? actionPayload.label.trim() : undefined,
          poolAddress: typeof actionPayload.poolAddress === 'string' ? actionPayload.poolAddress.trim() : undefined,
        },
      };
    }

    const sessionId = ensureField(data.sessionId, 'sessionId');
    const message = typeof data.message === 'string' ? data.message.trim() : undefined;
    const username = typeof data.username === 'string' ? data.username.trim() : undefined;
    const address = typeof data.address === 'string' ? data.address.trim() : undefined;
    const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : undefined;
    const deviceVerificationFactoryAddress =
      typeof data.deviceVerificationFactoryAddress === 'string' && data.deviceVerificationFactoryAddress.trim()
        ? data.deviceVerificationFactoryAddress.trim()
        : undefined;
    const autoDeviceVerification =
      typeof data.autoDeviceVerification === 'boolean'
        ? data.autoDeviceVerification
        : Boolean(deviceVerificationFactoryAddress);

    if ((feature || 'auth.login') === 'auth.login' && !nonce) {
      throw new Error('Invalid QR payload: nonce is required');
    }

    return {
      feature: feature || 'auth.login',
      sessionId,
      nonce,
      apiBase,
      message,
      username,
      address,
      deviceVerificationFactoryAddress,
      autoDeviceVerification,
    };
  }

  // Legacy format compatibility: { sessionId, nonce, apiBase, message }
  const sessionId = ensureField(payload.sessionId, 'sessionId');
  const nonce = ensureField(payload.nonce, 'nonce');
  const apiBase = normalizeApiBase(ensureField(payload.apiBase, 'apiBase'));
  const message = typeof payload.message === 'string' ? payload.message.trim() : undefined;

  return {
    feature: 'auth.login',
    sessionId,
    nonce,
    apiBase,
    message,
  };
};
