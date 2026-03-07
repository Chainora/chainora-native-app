import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NfcManager from 'react-native-nfc-manager';

import { ToastType } from '../../../components/Toast';
import type { ScanMode } from '../../../components/ui/ScanDialog';
import { useAuth } from '../../auth';
import { useNfcEnabled } from './useNfcEnabled';
import { ROUTES } from '../../../navigation/routes/routes';
import type { RootStackParamList } from '../../../navigation/routes/rootStackParamList';
import type { WalletActionResult } from '../../../services/cardService';
import { resetWallet } from '../../../services/cardService';
import { NfcAlerts, NfcScanCopy, NfcToastMessages } from '../constants/messages';

export type UseNfcScanScreenParams = {
  navigation: NativeStackNavigationProp<RootStackParamList, typeof ROUTES.NfcScan>;
};

export type UseNfcScanScreenResult = {
  title: string;
  isEnabled: boolean | null;
  isScanning: boolean;
  isResetting: boolean;
  dialogVisible: boolean;
  toastMessage: string | null;
  toastVisible: boolean;
  toastType: ToastType;
  primaryLabel: string;
  resetLabel: string;
  openScanDialog: () => void;
  closeScanDialog: () => void;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: () => void;
  handleScanSuccess: (payload: { result: WalletActionResult; mode: ScanMode }) => void;
  handleScanningChange: (value: boolean) => void;
  confirmReset: () => void;
};

const initialToastState = {
  message: null as string | null,
  visible: false,
  type: 'info' as ToastType,
};

export const useNfcScanScreen = ({ navigation }: UseNfcScanScreenParams): UseNfcScanScreenResult => {
  const { isEnabled } = useNfcEnabled();
  const { initializeSession, completeSession } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [toastState, setToastState] = useState(initialToastState);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToastState({ message, type, visible: true });
  }, []);

  const dismissToast = useCallback(() => {
    setToastState(prev => ({ ...prev, visible: false, message: null }));
  }, []);

  const openNfcSettings = useCallback(() => {
    NfcManager.goToNfcSetting().catch(() => {
      showToast(NfcToastMessages.nfcSettingsFailure, 'error');
    });
  }, [showToast]);

  const promptEnableNfc = useCallback(() => {
    Alert.alert(NfcAlerts.nfcRequired.title, NfcAlerts.nfcRequired.message, [
      {
        text: NfcAlerts.nfcRequired.cancelLabel,
        style: 'cancel',
      },
      {
        text: NfcAlerts.nfcRequired.confirmLabel,
        onPress: openNfcSettings,
      },
    ]);
  }, [openNfcSettings]);

  const openScanDialog = useCallback(() => {
    if (isEnabled === false) {
      promptEnableNfc();
      return;
    }
    setDialogVisible(true);
  }, [isEnabled, promptEnableNfc]);

  const closeScanDialog = useCallback(() => {
    setDialogVisible(false);
  }, []);

  const handleScanSuccess = useCallback(
    async ({ result, mode }: { result: WalletActionResult; mode: ScanMode }) => {
      setDialogVisible(false);

      if (!result.ethAddress) {
        showToast(NfcToastMessages.addressDeriveFailure, 'error');
        return;
      }

      try {
        await initializeSession(result.ethAddress);
        await completeSession();
        showToast('Authenticated via card scan.', 'success');
      } catch (authError) {
        const message = authError instanceof Error ? authError.message : String(authError);
        showToast(message, 'error');
        return;
      }

      if (mode === 'signin') {
        navigation.reset({
          index: 1,
          routes: [
            { name: ROUTES.NfcScan },
            {
              name: ROUTES.Home,
              params: {
                ethAddress: result.ethAddress,
                publicKeyHex: result.publicKeyHex,
                mode,
              },
            },
          ],
        });
        return;
      }

      // Init flow → show activation success screen first
      navigation.reset({
        index: 1,
        routes: [
          { name: ROUTES.NfcScan },
          {
            name: ROUTES.ActivateSuccess,
            params: {
              ethAddress: result.ethAddress,
              publicKeyHex: result.publicKeyHex,
              mode,
            },
          },
        ],
      });
    },
    [navigation, showToast, initializeSession, completeSession],
  );

  const performReset = useCallback(async () => {
    if (isEnabled === false) {
      promptEnableNfc();
      return;
    }

    setDialogVisible(false);
    setIsResetting(true);
    try {
      const result = await resetWallet();
      if (result.ok) {
        showToast(result.message, 'success');
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`${NfcToastMessages.resetFailurePrefix}${message}`, 'error');
    } finally {
      setIsResetting(false);
    }
  }, [isEnabled, promptEnableNfc, showToast]);

  const confirmReset = useCallback(() => {
    if (isResetting) {
      return;
    }

    Alert.alert(NfcAlerts.resetConfirmation.title, NfcAlerts.resetConfirmation.message, [
      { text: NfcAlerts.resetConfirmation.cancelLabel, style: 'cancel' },
      {
        text: NfcAlerts.resetConfirmation.confirmLabel,
        style: 'destructive',
        onPress: performReset,
      },
    ]);
  }, [isResetting, performReset]);

  const primaryLabel = useMemo(
    () => (isScanning ? NfcScanCopy.scanningLabel : NfcScanCopy.scanButton),
    [isScanning],
  );

  const resetLabel = useMemo(
    () => (isResetting ? NfcScanCopy.resettingLabel : NfcScanCopy.resetButton),
    [isResetting],
  );

  return {
    title: NfcScanCopy.title,
    isEnabled,
    isScanning,
    isResetting,
    dialogVisible,
    toastMessage: toastState.message,
    toastVisible: toastState.visible,
    toastType: toastState.type,
    primaryLabel,
    resetLabel,
    openScanDialog,
    closeScanDialog,
    showToast,
    dismissToast,
    handleScanSuccess,
    handleScanningChange: setIsScanning,
    confirmReset,
  };
};
