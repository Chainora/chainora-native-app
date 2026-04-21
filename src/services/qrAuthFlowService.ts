import { getAddress } from 'viem';

import { getActiveNetwork } from '../config/network';
import {
  buildDeviceVerificationCacheKey,
  readDeviceVerificationCache,
  writeDeviceVerificationCache,
} from './qr-login/deviceVerificationCache';
import {
  extractResponseData,
  fetchWithTimeout,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { isRpcTimeoutLikeError } from './qr-login/errorUtils';
import { withVerifiedWalletSession } from './cardService';
import { mapCreatePoolStatusToLoginStatus, verifyLoginDeviceInOneSession } from './qrAuthDeviceVerificationService';
import { signAuthProofWithSession } from './qrAuthProofService';
import { verifyCardAttestationForCreatePool } from './qrCreateGroupDeviceVerificationService';
import { createSessionStatusPublisher } from './qrFlowCommonService';
import type {
  LoginDeviceWarmupResult,
  QrLoginPayload,
  VerifyLoginRequest,
  VerifyLoginResponse,
} from './qrTypes';
import { getPublicViemClient } from './web3Client';

export { createQrLoginProof } from './qrAuthProofService';

const isTransientDeviceVerificationError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    isRpcTimeoutLikeError(message)
    || normalized.includes('confirmation is taking too long')
    || normalized.includes('transaction may still be pending on-chain')
    || normalized.includes('rpc is slow')
    || normalized.includes('request timed out')
    || normalized.includes('network request failed')
  );
};

export const warmupLoginDeviceVerification = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
  publishSessionProgress = true,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
  publishSessionProgress?: boolean;
}): Promise<LoginDeviceWarmupResult> => {
  const shouldAuto = payload.autoDeviceVerification !== false;
  if (!shouldAuto) {
    return {
      attempted: false,
      verified: false,
      message: 'Auto device verification on login is disabled.',
    };
  }

  const factoryAddressRaw = payload.deviceVerificationFactoryAddress?.trim() ?? '';
  if (!factoryAddressRaw) {
    return {
      attempted: false,
      verified: false,
      message: 'No protocol factory address in login QR payload.',
    };
  }

  const activeNetwork = getActiveNetwork();
  const factoryAddress = getAddress(factoryAddressRaw);
  const accountAddress = getAddress(expectedAddress);
  const verificationCacheKey = buildDeviceVerificationCacheKey(
    activeNetwork.chainId,
    factoryAddress,
    accountAddress,
  );
  const cachedVerification = readDeviceVerificationCache(verificationCacheKey);
  if (cachedVerification === true) {
    return {
      attempted: false,
      verified: true,
      message: 'Wallet already device-verified recently (cached).',
    };
  }

  const sessionId = payload.sessionId?.trim() ?? '';
  const pushStatus = createSessionStatusPublisher({
    apiBase: payload.apiBase,
    sessionId,
    enabled: publishSessionProgress && Boolean(sessionId),
  });

  onProgress?.('Login verified. Running one-time on-chain device verification warmup...');
  pushStatus('login_device_verify_preparing');

  try {
    await verifyCardAttestationForCreatePool({
      apiBase: payload.apiBase,
      pin,
      expectedAddress: accountAddress,
      factoryAddress,
      onProgress,
      onSessionStatus: status => {
        const loginStatus = mapCreatePoolStatusToLoginStatus(status);
        if (loginStatus) {
          pushStatus(loginStatus);
        }
      },
    });

    writeDeviceVerificationCache(verificationCacheKey, true);
    pushStatus('login_device_verify_success');
    return {
      attempted: true,
      verified: true,
      message: 'Wallet is now device-verified on-chain for future create/invite flows.',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    pushStatus('login_device_verify_failed');
    return {
      attempted: true,
      verified: false,
      message: reason,
    };
  }
};

export const verifyQrLoginWithOneTapVerification = async ({
  payload,
  pin,
  expectedAddress,
  onProgress,
}: {
  payload: QrLoginPayload;
  pin: string;
  expectedAddress: string;
  onProgress?: (status: string) => void;
}): Promise<VerifyLoginResponse> => {
  if ((payload.feature ?? 'auth.login') !== 'auth.login') {
    throw new Error('QR payload is not an auth login request.');
  }

  const sessionId = payload.sessionId?.trim() ?? '';
  if (!sessionId) {
    throw new Error('QR payload missing sessionId.');
  }

  const activeNetwork = getActiveNetwork();
  if (activeNetwork.key !== 'chainora') {
    throw new Error('Switch active network to Chainora before QR login verification.');
  }

  const accountAddress = getAddress(expectedAddress);
  const factoryAddressRaw = payload.deviceVerificationFactoryAddress?.trim() ?? '';
  const requiresDeviceVerification = factoryAddressRaw.length > 0;
  const factoryAddress = requiresDeviceVerification ? getAddress(factoryAddressRaw) : null;
  const verificationCacheKey = factoryAddress
    ? buildDeviceVerificationCacheKey(activeNetwork.chainId, factoryAddress, accountAddress)
    : '';
  const pushStatus = createSessionStatusPublisher({
    apiBase: payload.apiBase,
    sessionId,
    enabled: Boolean(sessionId),
  });
  const client = getPublicViemClient(activeNetwork);

  return withVerifiedWalletSession(pin, async walletSession => {
    if (walletSession.ethAddress.toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error('Card address does not match the active wallet in app.');
    }

    onProgress?.('Signing login challenge on card...');
    const proof = await signAuthProofWithSession({
      payload,
      session: walletSession,
    });

    if (requiresDeviceVerification && factoryAddress) {
      pushStatus('login_device_verify_preparing');
      const cachedVerification = readDeviceVerificationCache(verificationCacheKey);

      try {
        if (cachedVerification !== true) {
          await verifyLoginDeviceInOneSession({
            apiBase: payload.apiBase,
            accountAddress,
            factoryAddress,
            client,
            session: walletSession,
            onProgress,
            onSessionStatus: pushStatus,
          });
        } else {
          onProgress?.('Wallet already device-verified recently (cached).');
        }

        writeDeviceVerificationCache(verificationCacheKey, true);
        pushStatus('login_device_verify_success');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn('[QRLogin] device verification warmup failed; continuing login', {
          reason,
          accountAddress,
          factoryAddress,
        });
        onProgress?.(
          isTransientDeviceVerificationError(reason)
            ? 'Device verification warmup is delayed because Chainora RPC is slow. Continuing login now...'
            : 'Device verification warmup failed. Continuing login now, and you can retry warmup later.',
        );
      }
    }

    onProgress?.('Submitting signature to backend for login verification...');
    return verifyQrLogin({
      apiBase: payload.apiBase,
      sessionId,
      address: proof.address,
      signatureHex: proof.signatureHex,
      recovery: proof.recovery,
    });
  });
};

export const verifyQrLogin = async ({
  apiBase,
  sessionId,
  address,
  signatureHex,
  recovery,
}: VerifyLoginRequest): Promise<VerifyLoginResponse> => {
  const endpoint = `${apiBase}/v1/auth/verify`;
  const body = {
    sessionId,
    address,
    signature: signatureHex,
    v: recovery,
  };

  console.log('[QRLogin] verify request', {
    endpoint,
    sessionId,
    address,
    recovery,
  });

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await readApiErrorMessage(response, `Verify login failed: ${response.status} at ${endpoint}`);
    throw new Error(detail);
  }

  const raw = (await response.json()) as { data?: VerifyLoginResponse } | VerifyLoginResponse;
  const payload = extractResponseData<VerifyLoginResponse>(raw);
  console.log('[QRLogin] verify response', {
    endpoint,
    verified: payload.verified,
    address: payload.address,
  });

  return payload;
};
