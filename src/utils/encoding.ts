export const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

export const hexToBytes = (hex: string): Uint8Array => {
  const sanitized = hex.replace(/\s+/g, '');
  if (sanitized.length % 2 !== 0) {
    throw new Error('Hex string must have an even length');
  }
  const byteCount = sanitized.length / 2;
  const result = new Uint8Array(byteCount);
  for (let index = 0; index < byteCount; index += 1) {
    result[index] = parseInt(sanitized.substr(index * 2, 2), 16);
  }
  return result;
};

export const bytesToUtf8 = (bytes: Uint8Array): string => {
  try {
    const hexString = Array.from(bytes)
      .map(byte => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');
    return decodeURIComponent(hexString);
  } catch (error) {
    throw new Error('Failed to decode UTF-8 payload');
  }
};
