import { keccak_256 } from '@noble/hashes/sha3.js';

import { signTransactionHash } from './cardService';
import { recoverSignature } from './transaction/signatureUtils';

const DEFAULT_AUTH_TEMPLATE = 'Sign this to login to Chainora: %s';

const buildAuthMessage = (nonce: string, explicitMessage?: string): string => {
  const cleaned = explicitMessage?.trim();
  if (cleaned) {
    return cleaned;
  }
  return DEFAULT_AUTH_TEMPLATE.replace('%s', nonce);
};

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
};

const buildEip191Hash = (message: string): Uint8Array => {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const prefixBytes = encoder.encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefixBytes, messageBytes));
};

const normalizeApiBase = (apiBase: string): string => {
  const trimmed = apiBase.trim();
  if (!trimmed) {
    throw new Error('Missing apiBase in QR payload');
  }
  const url = new URL(trimmed);
  return `${url.protocol}//${url.host}`;
};

const ensureField = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid QR payload: ${field} is required`);
  }
  return value.trim();
};

export type QrLoginPayload = {
  feature?: string;
  sessionId: string;
  nonce: string;
  apiBase: string;
  message?: string;
};

type GenericQrEnvelope = {
  feature?: string;
  apiBase?: unknown;
  data?: Record<string, unknown>;
};

export type QrLoginProof = {
  address: string;
  signatureHex: string;
  recovery: number;
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
};

export type NotifyLoginProgressRequest = {
  apiBase: string;
  sessionId: string;
  status: string;
};

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
    if (feature && feature !== 'auth.login') {
      throw new Error(`Unsupported QR feature: ${feature}`);
    }

    const data = envelope.data as Record<string, unknown>;
    const sessionId = ensureField(data.sessionId, 'sessionId');
    const nonce = ensureField(data.nonce, 'nonce');
    const apiBase = normalizeApiBase(ensureField(envelope.apiBase, 'apiBase'));
    const message = typeof data.message === 'string' ? data.message.trim() : undefined;

    return {
      feature: feature || 'auth.login',
      sessionId,
      nonce,
      apiBase,
      message,
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

export const createQrLoginProof = async (payload: QrLoginPayload, pin: string): Promise<QrLoginProof> => {
  const message = buildAuthMessage(payload.nonce, payload.message);
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
  };
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

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Network request failed for ${endpoint}. ${reason}. If running on a real phone, do not use localhost; use your laptop LAN IP (e.g. http://192.168.x.x:8080).`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Verify login failed: ${response.status} at ${endpoint}`);
  }

  const json = (await response.json()) as VerifyLoginResponse;
  console.log('[QRLogin] verify response', {
    endpoint,
    verified: json.verified,
    address: json.address,
  });

  return json;
};

export const notifyQrLoginProgress = async ({
  apiBase,
  sessionId,
  status,
}: NotifyLoginProgressRequest): Promise<void> => {
  const endpoint = `${apiBase}/v1/auth/progress`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        status,
      }),
    });
  } catch (error) {
    console.warn('[QRLogin] progress notify failed', {
      endpoint,
      sessionId,
      status,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
