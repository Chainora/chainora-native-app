import { useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import NfcManager from 'react-native-nfc-manager';

import type { LocaleKey } from '../../../locales';
import type { ToastType } from '../../../components/Toast';

type TranslateFn = (key: LocaleKey) => string;

type UseScanCardNfcLifecycleArgs = {
  isNfcEnabled: boolean | null;
  showToast: (message: string, type: ToastType) => void;
  shakeDialog: () => void;
  t: TranslateFn;
};

type UseScanCardNfcLifecycleResult = {
  ensureNfcReady: () => Promise<boolean>;
};

export const useScanCardNfcLifecycle = ({
  isNfcEnabled,
  showToast,
  shakeDialog,
  t,
}: UseScanCardNfcLifecycleArgs): UseScanCardNfcLifecycleResult => {
  const openNfcSettings = useCallback(async () => {
    try {
      const manager = NfcManager as unknown as { goToNfcSetting?: () => Promise<void> };
      if (manager.goToNfcSetting) {
        await manager.goToNfcSetting();
        return;
      }
      await Linking.openSettings();
    } catch {
      showToast(t('scanOpenSettingsFail'), 'error');
    }
  }, [showToast, t]);

  const ensureNfcReady = useCallback(async () => {
    let currentNfcEnabled = isNfcEnabled;
    if (currentNfcEnabled !== true) {
      try {
        currentNfcEnabled = await NfcManager.isEnabled();
      } catch {
        currentNfcEnabled = isNfcEnabled;
      }
    }

    if (currentNfcEnabled !== false) {
      return true;
    }

    Alert.alert(t('scanNfcDisabledTitle'), t('scanNfcDisabledMessage'), [
      {
        text: t('scanOpenSettings'),
        onPress: () => {
          openNfcSettings().catch(() => undefined);
        },
      },
    ]);
    showToast(t('scanToastNfcDisabled'), 'error');
    shakeDialog();
    return false;
  }, [isNfcEnabled, openNfcSettings, shakeDialog, showToast, t]);

  return { ensureNfcReady };
};
