import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { THEME } from '../theme/colors';

type ButtonVariant = 'primary' | 'secondary';

type AppButtonProps = {
  label: string;
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  variant?: ButtonVariant;
};

export const AppButton: React.FC<AppButtonProps> = ({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
}) => {
  const buttonStyles = [
    styles.base,
    variant === 'primary' ? styles.primary : styles.secondary,
    disabled && styles.disabled,
  ];

  const textStyles = [
    styles.label,
    variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel,
  ];

  return (
    <Pressable
      accessibilityRole="button"
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={textStyles}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  primary: {
    backgroundColor: THEME.primary,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  secondary: {
    backgroundColor: THEME.surface,
    borderWidth: 2,
    borderColor: THEME.primary,
  },
  disabled: {
    opacity: 0.7,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
  },
  primaryLabel: {
    color: THEME.foreground,
  },
  secondaryLabel: {
    color: THEME.primary,
  },
});
