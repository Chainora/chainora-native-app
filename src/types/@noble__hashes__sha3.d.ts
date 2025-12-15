declare module '@noble/hashes/sha3' {
  export function keccak_256(message: Uint8Array | string): Uint8Array;
}
