import NfcManager, { NfcAdapter, NfcEvents, NfcTech } from 'react-native-nfc-manager';
import { InteractionManager, Platform, Vibration } from 'react-native';

export type IsoDepClient = {
  transceive: (command: Uint8Array) => Promise<Uint8Array>;
};

export type IsoDepSession<T> = (isoDep: IsoDepClient) => Promise<T>;

const READER_MODE_HANG_TIMEOUT_MS = 15_000;
const MAX_RESET_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> => new Promise(resolve => {
  setTimeout(resolve, ms);
});

const safeCancelTechnology = async () => {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch (error) {
    // ignore cancel failures so we do not mask the original error
  }
};

const safeUnregisterTagEvent = async () => {
  try {
    await NfcManager.unregisterTagEvent();
  } catch (error) {
    // best effort
  }
};

const clearAllNfcListeners = () => {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
  } catch (error) {}
  try {
    NfcManager.setEventListener(NfcEvents.SessionClosed, null);
  } catch (error) {}
  try {
    NfcManager.setEventListener(NfcEvents.StateChanged, null);
  } catch (error) {}
};

// Android: use reader mode instead of foreground dispatch. Foreground dispatch
// routes tag events through Android Intents which can get stuck when a tag
// handle from a previous session is still being presence-checked at the
// libnfc_nci level. Reader mode uses a direct callback and handles each tag
// detection independently, bypassing the tag-handle lifecycle.
const buildRequestTechnologyOptions = () => {
  const base = {
    alertMessage: 'Hold near your Chainora card',
  };

  if (Platform.OS === 'android') {
    return {
      ...base,
      isReaderModeEnabled: true,
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A
        | NfcAdapter.FLAG_READER_NFC_B
        | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
        | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
      readerModeDelay: 250,
    };
  }

  return base;
};

const requestIsoDepWithTimeout = async (timeoutMs: number, attempt: number): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let discoverTagFiredAt: number | null = null;

  // Diagnostic listener — fires when the native layer sees a tag even if the
  // techRequest.connect() path does not invoke its pending callback.
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: unknown) => {
      discoverTagFiredAt = Date.now();
      console.log(`[NFC] diagnostic DiscoverTag fired during attempt ${attempt}`, tag);
    });
  } catch (listenerError) {
    console.warn('[NFC] could not attach DiscoverTag diagnostic listener', listenerError);
  }

  const startedAt = Date.now();

  try {
    await Promise.race([
      NfcManager.requestTechnology(NfcTech.IsoDep, buildRequestTechnologyOptions()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const hint =
            discoverTagFiredAt !== null
              ? ` (tag WAS discovered natively at +${discoverTagFiredAt - startedAt}ms but JS callback never resolved — native state may be stuck)`
              : ' (no DiscoverTag event — reader mode may not be armed)';
          reject(new Error(`requestTechnology hung — no tag detected within timeout.${hint}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    } catch (cleanupError) {
      // ignore
    }
  }
};

const acquireIsoDep = async (): Promise<void> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RESET_ATTEMPTS; attempt += 1) {
    try {
      await requestIsoDepWithTimeout(READER_MODE_HANG_TIMEOUT_MS, attempt);
      try {
        Vibration.vibrate(40);
      } catch {
        // best-effort; never fail the NFC flow because of haptic
      }
      return;
    } catch (error) {
      lastError = error;

      // Aggressive reset before next attempt — cancel any pending session,
      // unregister foreground dispatch/reader-mode registration entirely,
      // clear listeners, and re-initialise the NFC manager so reader mode
      // can be re-armed from a known-good state.
      await safeCancelTechnology();
      await safeUnregisterTagEvent();
      clearAllNfcListeners();
      await sleep(500 + 200 * attempt);
      try {
        await NfcManager.start();
      } catch {
        // ignore; next attempt will surface any persistent failure
      }
      await sleep(250);
    }
  }

  console.warn('[NFC] acquireIsoDep: all attempts failed', lastError);
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to acquire IsoDep after multiple attempts.');
};

export const withIsoDep = async <T>(callback: IsoDepSession<T>): Promise<T> => {
  // Ensure NFC manager is initialised even if caller screen hook is not ready yet.
  await NfcManager.start();
  await safeCancelTechnology();
  await safeUnregisterTagEvent();
  clearAllNfcListeners();
  // Wait for any pending UI interactions (modal transitions, keyboard
  // dismissals, state commits) to settle before enabling reader mode.
  // On Android, enabling reader mode while the UI is mid-transition can
  // result in the callback being registered against a paused Activity,
  // which silently swallows tag events.
  await new Promise<void>(resolve => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  // Give Android a short window to finish tearing down any prior reader mode
  // session before re-enabling it. Without this pause the second call to
  // requestTechnology in the same app session can hang on some devices.
  await sleep(500);
  await acquireIsoDep();

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

const normaliseResponse = (response: Uint8Array | number[]): Uint8Array => {
  return response instanceof Uint8Array ? response : Uint8Array.from(response);
};
