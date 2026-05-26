import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  Camera,
  useCodeScanner,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import {
  getNetworkConfig,
  getNetworkConfigByChainId,
  type WalletHomeNetworkKey,
} from '@config/network';
import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { parseReceiveQrPayload } from '@utils/evmQr';
import { QR_SCANNER_BACKGROUND, styles } from './QRScanner.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.QRScanner
>;

const QRScannerScreen: React.FC<Props> = ({ navigation, route }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { t } = useSettings();
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const scanHandledRef = useRef(false);
  const { walletAddress, publicKeyHex, fallbackChainKey } = route.params ?? {};

  useEffect(() => {
    const status = Camera.getCameraPermissionStatus();
    setPermissionBlocked(status === 'denied' || status === 'restricted');
  }, []);

  const requestCameraPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      setPermissionBlocked(false);
      return;
    }

    setPermissionBlocked(true);
    Alert.alert(t('qrCameraPermissionTitle'), t('qrCameraPermissionMessage'), [
      { text: t('commonCancel'), style: 'cancel' },
      {
        text: t('scanOpenSettings'),
        onPress: () => {
          Linking.openSettings().catch(() => {
            Alert.alert(t('qrErrorTitle'), t('qrErrorOpenSettings'));
          });
        },
      },
    ]);
  };

  const getFallbackChainKey = useCallback((): WalletHomeNetworkKey | null => {
    if (!fallbackChainKey) {
      return null;
    }

    try {
      return getNetworkConfig(fallbackChainKey).key as WalletHomeNetworkKey;
    } catch {
      return null;
    }
  }, [fallbackChainKey]);

  const handleScannedPayload = useCallback(
    (payload: string) => {
      if (scanHandledRef.current || !walletAddress) {
        return;
      }

      const parsed = parseReceiveQrPayload(payload);
      if (!parsed) {
        return;
      }

      const network = parsed.chainId
        ? getNetworkConfigByChainId(parsed.chainId)
        : null;
      const chainKey =
        network?.key ?? (parsed.chainId ? null : getFallbackChainKey());

      if (!chainKey) {
        scanHandledRef.current = true;
        Alert.alert(t('qrErrorTitle'), t('qrErrorUnsupportedReceiveNetwork'), [
          {
            text: t('commonDone'),
            onPress: () => {
              scanHandledRef.current = false;
            },
          },
        ]);
        return;
      }

      scanHandledRef.current = true;
      navigation.replace(ROUTES.Send, {
        walletAddress,
        publicKeyHex,
        chainKey: chainKey as WalletHomeNetworkKey,
        initialRecipient: parsed.address,
      });
    },
    [getFallbackChainKey, navigation, publicKeyHex, t, walletAddress],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes.find(code => code.value)?.value;
      if (value) {
        handleScannedPayload(value);
      }
    },
  });

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={QR_SCANNER_BACKGROUND}
      />

      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {hasPermission && device ? (
          <View style={styles.cameraWrap}>
            <Camera
              style={styles.camera}
              device={device}
              isActive
              codeScanner={codeScanner}
            />
            <View style={styles.cameraDim} />

            <View style={styles.topBar}>
              <Pressable
                style={styles.iconButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="chevron-back" size={22} color="#EAF0FB" />
              </Pressable>

              <View pointerEvents="none" style={styles.topTitleWrap}>
                <Text style={styles.topTitle}>{t('qrHeaderTitle')}</Text>
              </View>

              <View style={styles.rightGroup}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => undefined}
                  accessibilityLabel={t('qrTopImageAction')}
                >
                  <Ionicons name="image-outline" size={20} color="#EAF0FB" />
                </Pressable>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => undefined}
                  accessibilityLabel={t('qrTopEditAction')}
                >
                  <Ionicons name="create-outline" size={20} color="#EAF0FB" />
                </Pressable>
              </View>
            </View>

            <View style={styles.frameLayer} pointerEvents="none">
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>

              <View style={styles.hintRow}>
                <View style={styles.hintDot} />
                <Text style={styles.hintText}>{t('qrMonoHint')}</Text>
              </View>
            </View>

            <Pressable
              style={styles.flashButton}
              onPress={() => undefined}
              accessibilityLabel={t('qrFlashAction')}
            >
              <Ionicons name="flash-off-outline" size={22} color="#EAF0FB" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.fallbackWrap}>
            <Text style={styles.fallbackTitle}>{t('qrFallbackTitle')}</Text>
            <Text style={styles.fallbackSub}>{t('qrFallbackSubtitle')}</Text>

            {!hasPermission ? (
              <>
                <Pressable
                  style={styles.fallbackButton}
                  onPress={() => {
                    requestCameraPermission().catch(() => undefined);
                  }}
                >
                  <Text style={styles.fallbackButtonText}>
                    {t('qrGrantCameraPermission')}
                  </Text>
                </Pressable>
                {permissionBlocked ? (
                  <Text style={styles.fallbackNote}>
                    {t('qrPermissionDeniedNote')}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.fallbackNote}>{t('qrNoCameraDevice')}</Text>
            )}

            <Pressable
              style={[styles.fallbackButton, styles.fallbackGhost]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.fallbackButtonText}>{t('commonBack')}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

export default QRScannerScreen;
