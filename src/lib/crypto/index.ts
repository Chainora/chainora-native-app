export const toHexSignature = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

export const fromHexSignature = (hex: string): Uint8Array => {
  const sanitized = hex.replace(/\s+/g, '');
  if (sanitized.length % 2 !== 0) {
    throw new Error('Signature hex must be even length');
  }
  const result = new Uint8Array(sanitized.length / 2);
  for (let index = 0; index < sanitized.length; index += 2) {
    result[index / 2] = parseInt(sanitized.slice(index, index + 2), 16);
  }
  return result;
};
