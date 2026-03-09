import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useSettings } from '../../features/settings';
import type { ThemeTokens } from '../../types/theme/colors';

const KEYPAD_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'back-right',
  '0',
  'submit',
];

type PinKeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  disabled?: boolean;
};

export const PinKeypad: React.FC<PinKeypadProps> = ({
  onDigit,
  onBackspace,
  onSubmit,
  submitDisabled = false,
  disabled = false,
}) => {
  const { themeTokens } = useSettings();
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);

  const handlePress = (key: string) => {
    if (disabled) return;
    if (key === 'submit') {
      if (!submitDisabled) {
        onSubmit?.();
      }
      return;
    }
    if (key === 'back-right') {
      onBackspace();
      return;
    }
    onDigit(key);
  };

  return (
    <View style={styles.container}>
      {KEYPAD_KEYS.map(key => {
        const isBack = key === 'back-right';
        const isSubmit = key === 'submit';

        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.keyWrapper,
              styles.key,
              isSubmit && styles.submitKey,
              (disabled || (isSubmit && submitDisabled)) && styles.keyDisabled,
              pressed && styles.keyPressed,
            ]}
            onPress={() => handlePress(key)}
            disabled={disabled || (isSubmit && submitDisabled)}
            accessibilityRole="button"
            accessibilityLabel={isBack ? 'Delete' : isSubmit ? 'Submit PIN' : `Digit ${key}`}
          >
            {isBack ? (
              <Ionicons
                name="backspace-outline"
                size={26}
                color={themeTokens.foregroundMuted}
              />
            ) : isSubmit ? (
              <View style={styles.submitContent}>
                <Ionicons name="arrow-forward-circle" size={28} color={themeTokens.background} />
              </View>
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 258,
  },
  keyWrapper: {
    width: 78,
    height: 78,
    justifyContent: 'center',
    alignItems: 'center',
  },
  key: {
    backgroundColor: theme.surfaceHighlight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  keyPressed: {
    backgroundColor: theme.surface,
    transform: [{ scale: 0.97 }],
  },
  keyDisabled: {
    opacity: 0.5,
  },
  submitKey: {
    backgroundColor: theme.primary,
    borderColor: theme.primaryLight,
  },
  keyText: {
    fontSize: theme.typography.subtitle,
    fontWeight: '700',
    color: theme.foreground,
  },
  submitContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
