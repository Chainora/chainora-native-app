import { bytesToHex } from '@utils/encoding';

export type StatusWord = {
  sw1: number;
  sw2: number;
  value: number;
  hex: string;
  ok: boolean;
};

export type ApduResponse = {
  data: Uint8Array;
  statusWord: StatusWord;
};

const CLA = 0x00;
const SELECT_INS = 0xa4;
const READ_BINARY_INS = 0xb0;

export const buildSelectApdu = (aid: Uint8Array): Uint8Array => {
  const header = new Uint8Array([CLA, SELECT_INS, 0x04, 0x00, aid.length]);
  const trailer = new Uint8Array([0x00]);
  return concatUint8Arrays(header, aid, trailer);
};

export const buildReadBinaryApdu = (
  offset: number,
  expectedLength: number,
): Uint8Array => {
  if (offset < 0 || offset > 0x7fff) {
    throw new Error('Offset out of range for READ BINARY');
  }
  if (expectedLength <= 0 || expectedLength > 0xff) {
    throw new Error('Invalid READ BINARY length');
  }
  const p1 = Math.floor(offset / 0x100) % 0x100;
  const p2 = offset % 0x100;
  return new Uint8Array([CLA, READ_BINARY_INS, p1, p2, expectedLength]);
};

export const parseApduResponse = (payload: Uint8Array): ApduResponse => {
  if (payload.length < 2) {
    throw new Error('APDU response missing status word');
  }
  const data = payload.slice(0, payload.length - 2);
  const sw1 = payload[payload.length - 2];
  const sw2 = payload[payload.length - 1];
  const value = sw1 * 0x100 + sw2;
  const hex = bytesToHex(new Uint8Array([sw1, sw2]));
  return {
    data,
    statusWord: {
      sw1,
      sw2,
      value,
      hex,
      ok: value === 0x9000,
    },
  };
};

const concatUint8Arrays = (...arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  arrays.forEach(array => {
    result.set(array, offset);
    offset += array.length;
  });
  return result;
};
