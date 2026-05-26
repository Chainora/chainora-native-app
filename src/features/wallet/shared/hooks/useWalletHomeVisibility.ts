import { useCallback, useEffect, useState } from 'react';

import type { WalletHomeNetworkKey } from '../../../../config/network';
import {
  buildDefaultWalletHomeVisibility,
  getWalletHomeVisibility,
  setWalletHomeAssetEnabled,
} from '../../storage/walletHomePreferences';

export const useWalletHomeVisibility = (networkKeys: WalletHomeNetworkKey[]) => {
  const [visibility, setVisibility] = useState(() => buildDefaultWalletHomeVisibility(networkKeys));

  useEffect(() => {
    let mounted = true;

    getWalletHomeVisibility(networkKeys)
      .then(next => {
        if (mounted) {
          setVisibility(next);
        }
      })
      .catch(error => {
        console.warn('[WalletFlow] Failed to load visibility', error);
      });

    return () => {
      mounted = false;
    };
  }, [networkKeys]);

  const updateVisibility = useCallback(async (key: WalletHomeNetworkKey, enabled: boolean) => {
    setVisibility(prev => ({ ...prev, [key]: enabled }));
    try {
      const next = await setWalletHomeAssetEnabled(key, enabled, networkKeys);
      setVisibility(next);
    } catch (error) {
      console.warn('[WalletFlow] Failed to persist visibility', error);
    }
  }, [networkKeys]);

  return { visibility, updateVisibility };
};
