import {
  buildPortfolioAssetSnapshot,
  calculatePortfolioDayChange,
  formatUsdValue,
  formatSignedPercentDelta,
  formatSignedUsdDelta,
  mergePortfolioActivities,
  sortPortfolioAssets,
  sumPortfolioUsdValue,
} from './homePortfolio';
import { NETWORKS } from '../../config/network';
import type { RecentActivity } from './recentActivityStorage';

describe('homePortfolio', () => {
  it('sorts assets by usd value descending', () => {
    const assets = sortPortfolioAssets([
      buildPortfolioAssetSnapshot({ network: NETWORKS.polygonMainnet, balanceFormatted: '100.0000' }),
      buildPortfolioAssetSnapshot({ network: NETWORKS.ethMainnet, balanceFormatted: '1.2500' }),
      buildPortfolioAssetSnapshot({ network: NETWORKS.bscMainnet, balanceFormatted: '0.5000' }),
    ]);

    expect(assets.map(asset => asset.network.key)).toEqual([
      'ethMainnet',
      'bscMainnet',
      'polygonMainnet',
    ]);
  });

  it('sums portfolio totals from all chains', () => {
    const assets = [
      buildPortfolioAssetSnapshot({ network: NETWORKS.ethMainnet, balanceFormatted: '1.0000' }),
      buildPortfolioAssetSnapshot({ network: NETWORKS.baseMainnet, balanceFormatted: '0.5000' }),
    ];

    expect(sumPortfolioUsdValue(assets)).toBeCloseTo(5247.36, 2);
  });

  it('merges activities newest first', () => {
    const activities: RecentActivity[] = [
      {
        id: '1',
        walletAddress: '0x1',
        networkKey: 'ethMainnet',
        kind: 'send',
        transactionHash: '0xabc',
        fromAddress: '0x1',
        toAddress: '0x2',
        amountDisplay: '0.1',
        currencySymbol: 'ETH',
        networkName: 'Ethereum',
        createdAt: '2026-05-20T10:00:00.000Z',
      },
      {
        id: '2',
        walletAddress: '0x1',
        networkKey: 'baseMainnet',
        kind: 'receive',
        transactionHash: '0xdef',
        fromAddress: '0x2',
        toAddress: '0x1',
        amountDisplay: '0.2',
        currencySymbol: 'ETH',
        networkName: 'Base',
        createdAt: '2026-05-21T10:00:00.000Z',
      },
    ];

    expect(mergePortfolioActivities(activities).map(item => item.id)).toEqual(['2', '1']);
  });

  it('formats usd values consistently', () => {
    expect(formatUsdValue(1234.567)).toBe('$1,234.57');
  });

  it('calculates day-over-day delta from the previous snapshot', () => {
    expect(calculatePortfolioDayChange(120, 100)).toEqual({
      amountUsd: 20,
      percent: 20,
      direction: 'up',
    });
  });

  it('formats signed delta labels', () => {
    expect(formatSignedUsdDelta(-24.5)).toBe('-$24.50');
    expect(formatSignedPercentDelta(3.456)).toBe('+3.46%');
  });
});
