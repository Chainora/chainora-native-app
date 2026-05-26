import { useEffect, useState } from 'react';

import type { NetworkConfig } from '@config/network';
import { getUsdPriceForNetwork } from '@services/priceService';

export type NetworkPriceQuoteMap = Record<string, { usdPrice: number; available: boolean }>;

export const useNetworkPriceQuotes = (networks: NetworkConfig[]): NetworkPriceQuoteMap => {
  const [priceByNetworkKey, setPriceByNetworkKey] = useState<NetworkPriceQuoteMap>({});

  useEffect(() => {
    let mounted = true;

    Promise.all(
      networks.map(async network => ({
        networkKey: network.key,
        quote: await getUsdPriceForNetwork(network),
      })),
    )
      .then(results => {
        if (!mounted) {
          return;
        }

        const next = results.reduce<NetworkPriceQuoteMap>((result, item) => {
          result[item.networkKey] = {
            usdPrice: item.quote.usdPrice,
            available: item.quote.available,
          };
          return result;
        }, {});

        setPriceByNetworkKey(next);
      })
      .catch(error => {
        console.warn('[WalletFlow] Failed to load token prices', error);
      });

    return () => {
      mounted = false;
    };
  }, [networks]);

  return priceByNetworkKey;
};
