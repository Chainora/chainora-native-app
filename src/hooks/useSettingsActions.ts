import { useCallback } from 'react';
import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ROUTES } from '@navigation/routes/routes';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { clearActivitySyncState } from '@services/activitySyncService';
import { clearRecentActivities } from '@services/storage/recentActivityStorage';
import { useAuth } from '@hooks/useAuth';
import { useSettings } from '@hooks/useSettings';

type SettingsNavigation = NativeStackNavigationProp<RootStackParamList, typeof ROUTES.Settings>;

export const useSettingsActions = (navigation: SettingsNavigation) => {
  const { clearSession } = useAuth();
  const { t } = useSettings();

  const handleLogout = useCallback(() => {
    Alert.alert(t('settingsLogoutAlertTitle'), t('settingsLogoutAlertMessage'), [
      { text: t('commonCancel'), style: 'cancel' },
      {
        text: t('settingsLogoutTitle'),
        style: 'destructive',
        onPress: () => {
          clearSession()
            .then(() => {
              navigation.reset({
                index: 0,
                routes: [{ name: ROUTES.Welcome }],
              });
            })
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              Alert.alert(t('settingsLogoutFailedTitle'), message);
            });
        },
      },
    ]);
  }, [clearSession, navigation, t]);

  const handleDeleteCache = useCallback(() => {
    Alert.alert(t('settingsDeleteCacheAlertTitle'), t('settingsDeleteCacheAlertMessage'), [
      { text: t('commonCancel'), style: 'cancel' },
      {
        text: t('settingsDeleteCacheTitle'),
        style: 'destructive',
        onPress: () => {
          Promise.all([clearRecentActivities(), clearActivitySyncState()])
            .then(() => {
              Alert.alert(t('settingsDeleteCacheSuccessTitle'), t('settingsDeleteCacheSuccessMessage'));
            })
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              Alert.alert(t('settingsDeleteCacheFailedTitle'), message);
            });
        },
      },
    ]);
  }, [t]);

  return { handleDeleteCache, handleLogout };
};
