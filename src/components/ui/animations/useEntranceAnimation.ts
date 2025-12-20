import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

type EntranceAnimationOptions = {
  translateInitial?: number;
  delay?: number;
  fadeDuration?: number;
  springConfig?: {
    friction?: number;
    tension?: number;
  };
};

export const useEntranceAnimation = ({
  translateInitial = 24,
  delay = 0,
  fadeDuration = 600,
  springConfig = {
    friction: 8,
    tension: 40,
  },
}: EntranceAnimationOptions = {}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(translateInitial)).current;

  useEffect(() => {
    const intro = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: fadeDuration,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: springConfig.friction ?? 8,
        tension: springConfig.tension ?? 40,
        useNativeDriver: true,
      }),
    ]);

    const animation = delay > 0 ? Animated.sequence([Animated.delay(delay), intro]) : intro;
    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, fadeDuration, opacity, springConfig.friction, springConfig.tension, translateY]);

  return {
    opacity,
    translateY,
    animatedStyle: {
      opacity,
      transform: [{ translateY }],
    } as const,
  };
};
