import type { NetworkConfig } from '../config/network';

export type NetworkPriceQuote = {
  usdPrice: number;
  available: boolean;
  symbol?: string;
};

const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price';
const PRICE_TTL_MS = 30_000;

const cache = new Map<string, { value: number; expiresAt: number }>();
const inFlight = new Map<string, Promise<number | null>>();

const normalizeSymbol = (value: string): string => value.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();

const readCachedPrice = (symbol: string): number | null => {
  const cached = cache.get(symbol);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    cache.delete(symbol);
    return null;
  }

  return cached.value;
};

const fetchBinanceTickerPrice = async (symbol: string): Promise<number | null> => {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    return null;
  }

  const cached = readCachedPrice(normalizedSymbol);
  if (cached !== null) {
    return cached;
  }

  const pending = inFlight.get(normalizedSymbol);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const response = await fetch(`${BINANCE_TICKER_URL}?symbol=${encodeURIComponent(normalizedSymbol)}`);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { price?: string };
      const price = Number.parseFloat(payload.price ?? '');
      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }

      cache.set(normalizedSymbol, {
        value: price,
        expiresAt: Date.now() + PRICE_TTL_MS,
      });

      return price;
    } catch {
      return null;
    } finally {
      inFlight.delete(normalizedSymbol);
    }
  })();

  inFlight.set(normalizedSymbol, request);
  return request;
};

const getBinanceSymbolCandidates = (network: NetworkConfig): string[] => {
  if (network.priceTickerSymbol) {
    return [network.priceTickerSymbol];
  }

  switch (network.key) {
    case 'ethMainnet':
      return ['ETHUSDT'];
    case 'bscMainnet':
      return ['BNBUSDT'];
    case 'polygonMainnet':
      return ['POLUSDT', 'MATICUSDT'];
    default: {
      const normalized = normalizeSymbol(network.currencySymbol);
      if (!normalized) {
        return [];
      }
      return [`${normalized}USDT`];
    }
  }
};

export const getUsdPriceForNetwork = async (network: NetworkConfig): Promise<NetworkPriceQuote> => {
  const candidates = getBinanceSymbolCandidates(network);

  for (const symbol of candidates) {
    const price = await fetchBinanceTickerPrice(symbol);
    if (price !== null) {
      return {
        usdPrice: price,
        available: true,
        symbol,
      };
    }
  }

  return {
    usdPrice: 0,
    available: false,
  };
};

export const clearNetworkPriceCache = (): void => {
  cache.clear();
  inFlight.clear();
};
