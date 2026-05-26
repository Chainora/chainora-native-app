import { useEffect, useMemo, useState } from 'react';

import {
  getWalletHomeNetworkKeys,
  getWalletHomeNetworks,
  subscribeNetworkRegistry,
  type NetworkConfig,
  type WalletHomeNetworkKey,
} from '../../config/network';

export const useWalletHomeNetworks = (): NetworkConfig[] => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeNetworkRegistry(() => {
      setVersion(prev => prev + 1);
    });
  }, []);

  return useMemo(() => getWalletHomeNetworks(), [version]);
};

export const useWalletHomeNetworkKeys = (): WalletHomeNetworkKey[] => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeNetworkRegistry(() => {
      setVersion(prev => prev + 1);
    });
  }, []);

  return useMemo(() => getWalletHomeNetworkKeys(), [version]);
};
