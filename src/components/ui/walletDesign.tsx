import React from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';

export const WALLET_COLORS = {
  background: '#08111B',
  backgroundAlt: '#0A101A',
  surface: '#101827',
  surfaceAlt: '#121D2D',
  surfaceSoft: '#172233',
  border: '#243248',
  borderStrong: '#355072',
  text: '#EAF0FB',
  textMuted: '#A7B6CD',
  textSoft: '#7F90AC',
  textLow: '#677891',
  signal: '#2897FF',
  signalSoft: 'rgba(40, 151, 255, 0.12)',
  signalBorder: 'rgba(79, 180, 255, 0.36)',
  cyan: '#22D3EE',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.12)',
  danger: '#FF8A8A',
  dangerSoft: 'rgba(255, 122, 122, 0.12)',
  warning: '#F6B34A',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  overlay: 'rgba(3, 6, 10, 0.82)',
} as const;

export const DISPLAY_FONT = Platform.select({
  ios: 'Unbounded-Bold',
  android: 'Unbounded-Bold',
  default: 'System',
});

export const DISPLAY_FONT_MEDIUM = Platform.select({
  ios: 'Unbounded-Medium',
  android: 'Unbounded-Medium',
  default: 'System',
});

export const SANS_FONT = Platform.select({
  ios: 'Geist-Regular',
  android: 'Geist-Regular',
  default: 'System',
});

export const SANS_FONT_SEMIBOLD = Platform.select({
  ios: 'Geist-SemiBold',
  android: 'Geist-SemiBold',
  default: 'System',
});

export const MONO_FONT = Platform.select({
  ios: 'GeistMono-Regular',
  android: 'GeistMono-Regular',
  default: 'monospace',
});

type ButtonProps = {
  label: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

type TopBarProps = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
};

type KeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitIcon?: string;
  submitLabel?: string;
  compact?: boolean;
};

type TextFieldProps = {
  children?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  large?: boolean;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'submit'] as const;

export const walletShadow = (color = WALLET_COLORS.signal): ViewStyle => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.28,
  shadowRadius: 22,
  elevation: 9,
});

export const WalletAuras: React.FC = () => (
  <>
    <View style={styles.auraHalo} pointerEvents="none" />
    <View style={styles.auraMist} pointerEvents="none" />
    <View style={styles.auraCore} pointerEvents="none" />
  </>
);

export const WalletTopBar: React.FC<TopBarProps> = ({ title, onBack, right, titleStyle }) => (
  <View style={styles.topBar}>
    {onBack ? (
      <Pressable style={styles.iconButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={16} color={WALLET_COLORS.textMuted} />
      </Pressable>
    ) : (
      <View style={styles.topBarGhost} />
    )}
    <View style={styles.topBarTitleWrap} pointerEvents="none">
      <Text style={[styles.topBarTitle, titleStyle]} numberOfLines={1}>
        {title}
      </Text>
    </View>
    {right ?? <View style={styles.topBarGhost} />}
  </View>
);

export const WalletButton: React.FC<ButtonProps> = ({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  style,
  labelStyle,
}) => (
  <Pressable
    style={({ pressed }) => [
      styles.button,
      variant === 'primary' && styles.buttonPrimary,
      variant === 'secondary' && styles.buttonSecondary,
      variant === 'ghost' && styles.buttonGhost,
      disabled && styles.buttonDisabled,
      pressed && !disabled && styles.buttonPressed,
      style,
    ]}
    disabled={disabled}
    onPress={onPress}
  >
    <Text
      style={[
        styles.buttonText,
        variant === 'secondary' && styles.buttonTextSecondary,
        variant === 'ghost' && styles.buttonTextGhost,
        labelStyle,
      ]}
    >
      {label}
    </Text>
    {icon}
  </Pressable>
);

export const WalletSectionLabel: React.FC<{ label: string; style?: StyleProp<TextStyle> }> = ({
  label,
  style,
}) => <Text style={[styles.sectionLabel, style]}>{label}</Text>;

export const WalletPanel: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => <View style={[styles.panel, style]}>{children}</View>;

export const WalletPill: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => <View style={[styles.pill, style]}>{children}</View>;

export const WalletPinDots: React.FC<{ length: number; filled: number }> = ({ length, filled }) => (
  <View style={styles.pinDots}>
    {Array.from({ length }, (_, index) => (
      <View key={index} style={[styles.pinDot, index < filled && styles.pinDotOn]} />
    ))}
  </View>
);

export const WalletKeypad: React.FC<KeypadProps> = ({
  onDigit,
  onBackspace,
  onSubmit,
  submitDisabled = false,
  submitIcon = 'arrow-forward',
  submitLabel,
  compact = false,
}) => (
  <View style={[styles.keypad, compact && styles.keypadCompact]}>
    {KEYS.map(key => {
      const isBack = key === 'back';
      const isSubmit = key === 'submit';
      return (
        <Pressable
          key={key}
          style={({ pressed }) => [
            styles.key,
            compact && styles.keyCompact,
            isSubmit && styles.keySubmit,
            (isSubmit && submitDisabled) && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          disabled={isSubmit && submitDisabled}
          onPress={() => {
            if (key === 'back') {
              onBackspace();
              return;
            }
            if (key === 'submit') {
              onSubmit?.();
              return;
            }
            onDigit(key);
          }}
        >
          {isBack ? (
            <Ionicons name="backspace-outline" size={22} color={WALLET_COLORS.text} />
          ) : isSubmit ? (
            submitLabel ? (
              <Text style={styles.keySubmitLabel}>{submitLabel}</Text>
            ) : (
              <View style={[styles.keySubmitBubble, submitDisabled && styles.keySubmitBubbleDisabled]}>
                <Ionicons name={submitIcon as never} size={16} color="#EFF7FF" />
              </View>
            )
          ) : (
            <Text style={styles.keyText}>{key}</Text>
          )}
        </Pressable>
      );
    })}
  </View>
);

export const WalletTextField: React.FC<TextFieldProps> = ({
  children,
  left,
  right,
  style,
  large = false,
}) => (
  <View style={[styles.textField, large && styles.textFieldLarge, style]}>
    {left}
    <View style={styles.textFieldCenter}>{children}</View>
    {right}
  </View>
);

export const WalletHeroCard: React.FC<{
  addressText?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}> = ({ addressText = '0x4a7f · · · c2e1', label = 'CHAINORA', style }) => (
  <View style={[styles.heroCardWrap, style]}>
    <View style={styles.heroCardShadow} />
    <View style={styles.heroCard}>
      <View style={styles.heroChip} />
      <View style={styles.heroBrandRow}>
        <View style={styles.heroBrandDot} />
        <Text style={styles.heroBrand}>{label}</Text>
      </View>
      <Text style={styles.heroAddress}>{addressText}</Text>
      <View style={styles.heroWaveOne} />
      <View style={styles.heroWaveTwo} />
      <View style={styles.heroWaveThree} />
      <View style={styles.heroShine} />
    </View>
  </View>
);

export const buildWalletScreenStyles = () =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: WALLET_COLORS.background,
    },
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingBottom: 18,
    },
  });

const styles = StyleSheet.create({
  auraHalo: {
    position: 'absolute',
    top: -170,
    left: -24,
    right: -24,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(54, 132, 255, 0.12)',
    shadowColor: '#4FB4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 90,
    elevation: 1,
    transform: [{ scaleX: 1.24 }],
  },
  auraMist: {
    position: 'absolute',
    top: -126,
    left: 32,
    right: 32,
    height: 210,
    borderRadius: 999,
    backgroundColor: 'rgba(107, 188, 255, 0.08)',
    transform: [{ scaleX: 1.16 }],
  },
  auraCore: {
    position: 'absolute',
    top: -52,
    alignSelf: 'center',
    width: 160,
    height: 108,
    borderRadius: 999,
    backgroundColor: 'rgba(79, 180, 255, 0.18)',
    shadowColor: '#62BBFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 44,
    elevation: 2,
    transform: [{ scaleX: 1.3 }],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    minHeight: 40,
  },
  topBarGhost: {
    width: 34,
    height: 34,
  },
  topBarTitleWrap: {
    position: 'absolute',
    left: 48,
    right: 48,
    alignItems: 'center',
  },
  topBarTitle: {
    color: WALLET_COLORS.text,
    fontFamily: DISPLAY_FONT_MEDIUM,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  buttonPrimary: {
    borderColor: 'rgba(128, 204, 255, 0.7)',
    backgroundColor: WALLET_COLORS.signal,
    ...walletShadow(),
  },
  buttonSecondary: {
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
  },
  buttonGhost: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    color: '#EFF7FF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  buttonTextSecondary: {
    color: WALLET_COLORS.text,
  },
  buttonTextGhost: {
    color: WALLET_COLORS.textSoft,
  },
  sectionLabel: {
    color: WALLET_COLORS.textSoft,
    fontFamily: MONO_FONT,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    overflow: 'hidden',
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 14,
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: '#2C384C',
    backgroundColor: '#0D1320',
  },
  pinDotOn: {
    borderColor: '#4FB4FF',
    backgroundColor: '#2897FF',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  keypadCompact: {
    rowGap: 8,
  },
  key: {
    width: '31.2%',
    height: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCompact: {
    height: 60,
  },
  keySubmit: {
    borderColor: WALLET_COLORS.borderStrong,
    backgroundColor: '#0E1726',
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyPressed: {
    backgroundColor: '#162137',
  },
  keyText: {
    color: WALLET_COLORS.text,
    fontSize: 30,
    fontWeight: '500',
    fontFamily: DISPLAY_FONT,
  },
  keySubmitBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(128, 204, 255, 0.7)',
    backgroundColor: WALLET_COLORS.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySubmitBubbleDisabled: {
    opacity: 0.5,
  },
  keySubmitLabel: {
    color: '#EFF7FF',
    fontSize: 14,
    fontWeight: '700',
  },
  textField: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: WALLET_COLORS.border,
    backgroundColor: WALLET_COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  textFieldLarge: {
    minHeight: 60,
  },
  textFieldCenter: {
    flex: 1,
  },
  heroCardWrap: {
    alignItems: 'center',
  },
  heroCardShadow: {
    position: 'absolute',
    bottom: -16,
    width: '84%',
    height: 38,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 30, 60, 0.42)',
  },
  heroCard: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 1.58,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(90, 161, 255, 0.38)',
    backgroundColor: '#0D1320',
    padding: 20,
    overflow: 'hidden',
  },
  heroChip: {
    width: 52,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(96, 129, 179, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(137, 177, 235, 0.5)',
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
  },
  heroBrandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4FB4FF',
  },
  heroBrand: {
    color: '#D8E8FF',
    fontFamily: DISPLAY_FONT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heroAddress: {
    marginTop: 10,
    color: '#93AACD',
    fontFamily: MONO_FONT,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  heroWaveOne: {
    position: 'absolute',
    right: -36,
    bottom: -36,
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.26)',
  },
  heroWaveTwo: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.28)',
  },
  heroWaveThree: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(79, 180, 255, 0.36)',
  },
  heroShine: {
    position: 'absolute',
    right: -34,
    top: -18,
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(79, 180, 255, 0.14)',
  },
});
