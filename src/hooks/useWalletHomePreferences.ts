import { useCallback, useEffect, useRef, useState } from 'react';

import type { WalletHomeNetworkKey } from '@config/network';
import {
  buildDefaultWalletHomeVisibility,
  getWalletHomeVisibility,
  syncPortfolioDailySnapshot,
  type WalletHomeVisibilityMap,
} from '@services/storage/walletHomePreferences';
import {
  calculatePortfolioDayChange,
  type FiatCurrency,
  formatSignedFiatDelta,
  formatSignedPercentDelta,
} from '@utils/homePortfolio';

type DayChangeLabel = {
  text: string;
  direction: 'up' | 'down' | 'flat';
};

export const useWalletHomePreferences = (networkKeys: WalletHomeNetworkKey[]) => {
  const [visibility, setVisibility] = useState<WalletHomeVisibilityMap>(() =>
    buildDefaultWalletHomeVisibility(networkKeys),
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const nextVisibility = await getWalletHomeVisibility(networkKeys);
      if (!mountedRef.current) {
        return;
      }
      setVisibility(nextVisibility);
      setPrefsReady(true);
    } catch (error) {
      console.warn('[Home] Failed to load wallet home preferences', error);
      if (mountedRef.current) {
        setPrefsReady(true);
      }
    }
  }, [networkKeys]);

  return { visibility, prefsReady, loadPreferences };
};

export const useHomePortfolioDayChange = ({
  currency,
  ethAddress,
  prefsReady,
  totalUsdValue,
}: {
  currency: FiatCurrency;
  ethAddress: string;
  prefsReady: boolean;
  totalUsdValue: number;
}): DayChangeLabel => {
  const [dayChangeLabel, setDayChangeLabel] = useState<DayChangeLabel>({
    text: `${formatSignedPercentDelta(0)} | ${formatSignedFiatDelta(0, currency)}`,
    direction: 'flat',
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!prefsReady) {
      return;
    }

    syncPortfolioDailySnapshot(ethAddress, totalUsdValue)
      .then(previousTotal => {
        if (!mountedRef.current) {
          return;
        }

        const nextDayChange = calculatePortfolioDayChange(totalUsdValue, previousTotal ?? totalUsdValue);
        setDayChangeLabel({
          text: `${formatSignedPercentDelta(nextDayChange.percent)} | ${formatSignedFiatDelta(nextDayChange.amountUsd, currency)}`,
          direction: nextDayChange.direction,
        });
      })
      .catch(error => {
        console.warn('[Home] Failed to sync portfolio snapshot', error);
      });
  }, [currency, ethAddress, prefsReady, totalUsdValue]);

  return dayChangeLabel;
};
