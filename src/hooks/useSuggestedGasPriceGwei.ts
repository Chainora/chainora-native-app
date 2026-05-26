import { useEffect, useState } from 'react';

import type { NetworkConfig } from '@config/network';
import { fetchSuggestedGasPriceWei } from '@services/transactionService';
import { formatGweiFromWei } from '@utils/sendFlowUtils';

export const useSuggestedGasPriceGwei = (network: NetworkConfig): string => {
  const [gasPriceGwei, setGasPriceGwei] = useState('');

  useEffect(() => {
    let mounted = true;

    fetchSuggestedGasPriceWei(network)
      .then(value => {
        if (mounted) {
          setGasPriceGwei(formatGweiFromWei(value));
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [network]);

  return gasPriceGwei;
};
