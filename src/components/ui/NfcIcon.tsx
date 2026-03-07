import React from 'react';
import { StyleSheet, View } from 'react-native';

import { THEME } from '../../types/theme/colors';

type NfcIconProps = {
  size?: number;
  color?: string;
};

export const NfcIcon: React.FC<NfcIconProps> = ({
  size = 56,
  color = THEME.primary,
}) => {
  const arcWidth = size * 0.22;
  const gap = size * 0.08;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.arc,
          {
            width: size * 0.32,
            height: arcWidth,
            borderRadius: arcWidth / 2,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.arc,
          styles.arcMiddle,
          {
            width: size * 0.52,
            height: arcWidth,
            borderRadius: arcWidth / 2,
            backgroundColor: color,
            marginTop: gap,
          },
        ]}
      />
      <View
        style={[
          styles.arc,
          styles.arcOuter,
          {
            width: size * 0.72,
            height: arcWidth,
            borderRadius: arcWidth / 2,
            backgroundColor: color,
            marginTop: gap,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    alignSelf: 'center',
  },
  arcMiddle: {
    opacity: 0.85,
  },
  arcOuter: {
    opacity: 0.6,
  },
});
