/// <reference types="jest" />

import { NETWORKS } from '../config/network';
import { clearNetworkPriceCache, getUsdPriceForNetwork } from './priceService';

const mockResponse = (ok: boolean, price?: string): Response => ({
  ok,
  json: async () => ({ price }),
} as Response);

describe('priceService', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    clearNetworkPriceCache();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch as typeof fetch;
  });

  it('uses ARBUSDT for arbitrum portfolio token pricing', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(true, '0.88'));

    const quote = await getUsdPriceForNetwork(NETWORKS.arbitrumMainnet);

    expect(quote).toEqual({
      usdPrice: 0.88,
      available: true,
      symbol: 'ARBUSDT',
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('symbol=ARBUSDT'));
  });

  it('uses OPUSDT for optimism portfolio token pricing', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(true, '1.52'));

    const quote = await getUsdPriceForNetwork(NETWORKS.optimismMainnet);

    expect(quote).toEqual({
      usdPrice: 1.52,
      available: true,
      symbol: 'OPUSDT',
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('symbol=OPUSDT'));
  });
});
