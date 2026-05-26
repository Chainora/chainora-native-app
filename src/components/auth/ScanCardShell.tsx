import React from 'react';
import { Animated, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScanCardShellProps = {
  resolvedTheme: 'light' | 'dark' | string;
  allowBackdropClose: boolean;
  isScanExperience: boolean;
  modalOpacityAnim: Animated.Value;
  modalScaleAnim: Animated.Value;
  shakeAnim: Animated.Value;
  onClose: () => void;
  children: React.ReactNode;
};

export const ScanCardShell: React.FC<ScanCardShellProps> = ({
  allowBackdropClose,
  children,
  isScanExperience,
  modalOpacityAnim,
  modalScaleAnim,
  onClose,
  resolvedTheme,
  shakeAnim,
}) => (
  <View style={styles.screenRoot}>
    <StatusBar
      barStyle={resolvedTheme === 'light' ? 'dark-content' : 'light-content'}
      backgroundColor="#08111B"
    />
    <SafeAreaView style={styles.screenRoot} edges={['top', 'bottom']}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!allowBackdropClose) {
            return;
          }
          onClose();
        }}
      />

      <Animated.View
        style={[
          styles.dialog,
          isScanExperience ? styles.scanShell : styles.authShell,
          styles.screenDialog,
          {
            opacity: modalOpacityAnim,
            transform: [
              { scale: modalScaleAnim },
              { translateX: shakeAnim },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </SafeAreaView>
  </View>
);

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#08111B',
  },
  dialog: {
    width: '100%',
    maxWidth: 390,
  },
  screenDialog: {
    flex: 1,
    width: '100%',
    maxWidth: undefined,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  authShell: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#272E3E',
    backgroundColor: '#11161F',
    paddingTop: 8,
    paddingBottom: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.58,
    shadowRadius: 36,
    elevation: 26,
  },
  scanShell: {
    minHeight: '96%',
    maxHeight: '96%',
    borderRadius: 34,
    backgroundColor: '#08111B',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.62,
    shadowRadius: 40,
    elevation: 30,
  },
});
