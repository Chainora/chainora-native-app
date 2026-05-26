import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StatusBar, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import { useSettings } from '@hooks/useSettings';
import type { RootStackParamList } from '@navigation/routes/rootStackParamList';
import { ROUTES } from '@navigation/routes/routes';
import { QR_SCANNER_BACKGROUND, styles } from './QRScanner.styles';

type Props = NativeStackScreenProps<
  RootStackParamList,
  typeof ROUTES.QRScanner
>;

const QRScannerScreen: React.FC<Props> = ({ navigation }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { t } = useSettings();
  const [permissionBlocked, setPermissionBlocked] = useState(false);

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

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={QR_SCANNER_BACKGROUND}
      />

      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {hasPermission && device ? (
          <View style={styles.cameraWrap}>
            <Camera style={styles.camera} device={device} isActive />
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
