import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { THEME } from '../types/theme/colors';

export type BottomNavItem = {
  key: string;
  label: string;
  active?: boolean;
  onPress?: () => void;
};

type BottomNavBarProps = {
  items: BottomNavItem[];
};

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ items }) => {
  return (
    <View style={styles.container}>
      {items.map(item => (
        <Pressable
          key={item.key}
          style={[styles.button, item.active && styles.buttonActive]}
          onPress={item.onPress}
          disabled={!item.onPress}
        >
          <Text style={[styles.label, item.active && styles.labelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: THEME.surface,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonActive: {
    borderTopWidth: 2,
    borderTopColor: THEME.primary,
  },
  label: {
    color: THEME.foregroundMuted,
    fontSize: THEME.typography.subtext,
    fontWeight: '600',
  },
  labelActive: {
    color: THEME.primary,
  },
});
