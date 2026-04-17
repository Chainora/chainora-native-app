import { useEffect, useState } from 'react';
import NfcManager, { NfcEvents } from 'react-native-nfc-manager';

type StateChangedEvent = {
  state: string;
};

export const useNfcEnabled = () => {
  const [isSupported, setSupported] = useState<boolean | null>(null);
  const [isEnabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const isStateEnabled = (state: string | null | undefined): boolean => {
      const normalized = String(state ?? '').trim().toLowerCase();
      return normalized === 'on' || normalized === 'enabled';
    };

    const handleStateChange = (state: string) => {
      if (!isMounted) {
        return;
      }
      const enabled = isStateEnabled(state);
      setEnabled(enabled);
      if (enabled) {
        setError(null);
      }
    };

    const attachStateListener = () => {
      NfcManager.setEventListener(NfcEvents.StateChanged, (event: StateChangedEvent) => {
        handleStateChange(event.state);
      });
    };

    const detachStateListener = () => {
      NfcManager.setEventListener(NfcEvents.StateChanged, null);
    };

    const initialise = async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (!isMounted) {
          return;
        }

        setSupported(supported);
        if (!supported) {
          setEnabled(false);
          setError('NFC is not supported on this device');
          return;
        }

        await NfcManager.start();
        if (!isMounted) {
          return;
        }

        setError(null);

        attachStateListener();

        const enabled = await NfcManager.isEnabled();
        if (isMounted) {
          setEnabled(enabled);
          if (enabled) {
            setError(null);
          }
        }
      } catch (initialiseError) {
        if (!isMounted) {
          return;
        }
        setSupported(false);
        setEnabled(false);
        const details = initialiseError instanceof Error ? initialiseError.message : null;
        setError(
          details ? `NFC is not available on this device (${details})` : 'NFC is not available on this device',
        );
      }
    };

    initialise();

    return () => {
      isMounted = false;
      detachStateListener();
    };
  }, []);

  return {
    isSupported,
    isEnabled,
    error,
  };
};
