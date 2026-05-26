import type { PortfolioAssetSnapshot } from './homePortfolio';
import type { RecentActivity } from '../../storage/recentActivityStorage';

export const buildAssetSignature = (assets: PortfolioAssetSnapshot[]) =>
  assets
    .map(asset => `${asset.network.key}:${asset.balanceFormatted}:${asset.usdValue}:${asset.error ?? ''}:${asset.priceUnavailable ? '1' : '0'}`)
    .join('|');

export const buildActivitySignature = (items: RecentActivity[]) => items.map(item => item.id).join('|');
