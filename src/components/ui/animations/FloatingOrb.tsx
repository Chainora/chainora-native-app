import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';

type XYPoint = {
  x: number;
  y: number;
};

type FloatingOrbProps = {
  color: string;
  size: number;
  initial: XYPoint;
  drift?: XYPoint;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  motion?: 'float' | 'rise';
  riseDistance?: number;
};

export const FloatingOrb: React.FC<FloatingOrbProps> = ({
  color,
  size,
  initial,
  drift = { x: 30, y: -40 },
  duration = 9000,
  style,
  opacity = 0.15,
  motion = 'float',
  riseDistance = 320,
}) => {
  const position = useRef(new Animated.ValueXY(initial)).current;
  const initialX = initial.x;
  const initialY = initial.y;
  const driftX = drift.x;
  const driftY = drift.y;

  useEffect(() => {
    if (motion === 'rise') {
      const upward = {
        x: initialX + driftX,
        y: initialY - Math.abs(riseDistance),
      };

      const riseLoop = Animated.loop(
        Animated.timing(position, {
          toValue: upward,
          duration,
          useNativeDriver: true,
        }),
      );

      position.setValue({ x: initialX, y: initialY });
      riseLoop.start();

      return () => {
        riseLoop.stop();
      };
    }

    const forward = {
      x: initialX + driftX,
      y: initialY + driftY,
    };
    const backward = {
      x: initialX - driftX * 0.6,
      y: initialY - driftY * 0.6,
    };

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(position, {
          toValue: forward,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(position, {
          toValue: backward,
          duration: duration * 1.2,
          useNativeDriver: true,
        }),
        Animated.timing(position, {
          toValue: { x: initialX, y: initialY },
          duration: duration * 0.9,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [driftX, driftY, duration, initialX, initialY, motion, position, riseDistance]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        // eslint-disable-next-line react-native/no-inline-styles
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateX: position.x }, { translateY: position.y }],
        },
        style,
      ]}
    />
  );
};
