import type { PortfolioAssetSnapshot } from '../../../features/wallet/homePortfolio';
import type { RecentActivity } from '../../../features/wallet/recentActivityStorage';

export const buildAssetSignature = (assets: PortfolioAssetSnapshot[]) =>
  assets
    .map(asset => `${asset.network.key}:${asset.balanceFormatted}:${asset.usdValue}:${asset.error ?? ''}:${asset.priceUnavailable ? '1' : '0'}`)
    .join('|');

export const buildActivitySignature = (items: RecentActivity[]) => items.map(item => item.id).join('|');
