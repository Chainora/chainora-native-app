import { useEffect, useState } from 'react';

import {
  getWalletHomeNetworkKeys,
  getWalletHomeNetworks,
  subscribeNetworkRegistry,
  type NetworkConfig,
  type WalletHomeNetworkKey,
} from '@config/network';

export const useWalletHomeNetworks = (): NetworkConfig[] => {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribeNetworkRegistry(() => {
      setVersion(prev => prev + 1);
    });
  }, []);

  return getWalletHomeNetworks();
};

export const useWalletHomeNetworkKeys = (): WalletHomeNetworkKey[] => {
  const [, setVersion] = useState(0);

  useEffect(() => {
    return subscribeNetworkRegistry(() => {
      setVersion(prev => prev + 1);
    });
  }, []);

  return getWalletHomeNetworkKeys();
};
