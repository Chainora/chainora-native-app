import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View, Animated, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Toast } from '../components/Toast';
import { AppButton } from '../components/AppButton';
import { ScanDialog } from '../components/ui/ScanDialog';
import { ScanButton } from '../components/ui/ScanButton';
import { FloatingOrb } from '../components/ui/animations/FloatingOrb';
import { useEntranceAnimation } from '../components/ui/animations/useEntranceAnimation';
import { useNfcScanScreen } from '../features/nfc/hooks/useNfcScanScreen';
import { THEME } from '../types/theme/colors';
import { ROUTES } from '../navigation/routes/routes';
import type { RootStackParamList } from '../navigation/routes/rootStackParamList';

type Props = NativeStackScreenProps<RootStackParamList, typeof ROUTES.NfcScan>;

const { width, height } = Dimensions.get('window');

export const NfcScanScreen: React.FC<Props> = ({ navigation }) => {
  const {
    title,
    isEnabled,
    isScanning,
    isResetting,
    dialogVisible,
    toastMessage,
    toastVisible,
    toastType,
    primaryLabel,
    resetLabel,
    openScanDialog,
    closeScanDialog,
    showToast,
    dismissToast,
    handleScanSuccess,
    handleScanningChange,
    confirmReset,
  } = useNfcScanScreen({ navigation });

  const { animatedStyle: introAnimation } = useEntranceAnimation({ translateInitial: 30, fadeDuration: 800 });

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Ambient Background */}
      <View style={StyleSheet.absoluteFill}>
        <FloatingOrb color={THEME.primary} size={300} initial={{ x: -60, y: -60 }} duration={8000} />
        <FloatingOrb
          color="#6366F1"
          size={240}
          initial={{ x: width - 220, y: height / 2.4 }}
          duration={10500}
          drift={{ x: 26, y: -32 }}
        />
        <FloatingOrb
          color="#06B6D4"
          size={220}
          initial={{ x: 40, y: height - 220 }}
          duration={9500}
          drift={{ x: -24, y: 28 }}
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <Animated.View 
          style={[
            styles.contentContainer, 
            introAnimation,
          ]}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>SECURE NFC</Text>
            </View>
            <Text style={styles.heading}>{title}</Text>
            <Text style={styles.subheading}>
              Hold your hardware wallet near the back of your device to sign in or initialize.
            </Text>
          </View>

          {/* Action Section */}
          <View style={styles.actions}>
            <View style={styles.scanButtonWrapper}>
              <ScanButton
                label={primaryLabel}
                onPress={openScanDialog}
                disabled={isScanning || isResetting}
              />
            </View>

            <View style={styles.resetWrapper}>
              <AppButton
                label={resetLabel}
                onPress={confirmReset}
                disabled={isScanning || isResetting}
                variant="text"
                style={styles.resetButton}
              />
            </View>
          </View>
        </Animated.View>

        <ScanDialog
          visible={dialogVisible}
          isNfcEnabled={isEnabled}
          onClose={closeScanDialog}
          onScanningChange={handleScanningChange}
          onShowToast={showToast}
          onSuccess={handleScanSuccess}
        />
        <Toast
          message={toastMessage}
          visible={toastVisible}
          type={toastType}
          onTimeout={dismissToast}
        />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#0F172A', // Dark Slate
  },
  safeArea: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
    maxWidth: 320,
  },
  badge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginBottom: 20,
  },
  badgeText: {
    color: THEME.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  scanButtonWrapper: {
    width: '100%',
    marginBottom: 24,
  },
  resetWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  resetButton: {
    minWidth: 120,
  },
});

export default NfcScanScreen;
