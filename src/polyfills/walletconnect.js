import { Buffer } from 'buffer';

const globalScope = globalThis;

if (!globalScope.Buffer) {
  globalScope.Buffer = Buffer;
}

if (!globalScope.TextEncoder) {
  class RNTextEncoder {
    encode(input = '') {
      return Uint8Array.from(Buffer.from(String(input), 'utf8'));
    }
  }

  globalScope.TextEncoder = RNTextEncoder;
}

if (!globalScope.TextDecoder) {
  class RNTextDecoder {
    decode(input) {
      if (input == null) {
        return '';
      }

      if (ArrayBuffer.isView(input)) {
        return Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString('utf8');
      }

      if (input instanceof ArrayBuffer) {
        return Buffer.from(input).toString('utf8');
      }

      return String(input);
    }
  }

  globalScope.TextDecoder = RNTextDecoder;
}
