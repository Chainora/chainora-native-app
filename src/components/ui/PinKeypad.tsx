import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import {
  PIN_COLORS,
  PIN_DISPLAY_FONT_MEDIUM,
  pinShadow,
} from './pinTheme';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ghost', '0', 'back'] as const;

type PinKeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

export const PinKeypad: React.FC<PinKeypadProps> = ({
  onDigit,
  onBackspace,
  disabled = false,
  compact = false,
}) => (
  <View style={styles.container}>
    {KEYPAD_KEYS.map(key => {
      const isBack = key === 'back';
      const isGhost = key === 'ghost';

      return (
        <Pressable
          key={key}
          style={({ pressed }) => [
            styles.key,
            compact && styles.keyCompact,
            isGhost && styles.keyGhost,
            disabled && styles.keyDisabled,
            pressed && !disabled && !isGhost && styles.keyPressed,
          ]}
          onPress={() => {
            if (disabled || isGhost) {
              return;
            }
            if (isBack) {
              onBackspace();
              return;
            }
            onDigit(key);
          }}
          disabled={disabled || isGhost}
          accessibilityRole={isGhost ? undefined : 'button'}
          accessibilityLabel={isBack ? 'Delete' : `Digit ${key}`}
        >
          {isBack ? (
            <Ionicons name="backspace-outline" size={24} color={PIN_COLORS.text} />
          ) : isGhost ? null : (
            <Text style={[styles.keyText, compact && styles.keyTextCompact]}>{key}</Text>
          )}
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    width: '100%',
  },
  key: {
    width: '31.5%',
    height: 78,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PIN_COLORS.border,
    backgroundColor: PIN_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...pinShadow(),
  },
  keyCompact: {
    height: 72,
    borderRadius: 20,
  },
  keyGhost: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  keyPressed: {
    backgroundColor: PIN_COLORS.surfaceAlt,
    transform: [{ scale: 0.98 }],
  },
  keyDisabled: {
    opacity: 0.5,
  },
  keyText: {
    color: PIN_COLORS.text,
    fontSize: 32,
    lineHeight: 36,
    fontFamily: PIN_DISPLAY_FONT_MEDIUM,
    textAlign: 'center',
  },
  keyTextCompact: {
    fontSize: 28,
    lineHeight: 32,
  },
});
