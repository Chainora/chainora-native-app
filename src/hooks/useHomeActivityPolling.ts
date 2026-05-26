import { useCallback, useEffect, useRef, useState } from 'react';

import type { NetworkConfig, WalletHomeNetworkKey } from '@config/network';
import { mergePortfolioActivities } from '@utils/homePortfolio';
import {
  getRecentActivitiesByWalletAcrossNetworks,
  type RecentActivity,
} from '@services/storage/recentActivityStorage';
import { syncWalletActivities } from '@services/activitySyncService';
import { buildActivitySignature } from '@utils/homeSignatures';

type UseHomeActivityPollingArgs = {
  ethAddress: string;
  isAppActive: boolean;
  isFocused: boolean;
  networkKeys: WalletHomeNetworkKey[];
  networks: NetworkConfig[];
  pollIntervalMs: number;
  syncDebounceMs: number;
};

type UseHomeActivityPollingResult = {
  activities: RecentActivity[];
  loadRecentActivity: () => Promise<void>;
  scheduleActivitySync: () => void;
};

export const useHomeActivityPolling = ({
  ethAddress,
  isAppActive,
  isFocused,
  networkKeys,
  networks,
  pollIntervalMs,
  syncDebounceMs,
}: UseHomeActivityPollingArgs): UseHomeActivityPollingResult => {
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const mountedRef = useRef(true);
  const activitySignatureRef = useRef('');
  const activityInFlightRef = useRef(false);
  const activityQueuedRef = useRef(false);
  const activitySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (activitySyncTimerRef.current) {
        clearTimeout(activitySyncTimerRef.current);
      }
    };
  }, []);

  const setActivitiesIfChanged = useCallback((next: RecentActivity[]) => {
    const signature = buildActivitySignature(next);
    if (activitySignatureRef.current === signature) {
      return;
    }
    activitySignatureRef.current = signature;
    setActivities(next);
  }, []);

  const loadRecentActivity = useCallback(async () => {
    if (activityInFlightRef.current) {
      activityQueuedRef.current = true;
      return;
    }

    activityInFlightRef.current = true;
    try {
      const cached = await getRecentActivitiesByWalletAcrossNetworks(ethAddress, networkKeys);
      if (mountedRef.current) {
        setActivitiesIfChanged(mergePortfolioActivities(cached));
      }

      await Promise.allSettled(networks.map(network => syncWalletActivities(ethAddress, network)));
      const next = await getRecentActivitiesByWalletAcrossNetworks(ethAddress, networkKeys);
      if (mountedRef.current) {
        setActivitiesIfChanged(mergePortfolioActivities(next));
      }
    } catch (error) {
      console.warn('[Home] Failed to load recent activity', error);
    } finally {
      activityInFlightRef.current = false;
      if (activityQueuedRef.current) {
        activityQueuedRef.current = false;
        setTimeout(() => {
          loadRecentActivity().catch(nextError => {
            console.warn('[Home] Queued activity sync failed', nextError);
          });
        }, 0);
      }
    }
  }, [ethAddress, networkKeys, networks, setActivitiesIfChanged]);

  const scheduleActivitySync = useCallback(() => {
    if (activitySyncTimerRef.current) {
      clearTimeout(activitySyncTimerRef.current);
    }
    activitySyncTimerRef.current = setTimeout(() => {
      loadRecentActivity().catch(error => {
        console.warn('[Home] Scheduled activity sync failed', error);
      });
    }, syncDebounceMs);
  }, [loadRecentActivity, syncDebounceMs]);

  useEffect(() => {
    loadRecentActivity().catch(error => {
      console.warn('[Home] Initial activity refresh failed', error);
    });
  }, [loadRecentActivity]);

  useEffect(() => {
    if (!isFocused || !isAppActive) {
      return;
    }

    const activityIntervalId = setInterval(() => {
      scheduleActivitySync();
    }, pollIntervalMs);

    return () => {
      clearInterval(activityIntervalId);
    };
  }, [isAppActive, isFocused, pollIntervalMs, scheduleActivitySync]);

  return { activities, loadRecentActivity, scheduleActivitySync };
};
