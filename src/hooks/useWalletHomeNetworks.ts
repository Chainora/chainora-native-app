import { useEffect, useMemo, useState } from 'react';

import {
  getWalletHomeNetworkKeys,
  getWalletHomeNetworks,
  subscribeNetworkRegistry,
  type NetworkConfig,
  type WalletHomeNetworkKey,
} from '@config/network';

const useNetworkRegistryVersion = (): number => {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeNetworkRegistry(() => {
      setVersion(prev => prev + 1);
    });
  }, []);

  return version;
};

const readWalletHomeNetworks = (_version: number): NetworkConfig[] =>
  getWalletHomeNetworks();

const readWalletHomeNetworkKeys = (_version: number): WalletHomeNetworkKey[] =>
  getWalletHomeNetworkKeys();

export const useWalletHomeNetworks = (): NetworkConfig[] => {
  const version = useNetworkRegistryVersion();

  return useMemo(() => readWalletHomeNetworks(version), [version]);
};

export const useWalletHomeNetworkKeys = (): WalletHomeNetworkKey[] => {
  const version = useNetworkRegistryVersion();

  return useMemo(() => readWalletHomeNetworkKeys(version), [version]);
};
