import type { PortfolioAssetSnapshot } from '@utils/homePortfolio';
import type { RecentActivity } from '@app-types/wallet';

export const buildAssetSignature = (assets: PortfolioAssetSnapshot[]) =>
  assets
    .map(asset => `${asset.network.key}:${asset.balanceFormatted}:${asset.usdValue}:${asset.error ?? ''}:${asset.priceUnavailable ? '1' : '0'}`)
    .join('|');

export const buildActivitySignature = (items: RecentActivity[]) => items.map(item => item.id).join('|');
