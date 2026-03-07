import React from 'react';
import { Pressable, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';

import { THEME } from '../types/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'text';

type AppButtonProps = {
  label: string;
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export const AppButton: React.FC<AppButtonProps> = ({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}) => {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && styles.pressed,
        variant === 'primary' && pressed && styles.primaryPressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary'
            ? styles.primaryLabel
            : variant === 'secondary'
            ? styles.secondaryLabel
            : styles.textLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Primary: Bright Neon Blue background with Glow
  primary: {
    backgroundColor: THEME.primary,
    shadowColor: THEME.glow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)', // Inner highlight hint
  },
  primaryPressed: {
    shadowOpacity: 0.2,
    shadowRadius: 6,
    transform: [{ scale: 0.98 }],
  },
  // Secondary: Glassmorphic dark surface
  secondary: {
    backgroundColor: 'rgba(30, 35, 46, 0.9)', // Semi-transparent gunmetal
    borderWidth: 1,
    borderColor: 'rgba(191, 164, 106, 0.35)', // Subtle gold border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  // Text: Minimalist ghost button
  text: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
  },
  disabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: THEME.typography.body,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryLabel: {
    color: '#0A0B0D', // Dark text on bright gold button
  },
  secondaryLabel: {
    color: THEME.primary, // Gold text on dark button
  },
  textLabel: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
  },
});
