import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import { FloatingOrb } from './FloatingOrb';
import { THEME } from '@app-types/theme/colors';

type OrbConfig = {
  key: string;
  color: string;
  size: number;
  initialX: number;
  initialY: number;
  driftX: number;
  riseDistance: number;
  duration: number;
  opacity: number;
};

type AmbientOrbsBackgroundProps = {
  count?: number;
  compact?: boolean;
};

const ORB_COLORS = [THEME.primary, THEME.border, THEME.surfaceHighlight, THEME.surface];

const AMBIENT_DEFAULTS = {
  compact: {
    maxCount: 10,
    minSize: 96,
    maxSize: 168,
    minDuration: 10_000,
    maxDuration: 15_000,
    minOpacity: 0.06,
    maxOpacity: 0.12,
    minX: -40,
    maxXOffset: -40,
    startYMinRatio: 0.8,
    startYMaxOffset: 140,
    minDriftX: -28,
    maxDriftX: 28,
    riseDistanceMinRatio: 0.8,
    riseDistanceMaxRatio: 1.2,
  },
  full: {
    maxCount: 10,
    minSize: 110,
    maxSize: 190,
    minDuration: 11_000,
    maxDuration: 18_000,
    minOpacity: 0.07,
    maxOpacity: 0.14,
    minX: -40,
    maxXOffset: -40,
    startYMinRatio: 0.8,
    startYMaxOffset: 140,
    minDriftX: -28,
    maxDriftX: 28,
    riseDistanceMinRatio: 0.8,
    riseDistanceMaxRatio: 1.2,
  },
} as const;

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const AmbientOrbsBackground: React.FC<AmbientOrbsBackgroundProps> = ({ count = 4, compact = false }) => {
  const { width, height } = Dimensions.get('window');
  const settings = compact ? AMBIENT_DEFAULTS.compact : AMBIENT_DEFAULTS.full;

  const safeCount = Math.max(2, Math.min(count, settings.maxCount));

  const orbConfigs = useMemo<OrbConfig[]>(() => {
    return Array.from({ length: safeCount }, (_, index) => ({
      key: `orb-${index}`,
      color: ORB_COLORS[index % ORB_COLORS.length],
      size: Math.round(randomInRange(settings.minSize, settings.maxSize)),
      initialX: randomInRange(settings.minX, width + settings.maxXOffset),
      initialY: randomInRange(height * settings.startYMinRatio, height + settings.startYMaxOffset),
      driftX: randomInRange(settings.minDriftX, settings.maxDriftX),
      riseDistance: randomInRange(
        height * settings.riseDistanceMinRatio,
        height * settings.riseDistanceMaxRatio,
      ),
      duration: Math.round(randomInRange(settings.minDuration, settings.maxDuration)),
      opacity: randomInRange(settings.minOpacity, settings.maxOpacity),
    }));
  }, [height, safeCount, settings, width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {orbConfigs.map(config => (
        <FloatingOrb
          key={config.key}
          color={config.color}
          size={config.size}
          initial={{ x: config.initialX, y: config.initialY }}
          drift={{ x: config.driftX, y: -24 }}
          duration={config.duration}
          opacity={config.opacity}
          motion="rise"
          riseDistance={config.riseDistance}
        />
      ))}
    </View>
  );
};

export default AmbientOrbsBackground;
