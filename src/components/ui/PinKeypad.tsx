import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { THEME } from '../../types/theme/colors';

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
  '',
  '0',
  'back-right',
];

type PinKeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
};

export const PinKeypad: React.FC<PinKeypadProps> = ({
  onDigit,
  onBackspace,
  disabled = false,
}) => {
  const handlePress = (key: string) => {
    if (disabled) return;
    if (key === 'back-right') {
      onBackspace();
      return;
    }
    if (key === '') return;
    onDigit(key);
  };

  return (
    <View style={styles.container}>
      {KEYPAD_KEYS.map(key => {
        const isBack = key === 'back-right';
        const isEmpty = key === '';

        if (isEmpty) {
          return <View key="empty-left" style={styles.keyWrapper} />;
        }

        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              styles.keyWrapper,
              styles.key,
              pressed && styles.keyPressed,
            ]}
            onPress={() => handlePress(key)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={isBack ? 'Delete' : `Digit ${key}`}
          >
            {isBack ? (
              <Ionicons
                name="backspace-outline"
                size={26}
                color={THEME.foregroundMuted}
              />
            ) : (
              <Text style={styles.keyText}>{key}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: THEME.surfaceHighlight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: THEME.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  keyPressed: {
    backgroundColor: THEME.surface,
    transform: [{ scale: 0.97 }],
  },
  keyText: {
    fontSize: THEME.typography.subtitle,
    fontWeight: '700',
    color: THEME.foreground,
  },
});
