import { useCallback } from 'react';

import {
  detectChainIdFromRpc,
  saveImportedNetwork,
} from '@services/storage/importedNetworkStorage';

type ImportedNetworkSaveInput = {
  name: string;
  rpcUrl: string;
  currencySymbol: string;
};

export const useImportedNetworkSaver = () =>
  useCallback(async ({ currencySymbol, name, rpcUrl }: ImportedNetworkSaveInput) => {
    const chainId = await detectChainIdFromRpc(rpcUrl);
    return saveImportedNetwork({
      name,
      rpcUrl,
      currencySymbol,
      chainId,
    });
  }, []);
