import { useCallback, useEffect, useRef, useState } from 'react';

import type { NetworkConfig } from '@config/network';
import {
  buildPortfolioAssetSnapshot,
  sortPortfolioAssets,
  type PortfolioAssetSnapshot,
} from '@utils/homePortfolio';
import { fetchWalletBalance } from '@services/balanceService';
import { getUsdPriceForNetwork } from '@services/priceService';
import { buildAssetSignature } from '@utils/homeSignatures';

type UseHomePortfolioPollingArgs = {
  ethAddress: string;
  isAppActive: boolean;
  isFocused: boolean;
  networks: NetworkConfig[];
  pollIntervalMs: number;
};

type UseHomePortfolioPollingResult = {
  assets: PortfolioAssetSnapshot[];
  assetsLoading: boolean;
  refreshPortfolio: () => Promise<void>;
};

export const useHomePortfolioPolling = ({
  ethAddress,
  isAppActive,
  isFocused,
  networks,
  pollIntervalMs,
}: UseHomePortfolioPollingArgs): UseHomePortfolioPollingResult => {
  const [assets, setAssets] = useState<PortfolioAssetSnapshot[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const mountedRef = useRef(true);
  const assetSignatureRef = useRef('');

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setAssetsIfChanged = useCallback((next: PortfolioAssetSnapshot[]) => {
    const signature = buildAssetSignature(next);
    if (assetSignatureRef.current === signature) {
      return;
    }
    assetSignatureRef.current = signature;
    setAssets(next);
  }, []);

  const refreshPortfolio = useCallback(async () => {
    if (networks.length === 0) {
      setAssetsIfChanged([]);
      return;
    }

    setAssetsLoading(true);
    try {
      const nextAssets = await Promise.all(
        networks.map(async network => {
          const [balanceResult, priceResult] = await Promise.allSettled([
            fetchWalletBalance(ethAddress, network),
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

          const message =
            balanceResult.reason instanceof Error
              ? balanceResult.reason.message
              : String(balanceResult.reason);
          return buildPortfolioAssetSnapshot({
            network,
            balanceFormatted: '0.0000',
            usdPrice: priceQuote.usdPrice,
            priceUnavailable: !priceQuote.available,
            error: message,
          });
        }),
      );

      if (mountedRef.current) {
        setAssetsIfChanged(sortPortfolioAssets(nextAssets));
      }
    } catch (error) {
      console.warn('[Home] Failed to refresh portfolio', error);
    } finally {
      if (mountedRef.current) {
        setAssetsLoading(false);
      }
    }
  }, [ethAddress, networks, setAssetsIfChanged]);

  useEffect(() => {
    refreshPortfolio().catch(error => {
      console.warn('[Home] Initial portfolio refresh failed', error);
    });
  }, [refreshPortfolio]);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const balanceIntervalId = setInterval(() => {
      refreshPortfolio().catch(error => {
        console.warn('[Home] Interval portfolio refresh failed', error);
      });
    }, pollIntervalMs);

    return () => {
      clearInterval(balanceIntervalId);
    };
  }, [isAppActive, isFocused, pollIntervalMs, refreshPortfolio]);

  return { assets, assetsLoading, refreshPortfolio };
};
