import { useEffect, useState } from 'react';

import type { NetworkConfig, WalletHomeNetworkKey } from '../../../../config/network';
import { fetchWalletBalance } from '../../../../services/balanceService';
import { getUsdPriceForNetwork } from '../../../../services/priceService';
import {
  buildPortfolioAssetSnapshot,
  sortPortfolioAssets,
  type PortfolioAssetSnapshot,
} from '../utils/homePortfolio';

export const useWalletHomeAssets = (
  networks: NetworkConfig[],
  walletAddress: string,
  visibility?: Partial<Record<WalletHomeNetworkKey, boolean>>,
) => {
  const [assets, setAssets] = useState<PortfolioAssetSnapshot[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const nextAssets = await Promise.all(
        networks.map(async network => {
          const [balanceResult, priceResult] = await Promise.allSettled([
            fetchWalletBalance(walletAddress, network),
            getUsdPriceForNetwork(network),
          ]);

          const priceQuote = priceResult.status === 'fulfilled'
            ? priceResult.value
            : { usdPrice: 0, available: false };

          if (balanceResult.status === 'fulfilled') {
            return buildPortfolioAssetSnapshot({
              network,
              balanceFormatted: balanceResult.value.formatted,
              balanceWei: balanceResult.value.wei,
              usdPrice: priceQuote.usdPrice,
              priceUnavailable: !priceQuote.available,
            });
          }

          return buildPortfolioAssetSnapshot({
            network,
            balanceFormatted: '0.0000',
            usdPrice: priceQuote.usdPrice,
            priceUnavailable: !priceQuote.available,
            error:
              balanceResult.reason instanceof Error
                ? balanceResult.reason.message
                : String(balanceResult.reason),
          });
        }),
      );

      if (!mounted) {
        return;
      }

      const filteredAssets = visibility
        ? nextAssets.filter(asset => visibility[asset.network.key] !== false)
        : nextAssets;
      setAssets(sortPortfolioAssets(filteredAssets));
    };

    load().catch(error => {
      console.warn('[WalletFlow] Failed to load assets', error);
    });

    return () => {
      mounted = false;
    };
  }, [networks, visibility, walletAddress]);

  return assets;
};
