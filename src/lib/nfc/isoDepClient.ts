import NfcManager, { NfcTech } from 'react-native-nfc-manager';

export type IsoDepClient = {
  transceive: (command: Uint8Array) => Promise<Uint8Array>;
};

export type IsoDepSession<T> = (isoDep: IsoDepClient) => Promise<T>;

const TECH_REQUEST_RETRY_DELAY_MS = 180;

const sleep = (ms: number): Promise<void> => new Promise(resolve => {
  setTimeout(resolve, ms);
});

const requestIsoDepWithRetry = async (): Promise<void> => {
  try {
    await NfcManager.requestTechnology(NfcTech.IsoDep, {
      alertMessage: 'Hold near your Chainora card',
    });
    return;
  } catch {
    await safeCancelTechnology();
    await sleep(TECH_REQUEST_RETRY_DELAY_MS);
    await NfcManager.requestTechnology(NfcTech.IsoDep, {
      alertMessage: 'Hold near your Chainora card',
    });
  }
};

export const withIsoDep = async <T>(callback: IsoDepSession<T>): Promise<T> => {
  // Ensure NFC manager is initialised even if caller screen hook is not ready yet.
  await NfcManager.start();
  await safeCancelTechnology();
  await requestIsoDepWithRetry();

  const handler = (NfcManager as unknown as { isoDepHandler?: { transceive: (payload: number[]) => Promise<number[] | Uint8Array>; } }).isoDepHandler;

  if (!handler || typeof handler.transceive !== 'function') {
    await safeCancelTechnology();
    throw new Error('IsoDep handler unavailable on this device');
  }

  try {
    const client: IsoDepClient = {
      async transceive(command: Uint8Array) {
        const payload = Array.from(command);
        const response = await handler.transceive(payload);
        return normaliseResponse(response);
      },
    };

    return await callback(client);
  } finally {
    await safeCancelTechnology();
  }
};

const safeCancelTechnology = async () => {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // ignore cancel failures so we do not mask the original error
  }
};

const normaliseResponse = (response: Uint8Array | number[]): Uint8Array => {
  return response instanceof Uint8Array ? response : Uint8Array.from(response);
};
