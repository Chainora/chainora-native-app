import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { THEME } from '../../theme/colors';

type PinInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  length?: number;
  disabled?: boolean;
  colorScheme?: 'light' | 'dark';
};

export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  length = 4,
  disabled = false,
  colorScheme = 'light',
}) => {
  const schemeStyle = colorScheme === 'dark' ? styles.dark : styles.light;
  const placeholderColor = colorScheme === 'dark' ? '#94A3B8' : THEME.foregroundMuted;

  return (
    <TextInput
      accessibilityLabel="PIN"
      style={[styles.input, schemeStyle, disabled && styles.disabled]}
      value={value}
      onChangeText={text => onChange(text.replace(/\D/g, '').slice(0, length))}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={length}
      editable={!disabled}
      placeholder={Array.from({ length }).map(() => '*').join('')}
      placeholderTextColor={placeholderColor}
      textAlign="center"
    />
  );
};

const styles = StyleSheet.create({
  input: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 24,
    letterSpacing: 12,
    marginBottom: 16,
  },
  light: {
    backgroundColor: '#FFFFFF',
    borderColor: THEME.border,
    color: THEME.background,
  },
  dark: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderColor: '#334155',
    color: '#F8FAFC',
  },
  disabled: {
    opacity: 0.5,
  },
});
