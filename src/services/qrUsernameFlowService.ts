import { buildEip191Hash } from './qr-login/cryptoUtils';
import {
  fetchWithTimeout,
  readApiErrorMessage,
} from './qr-login/httpUtils';
import { signHashAndAttestInOneTap } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';
import type {
  CardChallengeResponse,
  CardVerifyResponse,
  QrLoginPayload,
  VerifyLoginRequest,
  VerifyLoginResponse,
} from './qrTypes';
import { bytesToHex, hexToBytes } from '../utils/encoding';

// Username registration/primary selection QR flow only.
export const registerUsernameRelayer = async ({
  apiBase,
  sessionId,
  address,
  signatureHex,
  recovery,
  username,
  feature,
}: VerifyLoginRequest & { username: string; feature?: string }): Promise<VerifyLoginResponse> => {
  console.log('[UsernameFlow] start registerUsernameRelayer', {
    apiBase,
    sessionId,
    address,
    username,
  });
  console.log('[UsernameFlow] relayer registration request prepared');

  const endpoint = feature === 'username.set_primary'
    ? `${apiBase}/v1/relayer/primary/select`
    : `${apiBase}/v1/relayer/register`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      address,
      username,
      signature: signatureHex,
      v: recovery,
    }),
  });

  if (!response.ok) {
    const detail = await readApiErrorMessage(response, `Register username failed: ${response.status}`);
    throw new Error(detail);
  }
  console.log('[UsernameFlow] relayer register response ok');

  const raw = (await response.json()) as { data?: VerifyLoginResponse } | VerifyLoginResponse;
  if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
    return raw.data;
  }

  return raw as VerifyLoginResponse;
};

export const registerUsernameRelayerOneTap = async ({
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
  const isPrimarySelection = payload.feature === 'username.set_primary';
  const sessionId = payload.sessionId?.trim() ?? '';
  if (!sessionId) {
    throw new Error('QR payload missing sessionId.');
  }
  const username = payload.username?.trim() ?? '';
  if (!username) {
    throw new Error('QR payload missing username.');
  }

  const message = payload.message?.trim()
    || `${isPrimarySelection ? 'Set Chainora primary username' : 'Register Chainora username'} (session: ${sessionId})`;
  const messageHash = buildEip191Hash(message);

  console.log('[UsernameFlow] one-session NFC start', {
    apiBase: payload.apiBase,
    sessionId,
    username,
  });
  onProgress?.('Verifying PIN and signing challenge on card...');

  const signAndAttest = await signHashAndAttestInOneTap<CardChallengeResponse>(
    pin,
    messageHash,
    async ({ address, deviceCertificate }) => {
      if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
        throw new Error('Card address does not match the active wallet in app.');
      }

      const challengeEndpoint = `${payload.apiBase}/v1/card/challenge`;
      onProgress?.('Requesting challenge from backend...');
      const challengeResponse = await fetchWithTimeout(challengeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          deviceCertificate: bytesToHex(deviceCertificate),
        }),
      });

      if (!challengeResponse.ok) {
        const detail = await readApiErrorMessage(
          challengeResponse,
          `Card challenge failed: ${challengeResponse.status} at ${challengeEndpoint}`,
        );
        throw new Error(detail);
      }

      const challengeRaw = (await challengeResponse.json()) as { data?: CardChallengeResponse } | CardChallengeResponse;
      const challengePayload =
        challengeRaw && typeof challengeRaw === 'object' && 'data' in challengeRaw && challengeRaw.data
          ? challengeRaw.data
          : (challengeRaw as CardChallengeResponse);

      onProgress?.('Generating card attestation proof...');

      return {
        challenge: hexToBytes(challengePayload.challenge),
        meta: challengePayload,
      };
    },
  );

  if (!signAndAttest.ok || !signAndAttest.signatureDer || !signAndAttest.publicKeyHex || !signAndAttest.ethAddress) {
    throw new Error(signAndAttest.message || 'Unable to sign username payload');
  }

  if (!signAndAttest.attestationProof || !signAndAttest.challengeMeta) {
    throw new Error('Missing card attestation data from one-session NFC flow');
  }

  const recovered = recoverSignature(messageHash, signAndAttest.signatureDer, signAndAttest.publicKeyHex, 1);
  const signatureHex = `${recovered.r.slice(2)}${recovered.s.slice(2)}`;

  const verifyEndpoint = `${payload.apiBase}/v1/card/verify`;
  onProgress?.('Verifying card attestation with backend...');
  const verifyCardResponse = await fetchWithTimeout(verifyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      challengeId: signAndAttest.challengeMeta.challengeId,
      attestationProof: bytesToHex(signAndAttest.attestationProof),
    }),
  });

  if (!verifyCardResponse.ok) {
    const detail = await readApiErrorMessage(
      verifyCardResponse,
      `Card verification failed: ${verifyCardResponse.status} at ${verifyEndpoint}`,
    );
    throw new Error(detail);
  }

  const verifyCardRaw = (await verifyCardResponse.json()) as { data?: CardVerifyResponse } | CardVerifyResponse;
  const verifyCardPayload =
    verifyCardRaw && typeof verifyCardRaw === 'object' && 'data' in verifyCardRaw && verifyCardRaw.data
      ? verifyCardRaw.data
      : (verifyCardRaw as CardVerifyResponse);

  if (!verifyCardPayload.verified) {
    throw new Error('Card verification did not succeed');
  }

  onProgress?.(isPrimarySelection ? 'Submitting primary username selection via relayer...' : 'Submitting username registration via relayer...');
  return registerUsernameRelayer({
    apiBase: payload.apiBase,
    sessionId,
    address: signAndAttest.ethAddress,
    signatureHex,
    recovery: recovered.recovery,
    username,
    feature: payload.feature,
  });
};
