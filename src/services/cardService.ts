import { keccak_256 } from '@noble/hashes/sha3';

import { buildSelectApdu, parseApduResponse } from '../lib/apdu';
import { withIsoDep, IsoDepClient } from '../lib/nfc/isoDepClient';
import { bytesToHex } from '../utils/encoding';

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
} as const;

type WalletCommandOptions = {
  ins: number;
  data?: Uint8Array;
  p1?: number;
  p2?: number;
  le?: number;
};

export type WalletActionCode =
  | 'PIN_ALREADY_INITIALISED'
  | 'PIN_NOT_INITIALISED'
  | 'PIN_INVALID'
  | 'KEYPAIR_FAILURE'
  | 'PUBLIC_KEY_FAILURE'
  | 'RESET_FAILED'
  | 'SELECT_FAILED'
  | 'PIN_STATE_UNAVAILABLE'
  | 'TRANSPORT_ERROR'
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
  console.log('[NFC] Wallet transport error', { message });
  return {
    ok: false,
    message: `NFC transport error: ${message}`,
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

      const generateResponse = await sendWalletCommand(isoDep, { ins: INS.GEN_KEY_PAIR });
      if (!generateResponse.statusWord.ok) {
        return walletError('generateKeyPair', 'Key pair generation failed on the card.', 'KEYPAIR_FAILURE', generateResponse.statusWord.hex);
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

      return buildInfoResult('Wallet initialised successfully.', publicKeyResponse.statusWord.hex, publicKeyResponse.data);
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
