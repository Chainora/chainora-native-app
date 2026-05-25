import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import { DISPLAY_FONT_MEDIUM, MONO_FONT } from '../components/ui/walletDesign';
import { useSettings } from '../features/settings';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';
import { ROUTES } from '../navigation/routes/routes';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.QRScanner>;

const FRAME_SIZE = 220;

const QRScannerScreen: React.FC<Props> = ({ navigation }) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { t } = useSettings();
  const styles = useMemo(() => createStyles(), []);

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
    Alert.alert(
      t('qrCameraPermissionTitle'),
      t('qrCameraPermissionMessage'),
      [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('scanOpenSettings'),
          onPress: () => {
            Linking.openSettings().catch(() => {
              Alert.alert(t('qrErrorTitle'), t('qrErrorOpenSettings'));
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        {hasPermission && device ? (
          <View style={styles.cameraWrap}>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive />
            <View style={styles.cameraDim} />

            <View style={styles.topBar}>
              <Pressable style={styles.iconButton} onPress={() => navigation.goBack()}>
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
                  <Text style={styles.fallbackButtonText}>{t('qrGrantCameraPermission')}</Text>
                </Pressable>
                {permissionBlocked ? <Text style={styles.fallbackNote}>{t('qrPermissionDeniedNote')}</Text> : null}
              </>
            ) : (
              <Text style={styles.fallbackNote}>{t('qrNoCameraDevice')}</Text>
            )}

            <Pressable style={[styles.fallbackButton, styles.fallbackGhost]} onPress={() => navigation.goBack()}>
              <Text style={styles.fallbackButtonText}>{t('commonBack')}</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000000',
    },
    cameraWrap: {
      flex: 1,
    },
    cameraDim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.16)',
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    topTitleWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 16,
      alignItems: 'center',
    },
    topTitle: {
      color: '#EAF0FB',
      fontFamily: DISPLAY_FONT_MEDIUM,
      fontSize: 17,
      letterSpacing: -0.4,
    },
    frameLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanFrame: {
      width: FRAME_SIZE,
      height: FRAME_SIZE,
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderWidth: 6,
      borderColor: '#EAF0FB',
      borderRadius: 14,
    },
    topLeft: {
      top: 0,
      left: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 0,
    },
    topRight: {
      top: 0,
      right: 0,
      borderLeftWidth: 0,
      borderBottomWidth: 0,
      borderTopLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    bottomLeft: {
      bottom: 0,
      left: 0,
      borderRightWidth: 0,
      borderTopWidth: 0,
      borderTopLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    bottomRight: {
      bottom: 0,
      right: 0,
      borderLeftWidth: 0,
      borderTopWidth: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 0,
    },
    hintRow: {
      position: 'absolute',
      bottom: 130,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    hintDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#2897FF',
      shadowColor: '#2897FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 8,
      elevation: 3,
    },
    hintText: {
      color: '#A7B6CD',
      fontFamily: MONO_FONT,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    flashButton: {
      position: 'absolute',
      right: 18,
      bottom: 60,
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackWrap: {
      flex: 1,
      paddingHorizontal: 22,
      justifyContent: 'center',
      gap: 12,
    },
    fallbackTitle: {
      color: '#EAF0FB',
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    fallbackSub: {
      color: '#A7B6CD',
      fontSize: 14,
      lineHeight: 20,
    },
    fallbackNote: {
      color: '#A7B6CD',
      fontSize: 13,
      lineHeight: 18,
    },
    fallbackButton: {
      height: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2F4667',
      backgroundColor: '#1B2B42',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackGhost: {
      backgroundColor: '#121A28',
      borderColor: '#233145',
    },
    fallbackButtonText: {
      color: '#EAF4FF',
      fontSize: 14,
      fontWeight: '700',
    },
  });

export default QRScannerScreen;

