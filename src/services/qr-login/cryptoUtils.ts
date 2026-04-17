import { keccak_256 } from '@noble/hashes/sha3.js';

import { DEFAULT_AUTH_TEMPLATE } from './constants';

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
  const prefixBytes = encoder.encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  return keccak_256(concatBytes(prefixBytes, messageBytes));
};

export const buildAuthMessage = (nonce: string, explicitMessage?: string): string => {
  const cleaned = explicitMessage?.trim();
  if (cleaned) {
    return cleaned;
  }
  return DEFAULT_AUTH_TEMPLATE.replace('%s', nonce);
};
