import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { PinKeypad } from './PinKeypad';
import {
  PIN_COLORS,
  PIN_DISPLAY_FONT_BOLD,
  PIN_SANS_FONT,
  PIN_SANS_FONT_EXTRABOLD,
  PIN_SANS_FONT_SEMIBOLD,
  pinShadow,
} from './pinTheme';

type PinInputProps = {
  value: string;
  onChange?: (nextValue: string) => void;
  onDigit?: (digit: string) => void;
  onBackspace?: () => void;
  onSubmit?: () => void;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  length?: number;
  disabled?: boolean;
  submitDisabled?: boolean;
  variant?: 'screen' | 'card';
  heroIconName?: React.ComponentProps<typeof Ionicons>['name'];
  animateHero?: boolean;
  showHero?: boolean;
  squareIndicators?: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  supportingText?: string | null;
  errorMessage?: string | null;
  headerSlot?: React.ReactNode;
  contentSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  afterActionSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
  colorScheme?: 'light' | 'dark';
};

const Hero: React.FC<{
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  animateHero: boolean;
}> = ({ iconName = 'wifi-outline', animateHero }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animateHero) {
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
      pulse.setValue(0);
    };
  }, [animateHero, pulse]);

  const animatedStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.12],
          }),
        },
      ],
      opacity: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.34, 0.08],
      }),
    }),
    [pulse],
  );

  return (
    <View style={styles.heroWrap}>
      <Animated.View style={[styles.heroRing, animatedStyle]} />
      <View style={styles.heroCore}>
        <Ionicons name={iconName} size={34} color={PIN_COLORS.signalBright} />
      </View>
    </View>
  );
};

export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  onDigit,
  onBackspace,
  onSubmit,
  title,
  subtitle,
  ctaLabel,
  length = 4,
  disabled = false,
  submitDisabled = false,
  variant = 'card',
  heroIconName = 'wifi-outline',
  animateHero = true,
  showHero = true,
  squareIndicators = false,
  progressCurrent,
  progressTotal,
  progressLabel,
  supportingText,
  errorMessage,
  headerSlot,
  contentSlot,
  footerSlot,
  afterActionSlot,
  style,
}) => {
  const filled = value.slice(0, length).length;

  const handleDigit = (digit: string) => {
    if (disabled) {
      return;
    }
    if (onDigit) {
      onDigit(digit);
      return;
    }
    onChange?.(`${value}${digit}`.replace(/\D/g, '').slice(0, length));
  };

  const handleBackspace = () => {
    if (disabled) {
      return;
    }
    if (onBackspace) {
      onBackspace();
      return;
    }
    onChange?.(value.slice(0, -1));
  };

  return (
    <View style={[styles.container, variant === 'screen' && styles.screenContainer, style]}>
      {headerSlot}

      {typeof progressCurrent === 'number' && typeof progressTotal === 'number' ? (
        <View style={styles.progressWrap}>
          {progressLabel ? <Text style={styles.progressLabel}>{progressLabel}</Text> : null}
          <View style={styles.progressRow}>
            {Array.from({ length: progressTotal }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.progressSegment,
                  squareIndicators && styles.progressSegmentSquare,
                  progressCurrent > index && styles.progressSegmentOn,
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.header}>
        {showHero ? <Hero iconName={heroIconName} animateHero={animateHero} /> : null}
        {title ? <Text style={[styles.title, variant === 'screen' && styles.titleScreen]}>{title}</Text> : null}
        {subtitle ? (
          <Text style={[styles.subtitle, variant === 'screen' && styles.subtitleScreen]}>{subtitle}</Text>
        ) : null}
      </View>

      {contentSlot}

      <View style={styles.pinBlock}>
        <View style={styles.dotsRow}>
          {Array.from({ length }, (_, index) => (
            <View
              key={index}
              style={[styles.dot, squareIndicators && styles.dotSquare, index < filled && styles.dotFilled]}
            />
          ))}
        </View>

        {supportingText ? <Text style={styles.supportingText}>{supportingText}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PinKeypad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          disabled={disabled}
          compact={variant === 'card'}
        />
      </View>

      <View style={[styles.actions, variant === 'screen' && styles.actionsScreen]}>
        {footerSlot}
        {ctaLabel ? (
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (submitDisabled || disabled) && styles.buttonDisabled,
              pressed && !(submitDisabled || disabled) && styles.primaryButtonPressed,
            ]}
            onPress={onSubmit}
            disabled={submitDisabled || disabled}
          >
            <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
        {afterActionSlot}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 28,
  },
  screenContainer: {
    flex: 1,
    paddingTop: 18,
    paddingBottom: 8,
  },
  progressWrap: {
    gap: 8,
    marginBottom: 18,
  },
  progressLabel: {
    color: PIN_COLORS.textSoft,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.5,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
    textTransform: 'uppercase',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1B2536',
  },
  progressSegmentSquare: {
    borderRadius: 2,
  },
  progressSegmentOn: {
    backgroundColor: PIN_COLORS.signal,
    shadowColor: PIN_COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  heroWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.24)',
  },
  heroCore: {
    width: 82,
    height: 82,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: PIN_COLORS.signalBorder,
    backgroundColor: 'rgba(15, 25, 39, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    ...pinShadow(PIN_COLORS.signalBright),
  },
  title: {
    color: PIN_COLORS.text,
    fontSize: 24,
    lineHeight: 32,
    fontFamily: PIN_DISPLAY_FONT_BOLD,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  titleScreen: {
    fontSize: 28,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: 10,
    color: PIN_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: PIN_SANS_FONT,
    textAlign: 'center',
  },
  subtitleScreen: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
  },
  pinBlock: {
    gap: 14,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 2,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.8,
    borderColor: '#2C384C',
    backgroundColor: '#0D1320',
  },
  dotSquare: {
    borderRadius: 3,
  },
  dotFilled: {
    borderColor: PIN_COLORS.signalBright,
    backgroundColor: PIN_COLORS.signal,
  },
  supportingText: {
    minHeight: 18,
    color: PIN_COLORS.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: PIN_SANS_FONT,
    textAlign: 'center',
  },
  errorText: {
    minHeight: 18,
    color: PIN_COLORS.danger,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
    marginTop: 20,
  },
  actionsScreen: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PIN_COLORS.signalBright,
    backgroundColor: PIN_COLORS.signal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...pinShadow(PIN_COLORS.signalBright),
  },
  primaryButtonPressed: {
    backgroundColor: '#1D87E9',
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 19,
    fontFamily: PIN_SANS_FONT_EXTRABOLD,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.52,
  },
});
