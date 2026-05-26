import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { THEME } from '@app-types/theme/colors';

type ShieldCheckIconProps = {
  size?: number;
  color?: string;
};

export const ShieldCheckIcon: React.FC<ShieldCheckIconProps> = ({
  size = 64,
  color = THEME.primary,
}) => {
  return (
    <View style={[styles.shield, { width: size * 1.2, height: size * 1.1 }]}>
      <Text style={[styles.check, { color, fontSize: size * 0.5 }]}>✓</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  shield: {
    borderRadius: 16,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontWeight: '700',
  },
});
