import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Easing } from 'react-native';

import { THEME } from '../../types/theme/colors';

type ScanButtonProps = {
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
};

export const ScanButton: React.FC<ScanButtonProps> = ({
  label = 'Scan NFC Card',
  disabled = false,
  onPress,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!disabled) {
      // Breathing pulse animation for the outer glow
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 2000,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 0.8,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.5,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0);
    }
  }, [disabled, pulseAnim, glowAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 9,
      tension: 40,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 9,
      tension: 40,
    }).start();
  };

  return (
    <View style={[styles.container, disabled && styles.containerDisabled]}>
      {/* Outer pulsing glow */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            opacity: disabled ? 0 : glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />

      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={styles.pressable}
      >
        <Animated.View
          style={[
            styles.buttonBody,
            disabled && styles.buttonDisabled,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Holographic Wave Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.waveSmall} />
            <View style={styles.waveMedium} />
            <View style={styles.waveLarge} />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.subLabel}>{disabled ? 'Initializing...' : 'Tap to start'}</Text>
          </View>

          {/* Decorative Corner Accents */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 90,
    marginVertical: 12,
  },
  containerDisabled: {
    opacity: 0.8,
  },
  glowRing: {
    position: 'absolute',
    width: '102%',
    height: '115%',
    borderRadius: 24,
    backgroundColor: THEME.primary,
    opacity: 0.5,
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10, // Android glow
  },
  pressable: {
    width: '100%',
    height: '100%',
  },
  buttonBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)', // Light cyan border
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  buttonDisabled: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  // CSS shapes for the wave icon
  waveSmall: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.primary,
  },
  waveMedium: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: THEME.primary,
    opacity: 0.8,
  },
  waveLarge: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: THEME.primary,
    opacity: 0.4,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  subLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  // Futuristic corners
  corner: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderColor: THEME.primary,
    opacity: 0.6,
  },
  cornerTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  cornerTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
});
