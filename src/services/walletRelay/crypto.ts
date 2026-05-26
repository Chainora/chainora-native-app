import { keccak_256 } from '@noble/hashes/sha3.js';

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

export const buildEip191Hash = (message: string): Uint8Array => {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  return buildEip191HashFromBytes(messageBytes);
};

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

export const decodePersonalSignInput = (input: string): Uint8Array => {
  const raw = String(input ?? '').trim();
  if (/^0x[0-9a-fA-F]*$/.test(raw) && raw.length % 2 === 0) {
    const body = raw.slice(2);
    return body.length === 0 ? new Uint8Array(0) : hexToBytes(body);
  }

  return new TextEncoder().encode(raw);
};

export const buildEip191HashFromBytes = (messageBytes: Uint8Array): Uint8Array => {
  const encoder = new TextEncoder();
  const prefixBytes = encoder.encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefixBytes, messageBytes));
};

export const buildEip191HashFromPersonalSignInput = (input: string): Uint8Array => {
  return buildEip191HashFromBytes(decodePersonalSignInput(input));
};
