import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchEthBalance } from '../../../services/balanceService';

export type WalletBalanceState = {
  formatted: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

export const useWalletBalance = (address: string | undefined | null): WalletBalanceState => {
  const [formatted, setFormatted] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    if (!address) {
      setFormatted(null);
      return;
    }

    let isMounted = true;
    const readBalance = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchEthBalance(address);
        if (isMounted) {
          setFormatted(result.formatted);
        }
      } catch (balanceError) {
        if (isMounted) {
          const message = balanceError instanceof Error ? balanceError.message : String(balanceError);
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    readBalance();

    return () => {
      isMounted = false;
    };
  }, [address, requestId]);

  const refresh = useCallback(() => {
    setRequestId(prev => prev + 1);
  }, []);

  return useMemo(() => ({ formatted, loading, error, refresh }), [formatted, loading, error, refresh]);
};
