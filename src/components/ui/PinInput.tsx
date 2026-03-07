import React, { useRef } from 'react';
import { StyleSheet, TextInput, View, Text } from 'react-native';

import { THEME } from '../../types/theme/colors';

type PinInputProps = {
  value: string;
  onChange: (nextValue: string) => void;
  length?: number;
  disabled?: boolean;
  colorScheme?: 'light' | 'dark';
  autoFocus?: boolean;
};

export const PinInput: React.FC<PinInputProps> = ({
  value,
  onChange,
  length = 4,
  disabled = false,
  colorScheme = 'light',
  autoFocus = true,
}) => {
  const inputRef = useRef<TextInput>(null);
  const boxes = Array.from({ length }, (_, i) => i);

  const isDark = colorScheme === 'dark';
  
  // Colors
  const containerBg = isDark ? 'rgba(0,0,0,0.2)' : '#F8FAFC';
  const cellBg = isDark ? '#1E293B' : '#FFFFFF';
  const cellBorder = isDark ? '#334155' : '#E2E8F0';
  const cellActiveBorder = isDark ? '#60A5FA' : THEME.primary;
  const textColor = isDark ? '#F1F5F9' : '#0F172A';

  return (
    <View style={styles.container}>
      {/* Background pill */}
      <View style={[styles.backgroundPill, { backgroundColor: containerBg }]} />
      
      {/* Visual Cells */}
      <View style={styles.cellsContainer} pointerEvents="none">
        {boxes.map((index) => {
          const char = value[index];
          const isActive = !disabled && index === value.length;
          const isFilled = !!char;

          return (
            <View
              key={index}
              style={[
                styles.cell,
                // eslint-disable-next-line react-native/no-inline-styles
                { 
                  backgroundColor: cellBg, 
                  borderColor: isActive ? cellActiveBorder : cellBorder,
                  shadowOpacity: isActive ? 0.1 : 0,
                },
              ]}
            >
              {isFilled ? (
                <Text style={[styles.cellText, { color: textColor }]}>•</Text>
              ) : (
                 isActive && <View style={[styles.cursor, { backgroundColor: cellActiveBorder }]} />
              )}
            </View>
          );
        })}
      </View>

      {/* Invisible Interactive Input Overlay */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        editable={!disabled}
        autoFocus={autoFocus}
        caretHidden={true}
        contextMenuHidden={true}
        selectTextOnFocus={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    position: 'relative',
    marginBottom: 20,
    height: 80, // Ensure container has height for absolute children
  },
  backgroundPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 20,
    right: 20,
    borderRadius: 24,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01, // Near-zero opacity to ensure interactivity on all devices
    zIndex: 99, // Ensure it sits on top
    elevation: 99, // Android elevation to ensure it's on top of cells
  },
  cellsContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell: {
    width: 56,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  cellText: {
    fontSize: THEME.typography.display,
    fontWeight: '700',
    lineHeight: 36,
    textAlign: 'center',
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
    opacity: 0.8,
  },
});
