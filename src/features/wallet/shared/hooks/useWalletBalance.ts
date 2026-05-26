import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NetworkConfig } from '../../../../config/network';
import { fetchWalletBalance } from '../../../../services/balanceService';

export type WalletBalanceState = {
  formatted: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export const useWalletBalance = (
  address: string | undefined | null,
  network?: NetworkConfig,
): WalletBalanceState => {
  const [formatted, setFormatted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);
  const inFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  useEffect(() => {
    if (!address) {
      setFormatted(null);
      return;
    }

    let isMounted = true;
    const readBalance = async () => {
      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchWalletBalance(address, network);
        if (isMounted) {
          setFormatted(prev => (prev === result.formatted ? prev : result.formatted));
        }
      } catch (balanceError) {
        if (isMounted) {
          const message = balanceError instanceof Error ? balanceError.message : String(balanceError);
          setError(prev => (prev === message ? prev : message));
        }
      } finally {
        inFlightRef.current = false;
        if (isMounted) {
          setLoading(false);
          if (queuedRefreshRef.current) {
            queuedRefreshRef.current = false;
            setRequestId(prev => prev + 1);
          }
        }
      }
    };

    readBalance();

    return () => {
      isMounted = false;
    };
  }, [address, network, requestId]);

  const refresh = useCallback(() => {
    if (inFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }
    setRequestId(prev => prev + 1);
  }, []);

  return useMemo(() => ({ formatted, loading, error, refresh }), [formatted, loading, error, refresh]);
};
