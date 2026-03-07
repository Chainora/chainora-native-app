import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '../types/theme/colors';

export type ToastType = 'info' | 'error' | 'success';

type ToastProps = {
  message: string | null;
  visible: boolean;
  type?: ToastType;
  onTimeout?: () => void;
  duration?: number;
};

const TOAST_COLORS: Record<ToastType, { background: string; text: string }> = {
  info: { background: '#1E6BFF', text: '#FFFFFF' },
  success: { background: '#0E9F6E', text: '#FFFFFF' },
  error: { background: '#DC2626', text: '#FFFFFF' },
};

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  type = 'info',
  onTimeout,
  duration = 3000,
}) => {
  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!message) {
      return;
    }

    const timer = setTimeout(() => {
      onTimeout?.();
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [visible, message, duration, onTimeout]);

  if (!visible || !message) {
    return null;
  }

  const palette = TOAST_COLORS[type];

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  message: {
    fontSize: THEME.typography.subtext,
    fontWeight: '600',
  },
});
