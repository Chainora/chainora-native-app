import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { THEME } from '../../utils/theme/colors';

type ScanButtonProps = {
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
};

export const ScanButton: React.FC<ScanButtonProps> = ({
  label = 'Scan NFC',
  disabled = false,
  onPress,
}) => {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <View style={styles.innerWave} />
        <View style={styles.outerWave} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: THEME.primary,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    backgroundColor: THEME.primaryLight,
    opacity: 0.6,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: THEME.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  innerWave: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.foreground,
  },
  outerWave: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: THEME.foreground,
    opacity: 0.4,
  },
  label: {
    color: THEME.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
});
