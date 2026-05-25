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

export const PIN_COLORS = {
  background: '#08111B',
  backgroundAlt: '#0B111C',
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
  signalBright: '#4FB4FF',
  signalSoft: 'rgba(40, 151, 255, 0.12)',
  signalBorder: 'rgba(79, 180, 255, 0.36)',
  cyan: '#22D3EE',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.12)',
  danger: '#FF8A8A',
  dangerSoft: 'rgba(255, 138, 138, 0.12)',
  warning: '#F6B34A',
  warningSoft: 'rgba(246, 179, 74, 0.12)',
  overlay: 'rgba(3, 6, 10, 0.82)',
} as const;

export const PIN_DISPLAY_FONT_BOLD = Platform.select({
  ios: 'Unbounded-ExtraBold',
  android: 'Unbounded-ExtraBold',
  default: 'System',
});

export const PIN_DISPLAY_FONT_MEDIUM = Platform.select({
  ios: 'Unbounded-Medium',
  android: 'Unbounded-Medium',
  default: 'System',
});

export const PIN_SANS_FONT = Platform.select({
  ios: 'Geist-Regular',
  android: 'Geist-Regular',
  default: 'System',
});

export const PIN_SANS_FONT_SEMIBOLD = Platform.select({
  ios: 'Geist-SemiBold',
  android: 'Geist-SemiBold',
  default: 'System',
});

export const PIN_SANS_FONT_EXTRABOLD = Platform.select({
  ios: 'Geist-ExtraBold',
  android: 'Geist-ExtraBold',
  default: 'System',
});

export const PIN_MONO_FONT = Platform.select({
  ios: 'GeistMono-Regular',
  android: 'GeistMono-Regular',
  default: 'monospace',
});

export const pinShadow = (color: string = PIN_COLORS.signal): ViewStyle => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.28,
  shadowRadius: 24,
  elevation: 9,
});

type PinTopBarProps = {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

type PinProgressProps = {
  current: number;
  total: number;
};

type PinGhostButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

type PinNoteCardProps = {
  text: string;
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: 'signal' | 'success' | 'warning' | 'danger';
  style?: StyleProp<ViewStyle>;
};

const toneColorMap = {
  signal: PIN_COLORS.signalBright,
  success: PIN_COLORS.success,
  warning: PIN_COLORS.warning,
  danger: PIN_COLORS.danger,
} as const;

const toneBackgroundMap = {
  signal: PIN_COLORS.signalSoft,
  success: PIN_COLORS.successSoft,
  warning: PIN_COLORS.warningSoft,
  danger: PIN_COLORS.dangerSoft,
} as const;

export const PinAuras: React.FC = () => (
  <>
    <View pointerEvents="none" style={styles.auraHalo} />
    <View pointerEvents="none" style={styles.auraMist} />
    <View pointerEvents="none" style={styles.auraCore} />
  </>
);

export const PinTopBar: React.FC<PinTopBarProps> = ({ title, onBack, right }) => (
  <View style={styles.topBar}>
    {onBack ? (
      <Pressable style={styles.iconButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={16} color={PIN_COLORS.textMuted} />
      </Pressable>
    ) : (
      <View style={styles.topBarGhost} />
    )}
    <View style={styles.topBarTitleWrap} pointerEvents="none">
      {title ? <Text style={styles.topBarTitle}>{title}</Text> : null}
    </View>
    {right ?? <View style={styles.topBarGhost} />}
  </View>
);

export const PinProgress: React.FC<PinProgressProps> = ({ current, total }) => (
  <View style={styles.progressRow}>
    {Array.from({ length: total }, (_, index) => (
      <View
        key={index}
        style={[styles.progressSegment, current > index && styles.progressSegmentOn]}
      />
    ))}
  </View>
);

export const PinGhostButton: React.FC<PinGhostButtonProps> = ({
  label,
  onPress,
  disabled = false,
  style,
  labelStyle,
}) => (
  <Pressable
    style={({ pressed }) => [
      styles.ghostButton,
      disabled && styles.buttonDisabled,
      pressed && !disabled && styles.ghostButtonPressed,
      style,
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={[styles.ghostButtonText, labelStyle]}>{label}</Text>
  </Pressable>
);

export const PinNoteCard: React.FC<PinNoteCardProps> = ({
  text,
  iconName = 'lock-closed-outline',
  tone = 'signal',
  style,
}) => (
  <View
    style={[
      styles.noteCard,
      {
        borderColor: toneBackgroundMap[tone],
        backgroundColor: toneBackgroundMap[tone],
      },
      style,
    ]}
  >
    <View style={[styles.noteIcon, { backgroundColor: toneColorMap[tone] }]}>
      <Ionicons name={iconName} size={13} color={PIN_COLORS.background} />
    </View>
    <Text style={styles.noteText}>{text}</Text>
  </View>
);

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
    shadowColor: PIN_COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 44,
    transform: [{ scaleX: 1.3 }],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PIN_COLORS.border,
    backgroundColor: PIN_COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarGhost: {
    width: 34,
    height: 34,
  },
  topBarTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  topBarTitle: {
    color: PIN_COLORS.text,
    fontFamily: PIN_DISPLAY_FONT_MEDIUM,
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.2,
    textAlign: 'center',
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
  progressSegmentOn: {
    backgroundColor: PIN_COLORS.signal,
    shadowColor: PIN_COLORS.signalBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  ghostButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PIN_COLORS.border,
    backgroundColor: 'rgba(16, 24, 39, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ghostButtonPressed: {
    backgroundColor: PIN_COLORS.surfaceAlt,
  },
  ghostButtonText: {
    color: PIN_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: PIN_SANS_FONT_SEMIBOLD,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    color: PIN_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: PIN_SANS_FONT,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
