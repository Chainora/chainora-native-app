import { buildAuthMessage, buildEip191Hash } from './qr-login/cryptoUtils';
import { CREATE_POOL_QR_FEATURE, POOL_ACTION_QR_FEATURE } from './qr-login/constants';
import { signTransactionHash, type VerifiedWalletSession } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';
import type { QrLoginPayload, QrLoginProof } from './qrTypes';

export const signAuthProofWithSession = async ({
  payload,
  session,
}: {
  payload: QrLoginPayload;
  session: VerifiedWalletSession;
}): Promise<QrLoginProof> => {
  const sessionId = payload.sessionId?.trim() ?? '';
  if (!sessionId) {
    throw new Error('QR payload missing sessionId.');
  }

  const message = buildAuthMessage(payload.nonce ?? '', payload.message);
  const messageHash = buildEip191Hash(message);
  const signResult = await session.signHash(messageHash);
  if (!signResult.ok || !signResult.signatureDer || !signResult.publicKeyHex || !signResult.ethAddress) {
    throw new Error(signResult.message || 'Unable to sign login challenge');
  }

  const recovered = recoverSignature(messageHash, signResult.signatureDer, signResult.publicKeyHex, 1);
  const signatureHex = `${recovered.r.slice(2)}${recovered.s.slice(2)}`;

  return {
    address: signResult.ethAddress,
    signatureHex,
    recovery: recovered.recovery,
    deviceCertificate: session.deviceCertificate,
  };
};

export const createQrLoginProof = async (payload: QrLoginPayload, pin: string): Promise<QrLoginProof> => {
  const sessionId = payload.sessionId?.trim() ?? '';
  if ((payload.feature ?? 'auth.login') !== CREATE_POOL_QR_FEATURE && (payload.feature ?? 'auth.login') !== POOL_ACTION_QR_FEATURE && !sessionId) {
    throw new Error('QR payload missing sessionId.');
  }

  const message = payload.feature === 'username.register' || payload.feature === 'username.set_primary'
    ? (payload.message?.trim() || `Register Chainora username (session: ${sessionId})`)
    : buildAuthMessage(payload.nonce ?? '', payload.message);
  const messageHash = buildEip191Hash(message);

  const signResult = await signTransactionHash(pin, messageHash);
  if (!signResult.ok || !signResult.signatureDer || !signResult.publicKeyHex || !signResult.ethAddress) {
    throw new Error(signResult.message || 'Unable to sign login challenge');
  }

  const recovered = recoverSignature(messageHash, signResult.signatureDer, signResult.publicKeyHex, 1);
  const signatureHex = `${recovered.r.slice(2)}${recovered.s.slice(2)}`;

  return {
    address: signResult.ethAddress,
    signatureHex,
    recovery: recovered.recovery,
    deviceCertificate: signResult.deviceCertificate,
  };
};
