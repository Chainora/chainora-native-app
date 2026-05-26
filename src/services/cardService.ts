import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';

import { buildSelectApdu, parseApduResponse } from '../lib/apdu';
import { withIsoDep, IsoDepClient } from '../lib/nfc/isoDepClient';
import { bytesToHex, hexToBytes } from '../utils/encoding';
import type {
  CardAttestationResult,
  CardCertificateResult,
  WalletActionCode,
  WalletActionResult,
  WalletSignatureResult,
  WalletSignAndAttestResult,
} from '@app-types/wallet';

export type {
  CardAttestationResult,
  CardCertificateResult,
  WalletActionCode,
  WalletActionResult,
  WalletSignatureResult,
  WalletSignAndAttestResult,
} from '@app-types/wallet';

const WALLET_AID = new Uint8Array([0xf0, 0x56, 0x4e, 0x43, 0x48, 0x57, 0x01]);
const WALLET_CLA = 0x80;

const INS = {
  INIT_PIN: 0x10,
  VERIFY_PIN: 0x11,
  UPDATE_PIN: 0x12,
  RESET_PIN: 0x13,
  IS_PIN_INITIALIZED: 0x14,
  GEN_KEY_PAIR: 0x20,
  GET_PUBLIC_KEY: 0x21,
  SIGN_HASH: 0x22,
  BACKUP_SESSION: 0x30,
  BACKUP_EXPORT: 0x31,
  BACKUP_IMPORT: 0x32,
  DEVICE_CERT: 0x23,
  CARD_ATTEST: 0x24,
} as const;

const P1_BACKUP = {
  GET_FACTORY_CSR: 0x10,
  SET_DEVICE_CERT: 0x11,
  START_LINK_PROOF: 0x01,
  LOAD_PEER_CERT: 0x02,
  LOAD_PEER_LINK_PROOF: 0x03,
  CLEAR_LINK_STATE: 0x04,
} as const;

const P1_DEVICE_CERT = {
  GET_DEVICE_CERT: 0x00,
  GET_FACTORY_CSR: 0x10,
  SET_DEVICE_CERT: 0x11,
} as const;

const DEVICE_CERT_BODY_LENGTH = 1 + 16 + 65 + 1;
const FACTORY_ROOT_PUBLIC_KEY_HEX =
  '043e5662949af3d3bdf8c226bdd8444098a14f8960870ccb5be55bbe098b363aadd06109c1c50cfcfb44f80ecd082fd1d00fc8de8c73ed521ad0bab962422f721a';
const FACTORY_ROOT_PUBLIC_KEY_BYTES = hexToBytes(FACTORY_ROOT_PUBLIC_KEY_HEX);

type WalletCommandOptions = {
  ins: number;
  data?: Uint8Array;
  p1?: number;
  p2?: number;
  le?: number;
};

export type VerifiedWalletSession = {
  publicKeyHex: string;
  ethAddress: string;
  deviceCertificate: Uint8Array;
  signHash: (hash: Uint8Array) => Promise<WalletSignatureResult>;
  attestChallenge: (challenge: Uint8Array) => Promise<CardAttestationResult>;
};

const deriveEthAddress = (publicKey: Uint8Array): string => {
  const isUncompressedWithPrefix = publicKey.length === 65 && publicKey[0] === 0x04;
  const keyBytes = isUncompressedWithPrefix ? publicKey.slice(1) : publicKey;

  if (keyBytes.length !== 64) {
    throw new Error(`Unexpected public key length (${keyBytes.length}). Expected 64 bytes after removing format prefix.`);
  }

  const digest = keccak_256(keyBytes);
  const addressBytes = digest.slice(-20);
  return `0x${bytesToHex(addressBytes)}`;
};

const buildWalletCommand = ({ ins, data, p1 = 0x00, p2 = 0x00, le }: WalletCommandOptions): Uint8Array => {
  const payload = data ?? new Uint8Array(0);
  if (payload.length > 0xff) {
    throw new Error('Wallet command payload exceeds 255 bytes');
  }
  if (le !== undefined && (le < 0 || le > 0xff)) {
    throw new Error('Wallet command Le must be within 0-255');
  }

  if (payload.length === 0) {
    if (le === undefined) {
      const buffer = new Uint8Array(4);
      buffer[0] = WALLET_CLA;
      buffer[1] = ins;
      buffer[2] = p1;
      buffer[3] = p2;
      return buffer;
    }

    const buffer = new Uint8Array(5);
    buffer[0] = WALLET_CLA;
    buffer[1] = ins;
    buffer[2] = p1;
    buffer[3] = p2;
    buffer[4] = le;
    return buffer;
  }

  const bodyLength = 5 + payload.length + (le !== undefined ? 1 : 0);
  const buffer = new Uint8Array(bodyLength);
  buffer[0] = WALLET_CLA;
  buffer[1] = ins;
  buffer[2] = p1;
  buffer[3] = p2;
  buffer[4] = payload.length;
  buffer.set(payload, 5);

  if (le !== undefined) {
    buffer[5 + payload.length] = le;
  }

  return buffer;
};

const encodePin = (pin: string): Uint8Array => {
  const trimmed = pin.trim();
  if (!/^\d{4,8}$/.test(trimmed)) {
    throw new Error('PIN must contain 4-8 digits');
  }
  return Uint8Array.from(trimmed.split('').map(char => char.charCodeAt(0)));
};

const sendWalletCommand = async (isoDep: IsoDepClient, options: WalletCommandOptions) => {
  const command = buildWalletCommand(options);
  const response = await isoDep.transceive(command);
  return parseApduResponse(response);
};

const walletError = (
  step: string,
  message: string,
  code: WalletActionCode,
  statusWord?: string,
): WalletActionResult => {
  console.log('[NFC] Wallet error', { step, code, statusWord, message });
  return {
    ok: false,
    message,
    statusWord,
    code,
    step,
  };
};

const transportError = (message: string): WalletActionResult => {
  const reason = message && message.trim() ? message.trim() : 'NFC communication interrupted. Keep card steady and try again.';
  console.log('[NFC] Wallet transport error', { message });
  return {
    ok: false,
    message: `NFC transport error: ${reason}`,
    code: 'TRANSPORT_ERROR',
    step: 'transport',
  };
};

const ensureWalletSelected = async (isoDep: IsoDepClient): Promise<WalletActionResult | null> => {
  const selectResponse = await isoDep.transceive(buildSelectApdu(WALLET_AID));
  const { statusWord } = parseApduResponse(selectResponse);

  if (!statusWord.ok) {
    return walletError('selectApplet', 'Failed to select the Chainora wallet applet.', 'SELECT_FAILED', statusWord.hex);
  }

  return null;
};

const isPinInitialised = (payload: Uint8Array): boolean => {
  return payload.length > 0 && payload[0] === 0x01;
};

const buildInfoResult = (message: string, statusWord: string, publicKey?: Uint8Array): WalletActionResult => {
  const publicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  let ethAddress: string | undefined;

  if (publicKeyHex) {
    console.log('[NFC] Wallet public key fetched', { preview: `${publicKeyHex.slice(0, 16)}...${publicKeyHex.slice(-8)}` });
  }

  if (publicKey) {
    try {
      ethAddress = deriveEthAddress(publicKey);
      console.log('[NFC] Wallet Ethereum address derived', { preview: `${ethAddress.slice(0, 12)}...${ethAddress.slice(-6)}` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn('[NFC] Failed to derive Ethereum address from public key', { reason });
    }
  }

  return {
    ok: true,
    message,
    statusWord,
    publicKeyHex,
    ethAddress,
    step: 'complete',
  };
};

const ensureHashLength = (hash: Uint8Array) => {
  if (hash.length !== 32) {
    throw new Error(`Transaction hash must be 32 bytes, received ${hash.length}`);
  }
};

const parseDerLength = (bytes: Uint8Array, offset: number): { length: number; nextOffset: number } => {
  let cursor = offset;
  if (cursor >= bytes.length) {
    throw new Error('Malformed DER signature length');
  }

  let length = bytes[cursor];
  cursor += 1;

  if (length <= 0x7f) {
    return { length, nextOffset: cursor };
  }

  const byteCount = length - 0x80;
  if (byteCount === 0 || byteCount > 2 || cursor + byteCount > bytes.length) {
    throw new Error('Malformed DER signature length encoding');
  }

  length = 0;
  for (let index = 0; index < byteCount; index += 1) {
    length = length * 256 + bytes[cursor + index];
  }

  return { length, nextOffset: cursor + byteCount };
};

const parseDerInteger = (bytes: Uint8Array, offset: number): { value: Uint8Array; nextOffset: number } => {
  if (offset >= bytes.length || bytes[offset] !== 0x02) {
    throw new Error('Malformed DER signature integer tag');
  }

  const { length, nextOffset } = parseDerLength(bytes, offset + 1);
  const end = nextOffset + length;
  if (end > bytes.length) {
    throw new Error('Malformed DER signature integer length');
  }

  return { value: bytes.slice(nextOffset, end), nextOffset: end };
};

const trimInteger = (value: Uint8Array): Uint8Array => {
  let offset = 0;
  while (offset < value.length - 1 && value[offset] === 0) {
    offset += 1;
  }
  return value.slice(offset);
};

const padTo32Bytes = (value: Uint8Array): Uint8Array => {
  const trimmed = trimInteger(value);
  if (trimmed.length > 32) {
    throw new Error('DER integer exceeds 32 bytes');
  }

  const padded = new Uint8Array(32);
  padded.set(trimmed, 32 - trimmed.length);
  return padded;
};

const derToCompactSignature = (der: Uint8Array): Uint8Array => {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER signature header');
  }

  const { length: sequenceLength, nextOffset: sequenceOffset } = parseDerLength(der, 1);
  const sequenceEnd = sequenceOffset + sequenceLength;
  if (sequenceEnd > der.length) {
    throw new Error('Incorrect DER sequence length');
  }

  const sequence = sequenceEnd === der.length ? der : der.slice(0, sequenceEnd);
  const firstInteger = parseDerInteger(sequence, sequenceOffset);
  const secondInteger = parseDerInteger(sequence, firstInteger.nextOffset);

  const rBytes = padTo32Bytes(firstInteger.value);
  const sBytes = padTo32Bytes(secondInteger.value);
  const compact = new Uint8Array(64);
  compact.set(rBytes, 0);
  compact.set(sBytes, 32);
  return compact;
};

const isFactorySignedDeviceCert = (deviceCert: Uint8Array): boolean => {
  if (deviceCert.length < DEVICE_CERT_BODY_LENGTH + 1) {
    return false;
  }

  const signatureLength = deviceCert[DEVICE_CERT_BODY_LENGTH];
  const expectedLength = DEVICE_CERT_BODY_LENGTH + 1 + signatureLength;
  if (signatureLength === 0 || expectedLength !== deviceCert.length) {
    return false;
  }

  const certBody = deviceCert.slice(0, DEVICE_CERT_BODY_LENGTH);
  const signatureDer = deviceCert.slice(DEVICE_CERT_BODY_LENGTH + 1, expectedLength);
  const digest = sha256(certBody);

  try {
    const signatureCompact = derToCompactSignature(signatureDer);
    return secp.verify(signatureCompact, digest, FACTORY_ROOT_PUBLIC_KEY_BYTES);
  } catch {
    return false;
  }
};

const verifyCardCertificate = (
  cert: Uint8Array,
  failureCode: Extract<WalletActionCode, 'BACKUP_INIT_FAILED' | 'BACKUP_EXPORT_FAILED' | 'BACKUP_IMPORT_FAILED'>,
): WalletActionResult | null => {
  if (isFactorySignedDeviceCert(cert)) {
    return null;
  }

  return walletError(
    'verifyFactoryCertificate',
    'Card certificate is not signed by Chainora factory key.',
    failureCode,
  );
};

const buildUpdatePinPayload = (currentPin: string, nextPin: string): Uint8Array => {
  const currentPinBytes = encodePin(currentPin);
  const nextPinBytes = encodePin(nextPin);

  const payload = new Uint8Array(1 + currentPinBytes.length + nextPinBytes.length);
  payload[0] = currentPinBytes.length;
  payload.set(currentPinBytes, 1);
  payload.set(nextPinBytes, 1 + currentPinBytes.length);

  return payload;
};

export const initialiseWallet = async (pin: string): Promise<WalletActionResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const pinState = await sendWalletCommand(isoDep, { ins: INS.IS_PIN_INITIALIZED, le: 0x01 });
      if (!pinState.statusWord.ok) {
        return walletError('pinState', 'Unable to determine PIN state.', 'PIN_STATE_UNAVAILABLE', pinState.statusWord.hex);
      }

      if (isPinInitialised(pinState.data)) {
        return walletError('pinState', 'PIN already initialised. Switch to Sign In mode.', 'PIN_ALREADY_INITIALISED', pinState.statusWord.hex);
      }

      const initResponse = await sendWalletCommand(isoDep, { ins: INS.INIT_PIN, data: encodePin(pin) });
      if (!initResponse.statusWord.ok) {
        const code: WalletActionCode = initResponse.statusWord.hex === '6985' ? 'PIN_ALREADY_INITIALISED' : 'UNKNOWN';
        return walletError('initPin', 'PIN initialisation failed on the card.', code, initResponse.statusWord.hex);
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'PIN incorrect. Try again.' : 'PIN verification failed on the card.';
        return walletError('verifyPin', message, code, verifyResponse.statusWord.hex);
      }

      const generateResponse = await sendWalletCommand(isoDep, { ins: INS.GEN_KEY_PAIR });
      if (!generateResponse.statusWord.ok) {
        console.log(generateResponse);
        return walletError('generateKeyPair', 'Key pair generation failed on the card.', 'KEYPAIR_FAILURE', generateResponse.statusWord.hex);
      }
      
      const publicKeyResponse = await sendWalletCommand(isoDep, { ins: INS.GET_PUBLIC_KEY, le: 0x00 });
      if (!publicKeyResponse.statusWord.ok) {
        return walletError('readPublicKey', 'Failed to retrieve the public key from the card.', 'PUBLIC_KEY_FAILURE', publicKeyResponse.statusWord.hex);
      }
      
      return buildInfoResult('Wallet initialised successfully.', publicKeyResponse.statusWord.hex, publicKeyResponse.data);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const initialisePinOnly = async (pin: string): Promise<WalletActionResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const pinState = await sendWalletCommand(isoDep, { ins: INS.IS_PIN_INITIALIZED, le: 0x01 });
      if (!pinState.statusWord.ok) {
        return walletError('pinState', 'Unable to determine PIN state.', 'PIN_STATE_UNAVAILABLE', pinState.statusWord.hex);
      }

      if (isPinInitialised(pinState.data)) {
        return walletError('pinState', 'PIN already initialised on this card.', 'PIN_ALREADY_INITIALISED', pinState.statusWord.hex);
      }

      const initResponse = await sendWalletCommand(isoDep, { ins: INS.INIT_PIN, data: encodePin(pin) });
      if (!initResponse.statusWord.ok) {
        const code: WalletActionCode = initResponse.statusWord.hex === '6985' ? 'PIN_ALREADY_INITIALISED' : 'UNKNOWN';
        return walletError('initPin', 'PIN initialisation failed on the card.', code, initResponse.statusWord.hex);
      }

      return {
        ok: true,
        message: 'Card PIN initialised successfully.',
        statusWord: initResponse.statusWord.hex,
        step: 'initPinOnly',
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const signInWallet = async (pin: string): Promise<WalletActionResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const pinState = await sendWalletCommand(isoDep, { ins: INS.IS_PIN_INITIALIZED, le: 0x01 });
      if (!pinState.statusWord.ok) {
        return walletError('pinState', 'Unable to determine PIN state.', 'PIN_STATE_UNAVAILABLE', pinState.statusWord.hex);
      }

      if (!isPinInitialised(pinState.data)) {
        return walletError('pinState', 'Wallet PIN has not been initialised yet.', 'PIN_NOT_INITIALISED', pinState.statusWord.hex);
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'PIN incorrect. Try again.' : 'PIN verification failed on the card.';
        return walletError('verifyPin', message, code, verifyResponse.statusWord.hex);
      }

      const publicKeyResponse = await sendWalletCommand(isoDep, { ins: INS.GET_PUBLIC_KEY, le: 0x00 });
      if (!publicKeyResponse.statusWord.ok) {
        return walletError('readPublicKey', 'Failed to retrieve the public key from the card.', 'PUBLIC_KEY_FAILURE', publicKeyResponse.statusWord.hex);
      }

      return buildInfoResult('Wallet unlocked successfully.', publicKeyResponse.statusWord.hex, publicKeyResponse.data);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const changeWalletPin = async (currentPin: string, nextPin: string): Promise<WalletActionResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(currentPin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'PIN_UPDATE_FAILED';
        const message = code === 'PIN_INVALID' ? 'Current PIN is incorrect.' : 'PIN verification failed on the card.';
        return walletError('verifyCurrentPin', message, code, verifyResponse.statusWord.hex);
      }

      const updatePayload = buildUpdatePinPayload(currentPin, nextPin);
      const updateResponse = await sendWalletCommand(isoDep, { ins: INS.UPDATE_PIN, data: updatePayload });
      if (!updateResponse.statusWord.ok) {
        return walletError('updatePin', 'Failed to update PIN on the card.', 'PIN_UPDATE_FAILED', updateResponse.statusWord.hex);
      }

      return {
        ok: true,
        message: 'PIN changed successfully.',
        statusWord: updateResponse.statusWord.hex,
        step: 'updatePin',
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const resetWallet = async (): Promise<WalletActionResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const resetResponse = await sendWalletCommand(isoDep, { ins: INS.RESET_PIN });
      if (!resetResponse.statusWord.ok) {
        return walletError(
          'resetCard',
          'Failed to reset the Chainora card.',
          'RESET_FAILED',
          resetResponse.statusWord.hex,
        );
      }

      return buildInfoResult('Wallet reset successfully.', resetResponse.statusWord.hex);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const signTransactionHash = async (pin: string, hash: Uint8Array): Promise<WalletSignatureResult> => {
  ensureHashLength(hash);

  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'PIN incorrect. Try again.' : 'PIN verification failed on the card.';
        return walletError('verifyPinForSign', message, code, verifyResponse.statusWord.hex);
      }

      const publicKeyResponse = await sendWalletCommand(isoDep, { ins: INS.GET_PUBLIC_KEY, le: 0x00 });
      if (!publicKeyResponse.statusWord.ok) {
        return walletError('readPublicKey', 'Failed to retrieve the public key from the card.', 'PUBLIC_KEY_FAILURE', publicKeyResponse.statusWord.hex);
      }

      const signatureResponse = await sendWalletCommand(isoDep, { ins: INS.SIGN_HASH, data: hash });
      if (!signatureResponse.statusWord.ok) {
        return walletError('signHash', 'Failed to sign transaction hash.', 'UNKNOWN', signatureResponse.statusWord.hex);
      }

      // Best-effort in same NFC session: read device certificate for backend attestation flow.
      let deviceCertificate: Uint8Array | undefined;
      const certResponse = await sendWalletCommand(isoDep, {
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (certResponse.statusWord.ok) {
        deviceCertificate = certResponse.data;
      }

      const publicKeyBytes = publicKeyResponse.data;
      const signatureBytes = signatureResponse.data;
      const base = buildInfoResult('Transaction hash signed successfully.', signatureResponse.statusWord.hex, publicKeyBytes);

      return {
        ...base,
        step: 'signHash',
        signatureDer: signatureBytes,
        signatureDerHex: bytesToHex(signatureBytes),
        deviceCertificate,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const signHashAndAttestInOneTap = async <TMeta>(
  pin: string,
  hash: Uint8Array,
  requestChallenge: (input: { address: string; deviceCertificate: Uint8Array }) => Promise<{ challenge: Uint8Array; meta: TMeta }>,
): Promise<WalletSignAndAttestResult<TMeta>> => {
  ensureHashLength(hash);

  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        return selectError;
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'PIN incorrect. Try again.' : 'PIN verification failed on the card.';
        return walletError('verifyPinForSignAndAttest', message, code, verifyResponse.statusWord.hex);
      }

      const publicKeyResponse = await sendWalletCommand(isoDep, { ins: INS.GET_PUBLIC_KEY, le: 0x00 });
      if (!publicKeyResponse.statusWord.ok) {
        return walletError('readPublicKey', 'Failed to retrieve the public key from the card.', 'PUBLIC_KEY_FAILURE', publicKeyResponse.statusWord.hex);
      }

      const signatureResponse = await sendWalletCommand(isoDep, { ins: INS.SIGN_HASH, data: hash });
      if (!signatureResponse.statusWord.ok) {
        return walletError('signHash', 'Failed to sign transaction hash.', 'UNKNOWN', signatureResponse.statusWord.hex);
      }

      const certResponse = await sendWalletCommand(isoDep, {
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!certResponse.statusWord.ok || certResponse.data.length === 0) {
        return walletError('getDeviceCert', 'Failed to get device certificate from card.', 'UNKNOWN', certResponse.statusWord.hex);
      }

      const base = buildInfoResult('Transaction hash signed successfully.', signatureResponse.statusWord.hex, publicKeyResponse.data);
      if (!base.ethAddress) {
        return walletError('deriveAddress', 'Failed to derive wallet address from card public key.', 'UNKNOWN', signatureResponse.statusWord.hex);
      }

      let challengeInput: { challenge: Uint8Array; meta: TMeta };
      try {
        challengeInput = await requestChallenge({
          address: base.ethAddress,
          deviceCertificate: certResponse.data,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return walletError('requestChallenge', `Failed to request card challenge: ${reason}`, 'UNKNOWN');
      }

      if (challengeInput.challenge.length !== 32) {
        return walletError('requestChallenge', 'Challenge must be exactly 32 bytes.', 'UNKNOWN');
      }

      const attestResponse = await sendWalletCommand(isoDep, {
        ins: INS.CARD_ATTEST,
        data: challengeInput.challenge,
      });
      if (!attestResponse.statusWord.ok) {
        return walletError('cardAttest', 'Failed to create card attestation proof.', 'UNKNOWN', attestResponse.statusWord.hex);
      }

      return {
        ...base,
        step: 'signAndAttest',
        signatureDer: signatureResponse.data,
        signatureDerHex: bytesToHex(signatureResponse.data),
        deviceCertificate: certResponse.data,
        attestationProof: attestResponse.data,
        challengeMeta: challengeInput.meta,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const withVerifiedWalletSession = async <T>(
  pin: string,
  runner: (session: VerifiedWalletSession) => Promise<T>,
): Promise<T> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) {
        throw new Error(selectError.message);
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'PIN incorrect. Try again.' : 'PIN verification failed on the card.';
        throw new Error(message);
      }

      const publicKeyResponse = await sendWalletCommand(isoDep, { ins: INS.GET_PUBLIC_KEY, le: 0x00 });
      if (!publicKeyResponse.statusWord.ok) {
        throw new Error('Failed to retrieve the public key from the card.');
      }

      const certResponse = await sendWalletCommand(isoDep, {
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!certResponse.statusWord.ok || certResponse.data.length === 0) {
        throw new Error('Failed to get device certificate from card.');
      }

      const publicKeyHex = bytesToHex(publicKeyResponse.data);
      const ethAddress = deriveEthAddress(publicKeyResponse.data);
      const deviceCertificate = certResponse.data;

      const signHash = async (hash: Uint8Array): Promise<WalletSignatureResult> => {
        ensureHashLength(hash);

        const signatureResponse = await sendWalletCommand(isoDep, { ins: INS.SIGN_HASH, data: hash });
        if (!signatureResponse.statusWord.ok) {
          return walletError('signHash', 'Failed to sign transaction hash.', 'UNKNOWN', signatureResponse.statusWord.hex);
        }

        return {
          ok: true,
          message: 'Transaction hash signed successfully.',
          statusWord: signatureResponse.statusWord.hex,
          step: 'signHash',
          signatureDer: signatureResponse.data,
          signatureDerHex: bytesToHex(signatureResponse.data),
          publicKeyHex,
          ethAddress,
          deviceCertificate,
        };
      };

      const attestChallenge = async (challenge: Uint8Array): Promise<CardAttestationResult> => {
        if (challenge.length !== 32) {
          return walletError('cardAttest', 'Challenge must be exactly 32 bytes.', 'UNKNOWN');
        }

        const response = await sendWalletCommand(isoDep, {
          ins: INS.CARD_ATTEST,
          data: challenge,
        });
        if (!response.statusWord.ok) {
          return walletError('cardAttest', 'Failed to create card attestation proof.', 'UNKNOWN', response.statusWord.hex);
        }

        return {
          ok: true,
          message: 'Card attestation proof generated successfully.',
          statusWord: response.statusWord.hex,
          step: 'cardAttest',
          attestationProof: response.data,
        };
      };

      return runner({
        publicKeyHex,
        ethAddress,
        deviceCertificate,
        signHash,
        attestChallenge,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || 'NFC communication interrupted. Keep card steady and try again.');
  }
};

export type BackupDestinationData = WalletActionResult & {
  deviceCert?: Uint8Array;
  linkProof?: Uint8Array;
};

export const prepareBackupDestination = async (pin: string): Promise<BackupDestinationData> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        return walletError('verifyPin', 'PIN verification failed.', 'PIN_INVALID', verifyResponse.statusWord.hex);
      }

      const clearState = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.CLEAR_LINK_STATE 
      });
      if (!clearState.statusWord.ok) {
        return walletError('clearState', 'Failed to clear session state.', 'BACKUP_INIT_FAILED', clearState.statusWord.hex);
      }

      const getCert = await sendWalletCommand(isoDep, { 
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!getCert.statusWord.ok) {
        return walletError('getDeviceCert', 'Failed to get device certificate.', 'BACKUP_INIT_FAILED', getCert.statusWord.hex);
      }
      const deviceCert = getCert.data;

      const certError = verifyCardCertificate(deviceCert, 'BACKUP_INIT_FAILED');
      if (certError) {
        return certError;
      }

      const getLinkProof = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.START_LINK_PROOF 
      });
      if (!getLinkProof.statusWord.ok) {
        return walletError('startLinkProof', 'Failed to generate link proof.', 'BACKUP_INIT_FAILED', getLinkProof.statusWord.hex);
      }
      const linkProof = getLinkProof.data;

      return {
        ok: true,
        message: 'Destination prepared successfully.',
        step: 'prepareBackupDestination',
        deviceCert,
        linkProof,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const initialisePinAndPrepareBackupDestination = async (pin: string): Promise<BackupDestinationData> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const pinState = await sendWalletCommand(isoDep, { ins: INS.IS_PIN_INITIALIZED, le: 0x01 });
      if (!pinState.statusWord.ok) {
        return walletError('pinState', 'Unable to determine PIN state.', 'PIN_STATE_UNAVAILABLE', pinState.statusWord.hex);
      }

      if (isPinInitialised(pinState.data)) {
        return walletError('pinState', 'PIN already initialised on this card.', 'PIN_ALREADY_INITIALISED', pinState.statusWord.hex);
      }

      const initResponse = await sendWalletCommand(isoDep, { ins: INS.INIT_PIN, data: encodePin(pin) });
      if (!initResponse.statusWord.ok) {
        const code: WalletActionCode = initResponse.statusWord.hex === '6985' ? 'PIN_ALREADY_INITIALISED' : 'UNKNOWN';
        return walletError('initPin', 'PIN initialisation failed on the secondary card.', code, initResponse.statusWord.hex);
      }

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        const code: WalletActionCode = verifyResponse.statusWord.hex === '6982' ? 'PIN_INVALID' : 'UNKNOWN';
        const message = code === 'PIN_INVALID' ? 'Secondary PIN incorrect. Try again.' : 'Secondary PIN verification failed on the card.';
        return walletError('verifyPin', message, code, verifyResponse.statusWord.hex);
      }

      const clearState = await sendWalletCommand(isoDep, {
        ins: INS.BACKUP_SESSION,
        p1: P1_BACKUP.CLEAR_LINK_STATE,
      });
      if (!clearState.statusWord.ok) {
        return walletError('clearState', 'Failed to clear session state.', 'BACKUP_INIT_FAILED', clearState.statusWord.hex);
      }

      const getCert = await sendWalletCommand(isoDep, {
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!getCert.statusWord.ok) {
        return walletError('getDeviceCert', 'Failed to get device certificate.', 'BACKUP_INIT_FAILED', getCert.statusWord.hex);
      }

      const certError = verifyCardCertificate(getCert.data, 'BACKUP_INIT_FAILED');
      if (certError) {
        return certError;
      }

      const getLinkProof = await sendWalletCommand(isoDep, {
        ins: INS.BACKUP_SESSION,
        p1: P1_BACKUP.START_LINK_PROOF,
      });
      if (!getLinkProof.statusWord.ok) {
        return walletError('startLinkProof', 'Failed to generate link proof.', 'BACKUP_INIT_FAILED', getLinkProof.statusWord.hex);
      }

      return {
        ok: true,
        message: 'Secondary card initialised and prepared successfully.',
        step: 'initPinAndPrepareBackupDestination',
        deviceCert: getCert.data,
        linkProof: getLinkProof.data,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export type BackupExportResult = WalletActionResult & {
  envelope?: Uint8Array;
  sourceCert?: Uint8Array;
  sourceLinkProof?: Uint8Array;
};

export const performBackupExport = async (
  pin: string, 
  peerCert: Uint8Array, 
  peerLinkProof: Uint8Array
): Promise<BackupExportResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        return walletError('verifyPin', 'PIN verification failed.', 'PIN_INVALID', verifyResponse.statusWord.hex);
      }
      
      const clearState = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.CLEAR_LINK_STATE 
      });
      if (!clearState.statusWord.ok) {
        return walletError('clearState', 'Failed to clear session state.', 'BACKUP_EXPORT_FAILED', clearState.statusWord.hex);
      }

      // Get Source Cert
      const getCert = await sendWalletCommand(isoDep, { 
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!getCert.statusWord.ok) {
        return walletError('sourceGetCert', 'Failed to get source certificate.', 'BACKUP_EXPORT_FAILED', getCert.statusWord.hex);
      }
      const sourceCert = getCert.data;

      const certError = verifyCardCertificate(sourceCert, 'BACKUP_EXPORT_FAILED');
      if (certError) {
        return certError;
      }

      // Start Link Proof (Source)
      const getLinkProof = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.START_LINK_PROOF 
      });
      if (!getLinkProof.statusWord.ok) {
        return walletError('sourceStartLinkProof', 'Source failed to start link proof.', 'BACKUP_EXPORT_FAILED', getLinkProof.statusWord.hex);
      }
      const sourceLinkProof = getLinkProof.data;

      const loadCert = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.LOAD_PEER_CERT,
        data: peerCert 
      });
      if (!loadCert.statusWord.ok) {
        return walletError('loadPeerCert', 'Failed to load destination certificate.', 'BACKUP_EXPORT_FAILED', loadCert.statusWord.hex);
      }

      const loadProof = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.LOAD_PEER_LINK_PROOF,
        data: peerLinkProof 
      });
      if (!loadProof.statusWord.ok) {
        return walletError('loadPeerProof', 'Failed to load destination link proof.', 'BACKUP_EXPORT_FAILED', loadProof.statusWord.hex);
      }

      const exportCmd = await sendWalletCommand(isoDep, { ins: INS.BACKUP_EXPORT });
      if (!exportCmd.statusWord.ok) {
        return walletError('backupExport', 'Failed to export backup envelope.', 'BACKUP_EXPORT_FAILED', exportCmd.statusWord.hex);
      }
      
      return {
        ok: true,
        message: 'Backup exported successfully.',
        step: 'performBackupExport',
        envelope: exportCmd.data,
        sourceCert,
        sourceLinkProof,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const performBackupImport = async (
  pin: string,
  peerCert: Uint8Array,
  peerLinkProof: Uint8Array,
  envelope: Uint8Array
): Promise<WalletActionResult> => {
  try {
    const certError = verifyCardCertificate(peerCert, 'BACKUP_IMPORT_FAILED');
    if (certError) {
      return certError;
    }

    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const verifyResponse = await sendWalletCommand(isoDep, { ins: INS.VERIFY_PIN, data: encodePin(pin) });
      if (!verifyResponse.statusWord.ok) {
        return walletError('verifyPin', 'PIN verification failed.', 'PIN_INVALID', verifyResponse.statusWord.hex);
      }
      
      const loadCert = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.LOAD_PEER_CERT,
        data: peerCert 
      });
      if (!loadCert.statusWord.ok) {
        return walletError('loadPeerCert', 'Failed to load source certificate.', 'BACKUP_IMPORT_FAILED', loadCert.statusWord.hex);
      }

      const loadProof = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_SESSION, 
        p1: P1_BACKUP.LOAD_PEER_LINK_PROOF,
        data: peerLinkProof 
      });
      if (!loadProof.statusWord.ok) {
        return walletError('loadPeerProof', 'Failed to load source link proof.', 'BACKUP_IMPORT_FAILED', loadProof.statusWord.hex);
      }

      const importCmd = await sendWalletCommand(isoDep, { 
        ins: INS.BACKUP_IMPORT, 
        data: envelope 
      });
      if (!importCmd.statusWord.ok) {
        return walletError('backupImport', 'Failed to import backup.', 'BACKUP_IMPORT_FAILED', importCmd.statusWord.hex);
      }

      return {
        ok: true,
        message: 'Backup imported successfully.',
        step: 'performBackupImport',
        statusWord: importCmd.statusWord.hex,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const readDeviceCertificate = async (): Promise<CardCertificateResult> => {
  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const response = await sendWalletCommand(isoDep, {
        ins: INS.DEVICE_CERT,
        p1: P1_DEVICE_CERT.GET_DEVICE_CERT,
      });
      if (!response.statusWord.ok) {
        return walletError('getDeviceCert', 'Failed to get device certificate.', 'UNKNOWN', response.statusWord.hex);
      }

      return {
        ok: true,
        message: 'Device certificate fetched successfully.',
        statusWord: response.statusWord.hex,
        step: 'getDeviceCert',
        deviceCertificate: response.data,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};

export const cardAttestChallenge = async (challenge: Uint8Array): Promise<CardAttestationResult> => {
  if (challenge.length !== 32) {
    return walletError('cardAttest', 'Challenge must be exactly 32 bytes.', 'UNKNOWN');
  }

  try {
    return await withIsoDep(async isoDep => {
      const selectError = await ensureWalletSelected(isoDep);
      if (selectError) return selectError;

      const response = await sendWalletCommand(isoDep, {
        ins: INS.CARD_ATTEST,
        data: challenge,
      });
      if (!response.statusWord.ok) {
        return walletError('cardAttest', 'Failed to create card attestation proof.', 'UNKNOWN', response.statusWord.hex);
      }

      return {
        ok: true,
        message: 'Card attestation proof generated successfully.',
        statusWord: response.statusWord.hex,
        step: 'cardAttest',
        attestationProof: response.data,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return transportError(message);
  }
};
